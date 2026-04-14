import type { McpServerStatus } from '../../stores/contextPackStore';

interface ServerChipProps {
  server: McpServerStatus;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * A single MCP server status chip — coloured pill showing status
 * (connected / disabled / auth-needed / failed) and the server name.
 * Click toggles a detail dropdown rendered by the parent.
 */
export function ServerChip({ server, isSelected, onSelect }: ServerChipProps) {
  const isDisabled = server.disabled;
  const needsAuth = server.status === 'auth-needed';
  const isReady = !isDisabled && server.status === 'ready';
  const statusIcon = isDisabled ? '○' : isReady ? '✓' : needsAuth ? '⚠' : '✗';
  const statusColor = isDisabled ? 'var(--fg-dim)' : isReady ? '#34d399' : needsAuth ? '#eab308' : '#ef4444';
  const statusLabel = isDisabled ? 'disabled' : isReady ? 'connected' : needsAuth ? 'auth-needed' : 'failed';

  return (
    <span
      onClick={onSelect}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        background: isDisabled ? 'transparent' : isReady ? 'rgba(52,211,153,0.06)' : 'rgba(234,179,8,0.06)',
        border: `1px solid ${
          isSelected
            ? 'var(--accent-bright)'
            : isDisabled
              ? 'var(--bg-surface-hover)'
              : isReady
                ? 'rgba(52,211,153,0.15)'
                : 'rgba(234,179,8,0.15)'
        }`,
        color: statusColor,
        cursor: 'pointer',
        opacity: isDisabled ? 0.5 : 1,
      }}
      title={`${server.name} · ${statusLabel}`}
    >
      <span style={{ fontSize: 10 }}>{statusIcon}</span>
      {server.name}
    </span>
  );
}
