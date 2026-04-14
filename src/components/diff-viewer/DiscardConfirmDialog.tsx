/** Discard file / Discard all 공통 확인 모달. */
import { Trash2 } from 'lucide-react';

export interface DiscardTarget {
  type: 'file' | 'all';
  path?: string;
}

interface DiscardConfirmDialogProps {
  target: DiscardTarget;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DiscardConfirmDialog({ target, onCancel, onConfirm }: DiscardConfirmDialogProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'default',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 420,
          maxWidth: '90vw',
          background: 'var(--bg-panel)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10,
          padding: 20,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 8 }}>
          {target.type === 'all' ? 'Discard all unstaged changes?' : 'Discard file changes?'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--fg-subtle)',
            marginBottom: 16,
            fontFamily: target.type === 'file' ? "'JetBrains Mono', monospace" : 'inherit',
          }}
        >
          {target.type === 'file'
            ? target.path
            : 'All uncommitted changes in unstaged files will be lost. This cannot be undone.'}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px',
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
              padding: '6px 14px',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 500,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Trash2 size={11} strokeWidth={1.5} /> Discard
          </button>
        </div>
      </div>
    </div>
  );
}
