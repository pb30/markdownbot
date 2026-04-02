import { WebContents } from 'electron';
import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

export class FileWatcher {
  private webContents: WebContents;
  private watcher: FSWatcher | null = null;
  private watchPath: string | null = null;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
  }

  start(dirPath: string): void {
    if (this.watcher) {
      this.stop();
    }

    this.watchPath = dirPath;

    this.watcher = chokidar.watch(dirPath, {
      ignored: [/(^|[\/\\])\.|node_modules|\.git/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    // Channel names must match preload listeners exactly
    this.watcher.on('add', (filePath: string) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        this.webContents.send('watcher:fileAdded', filePath);
        this.webContents.send('watcher:treeChanged');
      }
    });

    this.watcher.on('change', (filePath: string) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        this.webContents.send('watcher:fileChanged', filePath);
      }
    });

    this.watcher.on('unlink', (filePath: string) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        this.webContents.send('watcher:fileRemoved', filePath);
        this.webContents.send('watcher:treeChanged');
      }
    });

    this.watcher.on('unlinkDir', () => {
      this.webContents.send('watcher:treeChanged');
    });

    this.watcher.on('addDir', () => {
      this.webContents.send('watcher:treeChanged');
    });

    this.watcher.on('error', (error: Error) => {
      console.error('Watcher error:', error);
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.watchPath = null;
    }
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  getWatchPath(): string | null {
    return this.watchPath;
  }
}
