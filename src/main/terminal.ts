import { WebContents } from 'electron';
import { spawn } from 'node-pty';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';

interface TerminalInstance {
  id: string;
  pty: any;
  cwd: string;
  // Replay buffer: keeps ALL output so renderer can request it at any time.
  // This survives React StrictMode double-mounts, window reloads, etc.
  replayBuffer: string[];
  replayBytes: number;
  // Once true, data is ALSO sent live via webContents.send
  liveSending: boolean;
}

// Max replay buffer size (~512KB) — enough for a full terminal session
const MAX_REPLAY_BYTES = 512 * 1024;

export class TerminalManager {
  private webContents: WebContents;
  private terminals: Map<string, TerminalInstance> = new Map();

  constructor(webContents: WebContents) {
    this.webContents = webContents;
  }

  private detectShell(): string {
    const candidates = [
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh',
    ].filter(Boolean) as string[];

    for (const shell of candidates) {
      try {
        if (fs.existsSync(shell)) return shell;
      } catch {
        continue;
      }
    }
    return '/bin/zsh';
  }

  createTerminal(cwd: string, launchClaude: boolean = true): string {
    const terminalId = crypto.randomUUID();
    const shell = this.detectShell();
    const home = os.homedir();

    console.log(`[Terminal] Creating terminal: id=${terminalId.slice(0, 8)}, shell=${shell}, cwd=${cwd}`);

    // Build environment
    const baseEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) baseEnv[k] = v;
    }

    const env: Record<string, string> = {
      ...baseEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      HOME: home,
      SHELL: shell,
      USER: process.env.USER || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    const defaultPath = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
    if (!env.PATH || env.PATH === '') {
      env.PATH = defaultPath;
    }
    const extraPaths = [
      `${home}/.local/bin`,
      `${home}/.nvm/versions/node`,
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
    ];
    for (const p of extraPaths) {
      if (!env.PATH.includes(p)) {
        env.PATH = `${p}:${env.PATH}`;
      }
    }

    try {
      const pty = spawn(shell, ['-l'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env,
      });

      const terminalInstance: TerminalInstance = {
        id: terminalId,
        pty,
        cwd,
        replayBuffer: [],
        replayBytes: 0,
        liveSending: false,
      };

      this.terminals.set(terminalId, terminalInstance);

      // Handle pty data: always buffer for replay, also send live when enabled
      pty.onData((data: string) => {
        if (this.webContents.isDestroyed()) return;
        const inst = this.terminals.get(terminalId);
        if (!inst) return;

        // Always append to replay buffer
        inst.replayBuffer.push(data);
        inst.replayBytes += data.length;

        // Trim replay buffer if it exceeds max size
        while (inst.replayBytes > MAX_REPLAY_BYTES && inst.replayBuffer.length > 1) {
          const removed = inst.replayBuffer.shift()!;
          inst.replayBytes -= removed.length;
        }

        // Send live if renderer has subscribed
        if (inst.liveSending) {
          this.webContents.send('terminal:data', terminalId, data);
        }
      });

      pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        console.log(`[Terminal] Process exited: id=${terminalId.slice(0, 8)}, exitCode=${exitCode}, signal=${signal}`);
        if (!this.webContents.isDestroyed()) {
          this.webContents.send('terminal:exit', terminalId);
        }
        this.terminals.delete(terminalId);
      });

      // Auto-launch claude after a short delay for shell initialization
      if (launchClaude) {
        setTimeout(() => {
          try {
            this.writeToTerminal(terminalId, ' claude --enable-auto-mode --permission-mode acceptEdits\r');
          } catch {
            // Terminal may have been disposed
          }
        }, 800);
      }

      return terminalId;
    } catch (error) {
      console.error('[Terminal] Error creating terminal:', error);
      throw error;
    }
  }

  /**
   * Called by the renderer when its xterm + data listener are ready.
   *
   * Returns the full replay buffer so the renderer can catch up on any output
   * that arrived before the listener was registered. Enables live sending
   * for all future pty output.
   *
   * Safe to call multiple times (React StrictMode double-mount):
   * - Each call returns the current replay buffer
   * - Live sending is enabled on the first call and stays enabled
   */
  markRendererReady(terminalId: string): string[] {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      console.warn(`[Terminal] markRendererReady: terminal ${terminalId.slice(0, 8)} not found`);
      return [];
    }

    console.log(`[Terminal] markRendererReady: id=${terminalId.slice(0, 8)}, buffered=${terminal.replayBuffer.length} chunks (${terminal.replayBytes} bytes), wasLive=${terminal.liveSending}`);

    // Enable live sending (idempotent)
    terminal.liveSending = true;

    // Return a snapshot of the replay buffer.
    // Don't clear it — StrictMode may call this again, and the buffer
    // continues to serve as history for the terminal session.
    return [...terminal.replayBuffer];
  }

  writeToTerminal(terminalId: string, data: string): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal ${terminalId} not found`);
    }
    terminal.pty.write(data);
  }

  resizeTerminal(terminalId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;
    try {
      terminal.pty.resize(cols, rows);
    } catch {
      // Ignore resize errors on dead terminals
    }
  }

  disposeTerminal(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;
    try {
      terminal.pty.kill();
    } catch {
      // Already dead
    }
    this.terminals.delete(terminalId);
  }

  dispose(): void {
    for (const [_, terminal] of this.terminals) {
      try {
        terminal.pty.kill();
      } catch (error) {
        console.error('Error killing terminal:', error);
      }
    }
    this.terminals.clear();
  }
}
