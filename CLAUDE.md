# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Markdown editor and browser built with Electron + React + TypeScript. Uses electron-vite for bundling, node-pty for the integrated terminal, and xterm.js for terminal rendering.

## Requirements

- Node.js 24+

## Development

```bash
npm run dev          # Start in dev mode
npm run build        # Production build
npm run start        # Preview production build
npm run package      # Build distributable via electron-builder
```

## Quality checks — run after every change

```bash
npm run lint         # ESLint (flat config, TS + React hooks)
npm run lint:fix     # ESLint with auto-fix
npm run typecheck    # TypeScript type checking (tsc --noEmit)
npm run ci           # Run both typecheck and lint
```

Always run `npm run ci` after making changes to catch type errors and lint issues before committing.

## Architecture

### Build targets (electron-vite)

Three separate builds configured in `electron.vite.config.ts`:
- **main** → `out/main` — Node.js (Electron main process)
- **preload** → `out/preload` — Bridge between main and renderer
- **renderer** → `out/renderer` — React + Vite (browser context)

TypeScript uses composite project references: `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer with JSX + DOM). The renderer uses `@` as a path alias for `src/renderer/`.

### Main process (`src/main/`)

- `index.ts` — Window creation, menu setup, app lifecycle. Multi-window: per-window state (TerminalManager + FileWatcher + BrowserWindow) stored in a `windowStates` Map.
- `ipc.ts` — ~40 IPC handlers organized by domain prefix: `dialog:*`, `fs:*`, `terminal:*`, `watcher:*`, `store:*`, `git:*`, `export:*`. All handlers registered once globally; routed per-window via `event.sender` → `BrowserWindow.fromWebContents()`.
- `terminal.ts` — TerminalManager wraps node-pty. Key pattern: persistent `replayBuffer` (never cleared, 512KB cap) so new/remounted renderers can replay all prior output. Handles React 18 StrictMode double-mounts gracefully.
- `watcher.ts` — FileWatcher wraps chokidar. Filters for `.md`/`.txt` files, ignores hidden dirs and `node_modules`. Emits granular events: `fileChanged`, `fileAdded`, `fileRemoved`, `treeChanged`.
- `persistence.ts` — Stores recent directories and expanded folder paths in `app-state.json` under userData.

### Preload (`src/preload/`)

- `index.ts` — Context-isolated IPC bridge exposing ~40 methods on `window.api`. All renderer↔main communication goes through this bridge.

### Renderer (`src/renderer/`)

**State**: Single zustand store (`store/index.ts`) managing ~20 state fields: file tree, open tabs, terminal instances, sidebar/terminal dimensions, git status, revision queue.

**Key components**:
- `App.tsx` — Main layout: sidebar (FileTree or SearchPanel) | editor pane | terminal pane, with draggable resize handles.
- `CodeMirrorEditor.tsx` — CodeMirror 6 with custom gutter for comment markers. Uses `StateField` + `Decoration` for line selection highlighting. Debounced content updates; tracks external vs internal changes via `isExternalUpdate` ref.
- `MarkdownPreview.tsx` — react-markdown with remark-gfm + rehype-highlight + rehype-raw. Builds source-line mapping (`data-source-line` attributes) for scroll sync and gutter line selection. Mermaid diagrams lazy-loaded.
- `Terminal.tsx` — xterm.js with FitAddon + WebLinksAddon. Two-phase data flow: (1) request replay buffer on mount, (2) subscribe to live `terminal:data` events. Uses closure refs to survive StrictMode unmount/remount.
- `SearchPanel.tsx` — Full-text search across files with 300ms debounce, regex toggle. Uses sessionStorage to pass target line number to Editor.
- `QuickOpen.tsx` — Cmd+P file picker with intelligent ranking (exact → starts-with → contains).
- `FloatingCommentBox.tsx` + `RevisionQueuePanel.tsx` — Comment system: gutter click opens comment box, comments can be sent immediately to terminal (Cmd+Return) or batched into a revision queue (Shift+Return).

### Non-obvious patterns

- **node-pty is externalized** from the electron-vite bundle (native module) — see `electron.vite.config.ts`.
- **Terminal auto-launches Claude** in auto-mode after an 800ms shell startup delay.
- **PDF export** (`pdfExport.ts`) uses `ReactDOMServer.renderToString()` to build a standalone HTML document, then prints via a temporary hidden BrowserWindow.
- **Git diff** fetches the HEAD version via `git show HEAD:<path>` and compares against the current file content.
- **Expand state preservation** — file tree expand/collapse state is preserved across watcher-triggered refreshes and persisted to disk.
- **Split view modes** — each tab tracks its own view mode (`raw` | `rendered` | `split`).
- ESLint 9 flat config in `eslint.config.js`; `@typescript-eslint/no-explicit-any` is warn-level.
- CI runs lint + typecheck on push/PR to main (GitHub Actions).
