import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../../store'
import CodeMirrorEditor from './CodeMirrorEditor'
import MarkdownPreview from './MarkdownPreview'
import Outline from '../Outline/Outline'
import FloatingCommentBox from './FloatingCommentBox'
import RevisionQueuePanel from './RevisionQueuePanel'
import DiffView from './DiffView'
import { exportMarkdownToPdf } from '../../utils/pdfExport'
import { ChatBubbleLeftRightIcon, ListBulletIcon, ArrowDownTrayIcon } from '@heroicons/react/16/solid'
import '../../styles/Editor.css'
import '../../styles/InlineComments.css'
import '../../styles/DiffView.css'

const api = (window as any).api

export default function Editor() {
  const { openTabs, activeTabId, setTabMode, toggleOutline, showOutline, addToRevisionQueue, revisionQueue, showRevisionQueue, toggleRevisionQueue, activeTerminalId, rootDir, gitStatus, openTab } = useEditorStore()
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle')
  const [commentState, setCommentState] = useState<{
    visible: boolean
    startLine: number
    endLine: number
    position: { x: number; y: number }
  } | null>(null)
  const [diffData, setDiffData] = useState<{ original: string; current: string } | null>(null)

  const activeTab = openTabs.find((tab) => tab.id === activeTabId)

  useEffect(() => {
    setDiffData(null)
  }, [activeTabId])

  const isFileModified = activeTab ? (gitStatus[activeTab.filePath] === 'modified') : false

  const handleRequestComment = (startLine: number, endLine: number, position: { x: number; y: number }) => {
    setCommentState({ visible: true, startLine, endLine, position })
  }

  const handleSendComment = (comment: string) => {
    if (!activeTab || !activeTerminalId) return
    const relPath = rootDir ? activeTab.filePath.slice(rootDir.length + 1) : activeTab.filePath
    const lineRange = commentState!.startLine === commentState!.endLine
      ? `${commentState!.startLine}`
      : `${commentState!.startLine}-${commentState!.endLine}`
    const message = `${relPath}:${lineRange}\n${comment}\r`
    api.writeTerminal(activeTerminalId, message)
    setCommentState(null)
  }

  const handleQueueComment = (comment: string) => {
    if (!activeTab || !commentState) return
    addToRevisionQueue({
      filePath: activeTab.filePath,
      fileName: activeTab.fileName,
      startLine: commentState.startLine,
      endLine: commentState.endLine,
      comment,
    })
    setCommentState(null)
    // Auto-open the queue sidebar when adding an item
    if (!showRevisionQueue) {
      toggleRevisionQueue()
    }
  }

  const handleExportPdf = async () => {
    if (!activeTab) return

    setExportStatus('exporting')
    try {
      const fileName = activeTab.filePath.split('/').pop()?.replace(/\.(md|txt)$/, '') || 'document'
      await exportMarkdownToPdf(activeTab.content, fileName)
      setExportStatus('success')
      setTimeout(() => setExportStatus('idle'), 2000)
    } catch (error) {
      console.error('PDF export failed:', error)
      setExportStatus('error')
      setTimeout(() => setExportStatus('idle'), 3000)
    }
  }

  const handleToggleDiff = async () => {
    if (diffData) {
      setDiffData(null)
      return
    }
    if (!activeTab || !rootDir) return
    try {
      const data = await api.getGitDiff(activeTab.filePath, rootDir)
      setDiffData(data)
    } catch (error) {
      console.error('Failed to get git diff:', error)
    }
  }

  const handleLinkClick = async (href: string) => {
    if (!rootDir || !activeTab) return
    // Resolve relative link from the current file's directory
    const currentDir = activeTab.filePath.replace(/\/[^/]+$/, '')
    let targetPath: string
    if (href.startsWith('/')) {
      targetPath = rootDir + href
    } else {
      targetPath = currentDir + '/' + href
    }
    // Normalize the path (resolve ../ etc)
    const parts = targetPath.split('/')
    const normalized: string[] = []
    for (const part of parts) {
      if (part === '..') normalized.pop()
      else if (part !== '.') normalized.push(part)
    }
    targetPath = normalized.join('/')

    // Check if it's a markdown/txt file
    if (targetPath.endsWith('.md') || targetPath.endsWith('.txt')) {
      try {
        const content = await api.readFile(targetPath)
        const fileName = targetPath.split('/').pop() || targetPath
        openTab(targetPath, fileName, content ?? '')
      } catch (error) {
        // File doesn't exist or can't be read — fall through to default behavior
        console.error('Could not open linked file:', error)
      }
    }
  }

  if (!activeTab) {
    return <div className="editor-empty">No file selected</div>
  }

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <span className="editor-breadcrumb">{activeTab.filePath}</span>
        <div className="editor-controls">
          <div className="editor-toggle">
            <button
              className={`toggle-button ${activeTab.mode === 'raw' ? 'active' : ''}`}
              onClick={() => { setDiffData(null); setTabMode(activeTab.id, 'raw') }}
            >
              Raw
            </button>
            <button
              className={`toggle-button ${activeTab.mode === 'rendered' ? 'active' : ''}`}
              onClick={() => { setDiffData(null); setTabMode(activeTab.id, 'rendered') }}
            >
              Preview
            </button>
            <button
              className={`toggle-button ${activeTab.mode === 'split' ? 'active' : ''}`}
              onClick={() => { setDiffData(null); setTabMode(activeTab.id, 'split') }}
            >
              Split
            </button>
          </div>
          {isFileModified && (
            <button
              className={`diff-toggle ${diffData ? 'active' : ''}`}
              onClick={handleToggleDiff}
              title="Show git diff"
            >
              Diff
            </button>
          )}
          <button
            className={`pdf-export-button ${exportStatus}`}
            onClick={handleExportPdf}
            disabled={exportStatus === 'exporting'}
            title="Export to PDF"
          >
            <ArrowDownTrayIcon width={13} height={13} style={{ flexShrink: 0 }} />
            <span>{exportStatus === 'exporting' ? 'Exporting...' : exportStatus === 'idle' ? 'PDF' : exportStatus === 'success' ? 'Exported' : 'Failed'}</span>
          </button>
          <button
            className={`outline-toggle ${showOutline ? 'active' : ''}`}
            onClick={() => toggleOutline()}
            title="Toggle outline panel"
          >
            <ListBulletIcon width={14} height={14} />
          </button>
          <button
            className={`queue-toggle ${showRevisionQueue ? 'active' : ''}`}
            onClick={() => toggleRevisionQueue()}
            title="Revision queue"
          >
            <ChatBubbleLeftRightIcon width={14} height={14} />
            {revisionQueue.length > 0 && (
              <span className="queue-badge">{revisionQueue.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="editor-wrapper">
        <div className="editor-content">
          {diffData ? (
            <DiffView
              original={diffData.original}
              current={diffData.current}
              filePath={activeTab.filePath}
              onClose={() => setDiffData(null)}
            />
          ) : activeTab.mode === 'raw' ? (
            <CodeMirrorEditor tab={activeTab} onRequestComment={handleRequestComment} commentVisible={!!commentState} />
          ) : activeTab.mode === 'rendered' ? (
            <MarkdownPreview content={activeTab.content} onRequestComment={handleRequestComment} onLinkClick={handleLinkClick} commentVisible={!!commentState} />
          ) : (
            <div className="editor-split">
              <CodeMirrorEditor tab={activeTab} onRequestComment={handleRequestComment} commentVisible={!!commentState} />
              <div className="split-divider" />
              <MarkdownPreview content={activeTab.content} onRequestComment={handleRequestComment} onLinkClick={handleLinkClick} commentVisible={!!commentState} />
            </div>
          )}
        </div>
        {showRevisionQueue && <RevisionQueuePanel />}
        {showOutline && <Outline content={activeTab.content} />}
      </div>
      {commentState && (
        <FloatingCommentBox
          startLine={commentState.startLine}
          endLine={commentState.endLine}
          position={commentState.position}
          onSend={handleSendComment}
          onQueue={handleQueueComment}
          onDismiss={() => setCommentState(null)}
        />
      )}
    </div>
  )
}
