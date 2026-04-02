import React, { useState, useRef, useEffect } from 'react'

interface FloatingCommentBoxProps {
  startLine: number
  endLine: number
  position: { x: number; y: number }
  onSend: (comment: string) => void
  onQueue: (comment: string) => void
  onDismiss: () => void
}

export default function FloatingCommentBox({
  startLine,
  endLine,
  position,
  onSend,
  onQueue,
  onDismiss,
}: FloatingCommentBoxProps) {
  const [comment, setComment] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onDismiss])

  const handleSend = () => {
    if (!comment.trim()) return
    onSend(comment.trim())
    setComment('')
  }

  const handleQueue = () => {
    if (!comment.trim()) return
    onQueue(comment.trim())
    setComment('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      handleQueue()
    }
  }

  const lineLabel = startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}–${endLine}`

  return (
    <div
      ref={boxRef}
      className="floating-comment-box"
      style={{
        top: `${position.y}px`,
        left: `${Math.min(position.x, window.innerWidth - 440)}px`,
      }}
    >
      <div className="floating-comment-header">
        <span className="floating-comment-lines">{lineLabel}</span>
        <button className="floating-comment-close" onClick={onDismiss}>×</button>
      </div>
      <textarea
        ref={textareaRef}
        className="floating-comment-textarea"
        placeholder="Describe the revision..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
      />
      <div className="floating-comment-actions">
        <button className="floating-comment-btn send" onClick={handleSend} disabled={!comment.trim()}>
          Send to Claude <span className="shortcut">⌘↵</span>
        </button>
        <button className="floating-comment-btn queue" onClick={handleQueue} disabled={!comment.trim()}>
          Add to Queue <span className="shortcut">⇧↵</span>
        </button>
      </div>
    </div>
  )
}
