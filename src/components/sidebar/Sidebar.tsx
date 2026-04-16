import { useEffect } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import { useModalStore } from '../../stores/modalStore';
import { ProjectGroup } from './ProjectGroup';
import { TaskRow } from './TaskRow';
import { usePipelineRunner } from './usePipelineRunner';
import { usePipelineRunnerStore } from '../../stores/pipelineRunnerStore';
import { useSidebarSelection } from './useSidebarSelection';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { SidebarHeader } from './SidebarHeader';
import { DoneTasksList } from './DoneTasksList';
import { SelectionActionsPanel } from './SelectionActionsPanel';
import { TodaySummary } from './TodaySummary';
import { useResetSelectedTasks } from './useResetSelectedTasks';
import { messageCache } from '../../utils/chatState';
import type { Task } from '../../types/task';

// Tauri API 동적 import (CLAUDE.md 규칙 + quality gate).
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function Sidebar() {
  const modal = useModalStore();
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);
  const projects = useProjectStore((s) => s.projects);
  const removeProject = useProjectStore((s) => s.removeProject);

  const {
    selectedTasks,
    toggleSelect,
    clearSelection,
    collapsedProjects,
    toggleCollapse,
    showResetConfirm,
    setShowResetConfirm,
    deleteProjectTarget,
    setDeleteProjectTarget,
  } = useSidebarSelection();

  const { runningPipelines, askingTasks, runSelectedPipelines, countRunnable } = usePipelineRunner();

  const resetSelectedTasks = useResetSelectedTasks();

  // Clear stale asking/running state — render 중 store 업데이트는 React warning을
  // 발생시키므로 effect로 옮김.
  useEffect(() => {
    if (askingTasks.size > 0) {
      const runnerStore = usePipelineRunnerStore.getState();
      [...askingTasks].forEach((id) => {
        const msgs = messageCache.get(id);
        if (!msgs || msgs.length === 0 || msgs[msgs.length - 1].role === 'user') {
          runnerStore.unsetAsking(id);
        }
      });
    }
    if (runningPipelines.size > 0) {
      const runnerStore = usePipelineRunnerStore.getState();
      [...runningPipelines].forEach((id) => {
        const t = tasks.find((task) => task.id === id);
        if (!t || !t.pipeline?.enabled || t.status === 'waiting') {
          runnerStore.setNotRunning(id);
        }
      });
    }
  }, [askingTasks, runningPipelines, tasks]);

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

  // All projects (even empty ones)
  const projectGroups = projects.map((proj) => ({
    project: proj,
    tasks: nonDone.filter((t) => t.projectId === proj.id),
  }));

  const unassigned = nonDone.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId));

  return (
    <div className="sidebar">
      <SidebarHeader />
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
              color: 'var(--fg-faint)',
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
            onDeleteProject={handleDeleteProject}
          />
        ))}

        {/* Unassigned tasks */}
        {unassigned.length > 0 && (
          <>
            {projects.length > 0 && (
              <div className="sb-section" style={{ color: 'var(--border-strong)' }}>
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

        <DoneTasksList tasks={doneList} onUndone={(id) => setTaskStatus(id, 'waiting')} />
      </div>

      <SelectionActionsPanel
        selectedCount={selectedTasks.size}
        runnableCount={countRunnable(selectedTasks)}
        showResetConfirm={showResetConfirm}
        onRun={() => runSelectedPipelines(selectedTasks, clearSelection)}
        onReset={async () => {
          setShowResetConfirm(false);
          await resetSelectedTasks(selectedTasks);
          clearSelection();
        }}
        onShowResetConfirm={() => setShowResetConfirm(true)}
        onCancelResetConfirm={() => setShowResetConfirm(false)}
      />

      <TodaySummary
        totalFocus={totalFocus}
        totalInterrupts={totalInterrupts}
        totalInterruptTime={totalInterruptTime}
        doneCount={doneList.length}
        totalCount={tasks.length}
        onOpenReport={() => modal.open('report')}
      />

      {deleteProjectTarget && (
        <DeleteProjectDialog
          name={deleteProjectTarget.name}
          taskCount={deleteProjectTarget.taskCount}
          onCancel={() => setDeleteProjectTarget(null)}
          onConfirm={confirmDeleteProject}
        />
      )}
    </div>
  );
}
