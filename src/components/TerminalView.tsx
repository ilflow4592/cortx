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

// Track spawned PTY sessions globally to avoid duplicates across re-mounts
const spawnedSessions = new Set<string>();

export function TerminalView({ taskId, worktreePath }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ptyId = `term-${taskId}`;
    const cwd = worktreePath || '/';

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
    term.open(containerRef.current);
    termRef.current = term;

    setTimeout(() => fit.fit(), 50);

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    (async () => {
      try {
        // Listen first
        unlistenData = await listen<string>(`pty-data-${ptyId}`, (event) => {
          term.write(event.payload);
        });
        unlistenExit = await listen(`pty-exit-${ptyId}`, () => {
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
          spawnedSessions.delete(ptyId);
        });

        // Only spawn if not already spawned
        if (!spawnedSessions.has(ptyId)) {
          spawnedSessions.add(ptyId);
          await invoke('pty_spawn', { id: ptyId, cwd });
        }

        const { rows, cols } = term;
        await invoke('pty_resize', { id: ptyId, rows, cols });
      } catch (err) {
        term.write(`\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`);
        spawnedSessions.delete(ptyId);
      }
    })();

    term.onData((data) => {
      invoke('pty_write', { id: ptyId, data }).catch(() => {});
    });

    term.onResize(({ rows, cols }) => {
      invoke('pty_resize', { id: ptyId, rows, cols }).catch(() => {});
    });

    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(containerRef.current);

    cleanupRef.current = () => {
      resizeObserver.disconnect();
      unlistenData?.();
      unlistenExit?.();
      term.dispose();
      termRef.current = null;
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [taskId, worktreePath]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', padding: 8, background: '#0c0c12', overflow: 'hidden' }}
    />
  );
}
