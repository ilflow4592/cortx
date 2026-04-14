/**
 * DoneTasksList — 완료(done) 태스크 목록 + hover 시 노출되는 Undo 버튼.
 *
 * Undo 버튼은 클릭 시 task.status를 'waiting'으로 되돌린다.
 */
import { CheckCircle2 } from 'lucide-react';
import { formatTime } from '../../utils/time';
import type { Task } from '../../types/task';

interface DoneTasksListProps {
  tasks: Task[];
  onUndone: (taskId: string) => void;
}

export function DoneTasksList({ tasks, onUndone }: DoneTasksListProps) {
  if (tasks.length === 0) return null;

  return (
    <>
      <div className="sb-section" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 size={12} color="#34d399" strokeWidth={2} /> Done
      </div>
      {tasks.map((task) => (
        <div
          key={task.id}
          className="task-row-wrap"
          style={{
            padding: '0 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
            height: 77,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, paddingRight: 50 }}>
            <div className="sb-dot done" />
            <span
              style={{
                fontSize: 13,
                color: 'var(--fg-dim)',
                textDecoration: 'line-through',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {task.title}
            </span>
          </div>
          <span className="sb-timer">{formatTime(task.elapsedSeconds)}</span>
          <button
            onClick={() => onUndone(task.id)}
            className="task-delete-btn"
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
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#34d39920';
              e.currentTarget.style.color = '#34d399';
              e.currentTarget.style.borderColor = '#34d39940';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--border-muted)';
              e.currentTarget.style.color = 'var(--fg-faint)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            title="Undo — move back to waiting"
          >
            ↩
          </button>
        </div>
      ))}
    </>
  );
}
