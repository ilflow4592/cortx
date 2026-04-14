/**
 * SelectionActionsPanel — 선택된 태스크가 있을 때 노출되는 액션 패널.
 *
 * - Run Pipeline 버튼: 선택된 태스크들에 대해 /pipeline:dev-task 실행
 * - Reset Selected 버튼 + 확인 UI: 선택된 태스크들 초기화 (git/timer/session/cache)
 *
 * 컨테이너(Sidebar)는 selection 상태와 reset 액션을 주입한다.
 */
import { Play, RotateCcw } from 'lucide-react';

interface SelectionActionsPanelProps {
  selectedCount: number;
  showResetConfirm: boolean;
  onRun: () => void;
  onReset: () => void;
  onShowResetConfirm: () => void;
  onCancelResetConfirm: () => void;
}

export function SelectionActionsPanel({
  selectedCount,
  showResetConfirm,
  onRun,
  onReset,
  onShowResetConfirm,
  onCancelResetConfirm,
}: SelectionActionsPanelProps) {
  if (selectedCount === 0) return null;

  return (
    <div style={{ padding: '8px 16px' }}>
      <button
        onClick={onRun}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent-bg)',
          color: 'var(--accent)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 200ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent-bg)';
          e.currentTarget.style.borderColor = 'var(--accent-border)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--accent-bg)';
          e.currentTarget.style.borderColor = 'var(--accent-bg)';
        }}
      >
        <Play size={12} strokeWidth={2} /> Run Pipeline ({selectedCount})
      </button>
      {showResetConfirm && (
        <div style={{ padding: '8px 0', marginTop: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-secondary)', marginBottom: 6 }}>
            Reset {selectedCount} tasks?
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginBottom: 8 }}>
            Pipeline, timer, Claude session, git changes will be cleared.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onReset}
              style={{
                padding: '4px 12px',
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 600,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#ef4444',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reset
            </button>
            <button
              onClick={onCancelResetConfirm}
              style={{
                padding: '4px 12px',
                borderRadius: 5,
                fontSize: 10,
                background: 'none',
                border: '1px solid var(--fg-dim)',
                color: 'var(--fg-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {!showResetConfirm && (
        <button
          onClick={onShowResetConfirm}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            background: 'none',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 6,
            transition: 'all 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
          }}
        >
          <RotateCcw size={12} strokeWidth={1.5} /> Reset Selected ({selectedCount})
        </button>
      )}
    </div>
  );
}
