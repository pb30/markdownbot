import { contextBridge, ipcRenderer } from 'electron'
import type { Api, FileNode } from './types'

const api: Api = {
  // Dialog
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getPendingFolder: (): Promise<string | null> => ipcRenderer.invoke('app:getPendingFolder'),

  // File system
  readDir: (dirPath: string): Promise<FileNode[]> =>
    ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:createFile', filePath),
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:renameFile', oldPath, newPath),
  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteFile', filePath),
  getStats: (filePath: string): Promise<{ mtimeMs: number }> =>
    ipcRenderer.invoke('fs:getStats', filePath),
  searchFiles: (dirPath: string, query: string, isRegex: boolean) =>
    ipcRenderer.invoke('fs:searchFiles', dirPath, query, isRegex),

  // Terminal
  createTerminal: (cwd: string, launchClaude: boolean = true): Promise<string> =>
    ipcRenderer.invoke('terminal:create', cwd, launchClaude),
  markTerminalReady: (id: string): Promise<string[]> =>
    ipcRenderer.invoke('terminal:ready', id),
  writeTerminal: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  disposeTerminal: (id: string): Promise<void> =>
    ipcRenderer.invoke('terminal:dispose', id),
  onTerminalData: (callback: (id: string, data: string) => void): (() => void) => {
    const listener = (_event: any, id: string, data: string) => {
      callback(id, data)
    }
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (callback: (id: string) => void): (() => void) => {
    const listener = (_event: any, id: string) => {
      callback(id)
    }
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },

  // Watcher
  startWatching: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('watcher:start', dirPath),
  stopWatching: (): Promise<void> =>
    ipcRenderer.invoke('watcher:stop'),
  onFileChanged: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: any, filePath: string) => {
      callback(filePath)
    }
    ipcRenderer.on('watcher:fileChanged', listener)
    return () => ipcRenderer.removeListener('watcher:fileChanged', listener)
  },
  onFileAdded: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: any, filePath: string) => {
      callback(filePath)
    }
    ipcRenderer.on('watcher:fileAdded', listener)
    return () => ipcRenderer.removeListener('watcher:fileAdded', listener)
  },
  onFileRemoved: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: any, filePath: string) => {
      callback(filePath)
    }
    ipcRenderer.on('watcher:fileRemoved', listener)
    return () => ipcRenderer.removeListener('watcher:fileRemoved', listener)
  },
  onTreeChanged: (callback: () => void): (() => void) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on('watcher:treeChanged', listener)
    return () => ipcRenderer.removeListener('watcher:treeChanged', listener)
  },

  // PDF Export
  exportPDF: (htmlContent: string, outputPath: string): Promise<void> =>
    ipcRenderer.invoke('export:pdf', htmlContent, outputPath),
  showSaveDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName),

  // App
  onMenuNewFile: (callback: () => void): (() => void) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on('menu:newFile', listener)
    return () => ipcRenderer.removeListener('menu:newFile', listener)
  },
  onMenuOpenFolder: (callback: (folderPath?: string) => void): (() => void) => {
    const listener = (_event: any, folderPath?: string) => {
      callback(folderPath)
    }
    ipcRenderer.on('menu:openFolder', listener)
    return () => ipcRenderer.removeListener('menu:openFolder', listener)
  },

  // Persistence
  getRecentDirectories: (): Promise<string[]> =>
    ipcRenderer.invoke('store:getRecentDirs'),
  addRecentDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('store:addRecentDir', dirPath),
  getExpandedPaths: (rootDir: string): Promise<string[] | null> =>
    ipcRenderer.invoke('store:getExpandedPaths', rootDir),
  setExpandedPaths: (rootDir: string, paths: string[]): Promise<void> =>
    ipcRenderer.invoke('store:setExpandedPaths', rootDir, paths),

  // Git
  getGitStatus: (dirPath: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('git:status', dirPath),
  getGitDiff: (filePath: string, rootDir: string): Promise<{ original: string; current: string }> =>
    ipcRenderer.invoke('git:diff', filePath, rootDir),
}

contextBridge.exposeInMainWorld('api', api)
