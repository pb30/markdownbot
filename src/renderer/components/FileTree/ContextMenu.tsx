import React, { useEffect, useRef } from 'react'
import '../../styles/ContextMenu.css'

interface ContextMenuProps {
  x: number
  y: number
  nodeInfo: {
    path: string
    name: string
    type: 'file' | 'directory'
  } | null
  onAction: (action: string, nodePath: string, nodeType: 'file' | 'directory') => void
  onClose: () => void
}

export default function ContextMenu({ x, y, nodeInfo, onAction, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!nodeInfo) return null

  const items =
    nodeInfo.type === 'directory'
      ? [{ label: 'New File', action: 'new-file' }, { label: 'Rename', action: 'rename' }, { label: 'Delete', action: 'delete' }]
      : [{ label: 'Rename', action: 'rename' }, { label: 'Delete', action: 'delete' }]

  return (
    <div
      className="context-menu"
      ref={menuRef}
      style={{
        position: 'fixed',
        top: `${y}px`,
        left: `${x}px`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.action}
          className="context-menu-item"
          onClick={() => onAction(item.action, nodeInfo.path, nodeInfo.type)}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
