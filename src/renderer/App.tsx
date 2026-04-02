import React, { useEffect, useRef, useCallback } from 'react'
import { useEditorStore, FileNode } from './store'
import FileTree from './components/FileTree/FileTree'
import SearchPanel from './components/SearchPanel/SearchPanel'
import TabBar from './components/TabBar/TabBar'
import Editor from './components/Editor/Editor'
import Terminal from './components/Terminal/Terminal'
import ResizeHandle from './components/ResizeHandle'
import WelcomeScreen from './components/WelcomeScreen'
import QuickOpen from './components/QuickOpen/QuickOpen'
import './styles/App.css'

const api = (window as any).api

export default function App() {
  const {
    rootDir,
    openTabs,
    activeTabId,
    terminalIds,
    sidebarWidth,
    terminalHeight,
    showSearchPanel,
    setRootDir,
    setFileTree,
    openTab,
    updateTabContent,
    setSidebarWidth,
    setTerminalHeight,
    addTerminal,
    toggleSearchPanel,
    setGitStatus,
  } = useEditorStore()

  const mainAreaRef = useRef<HTMLDivElement>(null)
  const openTabsRef = useRef(openTabs)
  openTabsRef.current = openTabs

  // Shared function to open a folder and set up the workspace
  const openFolder = useCallback(async (folderPath?: string) => {
    // If no path provided, show the native folder picker
    const dirPath = folderPath || await api.openFolder()
    if (!dirPath) return

    // Read the filtered file tree
    let tree = await api.readDir(dirPath)

    // Apply saved expanded/collapsed states
    const savedPaths = await api.getExpandedPaths(dirPath)
    if (savedPaths !== null) {
      // We have saved state — apply it by collapsing everything then expanding saved paths
      const applyExpandState = (nodes: FileNode[]): FileNode[] => {
        return nodes.map(node => {
          if (node.type === 'directory') {
            const isExpanded = savedPaths.includes(node.path)
            return {
              ...node,
              isExpanded,
              children: node.children ? applyExpandState(node.children) : undefined,
            }
          }
          return node
        })
      }
      tree = applyExpandState(tree)
    }

    // Update state
    setRootDir(dirPath)
    setFileTree(tree)

    // Fetch git status
    api.getGitStatus(dirPath).then((status: Record<string, string>) => {
      setGitStatus(status)
    })

    // Save recent directory
    await api.addRecentDirectory(dirPath)

    // Start watching for file changes
    await api.startWatching(dirPath)

    // Create the first terminal (auto-launches claude)
    const terminalId = await api.createTerminal(dirPath)
    addTerminal(terminalId, 'claude')
  }, [setRootDir, setFileTree, addTerminal, setGitStatus])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        toggleSearchPanel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSearchPanel])

  // On mount, check if the main process has a pending folder for this window
  useEffect(() => {
    api.getPendingFolder().then((folderPath: string | null) => {
      if (folderPath) {
        openFolder(folderPath)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for menu events
  useEffect(() => {
    if (!api) return

    const cleanupOpenFolder = api.onMenuOpenFolder((folderPath?: string) => {
      openFolder(folderPath)
    })

    const cleanupNewFile = api.onMenuNewFile(async () => {
      if (!rootDir) return
      const fileName = `untitled-${Date.now()}.md`
      const filePath = `${rootDir}/${fileName}`
      try {
        await api.createFile(filePath)
        openTab(filePath, fileName, '')
      } catch (error) {
        console.error('Failed to create file:', error)
      }
    })

    return () => {
      cleanupOpenFolder()
      cleanupNewFile()
    }
  }, [rootDir, openFolder, openTab])

  // Listen for file watcher events — refresh tree and reload open files
  useEffect(() => {
    if (!rootDir || !api) return

    const refreshFileTree = async () => {
      try {
        const freshTree = await api.readDir(rootDir)
        // Preserve current expand/collapse states when merging the fresh tree
        const currentTree = useEditorStore.getState().fileTree
        const expandStateMap = new Map<string, boolean>()
        const collectExpandState = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.type === 'directory') {
              expandStateMap.set(node.path, node.isExpanded !== false)
            }
            if (node.children) collectExpandState(node.children)
          }
        }
        collectExpandState(currentTree)

        const applyExpandState = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(node => {
            if (node.type === 'directory') {
              const wasExpanded = expandStateMap.get(node.path)
              return {
                ...node,
                // Keep previous state if known, otherwise default to expanded (new folder)
                isExpanded: wasExpanded !== undefined ? wasExpanded : true,
                children: node.children ? applyExpandState(node.children) : undefined,
              }
            }
            return node
          })
        }

        setFileTree(applyExpandState(freshTree))
        // Also refresh git status
        if (rootDir) {
          api.getGitStatus(rootDir).then((status: Record<string, string>) => {
            setGitStatus(status)
          })
        }
      } catch (error) {
        console.error('Failed to refresh file tree:', error)
      }
    }

    const handleFileChanged = async (filePath: string) => {
      // Reload content for any open tab matching this path
      const tab = openTabsRef.current.find((t) => t.filePath === filePath)
      if (tab) {
        try {
          const content = await api.readFile(filePath)
          updateTabContent(tab.id, content)
        } catch (error) {
          console.error('Failed to reload file:', error)
        }
      }
    }

    const cleanupChanged = api.onFileChanged(handleFileChanged)
    const cleanupAdded = api.onFileAdded(() => refreshFileTree())
    const cleanupRemoved = api.onFileRemoved(() => refreshFileTree())

    return () => {
      cleanupChanged()
      cleanupAdded()
      cleanupRemoved()
    }
  }, [rootDir, setFileTree, updateTabContent, setGitStatus])

  const handleSidebarResize = (delta: number) => {
    const newWidth = Math.max(180, Math.min(600, sidebarWidth + delta))
    setSidebarWidth(newWidth)
  }

  const handleTerminalResize = (delta: number) => {
    if (!mainAreaRef.current) return
    const mainHeight = mainAreaRef.current.clientHeight
    const newHeight = Math.max(100, Math.min(mainHeight - 100, terminalHeight - delta))
    setTerminalHeight(newHeight)
  }

  // Welcome screen when no folder is open
  if (!rootDir) {
    return <WelcomeScreen onOpenFolder={openFolder} />
  }

  return (
    <div className="app-container">
      <div className="main-layout">
        {/* Left Sidebar: File Tree or Search Panel */}
        <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
          {showSearchPanel ? <SearchPanel /> : <FileTree />}
        </div>

        {/* Resize Handle between sidebar and main area */}
        <ResizeHandle direction="vertical" onResize={handleSidebarResize} />

        {/* Right Main Area: Editor + Terminal */}
        <div className="main-area" ref={mainAreaRef}>
          {/* Top: Tab Bar + Editor */}
          <div className="editor-pane">
            <TabBar />
            <div className="editor-container">
              {activeTabId && openTabs.length > 0 ? (
                <Editor />
              ) : (
                <div className="empty-editor">
                  <p>Select a file from the sidebar to get started</p>
                </div>
              )}
            </div>
          </div>

          {/* Resize Handle between editor and terminal */}
          <ResizeHandle direction="horizontal" onResize={handleTerminalResize} />

          {/* Bottom: Terminal */}
          <div className="terminal-pane" style={{ height: `${terminalHeight}px` }}>
            {terminalIds.length > 0 && <Terminal />}
          </div>
        </div>
      </div>
      <QuickOpen />
    </div>
  )
}
