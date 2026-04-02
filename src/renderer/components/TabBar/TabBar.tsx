import React from 'react'
import { useEditorStore } from '../../store'
import '../../styles/TabBar.css'

export default function TabBar() {
  const { openTabs, activeTabId, closeTab, setActiveTab } = useEditorStore()

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
  }

  const handleTabMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(tabId)
    }
  }

  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    closeTab(tabId)
  }

  if (openTabs.length === 0) {
    return (
      <div className="tab-bar">
        <div className="empty-tabs">No files open</div>
      </div>
    )
  }

  return (
    <div className="tab-bar">
      {openTabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
          onClick={() => handleTabClick(tab.id)}
          onMouseUp={(e) => handleTabMiddleClick(e, tab.id)}
        >
          <span className="tab-name">{tab.fileName}</span>
          {tab.isDirty && <span className="dirty-indicator">●</span>}
          <button
            className="tab-close"
            onClick={(e) => handleCloseClick(e, tab.id)}
            title="Close tab"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
