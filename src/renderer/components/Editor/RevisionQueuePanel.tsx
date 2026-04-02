import React from 'react'
import { useEditorStore } from '../../store'

const api = (window as any).api

export default function RevisionQueuePanel() {
  const { revisionQueue, removeFromRevisionQueue, clearRevisionQueue, toggleRevisionQueue, activeTerminalId, rootDir } = useEditorStore()

  const formatRelativePath = (filePath: string) => {
    if (rootDir && filePath.startsWith(rootDir)) {
      return filePath.slice(rootDir.length + 1)
    }
    return filePath
  }

  const submitAll = () => {
    if (!activeTerminalId || revisionQueue.length === 0) return

    let message = 'Please make the following revisions:\n\n'
    revisionQueue.forEach((item, idx) => {
      const relPath = formatRelativePath(item.filePath)
      const lineRange = item.startLine === item.endLine
        ? `${item.startLine}`
        : `${item.startLine}-${item.endLine}`
      message += `${idx + 1}. ${relPath}:${lineRange}\n${item.comment}\n\n`
    })

    api.writeTerminal(activeTerminalId, message + '\r')
    clearRevisionQueue()
    // Hide the sidebar after submitting
    toggleRevisionQueue()
  }

  if (revisionQueue.length === 0) {
    return (
      <div className="revision-queue-panel">
        <div className="revision-queue-header">
          <span>Revision Queue</span>
        </div>
        <div className="revision-queue-empty">No revisions queued</div>
      </div>
    )
  }

  return (
    <div className="revision-queue-panel">
      <div className="revision-queue-header">
        <span>Revision Queue ({revisionQueue.length})</span>
        <button className="revision-queue-clear" onClick={clearRevisionQueue} title="Clear all">
          Clear
        </button>
      </div>
      <div className="revision-queue-list">
        {revisionQueue.map((item) => (
          <div key={item.id} className="revision-queue-item">
            <div className="revision-queue-item-header">
              <span className="revision-queue-file">{item.fileName}</span>
              <span className="revision-queue-lines">
                :{item.startLine === item.endLine ? item.startLine : `${item.startLine}-${item.endLine}`}
              </span>
              <button
                className="revision-queue-remove"
                onClick={() => removeFromRevisionQueue(item.id)}
                title="Remove"
              >
                ×
              </button>
            </div>
            <div className="revision-queue-comment">{item.comment}</div>
          </div>
        ))}
      </div>
      <button
        className="revision-queue-submit"
        onClick={submitAll}
        disabled={!activeTerminalId}
        title={!activeTerminalId ? 'No active terminal' : 'Submit all to Claude'}
      >
        Submit All to Claude ({revisionQueue.length})
      </button>
    </div>
  )
}
