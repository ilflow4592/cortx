import { Play } from 'lucide-react';
import type { Task, PipelinePhase } from '../../types/task';
import type { Project } from '../../types/project';
import { PHASE_NAMES, PHASE_ORDER } from '../../constants/pipeline';

interface TaskListProps {
  tasks: Task[];
  projects: Project[];
  onResume: (task: Task) => void;
  onDismiss: (task: Task) => void;
}

function activePhaseName(task: Task): string {
  const active = PHASE_ORDER.find((p) => task.pipeline?.phases[p]?.status === 'in_progress');
  return active ? PHASE_NAMES[active as PipelinePhase] : '—';
}

/**
 * Scrollable list of interrupted pipeline tasks. Each row shows the
 * task title, project chip, branch, and the phase that was running
 * when the app crashed. Emits resume / dismiss per row.
 */
export function TaskList({ tasks, projects, onResume, onDismiss }: TaskListProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      {tasks.map((task) => {
        const project = projects.find((p) => p.id === task.projectId);
        return (
          <div
            key={task.id}
            style={{
              padding: 14,
              marginBottom: 8,
              background: 'var(--bg-surface-hover)',
              border: '1px solid var(--border-muted)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--fg-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.title}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--fg-subtle)',
                    marginTop: 2,
                    display: 'flex',
                    gap: 8,
                  }}
                >
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
                  {task.branchName && <span style={{ color: 'var(--fg-faint)' }}>{task.branchName}</span>}
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
                onClick={() => onResume(task)}
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
                onClick={() => onDismiss(task)}
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
                취소
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
