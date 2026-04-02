import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
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
  li: withSourceLines('li'),
  pre: withSourceLines('pre'),
  table: withSourceLines('table'),
}

type LineMapping = { sourceLine: number; sourceEndLine: number; top: number; height: number }

function findSourceLineAtY(y: number, mappings: LineMapping[], totalLines: number): number {
  if (mappings.length === 0) return 1

  // Before first element
  if (y < mappings[0].top) return 1

  // Binary search for element containing y
  let lo = 0, hi = mappings.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const m = mappings[mid]
    if (y < m.top) {
      hi = mid - 1
    } else if (y >= m.top + m.height) {
      lo = mid + 1
    } else {
      // y is within this element — for nested elements (e.g. li inside ul),
      // check if a later entry with a smaller height also contains y
      let best = mid
      for (let i = mid + 1; i < mappings.length && mappings[i].top <= y; i++) {
        if (y < mappings[i].top + mappings[i].height && mappings[i].height < mappings[best].height) {
          best = i
        }
      }
      return mappings[best].sourceLine
    }
  }

  // y fell in a gap between elements — return the preceding element's end line + 1
  // (capped at totalLines)
  if (hi >= 0 && hi < mappings.length) {
    return Math.min(mappings[hi].sourceEndLine + 1, totalLines)
  }

  // After last element
  return totalLines
}

export default function MarkdownPreview({ content, onRequestComment, onLinkClick, commentVisible }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = content.split('\n').length
  const lineCountRef = useRef(lineCount)
  lineCountRef.current = lineCount
  const [gutterSelection, setGutterSelection] = useState<{ startLine: number; endLine: number } | null>(null)
  const gutterDragRef = useRef<{ startLine: number; active: boolean }>({ startLine: 0, active: false })
  const lineMappingsRef = useRef<LineMapping[]>([])
  const [gutterHeight, setGutterHeight] = useState(0)
  const [hoverY, setHoverY] = useState<number | null>(null)

  // Build source-line position map after each render
  useLayoutEffect(() => {
    const container = previewRef.current
    if (!container) return

    const elements = container.querySelectorAll('[data-source-line]')
    const containerTop = container.getBoundingClientRect().top
    const scrollTop = container.scrollTop
    const mappings: LineMapping[] = []

    elements.forEach((el) => {
      const sourceLine = parseInt(el.getAttribute('data-source-line') || '0', 10)
      const sourceEndLine = parseInt(el.getAttribute('data-source-end-line') || '0', 10)
      if (!sourceLine) return
      const rect = el.getBoundingClientRect()
      mappings.push({
        sourceLine,
        sourceEndLine: sourceEndLine || sourceLine,
        top: rect.top - containerTop + scrollTop,
        height: rect.height,
      })
    })

    // Sort by top position
    mappings.sort((a, b) => a.top - b.top || a.sourceLine - b.sourceLine)
    lineMappingsRef.current = mappings
    setGutterHeight(container.scrollHeight)
  }, [content])

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

  // Compute source line from mouse Y relative to preview content
  const getLineFromMouseEvent = useCallback((e: MouseEvent) => {
    const gutter = gutterRef.current
    if (!gutter) return 1
    const gutterRect = gutter.getBoundingClientRect()
    const y = e.clientY - gutterRect.top + gutter.scrollTop
    return findSourceLineAtY(y, lineMappingsRef.current, lineCountRef.current)
  }, [])

  // Gutter mouse handlers for click/drag
  const handleGutterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const gutter = gutterRef.current
    if (!gutter) return
    const gutterRect = gutter.getBoundingClientRect()
    const y = e.clientY - gutterRect.top + gutter.scrollTop
    const lineNum = findSourceLineAtY(y, lineMappingsRef.current, lineCountRef.current)
    gutterDragRef.current = { startLine: lineNum, active: true }
    setGutterSelection({ startLine: lineNum, endLine: lineNum })
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!gutterDragRef.current.active) return
      const lineNum = getLineFromMouseEvent(e)
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
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onRequestComment, getLineFromMouseEvent])

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

  // Compute highlight overlay position from selection line range
  const selectionOverlay = React.useMemo(() => {
    if (!gutterSelection) return null
    const mappings = lineMappingsRef.current
    if (mappings.length === 0) return null

    // Find top of startLine
    let top: number | null = null
    let bottom: number | null = null
    for (const m of mappings) {
      if (m.sourceLine <= gutterSelection.startLine && m.sourceEndLine >= gutterSelection.startLine) {
        top = m.top
        break
      }
      if (m.sourceLine > gutterSelection.startLine) {
        top = m.top
        break
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const m = mappings[i]
      if (m.sourceLine <= gutterSelection.endLine && m.sourceEndLine >= gutterSelection.endLine) {
        bottom = m.top + m.height
        break
      }
      if (m.sourceLine < gutterSelection.endLine) {
        bottom = m.top + m.height
        break
      }
    }

    if (top == null) top = 0
    if (bottom == null) bottom = top + 22

    return { top, height: Math.max(bottom - top, 4) }
  }, [gutterSelection])

  // Handle gutter hover for + icon
  const handleGutterMouseMove = useCallback((e: React.MouseEvent) => {
    if (gutterDragRef.current.active) return
    const gutter = gutterRef.current
    if (!gutter) return
    const gutterRect = gutter.getBoundingClientRect()
    setHoverY(e.clientY - gutterRect.top + gutter.scrollTop)
  }, [])

  const handleGutterMouseLeave = useCallback(() => {
    if (!gutterDragRef.current.active) {
      setHoverY(null)
    }
  }, [])

  // Find the most specific element bounds at hoverY for + icon positioning
  const hoverIndicator = React.useMemo(() => {
    if (hoverY == null) return null
    const mappings = lineMappingsRef.current
    if (mappings.length === 0) return null

    let best: LineMapping | null = null
    for (const m of mappings) {
      if (hoverY >= m.top && hoverY < m.top + m.height) {
        if (!best || m.height < best.height) best = m
      }
    }
    return best ? { top: best.top, height: best.height } : null
  }, [hoverY])

  return (
    <div className="markdown-preview-wrapper">
      <div
        ref={gutterRef}
        className="preview-gutter"
        onMouseDown={handleGutterMouseDown}
        onMouseMove={handleGutterMouseMove}
        onMouseLeave={handleGutterMouseLeave}
      >
        <div className="preview-gutter-spacer" style={{ height: gutterHeight }} />
        {selectionOverlay && (
          <div
            className="preview-gutter-highlight"
            style={{ top: selectionOverlay.top, height: selectionOverlay.height }}
          />
        )}
        {hoverIndicator && !gutterSelection && (
          <div
            className="preview-gutter-hover"
            style={{ top: hoverIndicator.top, height: hoverIndicator.height }}
          >
            <span className="preview-gutter-plus">+</span>
          </div>
        )}
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
