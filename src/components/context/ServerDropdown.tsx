import { terminalCache } from '../../utils/terminalState';
import type { McpServerStatus } from '../../stores/contextPackStore';

// Dynamic import to avoid static Tauri API import (CLAUDE.md rule)
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

interface ServerDropdownProps {
  server: McpServerStatus;
  projectCwd?: string;
  taskId?: string;
  configuring: boolean;
  onSwitchTab?: (tab: string) => void;
  onConfigureStart: () => void;
  onConfigureEnd: () => void;
  onClose: () => void;
}

/**
 * Detail popover for a selected MCP server chip — shows status,
 * command, args, config file location, plus a "Configure in Terminal"
 * action that switches to the terminal tab and runs `claude /mcp`.
 */
export function ServerDropdown({
  server,
  projectCwd,
  taskId,
  configuring,
  onSwitchTab,
  onConfigureStart,
  onConfigureEnd,
  onClose,
}: ServerDropdownProps) {
  const isDisabled = server.disabled;
  const needsAuth = server.status === 'auth-needed';
  const isReady = !isDisabled && server.status === 'ready';
  const statusIcon = isDisabled ? '○' : isReady ? '✓' : needsAuth ? '⚠' : '✗';
  const statusColor = isDisabled ? 'var(--fg-dim)' : isReady ? '#34d399' : needsAuth ? '#eab308' : '#ef4444';
  const statusLabel = isDisabled ? 'disabled' : isReady ? 'connected' : needsAuth ? 'auth-needed' : 'failed';

  const configLocationMap: Record<string, string> = {
    project: `${projectCwd || ''}/.mcp.json`,
    local: `${projectCwd || ''}/.claude/mcp.json`,
    global: '~/.claude.json',
    'claude.ai': 'claude.ai (cloud)',
    'built-in': 'built-in',
  };
  const configLocation = configLocationMap[server.source] || server.source;

  const handleConfigureInTerminal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (configuring) return;
    if (!taskId || !onSwitchTab) return;
    onConfigureStart();
    onClose();
    onSwitchTab('terminal');
    const termPtyId = `term-${taskId}`;

    // Wait for terminal to render + resize before sending commands
    setTimeout(() => {
      // Force terminal resize first
      const cache = terminalCache.get(taskId);
      if (cache) {
        cache.fit.fit();
        const { rows, cols } = cache.term;
        tauriInvoke('pty_resize', { id: termPtyId, rows, cols }).catch(() => {});
      }

      // Always: cd → claude → /mcp
      // If Claude is already running, cd and claude are harmless
      // (Claude treats them as chat messages)
      setTimeout(() => {
        const cdCmd = projectCwd ? `cd ${projectCwd.replace(/ /g, '\\ ')}\r` : '';
        if (cdCmd) tauriInvoke('pty_write', { id: termPtyId, data: cdCmd }).catch(() => {});
        setTimeout(() => {
          tauriInvoke('pty_write', { id: termPtyId, data: `claude\r` }).catch(() => {});
          setTimeout(() => {
            tauriInvoke('pty_write', { id: termPtyId, data: `/mcp\r` }).catch(() => {});
            setTimeout(onConfigureEnd, 1000);
          }, 3000);
        }, 500);
      }, 300);
    }, 500);
  };

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 200,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '10px 14px',
        width: 320,
        maxWidth: 'calc(100vw - 40px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
      ref={(el) => {
        if (!el) return;
        const chip = el.parentElement?.querySelector('span');
        if (!chip) return;
        const rect = chip.getBoundingClientRect();
        const spaceRight = window.innerWidth - rect.left;
        const spaceBelow = window.innerHeight - rect.bottom;
        el.style.top = (spaceBelow > 200 ? rect.bottom + 4 : rect.top - el.offsetHeight - 4) + 'px';
        el.style.left = (spaceRight > 340 ? rect.left : window.innerWidth - 340) + 'px';
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--fg-primary)',
          marginBottom: 8,
          borderBottom: '1px solid var(--bg-surface-hover)',
          paddingBottom: 6,
        }}
      >
        {server.name.charAt(0).toUpperCase() + server.name.slice(1)} MCP Server
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
        <span style={{ color: 'var(--fg-faint)' }}>Status: </span>
        <span style={{ color: statusColor }}>
          {statusIcon} {statusLabel}
        </span>
      </div>
      {server.command && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
          <span style={{ color: 'var(--fg-faint)' }}>Command: </span>
          <span style={{ fontFamily: 'monospace' }}>{server.command}</span>
        </div>
      )}
      {server.args && server.args.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
          <span style={{ color: 'var(--fg-faint)' }}>Args: </span>
          <span style={{ fontFamily: 'monospace' }}>{server.args.join(' ')}</span>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
        <span style={{ color: 'var(--fg-faint)' }}>Config location: </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{configLocation}</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          borderTop: '1px solid var(--bg-surface-hover)',
          paddingTop: 6,
        }}
      >
        {taskId && onSwitchTab && (
          <button
            disabled={configuring}
            onClick={handleConfigureInTerminal}
            style={{
              padding: '5px 0',
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: '#60a5fa',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            Configure in Terminal
          </button>
        )}
      </div>
    </div>
  );
}
