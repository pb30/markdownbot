import { create } from 'zustand'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isExpanded?: boolean
}

export interface Tab {
  id: string
  filePath: string
  fileName: string
  content: string
  isDirty: boolean
  mode: 'raw' | 'rendered' | 'split'
}

export interface SearchMatch {
  line: number
  text: string
  matchStart: number
  matchEnd: number
}

export interface SearchResult {
  filePath: string
  fileName: string
  matches: SearchMatch[]
}

export interface RevisionComment {
  id: string
  filePath: string
  fileName: string
  startLine: number
  endLine: number
  comment: string
  timestamp: number
}

interface EditorStore {
  // State
  rootDir: string | null
  fileTree: FileNode[]
  openTabs: Tab[]
  activeTabId: string | null
  terminalIds: string[]
  terminalTypes: Record<string, 'claude' | 'shell'>
  activeTerminalId: string | null
  sidebarWidth: number
  terminalHeight: number
  theme: 'light' | 'dark' | 'system'
  showOutline: boolean
  showSearchPanel: boolean
  gitStatus: Record<string, string>
  revisionQueue: RevisionComment[]
  showRevisionQueue: boolean

  // Actions
  setRootDir: (path: string | null) => void
  setFileTree: (tree: FileNode[]) => void
  openTab: (filePath: string, fileName: string, content: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabContent: (id: string, content: string) => void
  setTabDirty: (id: string, dirty: boolean) => void
  setTabMode: (id: string, mode: 'raw' | 'rendered' | 'split') => void
  addTerminal: (id: string, type?: 'claude' | 'shell') => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string | null) => void
  setSidebarWidth: (width: number) => void
  setTerminalHeight: (height: number) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  expandNode: (path: string) => void
  collapseNode: (path: string) => void
  toggleOutline: () => void
  toggleSearchPanel: () => void
  setGitStatus: (status: Record<string, string>) => void
  addToRevisionQueue: (item: Omit<RevisionComment, 'id' | 'timestamp'>) => void
  removeFromRevisionQueue: (id: string) => void
  clearRevisionQueue: () => void
  toggleRevisionQueue: () => void
  getExpandedPaths: () => string[]
}

export const useEditorStore = create<EditorStore>((set) => ({
  // Initial state
  rootDir: null,
  fileTree: [],
  openTabs: [],
  activeTabId: null,
  terminalIds: [],
  terminalTypes: {},
  activeTerminalId: null,
  sidebarWidth: 260,
  terminalHeight: 250,
  theme: 'system',
  showOutline: false,
  showSearchPanel: false,
  gitStatus: {},
  revisionQueue: [],
  showRevisionQueue: false,

  // Actions
  setRootDir: (path) => set({ rootDir: path }),

  setFileTree: (tree) => set({ fileTree: tree }),

  openTab: (filePath, fileName, content) =>
    set((state) => {
      const existingTab = state.openTabs.find((tab) => tab.filePath === filePath)
      if (existingTab) {
        return { activeTabId: existingTab.id }
      }
      const newTab: Tab = {
        id: `tab-${Date.now()}-${Math.random()}`,
        filePath,
        fileName,
        content,
        isDirty: false,
        mode: 'rendered',
      }
      return {
        openTabs: [...state.openTabs, newTab],
        activeTabId: newTab.id,
      }
    }),

  closeTab: (id) =>
    set((state) => {
      const newTabs = state.openTabs.filter((tab) => tab.id !== id)
      let newActiveTabId = state.activeTabId
      if (newActiveTabId === id) {
        newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null
      }
      return { openTabs: newTabs, activeTabId: newActiveTabId }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabContent: (id, content) =>
    set((state) => {
      const tab = state.openTabs.find((t) => t.id === id)
      if (!tab || tab.content === content) return state
      return {
        openTabs: state.openTabs.map((t) => (t.id === id ? { ...t, content } : t)),
      }
    }),

  setTabDirty: (id, dirty) =>
    set((state) => ({
      openTabs: state.openTabs.map((tab) => (tab.id === id ? { ...tab, isDirty: dirty } : tab)),
    })),

  setTabMode: (id, mode) =>
    set((state) => ({
      openTabs: state.openTabs.map((tab) => (tab.id === id ? { ...tab, mode } : tab)),
    })),

  addTerminal: (id, type = 'shell') =>
    set((state) => {
      const newTerminalIds = [...state.terminalIds, id]
      return {
        terminalIds: newTerminalIds,
        terminalTypes: { ...state.terminalTypes, [id]: type },
        activeTerminalId: state.activeTerminalId || id,
      }
    }),

  removeTerminal: (id) =>
    set((state) => {
      const newTerminalIds = state.terminalIds.filter((tid) => tid !== id)
      let newActiveTerminalId = state.activeTerminalId
      if (newActiveTerminalId === id) {
        newActiveTerminalId = newTerminalIds.length > 0 ? newTerminalIds[0] : null
      }
      const { [id]: _, ...remainingTypes } = state.terminalTypes
      return {
        terminalIds: newTerminalIds,
        terminalTypes: remainingTypes,
        activeTerminalId: newActiveTerminalId,
      }
    }),

  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setTerminalHeight: (height) => set({ terminalHeight: height }),

  setTheme: (theme) => set({ theme }),

  expandNode: (path) =>
    set((state) => {
      const expand = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((node) => {
          if (node.path === path) {
            return { ...node, isExpanded: true }
          }
          if (node.children) {
            return { ...node, children: expand(node.children) }
          }
          return node
        })
      }
      return { fileTree: expand(state.fileTree) }
    }),

  collapseNode: (path) =>
    set((state) => {
      const collapse = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((node) => {
          if (node.path === path) {
            return { ...node, isExpanded: false }
          }
          if (node.children) {
            return { ...node, children: collapse(node.children) }
          }
          return node
        })
      }
      return { fileTree: collapse(state.fileTree) }
    }),

  toggleOutline: () =>
    set((state) => ({
      showOutline: !state.showOutline,
    })),

  toggleSearchPanel: () =>
    set((state) => ({
      showSearchPanel: !state.showSearchPanel,
    })),

  setGitStatus: (status) => set({ gitStatus: status }),

  addToRevisionQueue: (item) =>
    set((state) => ({
      revisionQueue: [...state.revisionQueue, {
        ...item,
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      }],
    })),

  removeFromRevisionQueue: (id) =>
    set((state) => ({
      revisionQueue: state.revisionQueue.filter((r) => r.id !== id),
    })),

  clearRevisionQueue: () => set({ revisionQueue: [] }),

  toggleRevisionQueue: () =>
    set((state) => ({ showRevisionQueue: !state.showRevisionQueue })),

  getExpandedPaths: () => {
    const state = useEditorStore.getState()
    const paths: string[] = []
    const collect = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'directory' && node.isExpanded !== false) {
          paths.push(node.path)
        }
        if (node.children) collect(node.children)
      }
    }
    collect(state.fileTree)
    return paths
  },
}))
