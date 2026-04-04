import { useEffect, useRef, useCallback } from 'react';
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

export function TerminalView({ taskId, worktreePath }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef<string | null>(null);
  const unlistenDataRef = useRef<UnlistenFn | null>(null);
  const unlistenExitRef = useRef<UnlistenFn | null>(null);

  const cleanup = useCallback(async () => {
    unlistenDataRef.current?.();
    unlistenExitRef.current?.();
    // Don't close PTY — keep session alive for task switching
    spawnedRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#06060a',
        foreground: '#d4d4d8',
        cursor: '#6366f1',
        cursorAccent: '#06060a',
        selectionBackground: '#6366f140',
        black: '#09090b',
        red: '#ef4444',
        green: '#34d399',
        yellow: '#eab308',
        blue: '#6366f1',
        magenta: '#c084fc',
        cyan: '#67e8f9',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde047',
        brightBlue: '#818cf8',
        brightMagenta: '#d8b4fe',
        brightCyan: '#a5f3fc',
        brightWhite: '#fafafa',
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
    fitRef.current = fit;

    // Fit after mount
    setTimeout(() => fit.fit(), 50);

    const ptyId = taskId;
    const cwd = worktreePath || '/';

    // Spawn PTY
    (async () => {
      try {
        await invoke('pty_spawn', { id: ptyId, cwd });
        spawnedRef.current = ptyId;

        // Listen for PTY data
        unlistenDataRef.current = await listen<string>(`pty-data-${ptyId}`, (event) => {
          term.write(event.payload);
        });

        // Listen for PTY exit
        unlistenExitRef.current = await listen(`pty-exit-${ptyId}`, () => {
          term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
        });

        // Send resize
        const { rows, cols } = term;
        await invoke('pty_resize', { id: ptyId, rows, cols });
      } catch (err) {
        term.write(`\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`);
      }
    })();

    // Forward input to PTY
    term.onData((data) => {
      if (spawnedRef.current) {
        invoke('pty_write', { id: spawnedRef.current, data }).catch(() => {});
      }
    });

    // Handle resize
    term.onResize(({ rows, cols }) => {
      if (spawnedRef.current) {
        invoke('pty_resize', { id: spawnedRef.current, rows, cols }).catch(() => {});
      }
    });

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      cleanup();
    };
  }, [taskId, worktreePath, cleanup]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        padding: '8px',
        background: '#06060a',
        overflow: 'hidden',
      }}
    />
  );
}
