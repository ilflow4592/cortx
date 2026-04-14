import { useEffect, useCallback, lazy, Suspense } from 'react';
import { Dock } from './components/Dock';
import { Sidebar } from './components/sidebar/Sidebar';
import { MainPanel } from './components/MainPanel';
import { StatusBar } from './components/StatusBar';
import { useTaskStore } from './stores/taskStore';
import { useProjectStore } from './stores/projectStore';
import { useSettingsStore } from './stores/settingsStore';
import { useContextPackStore } from './stores/contextPackStore';
import { useModalStore } from './stores/modalStore';
import { useLayoutStore } from './stores/layoutStore';
import { migrateFromLocalStorageIfNeeded, loadAllProjects, loadAllTasks } from './services/db';
import { useStorePersistence } from './hooks/useStorePersistence';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette } from './components/CommandPalette';
import { TaskPopoutWindow } from './components/TaskPopoutWindow';
import { useProjectScan } from './hooks/useProjectScan';

// 모달들은 lazy-load — 실제 열기 전엔 main bundle에 포함되지 않아 1MB chunk 감소.
// Monaco editor를 쓰는 SlashCommandBuilder가 특히 무거움.
const NewTaskModal = lazy(() => import('./components/NewTaskModal').then((m) => ({ default: m.NewTaskModal })));
const NewProjectModal = lazy(() =>
  import('./components/NewProjectModal').then((m) => ({ default: m.NewProjectModal })),
);
const SettingsModal = lazy(() =>
  import('./components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const DailyReport = lazy(() => import('./components/DailyReport').then((m) => ({ default: m.DailyReport })));
const Onboarding = lazy(() => import('./components/Onboarding').then((m) => ({ default: m.Onboarding })));
const ProjectSettings = lazy(() =>
  import('./components/ProjectSettings').then((m) => ({ default: m.ProjectSettings })),
);
const CrashRecoveryDialog = lazy(() =>
  import('./components/CrashRecoveryDialog').then((m) => ({ default: m.CrashRecoveryDialog })),
);
const CostDashboard = lazy(() => import('./components/CostDashboard').then((m) => ({ default: m.CostDashboard })));
const WorktreeCleanup = lazy(() =>
  import('./components/WorktreeCleanup').then((m) => ({ default: m.WorktreeCleanup })),
);
const PipelineConfigEditor = lazy(() =>
  import('./components/PipelineConfigEditor').then((m) => ({ default: m.PipelineConfigEditor })),
);
const McpServerManager = lazy(() =>
  import('./components/McpServerManager').then((m) => ({ default: m.McpServerManager })),
);
const SlashCommandBuilder = lazy(() =>
  import('./components/SlashCommandBuilder').then((m) => ({ default: m.SlashCommandBuilder })),
);
const UpdateChecker = lazy(() => import('./components/UpdateChecker').then((m) => ({ default: m.UpdateChecker })));

// Detect if this window is a task popout (URL query string has ?mode=popout&task=<id>)
function getPopoutTaskId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'popout') {
      const taskId = params.get('task');
      return taskId || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default function App() {
  const popoutTaskId = getPopoutTaskId();
  if (popoutTaskId) {
    return <TaskPopoutWindow taskId={popoutTaskId} />;
  }
  return <MainApp />;
}

function MainApp() {
  const modal = useModalStore();
  const layout = useLayoutStore();

  // Load persisted data from SQLite (auto-migrates from localStorage on first run)
  useEffect(() => {
    (async () => {
      try {
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
        if (crashed) useModalStore.getState().open('crashRecovery');
      } catch (err) {
        console.error('[cortx] Failed to load SQLite data:', err);
      }
    })();
    useSettingsStore.getState().loadSettings();
    useContextPackStore.getState().loadState();
    useContextPackStore.getState().loadMcpServers();
  }, []);

  // Task / Project Zustand 변경을 SQLite로 영속화 (디바운스 + flush 보장)
  useStorePersistence();

  // Apply theme to document root
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
  }, [theme]);

  // Timer
  useEffect(() => {
    const i = setInterval(() => {
      const s = useTaskStore.getState();
      s.tasks.filter((t) => t.status === 'active').forEach((t) => s.incrementTimer(t.id));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // Keyboard shortcuts — 모달 우선순위와 레이아웃 토글을 store 메서드로 위임
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        useModalStore.getState().toggleCommandPalette();
        return;
      }
      if (e.metaKey && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        useLayoutStore.getState().toggleSidebar();
        return;
      }
      if (e.metaKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        useLayoutStore.getState().toggleRightPanel();
        return;
      }
      if (e.key === 'Escape') {
        useModalStore.getState().closeTopmost();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Global shortcuts (Tauri)
  useEffect(() => {
    import('./hooks/useGlobalShortcuts')
      .then(({ registerShortcuts }) => registerShortcuts().catch(() => {}))
      .catch(() => {});
  }, []);

  // Background project scan — listen for per-project scan events
  useProjectScan();

  // Sidebar resize — layoutStore의 setSidebarWidth가 clamp를 처리하므로 순수 드래그 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { setIsResizing, setSidebarWidth, sidebarWidth } = useLayoutStore.getState();
    setIsResizing(true);
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => setSidebarWidth(startW + ev.clientX - startX);
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
  }, []);

  return (
    <div
      className="app-layout"
      style={{
        gridTemplateColumns: `64px ${layout.showSidebar ? `${layout.sidebarWidth}px` : '0px'} 1fr`,
        transition: 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className="titlebar-region" data-tauri-drag-region />
      <Dock />
      <div
        style={{
          overflow: 'hidden',
          width: layout.showSidebar ? layout.sidebarWidth : 0,
          transition: layout.isResizing ? 'none' : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div style={{ width: layout.sidebarWidth, minWidth: layout.sidebarWidth, height: '100%' }}>
          <ErrorBoundary label="Sidebar">
            <Sidebar />
          </ErrorBoundary>
        </div>
        {layout.showSidebar && (
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
              if (!layout.isResizing) e.currentTarget.style.background = 'transparent';
            }}
          />
        )}
      </div>
      <ErrorBoundary label="MainPanel">
        <MainPanel />
      </ErrorBoundary>
      <StatusBar />
      <CommandPalette open={modal.commandPalette} onClose={() => modal.close('commandPalette')} />
      <ModalRenderer />
    </div>
  );
}

/** 조건부 모달 렌더링만 한 곳에 모은다 — App의 return JSX 폭주 방지.
 *  모든 모달은 lazy chunk로 로드되므로 Suspense fallback은 빈 노드. */
function ModalRenderer() {
  const modal = useModalStore();

  return (
    <Suspense fallback={null}>
      {modal.crashRecovery && <CrashRecoveryDialog onClose={() => modal.close('crashRecovery')} />}
      {modal.costDashboard && <CostDashboard onClose={() => modal.close('costDashboard')} />}
      {modal.worktreeCleanup && <WorktreeCleanup onClose={() => modal.close('worktreeCleanup')} />}
      {modal.pipelineConfigEditor && (
        <PipelineConfigEditor
          projectPath={modal.pipelineConfigEditor.path}
          projectName={modal.pipelineConfigEditor.name}
          onClose={modal.closePipelineEditor}
        />
      )}
      {modal.mcpManager && <McpServerManager onClose={() => modal.close('mcpManager')} />}
      {modal.slashBuilder && <SlashBuilderAdapter />}
      {modal.updateChecker && <UpdateChecker onClose={() => modal.close('updateChecker')} />}
      {modal.newTask.open && (
        <NewTaskModal onClose={modal.closeNewTask} defaultProjectId={modal.newTask.projectId} />
      )}
      {modal.newProject && <NewProjectModal onClose={() => modal.close('newProject')} />}
      {modal.settings && <SettingsModal onClose={() => modal.close('settings')} />}
      {modal.report && <DailyReport onClose={() => modal.close('report')} />}
      {modal.onboarding && <Onboarding onComplete={modal.completeOnboarding} />}
      {modal.editProjectId && (
        <ProjectSettings projectId={modal.editProjectId} onClose={modal.closeEditProject} />
      )}
    </Suspense>
  );
}

/** SlashCommandBuilder는 현재 active task/project에서 cwd를 구하므로 별도 컴포넌트로 */
function SlashBuilderAdapter() {
  const close = () => useModalStore.getState().close('slashBuilder');
  const activeTask = useTaskStore.getState().tasks.find((t) => t.id === useTaskStore.getState().activeTaskId);
  const project = activeTask?.projectId
    ? useProjectStore.getState().projects.find((p) => p.id === activeTask.projectId)
    : null;
  const cwd = activeTask?.worktreePath || project?.localPath || '';
  return <SlashCommandBuilder projectCwd={cwd} onClose={close} />;
}
