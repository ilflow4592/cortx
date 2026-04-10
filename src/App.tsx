import { useState, useEffect, useCallback } from 'react';
import { Dock } from './components/Dock';
import { Sidebar } from './components/sidebar/Sidebar';
import { MainPanel } from './components/MainPanel';
import { StatusBar } from './components/StatusBar';
import { NewTaskModal } from './components/NewTaskModal';
import { NewProjectModal } from './components/NewProjectModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { DailyReport } from './components/DailyReport';
import { Onboarding } from './components/Onboarding';
import { ProjectSettings } from './components/ProjectSettings';
import { useTaskStore } from './stores/taskStore';
import { useProjectStore } from './stores/projectStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette } from './components/CommandPalette';
import { CrashRecoveryDialog } from './components/CrashRecoveryDialog';
import { CostDashboard } from './components/CostDashboard';

export default function App() {
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | undefined>(undefined);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('cortx-onboarded'));
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showCrashRecovery, setShowCrashRecovery] = useState(false);
  const [showCostDashboard, setShowCostDashboard] = useState(false);

  // Load persisted data from SQLite (auto-migrates from localStorage on first run)
  useEffect(() => {
    (async () => {
      try {
        const { migrateFromLocalStorageIfNeeded, loadAllProjects, loadAllTasks } = await import('./services/db');
        await migrateFromLocalStorageIfNeeded();
        const projects = await loadAllProjects();
        if (projects.length) useProjectStore.getState().loadProjects(projects);
        const { tasks, activeTaskId } = await loadAllTasks();
        if (tasks.length) useTaskStore.getState().loadTasks(tasks, activeTaskId);

        // Detect crashed tasks: active + pipeline in_progress means prior run was interrupted
        const crashed = tasks.some(
          (t) =>
            t.status === 'active' &&
            t.pipeline?.enabled &&
            Object.values(t.pipeline.phases).some((p) => p?.status === 'in_progress'),
        );
        if (crashed) setShowCrashRecovery(true);
      } catch (err) {
        console.error('[cortx] Failed to load SQLite data:', err);
      }
    })();
    import('./stores/settingsStore')
      .then(({ useSettingsStore }) => useSettingsStore.getState().loadSettings())
      .catch(() => {});
    import('./stores/contextPackStore')
      .then(({ useContextPackStore }) => {
        useContextPackStore.getState().loadState();
        useContextPackStore.getState().loadMcpServers();
      })
      .catch(() => {});
  }, []);

  // Persist to SQLite via Zustand subscribers (debounced per-task)
  useEffect(() => {
    const pending = new Map<string, NodeJS.Timeout>();
    const flushTask = (taskId: string) => {
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      if (task) {
        import('./services/db').then(({ upsertTask }) => upsertTask(task).catch(() => {}));
      }
    };
    const scheduleTaskSave = (taskId: string) => {
      const existing = pending.get(taskId);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        pending.delete(taskId);
        flushTask(taskId);
      }, 500);
      pending.set(taskId, handle);
    };

    let prevTasks = useTaskStore.getState().tasks;
    let prevActiveId = useTaskStore.getState().activeTaskId;
    let prevProjects = useProjectStore.getState().projects;

    const unsubTasks = useTaskStore.subscribe((s) => {
      // Detect changed tasks
      for (const t of s.tasks) {
        const prev = prevTasks.find((p) => p.id === t.id);
        if (!prev || prev.updatedAt !== t.updatedAt) {
          scheduleTaskSave(t.id);
        }
      }
      // Detect deleted tasks
      for (const p of prevTasks) {
        if (!s.tasks.find((t) => t.id === p.id)) {
          import('./services/db').then(({ deleteTask }) => deleteTask(p.id).catch(() => {}));
        }
      }
      // Active task ID change
      if (s.activeTaskId !== prevActiveId) {
        prevActiveId = s.activeTaskId;
        import('./services/db').then(({ setActiveTaskId }) => setActiveTaskId(s.activeTaskId).catch(() => {}));
      }
      prevTasks = s.tasks;
    });

    const unsubProjects = useProjectStore.subscribe((s) => {
      for (const p of s.projects) {
        const prev = prevProjects.find((x) => x.id === p.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(p)) {
          import('./services/db').then(({ upsertProject }) => upsertProject(p).catch(() => {}));
        }
      }
      for (const p of prevProjects) {
        if (!s.projects.find((x) => x.id === p.id)) {
          import('./services/db').then(({ deleteProject }) => deleteProject(p.id).catch(() => {}));
        }
      }
      prevProjects = s.projects;
    });

    return () => {
      unsubTasks();
      unsubProjects();
      // Flush all pending saves on unmount
      pending.forEach((handle, id) => {
        clearTimeout(handle);
        flushTask(id);
      });
      pending.clear();
    };
  }, []);

  // Timer
  useEffect(() => {
    const i = setInterval(() => {
      const s = useTaskStore.getState();
      s.tasks.filter((t) => t.status === 'active').forEach((t) => s.incrementTimer(t.id));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (e.metaKey && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setShowSidebar((v) => !v);
      }
      if (e.metaKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        setShowRightPanel((v) => !v);
      }
      if (e.key === 'Escape') {
        if (editProjectId) {
          setEditProjectId(null);
          return;
        }
        if (showReport) {
          setShowReport(false);
          return;
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (showNewProject) {
          setShowNewProject(false);
          return;
        }
        if (showNewTask) {
          setShowNewTask(false);
          return;
        }
        if (showOnboarding) {
          setShowOnboarding(false);
          localStorage.setItem('cortx-onboarded', '1');
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editProjectId, showReport, showSettings, showNewProject, showNewTask, showOnboarding]);

  // Global shortcuts (Tauri)
  useEffect(() => {
    import('./hooks/useGlobalShortcuts')
      .then(({ registerShortcuts }) => registerShortcuts().catch(() => {}))
      .catch(() => {});
  }, []);

  // Sidebar resize
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX,
        startW = sidebarWidth;
      const onMove = (e: MouseEvent) => setSidebarWidth(Math.max(160, Math.min(400, startW + e.clientX - startX)));
      const onUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth],
  );

  return (
    <div
      className="app-layout"
      style={{
        gridTemplateColumns: `64px ${showSidebar ? `${sidebarWidth}px` : '0px'} 1fr`,
        transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className="titlebar-region" data-tauri-drag-region />
      <Dock
        onAddTask={() => setShowNewTask(true)}
        onAddProject={() => setShowNewProject(true)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onEnsureSidebarOpen={() => setShowSidebar(true)}
      />
      <div
        style={{
          overflow: 'hidden',
          width: showSidebar ? sidebarWidth : 0,
          transition: isResizing ? 'none' : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth, height: '100%' }}>
          <ErrorBoundary label="Sidebar">
            <Sidebar
              onShowReport={() => setShowReport(true)}
              onAddTask={() => setShowNewTask(true)}
              onEditProject={(id) => setEditProjectId(id)}
              onAddTaskForProject={(id) => {
                setNewTaskProjectId(id);
                setShowNewTask(true);
              }}
            />
          </ErrorBoundary>
        </div>
        {showSidebar && (
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 4,
              height: '100%',
              cursor: 'col-resize',
              zIndex: 2,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#6366f140')}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.background = 'transparent';
            }}
          />
        )}
      </div>
      <ErrorBoundary label="MainPanel">
        <MainPanel showRightPanel={showRightPanel} onToggleRightPanel={() => setShowRightPanel((v) => !v)} />
      </ErrorBoundary>
      <StatusBar
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
      />
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNewTask={() => setShowNewTask(true)}
        onNewProject={() => setShowNewProject(true)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
        onShowReport={() => setShowReport(true)}
        onShowCostDashboard={() => setShowCostDashboard(true)}
      />
      {showCrashRecovery && <CrashRecoveryDialog onClose={() => setShowCrashRecovery(false)} />}
      {showCostDashboard && <CostDashboard onClose={() => setShowCostDashboard(false)} />}
      {showNewTask && (
        <NewTaskModal
          onClose={() => {
            setShowNewTask(false);
            setNewTaskProjectId(undefined);
          }}
          defaultProjectId={newTaskProjectId}
        />
      )}
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showReport && <DailyReport onClose={() => setShowReport(false)} />}
      {showOnboarding && (
        <Onboarding
          onComplete={() => {
            setShowOnboarding(false);
            localStorage.setItem('cortx-onboarded', '1');
          }}
        />
      )}
      {editProjectId && <ProjectSettings projectId={editProjectId} onClose={() => setEditProjectId(null)} />}
    </div>
  );
}
