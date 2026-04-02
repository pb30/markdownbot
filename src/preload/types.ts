export interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
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

export interface Api {
  // Dialog
  openFolder(): Promise<string | null>
  getPendingFolder(): Promise<string | null>

  // File system
  readDir(dirPath: string): Promise<FileNode[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  createFile(filePath: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  deleteFile(filePath: string): Promise<void>
  getStats(filePath: string): Promise<{ mtimeMs: number }>
  searchFiles(dirPath: string, query: string, isRegex: boolean): Promise<SearchResult[]>

  // Terminal
  createTerminal(cwd: string, launchClaude?: boolean): Promise<string>
  markTerminalReady(id: string): Promise<string[]>
  writeTerminal(id: string, data: string): Promise<void>
  resizeTerminal(id: string, cols: number, rows: number): Promise<void>
  disposeTerminal(id: string): Promise<void>
  onTerminalData(callback: (id: string, data: string) => void): () => void
  onTerminalExit(callback: (id: string) => void): () => void

  // Watcher
  startWatching(dirPath: string): Promise<void>
  stopWatching(): Promise<void>
  onFileChanged(callback: (filePath: string) => void): () => void
  onFileAdded(callback: (filePath: string) => void): () => void
  onFileRemoved(callback: (filePath: string) => void): () => void
  onTreeChanged(callback: () => void): () => void

  // PDF Export
  exportPDF(htmlContent: string, outputPath: string): Promise<void>
  showSaveDialog(defaultName: string): Promise<string | null>

  // App
  onMenuNewFile(callback: () => void): () => void
  onMenuOpenFolder(callback: (folderPath?: string) => void): () => void

  // Persistence
  getRecentDirectories(): Promise<string[]>
  addRecentDirectory(dirPath: string): Promise<void>
  getExpandedPaths(rootDir: string): Promise<string[] | null>
  setExpandedPaths(rootDir: string, paths: string[]): Promise<void>

  // Git
  getGitStatus(dirPath: string): Promise<Record<string, string>>
  getGitDiff(filePath: string, rootDir: string): Promise<{ original: string; current: string }>
}

declare global {
  interface Window {
    api: Api
  }
}
