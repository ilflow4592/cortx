/**
 * Slash command 삭제 확인 오버레이. SlashCommandBuilder 에서 추출.
 */
import type { SlashCommand } from './api';

interface Props {
  target: SlashCommand;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({ target, onCancel, onConfirm }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Cancel delete"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          border: 'none',
          padding: 0,
          cursor: 'default',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 380,
          background: 'var(--bg-panel)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10,
          padding: 18,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 8 }}>
          Delete command?
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--fg-subtle)',
            marginBottom: 16,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          /{target.name} ({target.source})
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '5px 12px',
              borderRadius: 5,
              fontSize: 11,
              background: 'none',
              border: '1px solid var(--fg-dim)',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '5px 12px',
              borderRadius: 5,
              fontSize: 11,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
