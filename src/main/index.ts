import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';
import { TerminalManager } from './terminal.js';
import { FileWatcher } from './watcher.js';
import { getRecentDirectories } from './persistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WindowState {
  window: BrowserWindow;
  terminalManager: TerminalManager;
  fileWatcher: FileWatcher;
}

const windowStates = new Map<number, WindowState>();
export const pendingFolderPaths = new Map<number, string>();
let ipcRegistered = false;

function createWindow(openFolderPath?: string) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    show: false,
  });

  // Use electron-vite's env var for dev mode
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Only open devtools in dev mode
  if (process.env.ELECTRON_RENDERER_URL) {
    win.webContents.openDevTools();
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  // Store the folder path so the renderer can request it when React is mounted
  if (openFolderPath) {
    pendingFolderPaths.set(win.id, openFolderPath);
  }

  // Initialize per-window managers
  const tm = new TerminalManager(win.webContents);
  const fw = new FileWatcher(win.webContents);

  windowStates.set(win.id, { window: win, terminalManager: tm, fileWatcher: fw });

  // Register IPC handlers only once (they use event.sender to find the right window)
  if (!ipcRegistered) {
    registerIpcHandlers(windowStates);
    ipcRegistered = true;
  }

  win.on('closed', () => {
    const state = windowStates.get(win.id);
    if (state) {
      state.terminalManager.dispose();
      state.fileWatcher.stop();
      windowStates.delete(win.id);
    }
  });

  createMenu();
  return win;
}

export async function createMenu() {
  const isMac = process.platform === 'darwin';

  // Build "Open Recent" submenu from persisted recent directories
  let recentDirs: string[] = [];
  try {
    recentDirs = await getRecentDirectories();
  } catch {}

  const recentSubmenu: any[] = recentDirs.length > 0
    ? [
        ...recentDirs.map((dir) => ({
          label: dir.split('/').pop() || dir,
          sublabel: dir,
          click: () => {
            createWindow(dir);
          },
        })),
        { type: 'separator' },
        {
          label: 'Clear Recent',
          click: async () => {
            // We don't clear persistence here, just rebuild the menu
            // Users can rely on natural displacement
          },
        },
      ]
    : [{ label: 'No Recent Folders', enabled: false }];

  const template: any[] = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const focusedWin = BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(focusedWin || BrowserWindow.getAllWindows()[0], {
              properties: ['openDirectory'],
            });
            if (!result.canceled && result.filePaths[0]) {
              createWindow(result.filePaths[0]);
            }
          },
        },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const focusedWin = BrowserWindow.getFocusedWindow();
            focusedWin?.webContents.send('menu:newFile');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('ready', () => createWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  for (const state of windowStates.values()) {
    state.terminalManager.dispose();
    state.fileWatcher.stop();
  }
});
