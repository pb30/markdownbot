import React, { useState, useEffect } from 'react'
import { FolderIcon, FolderOpenIcon } from '@heroicons/react/24/outline'
import '../styles/WelcomeScreen.css'

const api = (window as any).api

interface WelcomeScreenProps {
  onOpenFolder: (folderPath?: string) => void
}

export default function WelcomeScreen({ onOpenFolder }: WelcomeScreenProps) {
  const [recentDirs, setRecentDirs] = useState<string[]>([])

  useEffect(() => {
    api.getRecentDirectories().then((dirs: string[]) => {
      setRecentDirs(dirs)
    })
  }, [])

  const dirName = (p: string) => p.split('/').pop() || p
  const dirParent = (p: string) => {
    const parts = p.split('/')
    parts.pop()
    return parts.length > 2 ? '~/' + parts.slice(-2).join('/') : parts.join('/')
  }
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-logo">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="4" y="4" width="56" height="56" rx="12" fill="var(--accent-color)" opacity="0.15"/>
            <path d="M20 20h24M20 28h24M20 36h16" stroke="var(--accent-color)" strokeWidth="3" strokeLinecap="round"/>
            <path d="M44 36l4 4-4 4" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1>Markdown Bot</h1>
        <p className="welcome-description">
          Browse and edit markdown files with an integrated terminal for Claude Code.
        </p>

        <button className="welcome-button" onClick={() => onOpenFolder()}>
          <FolderOpenIcon width={18} height={18} />
          Open Folder
        </button>

        {recentDirs.length > 0 && (
          <div className="recent-directories">
            <h3 className="recent-title">Recent</h3>
            <ul className="recent-list">
              {recentDirs.map((dir) => (
                <li key={dir}>
                  <button className="recent-item" onClick={() => onOpenFolder(dir)}>
                    <FolderIcon width={16} height={16} className="recent-icon" />
                    <span className="recent-info">
                      <span className="recent-name">{dirName(dir)}</span>
                      <span className="recent-path">{dirParent(dir)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="welcome-shortcuts">
          <span className="shortcut-hint">
            <kbd>⌘</kbd><kbd>O</kbd> Open folder
          </span>
          <span className="shortcut-hint">
            <kbd>⌘</kbd><kbd>N</kbd> New file
          </span>
          <span className="shortcut-hint">
            <kbd>⌘</kbd><kbd>⇧</kbd><kbd>F</kbd> Search
          </span>
        </div>
      </div>
    </div>
  )
}
