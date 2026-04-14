import { useState } from 'react';
import type { InterruptReason } from '../types/task';
import { ModalBackdrop } from './common/ModalBackdrop';

const reasons: { value: InterruptReason; label: string; icon: string }[] = [
  { value: 'interrupt', label: 'Interrupted', icon: '🔔' },
  { value: 'other-task', label: 'Switching task', icon: '🔄' },
  { value: 'break', label: 'Taking a break', icon: '☕' },
  { value: 'meeting', label: 'Meeting', icon: '📅' },
  { value: 'other', label: 'Other', icon: '💭' },
];

export function PauseDialog({
  onConfirm,
  onCancel,
  defaultMemo,
}: {
  onConfirm: (reason: InterruptReason, memo: string) => void;
  onCancel: () => void;
  defaultMemo: string;
}) {
  const [reason, setReason] = useState<InterruptReason>('interrupt');
  const [memo, setMemo] = useState(defaultMemo);

  return (
    <ModalBackdrop onClose={onCancel} dialogStyle={{ width: 400 }} ariaLabel="Pause task">
      <div className="modal-header">
        <h2>Pause Task</h2>
        <button className="modal-close" onClick={onCancel}>
          ×
        </button>
      </div>
      <div className="modal-body">
        <div className="field">
          <span className="field-label">Reason</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {reasons.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  border: reason === r.value ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--bg-chip)',
                  background: reason === r.value ? 'rgba(99,102,241,0.06)' : 'var(--bg-surface)',
                  color: reason === r.value ? '#818cf8' : '#71717a',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {r.icon} {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Memo (what were you doing?)</span>
          <input
            className="field-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Implementing auth flow..."
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn"
            style={{ background: '#eab308', color: '#09090b' }}
            onClick={() => onConfirm(reason, memo)}
          >
            ⏸ Pause
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
