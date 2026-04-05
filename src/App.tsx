import { useState, useEffect, useRef, useCallback } from 'react';
import { Dock } from './components/Dock';
import { Sidebar } from './components/Sidebar';
import { MainPanel } from './components/MainPanel';
import { StatusBar } from './components/StatusBar';
import { NewTaskModal } from './components/NewTaskModal';
import { NewProjectModal } from './components/NewProjectModal';
import { SettingsModal } from './components/SettingsModal';
import { DailyReport } from './components/DailyReport';
import { Onboarding } from './components/Onboarding';
import { ProjectSettings } from './components/ProjectSettings';
import { useTaskStore } from './stores/taskStore';
import { useProjectStore } from './stores/projectStore';
import { useSettingsStore } from './stores/settingsStore';
import { useContextPackStore } from './stores/contextPackStore';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { saveData, loadData } from './services/persistence';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
  const resizingRef = useRef(false);
  const { tasks, activeTaskId } = useTaskStore();
  const { projects } = useProjectStore();
  const loaded = useRef(false);

  useGlobalShortcuts();

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startX;
      const newWidth = Math.max(160, Math.min(400, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // Keyboard shortcuts for panel toggle + fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setShowSidebar((v) => !v);
      }
      if (e.metaKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        setShowRightPanel((v) => !v);
      }
      if (e.key === 'Escape') {
        // Close modals in priority order (last opened first)
        if (editProjectId) { setEditProjectId(null); return; }
        if (showReport) { setShowReport(false); return; }
        if (showSettings) { setShowSettings(false); return; }
        if (showNewProject) { setShowNewProject(false); return; }
        if (showNewTask) { setShowNewTask(false); return; }
        if (showOnboarding) { setShowOnboarding(false); localStorage.setItem('cortx-onboarded', '1'); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editProjectId, showReport, showSettings, showNewProject, showNewTask, showOnboarding]);

  // Header double-click → toggle fullscreen
  const handleHeaderDoubleClick = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMax) await win.unmaximize();
      else await win.maximize();
    } catch {
      // Not in Tauri context
    }
  }, []);

  // Load persisted data
  useEffect(() => {
    (async () => {
      useSettingsStore.getState().loadSettings();
      useContextPackStore.getState().loadState();
      const data = await loadData<{ tasks: typeof tasks; activeTaskId: string | null }>('tasks');
      if (data?.tasks?.length) useTaskStore.getState().loadTasks(data.tasks, data.activeTaskId);
      const projData = await loadData<{ projects: typeof projects }>('projects');
      if (projData?.projects?.length) useProjectStore.getState().loadProjects(projData.projects);
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const s = useTaskStore.getState();
      saveData('tasks', { tasks: s.tasks, activeTaskId: s.activeTaskId });
      saveData('projects', { projects: useProjectStore.getState().projects });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const s = useTaskStore.getState();
      const t = s.tasks.find((t) => t.id === s.activeTaskId && t.status === 'active');
      if (t) s.incrementTimer(t.id);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const timeout = setTimeout(() => saveData('tasks', { tasks, activeTaskId }), 500);
    return () => clearTimeout(timeout);
  }, [tasks, activeTaskId]);

  useEffect(() => {
    if (!loaded.current) return;
    const timeout = setTimeout(() => saveData('projects', { projects }), 500);
    return () => clearTimeout(timeout);
  }, [projects]);

  return (
    <div className="app-layout" style={{ gridTemplateColumns: `64px ${showSidebar ? `${sidebarWidth}px` : '0px'} 1fr`, transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      {/* Titlebar: drag region + double-click to maximize */}
      <div className="titlebar-region">
        <div className="titlebar-region-clickable" onDoubleClick={handleHeaderDoubleClick} />
      </div>
      <Dock
        onAddTask={() => setShowNewTask(true)}
        onAddProject={() => setShowNewProject(true)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onEnsureSidebarOpen={() => setShowSidebar(true)}
      />
      <div style={{ overflow: 'hidden', width: showSidebar ? sidebarWidth : 0, transition: resizingRef.current ? 'none' : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0, position: 'relative' }}>
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth, height: '100%' }}>
        <Sidebar
          onShowReport={() => setShowReport(true)}
          onAddTask={() => setShowNewTask(true)}
          onEditProject={(id) => setEditProjectId(id)}
          onAddTaskForProject={(id) => { setNewTaskProjectId(id); setShowNewTask(true); }}
        />
        </div>
        {/* Resize handle */}
        {showSidebar && (
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute', top: 0, right: 0, width: 4, height: '100%',
              cursor: 'col-resize', zIndex: 2,
              background: 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#6366f140')}
            onMouseLeave={(e) => { if (!resizingRef.current) e.currentTarget.style.background = 'transparent'; }}
          />
        )}
      </div>
      <MainPanel
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
      />
      <StatusBar
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
      />
      {showNewTask && <NewTaskModal onClose={() => { setShowNewTask(false); setNewTaskProjectId(undefined); }} defaultProjectId={newTaskProjectId} />}
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showReport && <DailyReport onClose={() => setShowReport(false)} />}
      {showOnboarding && <Onboarding onComplete={() => { setShowOnboarding(false); localStorage.setItem('cortx-onboarded', '1'); }} />}
      {editProjectId && <ProjectSettings projectId={editProjectId} onClose={() => setEditProjectId(null)} />}
    </div>
  );
}
