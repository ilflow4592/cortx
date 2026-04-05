import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';

interface DockProps {
  onAddTask: () => void;
  onAddProject: () => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  onEnsureSidebarOpen?: () => void;
}

export function Dock({ onAddTask, onAddProject, onOpenSettings, onToggleSidebar, onEnsureSidebarOpen }: DockProps) {
  const { tasks, setActiveTask } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);

  const taskClass = (status: string) => {
    switch (status) {
      case 'active': return 'dock-task t-active';
      case 'paused': return 'dock-task t-paused';
      default: return 'dock-task t-waiting';
    }
  };

  return (
    <div className="dock">
      {onToggleSidebar && (
        <button className="dock-icon" onClick={onToggleSidebar} title="Toggle sidebar ⌘B">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>
      )}
      <div className="dock-sep" />

      {/* Project icons */}
      {projects.map((proj) => (
        <button
          key={proj.id}
          className="dock-icon"
          title={proj.name}
          style={{ position: 'relative' }}
          onClick={() => {
            const task = tasks.find((t) => t.projectId === proj.id && t.status !== 'done');
            if (task) setActiveTask(task.id);
            onEnsureSidebarOpen?.();
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 5, background: proj.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#06060a' }}>
            {proj.name.charAt(0).toUpperCase()}
          </span>
        </button>
      ))}

      {/* Add project */}
      <button className="dock-icon" onClick={onAddProject} title="New Project" style={{ color: '#27272a' }}>
        📁
      </button>

      <div className="dock-sep" />

      {/* Task shortcuts */}
      {tasks.filter(t => t.status !== 'done').slice(0, 9).map((task, i) => (
        <button key={task.id} className={taskClass(task.status)} onClick={() => { setActiveTask(task.id); onEnsureSidebarOpen?.(); }} title={task.title}>
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
