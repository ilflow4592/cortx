import { useState } from 'react';
import { X, CheckSquare, Square } from 'lucide-react';
import { formatTime } from '../../utils/time';

export function TaskRow({
  task,
  isActive,
  onSelect,
  onDelete,
  indent,
  color,
  selected,
  onToggleSelect,
  isRunning,
  isAsking,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    branchName: string;
    elapsedSeconds: number;
    pipeline?: { enabled: boolean; phases: Record<string, { status: string }> };
  };
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  indent: boolean;
  color?: string;
  selected?: boolean;
  onToggleSelect?: () => void;
  isRunning?: boolean;
  isAsking?: boolean;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cls = [
    'sb-task',
    isActive ? 'active' : '',
    task.status === 'paused' ? 'is-paused' : '',
    task.status === 'waiting' ? 'is-waiting' : '',
  ].join(' ');
  const dotCls = task.status === 'active' ? 'running' : task.status === 'paused' ? 'paused' : 'waiting';

  return (
    <div className="task-row-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {onToggleSelect && task.status !== 'done' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          aria-label={selected ? 'Deselect task' : 'Select task'}
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            zIndex: 5,
            background: 'none',
            border: 'none',
            padding: 0,
          }}
        >
          {selected ? (
            <CheckSquare size={18} color="var(--accent)" strokeWidth={1.5} />
          ) : (
            <Square size={18} color="var(--fg-dim)" strokeWidth={1.5} />
          )}
        </button>
      )}
      <button
        className={cls}
        onClick={onSelect}
        style={{
          ...(indent ? { paddingLeft: 24 } : {}),
          ...(isActive && color ? { borderLeftColor: color, boxShadow: `inset 3px 0 8px -3px ${color}50` } : {}),
        }}
      >
        <div className="sb-task-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div
              className={`sb-dot ${dotCls}`}
              style={{
                ...(color && task.status === 'active' ? { background: color, boxShadow: `0 0 6px ${color}80` } : {}),
                ...(isAsking ? { background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.6)' } : {}),
                ...(isRunning && !isAsking
                  ? {
                      background: 'var(--accent)',
                      boxShadow: '0 0 6px var(--accent-bg)',
                      animation: 'pulse-glow 1.5s infinite',
                    }
                  : {}),
              }}
            />
            <span className="sb-task-name" title={task.title}>
              {task.title}
            </span>
          </div>
          <span className="sb-timer">{task.status === 'waiting' ? '--:--' : formatTime(task.elapsedSeconds)}</span>
        </div>
        {task.branchName && (
          <div className="sb-meta">
            <code>{task.branchName}</code>
          </div>
        )}
        {task.pipeline?.enabled &&
          (() => {
            const phases = task.pipeline.phases;
            const activePhase = Object.entries(phases).find(([, v]) => v.status === 'in_progress');
            if (isAsking) {
              return (
                <div
                  style={{ fontSize: 9, color: '#f59e0b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b' }} />
                  Asking
                </div>
              );
            }
            if (activePhase) {
              return (
                <div
                  style={{
                    fontSize: 9,
                    color: 'var(--accent)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      animation: 'pulse 1.2s infinite',
                    }}
                  />
                  Running
                </div>
              );
            }
            return null;
          })()}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowConfirm(true);
        }}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'var(--border-muted)',
          border: '1px solid var(--border-strong)',
          color: 'var(--fg-faint)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0,
          transition: 'opacity 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#ef444420';
          e.currentTarget.style.color = '#ef4444';
          e.currentTarget.style.borderColor = '#ef444440';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--border-muted)';
          e.currentTarget.style.color = 'var(--fg-faint)';
          e.currentTarget.style.borderColor = 'var(--border-strong)';
        }}
        className="task-delete-btn"
        title="Delete task"
      >
        <X size={12} strokeWidth={1.5} />
      </button>

      {/* Inline delete confirmation */}
      {showConfirm && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'var(--border-muted)',
            border: '1px solid #ef444430',
            borderRadius: 8,
            padding: '8px 12px',
            zIndex: 20,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--fg-primary)' }}>
            {deleting ? 'Deleting...' : 'Delete this task?'}
          </span>
          {!deleting && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(true);
                  onDelete();
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Yes
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirm(false);
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'none',
                  border: '1px solid var(--fg-dim)',
                  color: '#888895',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                No
              </button>
            </>
          )}
          {deleting && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
        </div>
      )}
    </div>
  );
}
