import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface TerminalViewProps {
  taskId: string;
  worktreePath: string;
}

// Cache terminal instances + their DOM wrapper per task
interface TerminalCache {
  term: Terminal;
  fit: FitAddon;
  wrapper: HTMLDivElement;
  cwd: string;
  unlistenData: UnlistenFn | null;
  unlistenExit: UnlistenFn | null;
  spawned: boolean;
  claudeActive: boolean;
}

const terminalCache = new Map<string, TerminalCache>();

/** Check if Claude CLI is active in the terminal for a given task */
export function isClaudeActiveInTerminal(taskId: string): boolean {
  return terminalCache.get(taskId)?.claudeActive ?? false;
}

export function TerminalView({ taskId, worktreePath }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ptyId = `term-${taskId}`;
    const cwd = worktreePath && worktreePath !== '' ? worktreePath : '~';
    const container = containerRef.current;
    let cache = terminalCache.get(taskId);

    // Invalidate cache if cwd changed (e.g. worktree created after initial open)
    if (cache && cache.cwd !== cwd) {
      cache.unlistenData?.();
      cache.unlistenExit?.();
      cache.term.dispose();
      terminalCache.delete(taskId);
      cache = undefined;
    }

    if (cache) {
      // Move existing wrapper DOM into this container
      container.appendChild(cache.wrapper);
      setTimeout(() => cache!.fit.fit(), 50);
    } else {
      // Create a persistent wrapper div
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      container.appendChild(wrapper);

      const term = new Terminal({
        fontSize: 13,
        fontFamily: "'JetBrains Mono', monospace",
        theme: {
          background: '#0c0c12',
          foreground: '#d4d4d8',
          cursor: '#6366f1',
          cursorAccent: '#06060a',
          selectionBackground: '#6366f140',
          black: '#0c0c12', red: '#ef4444', green: '#34d399', yellow: '#eab308',
          blue: '#6366f1', magenta: '#c084fc', cyan: '#67e8f9', white: '#e4e4e7',
          brightBlack: '#52525b', brightRed: '#f87171', brightGreen: '#6ee7b7',
          brightYellow: '#fde047', brightBlue: '#818cf8', brightMagenta: '#d8b4fe',
          brightCyan: '#a5f3fc', brightWhite: '#fafafa',
        },
        cursorBlink: true,
        scrollback: 5000,
        allowProposedApi: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(wrapper);

      cache = { term, fit, wrapper, cwd, unlistenData: null, unlistenExit: null, spawned: false, claudeActive: false };
      terminalCache.set(taskId, cache);

      setTimeout(() => fit.fit(), 50);

      term.onData((data) => {
        invoke('pty_write', { id: ptyId, data }).catch(() => {});
      });

      term.onResize(({ rows, cols }) => {
        invoke('pty_resize', { id: ptyId, rows, cols }).catch(() => {});
      });

      const currentCache = cache;
      (async () => {
        try {
          currentCache.unlistenData = await listen<string>(`pty-data-${ptyId}`, (event) => {
            currentCache.term.write(event.payload);
            // Detect Claude CLI activity: look for Claude prompt marker (❯) or banner
            const data = event.payload;
            if (data.includes('Claude Code') || data.includes('❯')) {
              currentCache.claudeActive = true;
            }
            // Detect Claude exit (back to shell prompt)
            if (data.includes('[Process exited]') || data.includes('$ ') || data.includes('% ')) {
              currentCache.claudeActive = false;
            }
          });
          currentCache.unlistenExit = await listen(`pty-exit-${ptyId}`, () => {
            currentCache.term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
            currentCache.spawned = false;
            currentCache.claudeActive = false;
          });

          if (!currentCache.spawned) {
            currentCache.spawned = true;
            await invoke('pty_spawn', { id: ptyId, cwd });
          }

          const { rows, cols } = currentCache.term;
          await invoke('pty_resize', { id: ptyId, rows, cols });
        } catch (err) {
          currentCache.term.write(`\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`);
          currentCache.spawned = false;
        }
      })();
    }

    const resizeObserver = new ResizeObserver(() => {
      try { cache?.fit.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      // Detach wrapper from container but keep it alive in cache
      if (cache?.wrapper.parentElement === container) {
        container.removeChild(cache.wrapper);
      }
    };
  }, [taskId, worktreePath]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', padding: 8, background: '#0c0c12', overflow: 'hidden' }}
    />
  );
}
