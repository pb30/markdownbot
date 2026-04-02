import React, { useState } from 'react'
import { useEditorStore, FileNode } from '../../store'
import ContextMenu from './ContextMenu'
import { PlusIcon, MagnifyingGlassIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { FolderIcon, FolderOpenIcon, DocumentTextIcon, DocumentIcon } from '@heroicons/react/24/outline'
import '../../styles/FileTree.css'

const api = (window as any).api

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  nodeInfo: { path: string; name: string; type: 'file' | 'directory' } | null
}

export default function FileTree() {
  const {
    fileTree,
    rootDir,
    activeTabId,
    openTabs,
    openTab,
    expandNode,
    collapseNode,
    setFileTree,
    toggleSearchPanel,
    gitStatus,
  } = useEditorStore()

  const [searchTerm, setSearchTerm] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    nodeInfo: null,
  })

  const refreshTree = async () => {
    if (!rootDir) return
    try {
      const tree = await api.readDir(rootDir)
      setFileTree(tree)
    } catch (error) {
      console.error('Failed to refresh file tree:', error)
    }
  }

  const handleNodeClick = async (node: FileNode) => {
    if (node.type === 'directory') {
      if (node.isExpanded) {
        collapseNode(node.path)
      } else {
        expandNode(node.path)
      }
      // Save expand state after toggling
      const expandedPaths = useEditorStore.getState().getExpandedPaths()
      if (rootDir) {
        api.setExpandedPaths(rootDir, expandedPaths)
      }
    } else {
      try {
        const content = await api.readFile(node.path)
        openTab(node.path, node.name, content ?? '')
      } catch (error) {
        console.error('Failed to read file:', error)
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      nodeInfo: { path: node.path, name: node.name, type: node.type },
    })
  }

  const handleContextMenuClose = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  const handleContextMenuAction = async (action: string, nodePath: string, nodeType: 'file' | 'directory') => {
    setContextMenu((prev) => ({ ...prev, visible: false }))

    const dirPath = nodeType === 'directory' ? nodePath : nodePath.split('/').slice(0, -1).join('/')

    switch (action) {
      case 'new-file': {
        const fileName = prompt('File name:', 'untitled.md')
        if (!fileName) return
        const newFilePath = `${dirPath}/${fileName}`
        try {
          await api.createFile(newFilePath)
          await refreshTree()
          const content = await api.readFile(newFilePath)
          openTab(newFilePath, fileName, content ?? '')
        } catch (error) {
          console.error('Failed to create file:', error)
        }
        break
      }
      case 'rename': {
        const currentName = nodePath.split('/').pop() || ''
        const newName = prompt('New name:', currentName)
        if (!newName || newName === currentName) return
        const parentDir = nodePath.split('/').slice(0, -1).join('/')
        const newPath = `${parentDir}/${newName}`
        try {
          await api.renameFile(nodePath, newPath)
          await refreshTree()
        } catch (error) {
          console.error('Failed to rename:', error)
        }
        break
      }
      case 'delete': {
        const name = nodePath.split('/').pop()
        if (!window.confirm(`Delete "${name}"?`)) return
        try {
          await api.deleteFile(nodePath)
          await refreshTree()
        } catch (error) {
          console.error('Failed to delete:', error)
        }
        break
      }
    }
  }

  const filterNodes = (nodes: FileNode[], term: string): FileNode[] => {
    if (!term) return nodes
    return nodes.reduce((acc: FileNode[], node) => {
      const matches = node.name.toLowerCase().includes(term.toLowerCase())
      const children = node.children ? filterNodes(node.children, term) : []
      if (matches || children.length > 0) {
        acc.push({
          ...node,
          children: children.length > 0 ? children : node.children,
          isExpanded: true,
        })
      }
      return acc
    }, [])
  }

  const filteredTree = filterNodes(fileTree, searchTerm)

  const activeTabPath = activeTabId ? openTabs.find((t) => t.id === activeTabId)?.filePath : null

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = node.isExpanded !== false // default to expanded
    const isActive = node.type === 'file' && node.path === activeTabPath

    return (
      <div key={node.path}>
        <div
          className={`tree-node ${node.type} ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => handleNodeClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          {node.type === 'directory' ? (
            <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>
              <ChevronRightIcon width={12} height={12} />
            </span>
          ) : (
            <span className="chevron-spacer" />
          )}
          <span className="node-icon">
            {node.type === 'directory'
              ? (isExpanded
                ? <FolderOpenIcon width={14} height={14} className="icon-folder" />
                : <FolderIcon width={14} height={14} className="icon-folder" />)
              : (node.name.endsWith('.md')
                ? <DocumentTextIcon width={14} height={14} className="icon-file-md" />
                : <DocumentIcon width={14} height={14} className="icon-file" />)}
          </span>
          <span className={`node-name ${gitStatus[node.path] === 'modified' ? 'git-modified' : gitStatus[node.path] === 'new' ? 'git-new' : ''}`}>{node.name}</span>
        </div>

        {node.type === 'directory' && isExpanded && node.children && (
          <div className="tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Explorer</span>
        <div className="file-tree-actions">
          <button
            className="icon-btn"
            onClick={() => {
              if (!rootDir) return
              const fileName = prompt('File name:', 'untitled.md')
              if (!fileName) return
              const filePath = `${rootDir}/${fileName}`
              api.createFile(filePath).then(() => {
                refreshTree()
                api.readFile(filePath).then((content: string) => openTab(filePath, fileName, content ?? ''))
              })
            }}
            title="New File"
          >
            <PlusIcon width={14} height={14} />
          </button>
          <button
            className="icon-btn"
            onClick={() => toggleSearchPanel()}
            title="Search (⌘⇧F)"
          >
            <MagnifyingGlassIcon width={14} height={14} />
          </button>
        </div>
      </div>

      <div className="file-tree-filter">
        <input
          type="text"
          placeholder="Filter files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="file-tree-content">
        {filteredTree.length > 0 ? (
          filteredTree.map((node) => renderNode(node))
        ) : (
          <div className="tree-empty">No matching files</div>
        )}
      </div>

      {contextMenu.visible && contextMenu.nodeInfo && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeInfo={contextMenu.nodeInfo}
          onAction={handleContextMenuAction}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  )
}
