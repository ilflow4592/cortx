import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BarChart3, CheckCircle2, Play, RotateCcw, Trash2 } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import { formatTime } from '../../utils/time';
import { ProjectGroup } from './ProjectGroup';
import { TaskRow } from './TaskRow';
import { usePipelineRunner } from './usePipelineRunner';
import type { Task } from '../../types/task';

export function Sidebar({
  onShowReport,
  onEditProject,
  onAddTaskForProject,
}: {
  onShowReport?: () => void;
  onAddTask?: () => void;
  onEditProject?: (id: string) => void;
  onAddTaskForProject?: (projectId: string) => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);
  const projects = useProjectStore((s) => s.projects);
  const removeProject = useProjectStore((s) => s.removeProject);

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<{
    id: string;
    name: string;
    taskCount: number;
  } | null>(null);

  const { runningPipelines, setRunningPipelines, askingTasks, setAskingTasks, runSelectedPipelines } =
    usePipelineRunner();

  const toggleSelect = (id: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear asking state when user has responded (last message is from 'user')
  if (askingTasks.size > 0) {
    import('../../utils/chatState').then(({ messageCache: mc }) => {
      const toRemove = [...askingTasks].filter((id) => {
        const msgs = mc.get(id);
        if (!msgs || msgs.length === 0) return true;
        return msgs[msgs.length - 1].role === 'user';
      });
      if (toRemove.length > 0) {
        setAskingTasks((prev) => {
          const n = new Set(prev);
          toRemove.forEach((id) => n.delete(id));
          return n;
        });
      }
    });
  }

  // Clear running indicator when pipeline is reset
  if (runningPipelines.size > 0) {
    const toRemove = [...runningPipelines].filter((id) => {
      const t = tasks.find((task) => task.id === id);
      return !t || !t.pipeline?.enabled || t.status === 'waiting';
    });
    if (toRemove.length > 0) {
      setRunningPipelines((prev) => {
        const n = new Set(prev);
        toRemove.forEach((id) => n.delete(id));
        return n;
      });
    }
  }

  const nonDone = tasks.filter((t) => t.status !== 'done');
  const doneList = tasks.filter((t) => t.status === 'done');
  const totalFocus = tasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const totalInterrupts = tasks.reduce((s, t) => s + (t.interrupts?.length || 0), 0);
  const totalInterruptTime = tasks.reduce(
    (s, t) => s + (t.interrupts || []).reduce((a, e) => a + e.durationSeconds, 0),
    0,
  );

  const handleDeleteTask = async (task: Pick<Task, 'id' | 'worktreePath' | 'repoPath' | 'branchName'>) => {
    const repoPath = task.repoPath || '';
    if (task.worktreePath && repoPath) {
      try {
        await invoke('remove_worktree', { repoPath, worktreePath: task.worktreePath });
      } catch {
        /* worktree might not exist */
      }
      if (task.branchName) {
        try {
          await invoke('run_shell_command', {
            cwd: repoPath,
            command: `git branch -D ${task.branchName} 2>/dev/null`,
          });
        } catch {
          /* branch might not exist */
        }
      }
    }
    removeTask(task.id);
  };

  const handleDeleteProject = (id: string, name: string) => {
    const projTasks = tasks.filter((t) => t.projectId === id);
    setDeleteProjectTarget({ id, name, taskCount: projTasks.length });
  };

  const confirmDeleteProject = () => {
    if (!deleteProjectTarget) return;
    const projTasks = tasks.filter((t) => t.projectId === deleteProjectTarget.id);
    projTasks.forEach((t) => removeTask(t.id));
    removeProject(deleteProjectTarget.id);
    setDeleteProjectTarget(null);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // All projects (even empty ones)
  const projectGroups = projects.map((proj) => ({
    project: proj,
    tasks: nonDone.filter((t) => t.projectId === proj.id),
  }));

  const unassigned = nonDone.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId));

  return (
    <div className="sidebar">
      <div
        className="sb-header"
        onMouseDown={async (e) => {
          if (e.buttons === 1 && (e.target as HTMLElement).tagName !== 'BUTTON') {
            try {
              const { getCurrentWindow } = await import('@tauri-apps/api/window');
              await getCurrentWindow().startDragging();
            } catch {
              /* ignore */
            }
          }
        }}
        onDoubleClick={async (e) => {
          if ((e.target as HTMLElement).tagName === 'BUTTON') return;
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
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e8eef5' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
        </span>
        <span className="sb-title" style={{ fontSize: 10 }}>
          Tasks
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {projects.length === 0 && nonDone.length === 0 && doneList.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              fontSize: 12,
              color: '#4d5868',
              lineHeight: 1.8,
              padding: 16,
            }}
          >
            <div>
              No projects yet.
              <br />
              Click 📁 in the dock to add a project.
            </div>
          </div>
        )}

        {/* Project groups */}
        {projectGroups.map(({ project, tasks: projTasks }) => (
          <ProjectGroup
            key={project.id}
            project={project}
            tasks={projTasks}
            activeTaskId={activeTaskId}
            isCollapsed={collapsedProjects.has(project.id)}
            selectedTasks={selectedTasks}
            runningPipelines={runningPipelines}
            askingTasks={askingTasks}
            onToggleCollapse={() => toggleCollapse(project.id)}
            onSelectTask={setActiveTask}
            onDeleteTask={handleDeleteTask}
            onToggleSelect={toggleSelect}
            onEditProject={onEditProject}
            onAddTaskForProject={onAddTaskForProject}
            onDeleteProject={handleDeleteProject}
          />
        ))}

        {/* Unassigned tasks */}
        {unassigned.length > 0 && (
          <>
            {projects.length > 0 && (
              <div className="sb-section" style={{ color: '#2a3642' }}>
                No project
              </div>
            )}
            {unassigned.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isActive={activeTaskId === task.id}
                onSelect={() => setActiveTask(task.id)}
                onDelete={() => handleDeleteTask(task)}
                indent={false}
                selected={selectedTasks.has(task.id)}
                onToggleSelect={() => toggleSelect(task.id)}
                isRunning={runningPipelines.has(task.id)}
                isAsking={askingTasks.has(task.id)}
              />
            ))}
          </>
        )}

        {/* Done */}
        {doneList.length > 0 && (
          <>
            <div className="sb-section" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={12} color="#34d399" strokeWidth={2} /> Done
            </div>
            {doneList.map((task) => (
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
                      color: '#3d4856',
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
                  onClick={() => setTaskStatus(task.id, 'waiting')}
                  className="task-delete-btn"
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: '#1e2530',
                    border: '1px solid #2a3642',
                    color: '#4d5868',
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
                    e.currentTarget.style.background = '#1e2530';
                    e.currentTarget.style.color = '#4d5868';
                    e.currentTarget.style.borderColor = '#2a3642';
                  }}
                  title="Undo — move back to waiting"
                >
                  ↩
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Run Pipeline button */}
      {selectedTasks.size > 0 && (
        <div style={{ padding: '8px 16px' }}>
          <button
            onClick={() => runSelectedPipelines(selectedTasks, () => setSelectedTasks(new Set()))}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: 'rgba(90,165,165,0.1)',
              border: '1px solid rgba(90,165,165,0.2)',
              color: '#5aa5a5',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 200ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(90,165,165,0.2)';
              e.currentTarget.style.borderColor = 'rgba(90,165,165,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(90,165,165,0.1)';
              e.currentTarget.style.borderColor = 'rgba(90,165,165,0.2)';
            }}
          >
            <Play size={12} strokeWidth={2} /> Run Pipeline ({selectedTasks.size})
          </button>
          {showResetConfirm && (
            <div style={{ padding: '8px 0', marginTop: 4 }}>
              <div style={{ fontSize: 11, color: '#c0c8d4', marginBottom: 6 }}>Reset {selectedTasks.size} tasks?</div>
              <div style={{ fontSize: 10, color: '#6b7585', marginBottom: 8 }}>
                Pipeline, timer, Claude session, git changes will be cleared.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => {
                    setShowResetConfirm(false);
                    const { messageCache, sessionCache } = await import('../../utils/chatState');
                    for (const id of selectedTasks) {
                      const t = tasks.find((task) => task.id === id);
                      if (!t) continue;
                      await invoke('claude_stop_task', { taskId: id }).catch(() => {});
                      const proj = t.projectId ? projects.find((p) => p.id === t.projectId) : null;
                      const taskCwd = t.worktreePath || t.repoPath || proj?.localPath || '';
                      if (taskCwd) {
                        await invoke('run_shell_command', {
                          cwd: taskCwd,
                          command: 'git checkout -- . 2>/dev/null',
                        }).catch(() => {});
                        await invoke('run_shell_command', { cwd: taskCwd, command: 'git clean -fd 2>/dev/null' }).catch(
                          () => {},
                        );
                        await invoke('run_shell_command', {
                          cwd: taskCwd,
                          command: 'git reset origin/develop 2>/dev/null',
                        }).catch(() => {});
                        await invoke('run_shell_command', {
                          cwd: taskCwd,
                          command: 'git checkout -- . 2>/dev/null',
                        }).catch(() => {});
                      }
                      useTaskStore
                        .getState()
                        .updateTask(id, { pipeline: undefined, elapsedSeconds: 0, interrupts: [] });
                      useTaskStore.getState().setTaskStatus(id, 'waiting');
                      messageCache.delete(id);
                      sessionCache.delete(id);
                    }
                    setSelectedTasks(new Set());
                  }}
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
                  onClick={() => setShowResetConfirm(false)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 5,
                    fontSize: 10,
                    background: 'none',
                    border: '1px solid #3d4856',
                    color: '#8b95a5',
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
              onClick={() => setShowResetConfirm(true)}
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
              <RotateCcw size={12} strokeWidth={1.5} /> Reset Selected ({selectedTasks.size})
            </button>
          )}
        </div>
      )}

      {/* Today summary */}
      <div style={{ borderTop: '1px solid #141418', paddingBottom: 12 }}>
        <div className="sb-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Today</span>
          {onShowReport && (
            <button
              onClick={onShowReport}
              className="icon-btn-subtle"
              style={{
                background: 'none',
                border: 'none',
                color: '#3d4856',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                borderRadius: 4,
                padding: '2px 6px',
              }}
            >
              <BarChart3 size={14} strokeWidth={1.5} /> Report
            </button>
          )}
        </div>
        <div className="sb-summary">
          <span>Focus</span>
          <span className="val" style={{ color: '#7dbdbd' }}>
            {formatTime(totalFocus)}
          </span>
        </div>
        <div className="sb-summary">
          <span>Interrupts</span>
          <span className="val" style={{ color: '#eab308' }}>
            {totalInterrupts} ({formatTime(totalInterruptTime)})
          </span>
        </div>
        <div className="sb-summary">
          <span>Done</span>
          <span className="val" style={{ color: '#34d399' }}>
            {doneList.length}/{tasks.length}
          </span>
        </div>
      </div>

      {/* Delete project confirmation modal */}
      {deleteProjectTarget && (
        <div className="modal-overlay" onClick={() => setDeleteProjectTarget(null)}>
          <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={18} strokeWidth={1.5} color="#ef4444" /> Delete Project
              </h2>
              <button className="modal-close" onClick={() => setDeleteProjectTarget(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#c0c8d4', marginBottom: 8 }}>
                <strong style={{ color: '#e8eef5' }}>"{deleteProjectTarget.name}"</strong>
              </p>
              <p style={{ fontSize: 13, color: '#6b7585' }}>
                {deleteProjectTarget.taskCount > 0
                  ? `This will delete the project and its ${deleteProjectTarget.taskCount} task${deleteProjectTarget.taskCount > 1 ? 's' : ''}. This action cannot be undone.`
                  : 'Are you sure you want to delete this project? This action cannot be undone.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={() => setDeleteProjectTarget(null)}>
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{ background: '#ef4444', color: '#fff' }}
                  onClick={confirmDeleteProject}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
