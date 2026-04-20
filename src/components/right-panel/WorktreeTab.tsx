import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { useTaskStore } from '../../stores/taskStore';
import { logger } from '../../utils/logger';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function WorktreeTab({ task, taskProject }: { task: Task; taskProject: Project | null | undefined }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateTask = useTaskStore((s) => s.updateTask);

  const pipelineDone = task.pipeline?.phases?.done?.status === 'done';
  const hasWorktree = !!task.worktreePath && !!task.repoPath && task.worktreePath !== task.repoPath;
  const canCleanup = pipelineDone && hasWorktree && !busy;

  const doCleanup = async () => {
    if (!canCleanup || !task.worktreePath || !task.repoPath) return;
    setBusy(true);
    setError(null);
    try {
      await invoke('remove_worktree', { repoPath: task.repoPath, worktreePath: task.worktreePath });
      if (task.branchName) {
        await invoke('run_shell_command', {
          cwd: task.repoPath,
          command: `git branch -D ${task.branchName} 2>/dev/null`,
        }).catch(() => {});
      }
      updateTask(task.id, { worktreePath: undefined });
      setConfirming(false);
    } catch (e) {
      logger.error('worktree cleanup failed', e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {taskProject && (
        <>
          <div className="rp-section">Project</div>
          <div className="wt-info">
            <div className="wt-row">
              <span>Name</span>
              <span className="val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: taskProject.color }} />
                {taskProject.name}
              </span>
            </div>
            {taskProject.githubOwner && taskProject.githubRepo && (
              <div className="wt-row">
                <span>GitHub</span>
                <span className="val">
                  {taskProject.githubOwner}/{taskProject.githubRepo}
                </span>
              </div>
            )}
            <div className="wt-row">
              <span>Path</span>
              <span className="val">{taskProject.localPath || '—'}</span>
            </div>
          </div>
        </>
      )}
      <div className="rp-section">Worktree</div>
      <div className="wt-info">
        <div className="wt-row">
          <span>Branch</span>
          <span className="val">{task.branchName || '—'}</span>
        </div>
        <div className="wt-row">
          <span>Path</span>
          <span className="val">{task.worktreePath || task.repoPath || taskProject?.localPath || '—'}</span>
        </div>
        <div className="wt-row">
          <span>Repo</span>
          <span className="val">{task.repoPath || taskProject?.localPath || '—'}</span>
        </div>
        <div className="wt-row">
          <span>Status</span>
          <span className="val">{task.status}</span>
        </div>
        <div className="wt-row">
          <span>Layer</span>
          <span className="val">{task.layer || 'focus'}</span>
        </div>
      </div>
      {task.memo && (
        <>
          <div className="rp-section">Last Memo</div>
          <div className="memo-callout">{task.memo}</div>
        </>
      )}

      {hasWorktree && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => canCleanup && setConfirming(true)}
            disabled={!canCleanup}
            title={pipelineDone ? 'Worktree 정리' : '파이프라인이 완료(Done)되어야 활성화됩니다'}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              background: canCleanup ? 'rgba(239,68,68,0.08)' : 'var(--bg-chip)',
              border: `1px solid ${canCleanup ? 'rgba(239,68,68,0.3)' : 'var(--border-strong)'}`,
              borderRadius: 6,
              color: canCleanup ? '#ef4444' : 'var(--fg-dim)',
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: canCleanup ? 'pointer' : 'not-allowed',
              opacity: canCleanup ? 1 : 0.6,
            }}
          >
            <Trash2 size={13} strokeWidth={1.8} />
            Worktree 정리
          </button>
          {!pipelineDone && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--fg-subtle)', textAlign: 'center' }}>
              파이프라인 완료(Done) 이후 활성화
            </div>
          )}
        </div>
      )}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => !busy && setConfirming(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              padding: 0,
              cursor: busy ? 'wait' : 'default',
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              background: 'var(--bg-panel-alt)',
              border: '1px solid var(--border-strong)',
              borderRadius: 12,
              padding: '22px 26px',
              width: 380,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-primary)', marginBottom: 10 }}>
              Worktree 정리하시겠습니까?
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.7, marginBottom: 14 }}>
              다음 작업이 실행됩니다:
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--fg-secondary)' }}>
                <li>
                  Worktree 디렉토리 제거: <code style={{ fontSize: 11 }}>{task.worktreePath}</code>
                </li>
                {task.branchName && (
                  <li>
                    로컬 브랜치 삭제: <code style={{ fontSize: 11 }}>{task.branchName}</code>
                  </li>
                )}
              </ul>
            </div>
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 16 }}>
              이 작업은 되돌릴 수 없습니다. 커밋되지 않은 변경사항은 사라집니다.
            </div>
            {error && (
              <div
                style={{
                  fontSize: 11,
                  color: '#ef4444',
                  background: 'rgba(239,68,68,0.08)',
                  padding: '6px 10px',
                  borderRadius: 4,
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  background: 'none',
                  border: '1px solid var(--fg-dim)',
                  color: 'var(--fg-muted)',
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                취소
              </button>
              <button
                onClick={doCleanup}
                disabled={busy}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444',
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {busy ? '정리 중...' : '정리'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
