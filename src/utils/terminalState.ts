import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalCache {
  term: Terminal;
  fit: FitAddon;
  wrapper: HTMLDivElement;
  cwd: string;
  unlistenData: UnlistenFn | null;
  unlistenExit: UnlistenFn | null;
  spawned: boolean;
  claudeActive: boolean;
}

export const terminalCache = new Map<string, TerminalCache>();

/** Check if Claude CLI is active in the terminal for a given task */
export function isClaudeActiveInTerminal(taskId: string): boolean {
  return terminalCache.get(taskId)?.claudeActive ?? false;
}
