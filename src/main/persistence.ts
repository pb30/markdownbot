import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

interface AppState {
  recentDirectories: string[];
  expandedPaths: Record<string, string[]>;
}

const STATE_FILE = path.join(app.getPath('userData'), 'app-state.json');

let cachedState: AppState | null = null;

async function loadState(): Promise<AppState> {
  if (cachedState) return cachedState;
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    cachedState = JSON.parse(data);
    return cachedState!;
  } catch {
    cachedState = { recentDirectories: [], expandedPaths: {} };
    return cachedState;
  }
}

async function saveState(state: AppState): Promise<void> {
  cachedState = state;
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function getRecentDirectories(): Promise<string[]> {
  const state = await loadState();
  return state.recentDirectories;
}

export async function addRecentDirectory(dirPath: string): Promise<void> {
  const state = await loadState();
  // Remove if already exists, add to front
  state.recentDirectories = state.recentDirectories.filter(d => d !== dirPath);
  state.recentDirectories.unshift(dirPath);
  // Cap at 10
  state.recentDirectories = state.recentDirectories.slice(0, 10);
  await saveState(state);
}

export async function getExpandedPaths(rootDir: string): Promise<string[] | null> {
  const state = await loadState();
  return state.expandedPaths[rootDir] || null;
}

export async function setExpandedPaths(rootDir: string, paths: string[]): Promise<void> {
  const state = await loadState();
  state.expandedPaths[rootDir] = paths;
  await saveState(state);
}
