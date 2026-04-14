/**
 * Popout window — shows a single task's Claude chat + minimal header.
 * No sidebar, dock, right panel. Useful for multi-monitor setups where
 * you want to dedicate a window to one task.
 *
 * Rendered when URL has ?mode=popout&task=<taskId>.
 */
import { useEffect, useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { ClaudeChat } from './claude/ClaudeChat';
import { ErrorBoundary } from './ErrorBoundary';
import { migrateFromLocalStorageIfNeeded, loadAllProjects, loadAllTasks } from '../services/db';

interface Props {
  taskId: string;
}

export function TaskPopoutWindow({ taskId }: Props) {
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load persisted data from SQLite (shared across all windows)
  useEffect(() => {
    (async () => {
      try {
        await migrateFromLocalStorageIfNeeded();
        const projects = await loadAllProjects();
        if (projects.length) useProjectStore.getState().loadProjects(projects);
        const { tasks } = await loadAllTasks();
        if (tasks.length) useTaskStore.getState().loadTasks(tasks, taskId);
        setDataLoaded(true);
      } catch (err) {
        console.error('[cortx popout] Failed to load data:', err);
        setDataLoaded(true);
      }
    })();
  }, [taskId]);

  // Poll for task updates every 2s so main window changes (title, pipeline) reflect here
  useEffect(() => {
    if (!dataLoaded) return;
    const interval = setInterval(async () => {
      try {
        const { tasks } = await loadAllTasks();
        useTaskStore.getState().loadTasks(tasks, taskId);
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [dataLoaded, taskId]);

  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const project = useProjectStore((s) => (task?.projectId ? s.projects.find((p) => p.id === task.projectId) : null));

  if (!dataLoaded) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--fg-muted)',
          fontSize: 13,
        }}
      >
        Loading task...
      </div>
    );
  }

  if (!task) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--fg-muted)',
          fontSize: 13,
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div>Task not found</div>
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', fontFamily: "'JetBrains Mono', monospace" }}>
          {taskId}
        </div>
      </div>
    );
  }

  const cwd = task.worktreePath || task.repoPath || project?.localPath || '';
  const badgeCls = task.status === 'active' ? 'active' : task.status === 'paused' ? 'paused' : 'waiting';
  const statusLabel =
    task.status === 'active'
      ? 'In Progress'
      : task.status === 'paused'
        ? 'Paused'
        : task.status === 'waiting'
          ? 'Waiting'
          : task.status;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)',
        overflow: 'hidden',
      }}
    >
      {/* Minimal header */}
      <div
        data-tauri-drag-region
        style={{
          padding: '14px 20px',
          paddingLeft: 80, // leave space for traffic lights on macOS
          borderBottom: '1px solid var(--border-strong)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          background: 'var(--bg-app)',
        }}
      >
        {project && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: project.color,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--fg-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {task.title}
          </div>
          {task.branchName && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--fg-subtle)',
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 2,
              }}
            >
              {task.branchName}
            </div>
          )}
        </div>
        <span className={`mh-badge ${badgeCls}`}>
          <span className="dot" />
          {statusLabel}
        </span>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary label="ClaudeChat">
          <ClaudeChat taskId={task.id} cwd={cwd} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
