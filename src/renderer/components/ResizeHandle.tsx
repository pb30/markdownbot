import React, { useRef, useEffect } from 'react'
import '../styles/ResizeHandle.css'

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
}

export default function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const startPosRef = useRef(0)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    const handleMouseDown = (e: MouseEvent) => {
      isResizingRef.current = true
      startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return

      const currentPos = direction === 'vertical' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      startPosRef.current = currentPos
      onResizeRef.current(delta)
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    handle.addEventListener('mousedown', handleMouseDown)

    return () => {
      handle.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [direction])

  return <div ref={handleRef} className={`resize-handle resize-handle-${direction}`} />
}
