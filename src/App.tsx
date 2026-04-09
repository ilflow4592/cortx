import { useState, useEffect, useCallback } from 'react';
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

  // Load persisted data (migration handled in store.loadTasks/loadProjects)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cortx-tasks');
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.tasks?.length) useTaskStore.getState().loadTasks(data.tasks, data.activeTaskId);
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('cortx-projects');
      if (raw) {
        const data = JSON.parse(raw);
        const projects = Array.isArray(data) ? data : data?.projects || [];
        if (projects.length) useProjectStore.getState().loadProjects(projects);
      }
    } catch { /* ignore */ }
    import('./stores/settingsStore').then(({ useSettingsStore }) => useSettingsStore.getState().loadSettings()).catch(() => {});
    import('./stores/contextPackStore').then(({ useContextPackStore }) => {
      useContextPackStore.getState().loadState();
      useContextPackStore.getState().loadMcpServers();
    }).catch(() => {});
  }, []);

  // Persist on unload + periodic save every 5s
  useEffect(() => {
    const save = () => {
      const ts = useTaskStore.getState();
      const ps = useProjectStore.getState();
      localStorage.setItem('cortx-tasks', JSON.stringify({ tasks: ts.tasks, activeTaskId: ts.activeTaskId }));
      localStorage.setItem('cortx-projects', JSON.stringify(ps.projects));
    };
    window.addEventListener('beforeunload', save);
    const interval = setInterval(save, 5000);
    return () => { window.removeEventListener('beforeunload', save); clearInterval(interval); };
  }, []);

  // Timer
  useEffect(() => {
    const i = setInterval(() => { const s = useTaskStore.getState(); s.tasks.filter((t) => t.status === 'active').forEach((t) => s.incrementTimer(t.id)); }, 1000);
    return () => clearInterval(i);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'b' && !e.shiftKey) { e.preventDefault(); setShowSidebar((v) => !v); }
      if (e.metaKey && e.shiftKey && e.key === 'B') { e.preventDefault(); setShowRightPanel((v) => !v); }
      if (e.key === 'Escape') {
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

  // Global shortcuts (Tauri)
  useEffect(() => { import('./hooks/useGlobalShortcuts').then(({ registerShortcuts }) => registerShortcuts().catch(() => {})).catch(() => {}); }, []);

  // Sidebar resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); setIsResizing(true);
    const startX = e.clientX, startW = sidebarWidth;
    const onMove = (e: MouseEvent) => setSidebarWidth(Math.max(160, Math.min(400, startW + e.clientX - startX)));
    const onUp = () => { setIsResizing(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  return (
    <div className="app-layout" style={{ gridTemplateColumns: `64px ${showSidebar ? `${sidebarWidth}px` : '0px'} 1fr`, transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
      <div className="titlebar-region" data-tauri-drag-region />
      <Dock onAddTask={() => setShowNewTask(true)} onAddProject={() => setShowNewProject(true)} onOpenSettings={() => setShowSettings(true)} onToggleSidebar={() => setShowSidebar((v) => !v)} onEnsureSidebarOpen={() => setShowSidebar(true)} />
      <div style={{ overflow: 'hidden', width: showSidebar ? sidebarWidth : 0, transition: isResizing ? 'none' : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0, position: 'relative' }}>
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth, height: '100%' }}>
          <Sidebar onShowReport={() => setShowReport(true)} onAddTask={() => setShowNewTask(true)} onEditProject={(id) => setEditProjectId(id)} onAddTaskForProject={(id) => { setNewTaskProjectId(id); setShowNewTask(true); }} />
        </div>
        {showSidebar && <div onMouseDown={handleResizeStart} style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', cursor: 'col-resize', zIndex: 2 }} onMouseEnter={(e) => (e.currentTarget.style.background = '#6366f140')} onMouseLeave={(e) => { if (!isResizing) e.currentTarget.style.background = 'transparent'; }} />}
      </div>
      <MainPanel showRightPanel={showRightPanel} onToggleRightPanel={() => setShowRightPanel((v) => !v)} />
      <StatusBar showSidebar={showSidebar} onToggleSidebar={() => setShowSidebar((v) => !v)} showRightPanel={showRightPanel} onToggleRightPanel={() => setShowRightPanel((v) => !v)} />
      {showNewTask && <NewTaskModal onClose={() => { setShowNewTask(false); setNewTaskProjectId(undefined); }} defaultProjectId={newTaskProjectId} />}
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showReport && <DailyReport onClose={() => setShowReport(false)} />}
      {showOnboarding && <Onboarding onComplete={() => { setShowOnboarding(false); localStorage.setItem('cortx-onboarded', '1'); }} />}
      {editProjectId && <ProjectSettings projectId={editProjectId} onClose={() => setEditProjectId(null)} />}
    </div>
  );
}
