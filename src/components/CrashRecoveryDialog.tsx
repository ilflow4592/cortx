/**
 * Crash recovery dialog — shown on startup when tasks are detected
 * in an "interrupted" state (active + pipeline in_progress).
 *
 * These tasks couldn't have ended in that state via normal shutdown
 * because Stop/Done/Clear all reset the status. So they must have been
 * interrupted by a crash, force-quit, or system shutdown.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { runPipeline } from '../utils/pipelineExec';
import { PHASE_ORDER } from '../constants/pipeline';
import { TaskList } from './crash-recovery/TaskList';
import type { Task } from '../types/task';

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
          background: 'var(--bg-panel)',
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
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <AlertTriangle size={20} color="#eab308" strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-primary)' }}>
              중단된 파이프라인이 있습니다
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>
              {interruptedTasks.length}개의 task가 비정상 종료되었습니다. 재개하거나 취소할 수 있습니다.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fg-faint)',
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
        <TaskList
          tasks={interruptedTasks}
          projects={projects}
          onResume={handleResume}
          onDismiss={handleDismiss}
        />

        {/* Footer */}
        {interruptedTasks.length > 1 && (
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--border-muted)',
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
                border: '1px solid var(--fg-dim)',
                color: 'var(--fg-muted)',
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
