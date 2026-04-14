/** 프로젝트 삭제 확인 모달 — 연관 태스크 개수를 안내. */
import { Trash2 } from 'lucide-react';

interface Props {
  name: string;
  taskCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteProjectDialog({ name, taskCount, onConfirm, onCancel }: Props) {
  const msg =
    taskCount > 0
      ? `This will delete the project and its ${taskCount} task${taskCount > 1 ? 's' : ''}. This action cannot be undone.`
      : 'Are you sure you want to delete this project? This action cannot be undone.';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={18} strokeWidth={1.5} color="#ef4444" /> Delete Project
          </h2>
          <button className="modal-close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--fg-secondary)', marginBottom: 8 }}>
            <strong style={{ color: 'var(--fg-primary)' }}>&quot;{name}&quot;</strong>
          </p>
          <p style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>{msg}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="btn"
              style={{ background: '#ef4444', color: '#e5e5e5' }}
              onClick={onConfirm}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
