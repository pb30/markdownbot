import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/atom-one-dark.css'
import '../../styles/MarkdownPreview.css'

interface MarkdownPreviewProps {
  content: string
  onRequestComment?: (startLine: number, endLine: number, position: { x: number; y: number }) => void
  onLinkClick?: (href: string) => void
  commentVisible?: boolean
}

let mermaidInstance: any = null
let mermaidIdCounter = 0
const getMermaid = async () => {
  if (mermaidInstance) return mermaidInstance
  try {
    const mod = await import('mermaid')
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    mod.default.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    })
    mermaidInstance = mod.default
    return mermaidInstance
  } catch {
    console.warn('Mermaid not available')
    return null
  }
}

function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      const mermaid = await getMermaid()
      if (!mermaid || cancelled || !containerRef.current) return
      try {
        const id = `mermaid-${++mermaidIdCounter}`
        const { svg } = await mermaid.render(id, chart)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setError(null)
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to render diagram')
      }
    }
    render()
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return <div className="mermaid-error">{error}</div>
  }
  return <div ref={containerRef} className="mermaid-container" />
}

const withSourceLines = (Tag: string) => ({ node, children, ...props }: any) => (
  React.createElement(Tag, { 'data-source-line': node?.position?.start?.line, 'data-source-end-line': node?.position?.end?.line, ...props }, children)
)

const sourceLineComponents = {
  p: withSourceLines('p'),
  h1: withSourceLines('h1'),
  h2: withSourceLines('h2'),
  h3: withSourceLines('h3'),
  h4: withSourceLines('h4'),
  h5: withSourceLines('h5'),
  h6: withSourceLines('h6'),
  blockquote: withSourceLines('blockquote'),
  ul: withSourceLines('ul'),
  ol: withSourceLines('ol'),
  li: withSourceLines('li'),
  pre: withSourceLines('pre'),
  table: withSourceLines('table'),
}

export default function MarkdownPreview({ content, onRequestComment, onLinkClick, commentVisible }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = content.split('\n').length
  const lineCountRef = useRef(lineCount)
  lineCountRef.current = lineCount
  const [gutterSelection, setGutterSelection] = useState<{ startLine: number; endLine: number } | null>(null)
  const gutterDragRef = useRef<{ startLine: number; active: boolean }>({ startLine: 0, active: false })

  // Sync gutter scroll with preview scroll
  useEffect(() => {
    const preview = previewRef.current
    const gutter = gutterRef.current
    if (!preview || !gutter) return

    const handleScroll = () => {
      gutter.scrollTop = preview.scrollTop
    }
    preview.addEventListener('scroll', handleScroll)
    return () => preview.removeEventListener('scroll', handleScroll)
  }, [])

  // Gutter mouse handlers for click/drag
  const handleGutterMouseDown = useCallback((lineNum: number, e: React.MouseEvent) => {
    e.preventDefault()
    gutterDragRef.current = { startLine: lineNum, active: true }
    setGutterSelection({ startLine: lineNum, endLine: lineNum })
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!gutterDragRef.current.active || !gutterRef.current) return
      const gutterRect = gutterRef.current.getBoundingClientRect()
      const lineHeight = 22
      const scrollOffset = gutterRef.current.scrollTop
      const y = e.clientY - gutterRect.top + scrollOffset
      const lineNum = Math.max(1, Math.min(lineCountRef.current, Math.ceil(y / lineHeight)))
      const start = gutterDragRef.current.startLine
      setGutterSelection({ startLine: Math.min(start, lineNum), endLine: Math.max(start, lineNum) })
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!gutterDragRef.current.active) return
      gutterDragRef.current.active = false

      const sel = gutterSelectionRef.current
      if (!sel) return

      if (onRequestComment) {
        const gutterEl = gutterRef.current
        const gutterRight = gutterEl ? gutterEl.getBoundingClientRect().right + 8 : e.clientX
        onRequestComment(sel.startLine, sel.endLine, { x: gutterRight, y: e.clientY })
      }
      // Don't clear gutterSelection here — it stays visible while comment box is open
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onRequestComment])

  // Keep a ref to gutterSelection so mouseup handler can read latest value
  const gutterSelectionRef = useRef(gutterSelection)
  gutterSelectionRef.current = gutterSelection

  // Clear gutter selection when comment box is dismissed
  useEffect(() => {
    if (!commentVisible) {
      setGutterSelection(null)
    }
  }, [commentVisible])

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Check if it's an internal markdown link
    if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('#')) {
      const isMarkdown = href.endsWith('.md') || href.endsWith('.txt')
      if (isMarkdown && onLinkClick) {
        e.preventDefault()
        onLinkClick(href)
        return
      }
    }
  }

  const annotatedComponents: any = React.useMemo(() => ({
    ...sourceLineComponents,
    a: ({ node, href, children, ...props }: any) => (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleAnchorClick(e, href || '')}
      >
        {children}
      </a>
    ),
    code: ({ node, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '')
      const lang = match ? match[1] : ''

      if (lang === 'mermaid') {
        const chart = String(children).replace(/\n$/, '')
        return <MermaidDiagram chart={chart} />
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
  }), [onLinkClick])

  const selFrom = gutterSelection ? gutterSelection.startLine : -1
  const selTo = gutterSelection ? gutterSelection.endLine : -1

  return (
    <div className="markdown-preview-wrapper">
      <div ref={gutterRef} className="preview-gutter">
        {Array.from({ length: lineCount }, (_, i) => {
          const lineNum = i + 1
          const isSelected = gutterSelection && lineNum >= selFrom && lineNum <= selTo
          return (
            <div
              key={lineNum}
              className={`preview-gutter-line ${isSelected ? 'selected' : ''}`}
              onMouseDown={(e) => handleGutterMouseDown(lineNum, e)}
            >
              <span className="preview-gutter-plus">+</span>
            </div>
          )
        })}
      </div>
      <div ref={previewRef} className="markdown-preview">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={annotatedComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
