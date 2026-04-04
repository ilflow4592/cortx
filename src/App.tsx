import { useState, useEffect, useRef } from 'react';
import { Dock } from './components/Dock';
import { Sidebar } from './components/Sidebar';
import { MainPanel } from './components/MainPanel';
import { StatusBar } from './components/StatusBar';
import { NewTaskModal } from './components/NewTaskModal';
import { SettingsModal } from './components/SettingsModal';
import { DailyReport } from './components/DailyReport';
import { Onboarding } from './components/Onboarding';
import { useTaskStore } from './stores/taskStore';
import { useSettingsStore } from './stores/settingsStore';
import { useContextPackStore } from './stores/contextPackStore';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { saveData, loadData } from './services/persistence';

export default function App() {
  const [showNewTask, setShowNewTask] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('cortx-onboarded'));
  const { tasks, activeTaskId } = useTaskStore();
  const loaded = useRef(false);

  useGlobalShortcuts();

  // Load persisted data
  useEffect(() => {
    (async () => {
      useSettingsStore.getState().loadSettings();
      useContextPackStore.getState().loadState();

      const data = await loadData<{ tasks: typeof tasks; activeTaskId: string | null }>('tasks');
      if (data?.tasks?.length) {
        useTaskStore.getState().loadTasks(data.tasks, data.activeTaskId);
      }
      loaded.current = true;
    })();
  }, []);

  // Save on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const s = useTaskStore.getState();
      saveData('tasks', { tasks: s.tasks, activeTaskId: s.activeTaskId });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const s = useTaskStore.getState();
      const t = s.tasks.find((t) => t.id === s.activeTaskId && t.status === 'active');
      if (t) s.incrementTimer(t.id);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Persist tasks (debounced)
  useEffect(() => {
    if (!loaded.current) return;
    const timeout = setTimeout(() => {
      saveData('tasks', { tasks, activeTaskId });
    }, 500);
    return () => clearTimeout(timeout);
  }, [tasks, activeTaskId]);

  return (
    <div className="app-layout">
      <Dock onAddTask={() => setShowNewTask(true)} onOpenSettings={() => setShowSettings(true)} />
      <Sidebar onShowReport={() => setShowReport(true)} />
      <MainPanel />
      <StatusBar />
      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showReport && <DailyReport onClose={() => setShowReport(false)} />}
      {showOnboarding && <Onboarding onComplete={() => { setShowOnboarding(false); localStorage.setItem('cortx-onboarded', '1'); }} />}
    </div>
  );
}
