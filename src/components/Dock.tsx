import { useTaskStore } from '../stores/taskStore';

interface DockProps {
  onAddTask: () => void;
  onOpenSettings: () => void;
}

export function Dock({ onAddTask, onOpenSettings }: DockProps) {
  const { tasks, setActiveTask } = useTaskStore();

  const taskClass = (status: string) => {
    switch (status) {
      case 'active': return 'dock-task t-active';
      case 'paused': return 'dock-task t-paused';
      default: return 'dock-task t-waiting';
    }
  };

  return (
    <div className="dock">
      {/* macOS titlebar drag spacer */}
      <div style={{ height: 28, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <button className="dock-icon active" title="Tasks">📅</button>
      <button className="dock-icon" title="Search">🔍</button>
      <div className="dock-sep" />
      {tasks.filter(t => t.status !== 'done').map((task, i) => (
        <button key={task.id} className={taskClass(task.status)} onClick={() => setActiveTask(task.id)} title={task.title}>
          {i + 1}
          {(task.status === 'active' || task.status === 'paused') && <span className="td" />}
        </button>
      ))}
      <button className="dock-add" onClick={onAddTask} title="New Task">+</button>
      <div className="dock-bottom">
        <button className="dock-icon" onClick={onOpenSettings} title="Settings">⚙</button>
      </div>
    </div>
  );
}
