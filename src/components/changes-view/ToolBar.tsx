import { RotateCw, Trash2 } from 'lucide-react';

interface ToolBarProps {
  count: number;
  onDiscardAll: () => void;
  onRefresh: () => void;
}

export function ToolBar({ count, onDiscardAll, onRefresh }: ToolBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-strong)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 500 }}>
        Changes {count > 0 && <span style={{ color: 'var(--accent)' }}>{count}</span>}
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        {count > 0 && (
          <button
            onClick={onDiscardAll}
            title="Discard all changes"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fg-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        )}
        <button
          onClick={onRefresh}
          title="Refresh"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-subtle)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RotateCw size={14} strokeWidth={1.5} />
        </button>
      </span>
    </div>
  );
}
