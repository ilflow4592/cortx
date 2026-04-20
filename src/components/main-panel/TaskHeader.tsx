/**
 * Task header — title/status/branch + start/pause/resume/done/delete/toggle controls.
 *
 * 윈도우 드래그/더블클릭 최대화 영역도 포함. MainPanel에서 ~100줄을 분리.
 */
import { Play, Pause, Check, Trash2, RotateCcw, Undo2 } from 'lucide-react';
import type { Task, InterruptReason, PhaseStatus, PipelinePhase } from '../../types/task';
import { useTaskStore } from '../../stores/taskStore';
import { useContextHistoryStore } from '../../stores/contextHistoryStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { formatTime } from '../../utils/time';
import { useT } from '../../i18n';

interface Props {
  task: Task;
  onPauseRequest: () => void;
  onDeleteRequest: () => void;
}

export function TaskHeader({ task, onPauseRequest, onDeleteRequest }: Props) {
  const t = useT();
  const startTask = useTaskStore((s) => s.startTask);
  const resumeTask = useTaskStore((s) => s.resumeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);

  const badgeCls = task.status === 'active' ? 'active' : task.status === 'paused' ? 'paused' : 'waiting';
  const statusLabel =
    task.status === 'active'
      ? t('task.status.active')
      : task.status === 'paused'
        ? t('task.status.paused')
        : task.status === 'waiting'
          ? t('task.status.waiting')
          : task.status;

  const handleResume = async () => {
    await useContextHistoryStore.getState().detectDelta(task.id, task.branchName);
    resumeTask(task.id);
  };

  const handleResetTimer = () => {
    if (!window.confirm('Reset timer, status & interrupts?')) return;
    updateTask(task.id, { elapsedSeconds: 0, interrupts: [] });
    setTaskStatus(task.id, 'waiting');
  };

  return (
    <div
      className="main-header"
      role="presentation"
      onMouseDown={async (e) => {
        if (e.buttons === 1 && (e.target as HTMLElement).closest('.mh-right') === null) {
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().startDragging();
          } catch {
            /* ignore */
          }
        }
      }}
      onDoubleClick={async (e) => {
        if ((e.target as HTMLElement).closest('.mh-right')) return;
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const w = getCurrentWindow();
          if (await w.isMaximized()) await w.unmaximize();
          else await w.maximize();
        } catch {
          /* ignore */
        }
      }}
    >
      <div className="mh-left">
        <span className="mh-title" title={task.title}>
          {task.title}
        </span>
        <span className={`mh-badge ${badgeCls}`}>
          <span className="dot" />
          {statusLabel}
        </span>
        {task.branchName && <span className="mh-branch">{task.branchName}</span>}
      </div>
      <div className="mh-right">
        <span className="mh-timer">{formatTime(task.elapsedSeconds)}</span>
        {task.elapsedSeconds > 0 && (
          <button
            className="mh-btn"
            style={{
              background: 'none',
              color: 'var(--fg-subtle)',
              border: '1px solid var(--border-strong)',
              borderRadius: 5,
              padding: '4px 6px',
              fontSize: 10,
            }}
            onClick={handleResetTimer}
            title="Reset timer"
          >
            <RotateCcw size={12} strokeWidth={1.5} />
          </button>
        )}
        {task.status === 'waiting' && (
          <button className="mh-btn start" onClick={() => startTask(task.id)}>
            <Play size={12} strokeWidth={1.5} /> {t('action.start')}
          </button>
        )}
        {task.status === 'active' && (
          <button className="mh-btn pause" onClick={onPauseRequest}>
            <Pause size={12} strokeWidth={1.5} /> {t('action.pause')}
          </button>
        )}
        {task.status === 'paused' && (
          <button className="mh-btn resume" onClick={handleResume}>
            <Play size={12} strokeWidth={1.5} /> {t('action.resume')}
          </button>
        )}
        {task.status !== 'done' ? (
          <button
            className="mh-btn done"
            onClick={() => {
              setTaskStatus(task.id, 'done');
              const cur = useTaskStore.getState().tasks.find((tt) => tt.id === task.id);
              if (cur?.pipeline?.enabled) {
                const now = new Date().toISOString();
                const phases = { ...cur.pipeline.phases };
                const snapshot: Partial<Record<PipelinePhase, PhaseStatus>> = {};
                for (const key of Object.keys(phases) as PipelinePhase[]) {
                  const entry = phases[key];
                  snapshot[key] = entry?.status ?? 'pending';
                  phases[key] = {
                    ...entry,
                    status: 'done',
                    completedAt: entry?.completedAt ?? now,
                  };
                }
                updateTask(task.id, {
                  pipeline: { ...cur.pipeline, phases, completeSnapshot: snapshot },
                });
              }
            }}
          >
            <Check size={12} strokeWidth={1.5} /> {t('action.done')}
          </button>
        ) : (
          <button
            className="mh-btn"
            style={{
              background: 'none',
              border: '1px solid var(--border-strong)',
              color: 'var(--fg-secondary)',
            }}
            onClick={() => {
              setTaskStatus(task.id, 'waiting');
              const cur = useTaskStore.getState().tasks.find((tt) => tt.id === task.id);
              if (cur?.pipeline?.enabled) {
                const phases = { ...cur.pipeline.phases };
                const snap = cur.pipeline.completeSnapshot ?? {};
                for (const key of Object.keys(phases) as PipelinePhase[]) {
                  const entry = phases[key];
                  const restore = snap[key] ?? 'pending';
                  phases[key] = {
                    ...entry,
                    status: restore,
                    completedAt: restore === 'done' ? entry?.completedAt : undefined,
                  };
                }
                updateTask(task.id, {
                  pipeline: { ...cur.pipeline, phases, completeSnapshot: undefined },
                });
              }
            }}
            title="완료 취소 → 이전 상태로 복원"
          >
            <Undo2 size={12} strokeWidth={1.5} /> 완료 취소
          </button>
        )}
        <button
          className="mh-btn"
          style={{ background: 'none', color: 'var(--fg-dim)', border: '1px solid var(--border-muted)' }}
          onClick={onDeleteRequest}
          title="Delete task"
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
        <button
          className="mh-btn"
          style={{
            background: 'none',
            color: 'var(--fg-faint)',
            border: '1px solid var(--border-muted)',
            padding: '4px 8px',
          }}
          onClick={toggleRightPanel}
          title="Toggle right panel ⌘⇧B"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Pause 다이얼로그가 반환하는 interrupt reason — 타입 재노출로 MainPanel 호환 */
export type { InterruptReason };
