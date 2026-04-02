import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore, FileNode } from '../../store'
import '../../styles/QuickOpen.css'

const api = (window as any).api

interface FileMatch {
  name: string
  path: string
  relativePath: string
}

export default function QuickOpen() {
  const { rootDir, openTab, expandNode } = useEditorStore()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileMatch[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const allFilesRef = useRef<FileMatch[]>([])

  // Collect all files from the tree recursively
  const collectFiles = useCallback((nodes: FileNode[], rootPath: string): FileMatch[] => {
    const files: FileMatch[] = []
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          files.push({
            name: node.name,
            path: node.path,
            relativePath: node.path.replace(rootPath + '/', ''),
          })
        }
        if (node.children) walk(node.children)
      }
    }
    walk(nodes)
    return files
  }, [])

  // Listen for Cmd+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setIsOpen(prev => {
          if (!prev) {
            // Opening — collect all files
            const { fileTree, rootDir } = useEditorStore.getState()
            if (rootDir) {
              allFilesRef.current = collectFiles(fileTree, rootDir)
              setResults(allFilesRef.current.slice(0, 20))
            }
          }
          return !prev
        })
        setQuery('')
        setSelectedIndex(0)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [collectFiles])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Filter results when query changes
  useEffect(() => {
    if (!query) {
      setResults(allFilesRef.current.slice(0, 20))
      setSelectedIndex(0)
      return
    }

    const lower = query.toLowerCase()
    const filtered = allFilesRef.current.filter(f => {
      // Match against filename and path
      return f.name.toLowerCase().includes(lower) || f.relativePath.toLowerCase().includes(lower)
    })

    // Sort: exact name matches first, then starts-with, then contains
    filtered.sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      const aExact = aName === lower
      const bExact = bName === lower
      if (aExact !== bExact) return aExact ? -1 : 1
      const aStarts = aName.startsWith(lower)
      const bStarts = bName.startsWith(lower)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return aName.localeCompare(bName)
    })

    setResults(filtered.slice(0, 20))
    setSelectedIndex(0)
  }, [query])

  const handleSelect = useCallback(async (file: FileMatch) => {
    try {
      const content = await api.readFile(file.path)
      openTab(file.path, file.name, content ?? '')

      // Expand all ancestor directories so the file is visible in the tree
      if (rootDir) {
        const relativeParts = file.path.replace(rootDir + '/', '').split('/')
        // Build each ancestor path and expand it (skip the filename itself)
        let current = rootDir
        for (let i = 0; i < relativeParts.length - 1; i++) {
          current = current + '/' + relativeParts[i]
          expandNode(current)
        }
      }
    } catch (error) {
      console.error('Failed to open file:', error)
    }
    setIsOpen(false)
    setQuery('')
  }, [openTab, rootDir, expandNode])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex])
      }
    }
  }

  if (!isOpen || !rootDir) return null

  return (
    <div className="quick-open-overlay" onClick={() => setIsOpen(false)}>
      <div className="quick-open-modal" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="quick-open-input"
          placeholder="Search files by name..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="quick-open-results">
          {results.length > 0 ? (
            results.map((file, idx) => (
              <div
                key={file.path}
                className={`quick-open-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelect(file)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="quick-open-icon">
                  {file.name.endsWith('.md') ? '📄' : '📝'}
                </span>
                <span className="quick-open-name">{file.name}</span>
                <span className="quick-open-path">{file.relativePath.replace(/\/[^/]+$/, '') || '.'}</span>
              </div>
            ))
          ) : query ? (
            <div className="quick-open-empty">No matching files</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
