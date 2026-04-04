import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';

interface DockProps {
  onAddTask: () => void;
  onAddProject: () => void;
  onOpenSettings: () => void;
}

export function Dock({ onAddTask, onAddProject, onOpenSettings }: DockProps) {
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
      <div style={{ height: 28, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <button className="dock-icon active" title="Tasks">📅</button>
      <button className="dock-icon" title="Search">🔍</button>
      <div className="dock-sep" />

      {/* Project icons */}
      {projects.map((proj) => (
        <button
          key={proj.id}
          className="dock-icon"
          title={proj.name}
          style={{ position: 'relative' }}
          onClick={() => {
            // Select first non-done task of this project
            const task = tasks.find((t) => t.projectId === proj.id && t.status !== 'done');
            if (task) setActiveTask(task.id);
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
