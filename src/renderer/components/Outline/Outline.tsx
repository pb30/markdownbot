import React, { useMemo } from 'react'
import '../../styles/Outline.css'

interface Heading {
  level: number
  text: string
  slug: string
}

interface OutlineProps {
  content: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function Outline({ content }: OutlineProps) {
  const headings = useMemo(() => {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm
    const matches: Heading[] = []
    let match

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length
      const text = match[2].trim()
      matches.push({ level, text, slug: slugify(text) })
    }

    return matches
  }, [content])

  const handleHeadingClick = (heading: Heading) => {
    // Find the heading element in the markdown preview by text content
    const previewEl = document.querySelector('.markdown-preview')
    if (!previewEl) return

    const headingEls = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
    for (const el of headingEls) {
      if (el.textContent?.trim() === heading.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
  }

  if (headings.length === 0) {
    return (
      <div className="outline-panel">
        <div className="outline-header">Outline</div>
        <div className="outline-empty">No headings found</div>
      </div>
    )
  }

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <div className="outline-panel">
      <div className="outline-header">Outline</div>
      <nav className="outline-nav">
        {headings.map((heading, index) => (
          <button
            key={index}
            className={`outline-item level-${heading.level}`}
            onClick={() => handleHeadingClick(heading)}
            style={{ paddingLeft: `${8 + (heading.level - minLevel) * 14}px` }}
            title={heading.text}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </div>
  )
}
