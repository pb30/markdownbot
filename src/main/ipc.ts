import { ipcMain, WebContents, shell, BrowserWindow, dialog } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TerminalManager } from './terminal.js';
import { FileWatcher } from './watcher.js';
import { getRecentDirectories, addRecentDirectory, getExpandedPaths, setExpandedPaths } from './persistence.js';
import { createMenu, pendingFolderPaths } from './index.js';

interface WindowState {
  window: BrowserWindow;
  terminalManager: TerminalManager;
  fileWatcher: FileWatcher;
}

const execFileAsync = promisify(execFile);

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  isExpanded?: boolean;
}

async function readDirRecursive(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: FileTreeNode[] = [];

  for (const entry of entries) {
    // Skip hidden files and common exclusions
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const children = await readDirRecursive(fullPath);
      // Only include folders that have matching descendants
      if (children.length > 0) {
        results.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
          isExpanded: true,
        });
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        results.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
        });
      }
    }
  }

  // Sort: directories first, then alphabetical
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return results;
}

function getStateForSender(windowStates: Map<number, WindowState>, sender: WebContents): WindowState | undefined {
  const win = BrowserWindow.fromWebContents(sender);
  return win ? windowStates.get(win.id) : undefined;
}

export function registerIpcHandlers(
  windowStates: Map<number, WindowState>,
) {
  // Renderer calls this on mount to check if a folder should be auto-opened
  ipcMain.handle('app:getPendingFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const folderPath = pendingFolderPaths.get(win.id);
    if (folderPath) {
      pendingFolderPaths.delete(win.id);
      return folderPath;
    }
    return null;
  });

  // Dialog handler for opening a folder
  ipcMain.handle('dialog:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // File system handlers
  ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
    try {
      return await readDirRecursive(dirPath);
    } catch (error) {
      console.error('Error reading directory:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('Error writing file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:createFile', async (_, filePath: string) => {
    try {
      // Ensure .md extension if not present
      let finalPath = filePath;
      if (!finalPath.endsWith('.md') && !finalPath.endsWith('.txt')) {
        finalPath += '.md';
      }

      // Create parent directory if needed
      const dir = path.dirname(finalPath);
      await fs.mkdir(dir, { recursive: true });

      // Create the file with empty content
      await fs.writeFile(finalPath, '', 'utf-8');
      return { success: true, path: finalPath };
    } catch (error) {
      console.error('Error creating file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:renameFile', async (_, oldPath: string, newPath: string) => {
    try {
      await fs.rename(oldPath, newPath);
      return { success: true };
    } catch (error) {
      console.error('Error renaming file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:getStats', async (_, filePath: string) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        mtime: stats.mtime.getTime(),
        size: stats.size,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  });

  // Terminal handlers
  ipcMain.handle('terminal:create', async (event, cwd: string, launchClaude: boolean = true) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      const terminalId = state.terminalManager.createTerminal(cwd, launchClaude);
      return terminalId;
    } catch (error) {
      console.error('Error creating terminal:', error);
      throw error;
    }
  });

  ipcMain.handle('terminal:ready', async (event, terminalId: string) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      const bufferedData = state.terminalManager.markRendererReady(terminalId);
      return bufferedData;
    } catch (error) {
      console.error('Error marking terminal ready:', error);
      throw error;
    }
  });

  ipcMain.handle('terminal:write', async (event, terminalId: string, data: string) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      state.terminalManager.writeToTerminal(terminalId, data);
      return { success: true };
    } catch (error) {
      console.error('Error writing to terminal:', error);
      throw error;
    }
  });

  ipcMain.handle('terminal:resize', async (event, terminalId: string, cols: number, rows: number) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      state.terminalManager.resizeTerminal(terminalId, cols, rows);
      return { success: true };
    } catch (error) {
      console.error('Error resizing terminal:', error);
      throw error;
    }
  });

  ipcMain.handle('terminal:dispose', async (event, terminalId: string) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      state.terminalManager.disposeTerminal(terminalId);
      return { success: true };
    } catch (error) {
      console.error('Error disposing terminal:', error);
      throw error;
    }
  });

  // Search handlers
  ipcMain.handle('fs:searchFiles', async (_, dirPath: string, query: string, isRegex: boolean) => {
    try {
      const results = await searchFilesInDirectory(dirPath, query, isRegex);
      return results;
    } catch (error) {
      console.error('Error searching files:', error);
      throw error;
    }
  });

  // Watcher handlers
  ipcMain.handle('watcher:start', async (event, dirPath: string) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      state.fileWatcher.start(dirPath);
      return { success: true };
    } catch (error) {
      console.error('Error starting watcher:', error);
      throw error;
    }
  });

  ipcMain.handle('watcher:stop', async (event) => {
    try {
      const state = getStateForSender(windowStates, event.sender);
      if (!state) throw new Error('No window state found');
      state.fileWatcher.stop();
      return { success: true };
    } catch (error) {
      console.error('Error stopping watcher:', error);
      throw error;
    }
  });

  // PDF export handlers
  ipcMain.handle('export:pdf', async (_, htmlContent: string, outputPath: string) => {
    try {
      // Create a hidden browser window for rendering
      const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
        },
      });

      // Load HTML content into the window
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Wait for the content to be fully loaded
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Print to PDF
      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        pageSize: 'A4',
        margins: {
          marginType: 'default',
        },
      });

      // Write PDF to file
      await fs.writeFile(outputPath, pdfBuffer);

      // Cleanup
      pdfWindow.destroy();

      return { success: true, path: outputPath };
    } catch (error) {
      console.error('Error exporting PDF:', error);
      throw error;
    }
  });

  // Dialog handler for save file
  ipcMain.handle('dialog:saveFile', async (_, defaultName: string) => {
    try {
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (!currentWindow) {
        throw new Error('No focused window');
      }

      const result = await dialog.showSaveDialog(currentWindow, {
        defaultPath: defaultName,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled) {
        return null;
      }

      return result.filePath;
    } catch (error) {
      console.error('Error in save dialog:', error);
      throw error;
    }
  });

  // Recent directories
  ipcMain.handle('store:getRecentDirs', async () => {
    return await getRecentDirectories();
  });

  ipcMain.handle('store:addRecentDir', async (_, dirPath: string) => {
    await addRecentDirectory(dirPath);
    // Rebuild app menu so "Open Recent" list is updated
    createMenu();
  });

  // Expanded paths persistence
  ipcMain.handle('store:getExpandedPaths', async (_, rootDir: string) => {
    return await getExpandedPaths(rootDir);
  });

  ipcMain.handle('store:setExpandedPaths', async (_, rootDir: string, paths: string[]) => {
    await setExpandedPaths(rootDir, paths);
  });

  // Git diff for a specific file
  ipcMain.handle('git:diff', async (_, filePath: string, rootDir: string) => {
    try {
      // Get the original (HEAD) version
      const relativePath = path.relative(rootDir, filePath);
      const { stdout: originalContent } = await execFileAsync('git', ['show', `HEAD:${relativePath}`], {
        cwd: rootDir,
        timeout: 5000,
      });
      // Get the current working version
      const currentContent = await fs.readFile(filePath, 'utf-8');
      return { original: originalContent, current: currentContent };
    } catch (error: any) {
      // If file is new (not in HEAD), return empty original
      if (error.stderr?.includes('does not exist') || error.stderr?.includes('fatal')) {
        const currentContent = await fs.readFile(filePath, 'utf-8');
        return { original: '', current: currentContent };
      }
      throw error;
    }
  });

  // Git status
  ipcMain.handle('git:status', async (_, dirPath: string) => {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain', '-uall'], {
        cwd: dirPath,
        timeout: 5000,
      });
      const statusMap: Record<string, string> = {};
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        const xy = line.substring(0, 2);
        const filePath = path.resolve(dirPath, line.substring(3).trim());
        // Determine status: modified, new, staged
        if (xy === '??' || xy === 'A ' || xy === 'AM') {
          statusMap[filePath] = 'new';
        } else if (xy.includes('M') || xy.includes('R') || xy.includes('D')) {
          statusMap[filePath] = 'modified';
        }
      }
      return statusMap;
    } catch {
      // Not a git repo or git not installed
      return {};
    }
  });
}

interface SearchMatch {
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchResult {
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}

async function searchFilesInDirectory(
  dirPath: string,
  query: string,
  isRegex: boolean,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const maxMatches = 500;
  let matchCount = 0;

  if (!query) {
    return results;
  }

  // Create regex pattern
  let pattern: RegExp;
  try {
    if (isRegex) {
      pattern = new RegExp(query, 'gi');
    } else {
      // Escape special regex characters for literal search
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(escaped, 'gi');
    }
  } catch (error) {
    console.error('Invalid regex pattern:', error);
    return results;
  }

  async function searchDirRecursive(currentPath: string): Promise<void> {
    if (matchCount >= maxMatches) return;

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (matchCount >= maxMatches) return;

        // Skip hidden files and common exclusions
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await searchDirRecursive(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.md' || ext === '.txt') {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              const fileMatches: SearchMatch[] = [];

              lines.forEach((line, lineIdx) => {
                if (matchCount >= maxMatches) return;

                let match;
                while ((match = pattern.exec(line)) !== null && matchCount < maxMatches) {
                  fileMatches.push({
                    line: lineIdx + 1,
                    text: line,
                    matchStart: match.index,
                    matchEnd: match.index + match[0].length,
                  });
                  matchCount++;
                }
              });

              if (fileMatches.length > 0) {
                results.push({
                  filePath: fullPath,
                  fileName: entry.name,
                  matches: fileMatches,
                });
              }
            } catch (error) {
              // Skip files that can't be read
              console.debug(`Could not read file ${fullPath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.debug(`Could not read directory ${currentPath}:`, error);
    }
  }

  await searchDirRecursive(dirPath);
  return results;
}
