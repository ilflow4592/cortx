import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
// Dynamic imports to comply with CLAUDE.md rules
const tauriCore = () => import('@tauri-apps/api/core');
const tauriEvent = () => import('@tauri-apps/api/event');

interface TerminalViewProps {
  taskId: string;
  worktreePath: string;
  isActive?: boolean;
}

import { terminalCache } from '../utils/terminalState';

export function TerminalView({ taskId, worktreePath, isActive }: TerminalViewProps) {
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
      // Reuse existing wrapper — only attach if not already in this container
      if (cache.wrapper.parentElement !== container) {
        container.appendChild(cache.wrapper);
      }
    } else {
      // Create a persistent wrapper div
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      container.appendChild(wrapper);

      const term = new Terminal({
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Symbols Nerd Font', monospace",
        theme: {
          background: 'var(--bg-panel)',
          foreground: '#d4d4d8',
          cursor: '#6366f1',
          cursorAccent: 'var(--bg-surface)',
          selectionBackground: '#6366f140',
          black: 'var(--bg-panel)',
          red: '#ef4444',
          green: '#34d399',
          yellow: '#eab308',
          blue: '#6366f1',
          magenta: '#c084fc',
          cyan: '#67e8f9',
          white: 'var(--fg-primary)',
          brightBlack: 'var(--fg-subtle)',
          brightRed: '#f87171',
          brightGreen: '#6ee7b7',
          brightYellow: '#fde047',
          brightBlue: '#818cf8',
          brightMagenta: '#d8b4fe',
          brightCyan: '#a5f3fc',
          brightWhite: 'var(--fg-primary)',
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
        tauriCore().then(({ invoke }) => invoke('pty_write', { id: ptyId, data })).catch(() => {});
      });

      term.onResize(({ rows, cols }) => {
        tauriCore().then(({ invoke }) => invoke('pty_resize', { id: ptyId, rows, cols })).catch(() => {});
      });

      const currentCache = cache;
      (async () => {
        try {
          const { listen } = await tauriEvent();
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
          currentCache.unlistenExit = await listen<string>(`pty-exit-${ptyId}`, () => {
            currentCache.term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
            currentCache.spawned = false;
            currentCache.claudeActive = false;
          });

          if (!currentCache.spawned) {
            currentCache.spawned = true;
            const { invoke } = await tauriCore();
            await invoke('pty_spawn', { id: ptyId, cwd });
            // fit() at line ~89 already sets dimensions via onResize callback
            // No manual pty_resize needed — avoids double SIGWINCH → double banner
          }
        } catch (err) {
          currentCache.term.write(`\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`);
          currentCache.spawned = false;
        }
      })();
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver((entries) => {
      clearTimeout(resizeTimer);
      // Skip if container is invisible (display:none → width/height = 0)
      const entry = entries[0];
      if (!entry || entry.contentRect.width < 50 || entry.contentRect.height < 50) return;

      resizeTimer = setTimeout(() => {
        try {
          if (!cache) return;
          const prevCols = cache.term.cols;
          const prevRows = cache.term.rows;
          cache.fit.fit();
          const { rows, cols } = cache.term;
          if (cols > 10 && rows > 3 && (cols !== prevCols || rows !== prevRows)) {
            import('@tauri-apps/api/core').then(({ invoke: inv }) =>
              inv('pty_resize', { id: `term-${taskId}`, rows, cols })
            ).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      }, 300);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      // Keep wrapper in DOM — don't detach/reattach (causes xterm reflow issues)
    };
  }, [taskId, worktreePath]);

  // Auto-focus + fit terminal when tab becomes active
  useEffect(() => {
    if (isActive) {
      const cache = terminalCache.get(taskId);
      if (cache && containerRef.current) {
        // Wait for container to have real dimensions after display:none → contents
        requestAnimationFrame(() => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect || rect.width < 50) return; // still hidden
          const prevCols = cache.term.cols;
          cache.fit.fit();
          cache.term.focus();
          const { rows, cols } = cache.term;
          if (cols > 10 && rows > 3 && cols !== prevCols) {
            import('@tauri-apps/api/core').then(({ invoke: inv }) =>
              inv('pty_resize', { id: `term-${taskId}`, rows, cols })
            ).catch(() => {});
          }
        });
      }
    }
  }, [isActive, taskId]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', padding: 8, background: 'var(--bg-panel)', overflow: 'hidden' }}
    />
  );
}
