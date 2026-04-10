/**
 * Crash recovery dialog — shown on startup when tasks are detected
 * in an "interrupted" state (active + pipeline in_progress).
 *
 * These tasks couldn't have ended in that state via normal shutdown
 * because Stop/Done/Clear all reset the status. So they must have been
 * interrupted by a crash, force-quit, or system shutdown.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Play, X } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { runPipeline } from '../utils/pipelineExec';
import { PHASE_NAMES, PHASE_ORDER } from '../constants/pipeline';
import type { Task, PipelinePhase } from '../types/task';

interface Props {
  onClose: () => void;
}

export function CrashRecoveryDialog({ onClose }: Props) {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Interrupted = active status + pipeline enabled + at least one phase in_progress
  const interruptedTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (dismissed.has(t.id)) return false;
      if (t.status !== 'active') return false;
      if (!t.pipeline?.enabled) return false;
      return PHASE_ORDER.some((p) => t.pipeline!.phases[p]?.status === 'in_progress');
    });
  }, [tasks, dismissed]);

  if (interruptedTasks.length === 0) return null;

  const handleResume = (task: Task) => {
    // Mark as dismissed so it doesn't show again
    setDismissed((prev) => new Set(prev).add(task.id));
    // Run dev-resume pipeline skill
    runPipeline(task.id, '/pipeline:dev-resume');
    if (interruptedTasks.length === 1) onClose();
  };

  const handleDismiss = (task: Task) => {
    // Reset status to waiting and clear pipeline in_progress markers
    const phases = { ...task.pipeline!.phases };
    PHASE_ORDER.forEach((p) => {
      if (phases[p]?.status === 'in_progress') {
        phases[p] = { ...phases[p], status: 'pending' };
      }
    });
    useTaskStore.getState().updateTask(task.id, {
      status: 'waiting',
      pipeline: { ...task.pipeline!, phases },
    });
    setDismissed((prev) => new Set(prev).add(task.id));
    if (interruptedTasks.length === 1) onClose();
  };

  const handleDismissAll = () => {
    for (const task of interruptedTasks) handleDismiss(task);
    onClose();
  };

  const activePhaseName = (task: Task): string => {
    const active = PHASE_ORDER.find((p) => task.pipeline?.phases[p]?.status === 'in_progress');
    return active ? PHASE_NAMES[active as PipelinePhase] : '—';
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: '90vw',
          maxHeight: '80vh',
          background: '#0c0c12',
          border: '1px solid #eab30840',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #1e2530',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AlertTriangle size={20} color="#eab308" strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e8eef5' }}>중단된 파이프라인이 있습니다</div>
            <div style={{ fontSize: 11, color: '#6b7585', marginTop: 2 }}>
              {interruptedTasks.length}개의 task가 비정상 종료되었습니다. 재개하거나 취소할 수 있습니다.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#4d5868',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {interruptedTasks.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                style={{
                  padding: 14,
                  marginBottom: 8,
                  background: '#141821',
                  border: '1px solid #1e2530',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#e8eef5',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7585', marginTop: 2, display: 'flex', gap: 8 }}>
                      {project && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 2,
                              background: project.color,
                              display: 'inline-block',
                            }}
                          />
                          {project.name}
                        </span>
                      )}
                      {task.branchName && <span style={{ color: '#4d5868' }}>{task.branchName}</span>}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#eab308',
                      background: 'rgba(234,179,8,0.08)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(234,179,8,0.2)',
                      flexShrink: 0,
                    }}
                  >
                    {activePhaseName(task)} 중단됨
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleResume(task)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: 5,
                      fontSize: 11,
                      fontWeight: 500,
                      background: 'rgba(52,211,153,0.1)',
                      border: '1px solid rgba(52,211,153,0.3)',
                      color: '#34d399',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Play size={11} strokeWidth={1.5} /> 재개
                  </button>
                  <button
                    onClick={() => handleDismiss(task)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 5,
                      fontSize: 11,
                      background: 'none',
                      border: '1px solid #3d4856',
                      color: '#8b95a5',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {interruptedTasks.length > 1 && (
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid #1e2530',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={handleDismissAll}
              style={{
                padding: '6px 14px',
                borderRadius: 5,
                fontSize: 11,
                background: 'none',
                border: '1px solid #3d4856',
                color: '#8b95a5',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              모두 취소
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
