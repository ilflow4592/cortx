import { X, CheckSquare, Square } from 'lucide-react';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { TaskRow } from './TaskRow';

function ProjBtn({
  icon,
  title,
  onClick,
  hoverColor,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  hoverColor?: string;
}) {
  const color = hoverColor || '#a1a1aa';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'none',
        border: 'none',
        color: '#4d5868',
        cursor: 'pointer',
        fontSize: 16,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.1s, background 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = color;
        e.currentTarget.style.background = `${color}15`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#4d5868';
        e.currentTarget.style.background = 'none';
      }}
    >
      {icon}
    </button>
  );
}

export function ProjectGroup({
  project,
  tasks,
  activeTaskId,
  isCollapsed,
  selectedTasks,
  runningPipelines,
  askingTasks,
  onToggleCollapse,
  onSelectTask,
  onDeleteTask,
  onToggleSelect,
  onEditProject,
  onAddTaskForProject,
  onDeleteProject,
}: {
  project: Project;
  tasks: Task[];
  activeTaskId: string | null;
  isCollapsed: boolean;
  selectedTasks: Set<string>;
  runningPipelines: Set<string>;
  askingTasks: Set<string>;
  onToggleCollapse: () => void;
  onSelectTask: (id: string) => void;
  onDeleteTask: (task: Task) => void;
  onToggleSelect: (id: string) => void;
  onEditProject?: (id: string) => void;
  onAddTaskForProject?: (projectId: string) => void;
  onDeleteProject: (id: string, name: string) => void;
}) {
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedTasks.has(t.id));

  const handleProjectSelectToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allSelected) {
      tasks.forEach((t) => onToggleSelect(t.id));
    } else {
      tasks.filter((t) => !selectedTasks.has(t.id)).forEach((t) => onToggleSelect(t.id));
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #ffffff04',
          position: 'relative',
        }}
      >
        <span
          onClick={handleProjectSelectToggle}
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            zIndex: 5,
          }}
        >
          {tasks.length > 0 && allSelected ? (
            <CheckSquare size={18} color="#5aa5a5" strokeWidth={1.5} />
          ) : (
            <Square size={18} color="#3d4856" strokeWidth={1.5} />
          )}
        </span>
        <button
          onClick={onToggleCollapse}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            padding: '12px 16px 12px 30px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 3, background: project.color, flexShrink: 0 }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#a1a1aa',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 120,
            }}
          >
            {project.name}
          </span>
          <span style={{ fontSize: 13, color: '#6b6b78' }}>{tasks.length}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8, flexShrink: 0 }}>
          <ProjBtn
            icon={
              <span
                style={{
                  display: 'inline-block',
                  transition: 'transform 200ms ease',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}
              >
                ▼
              </span>
            }
            title={isCollapsed ? 'Expand' : 'Collapse'}
            onClick={onToggleCollapse}
          />
          {onAddTaskForProject && (
            <ProjBtn icon="+" title="Add task" onClick={() => onAddTaskForProject(project.id)} />
          )}
          {onEditProject && <ProjBtn icon="⚙" title="Settings" onClick={() => onEditProject(project.id)} />}
          <ProjBtn
            icon={<X size={12} strokeWidth={1.5} />}
            title="Delete"
            onClick={() => onDeleteProject(project.id, project.name)}
            hoverColor="#ef4444"
          />
        </div>
      </div>
      {!isCollapsed && (
        <>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              onSelect={() => onSelectTask(task.id)}
              onDelete={() => onDeleteTask(task)}
              indent
              color={project.color}
              selected={selectedTasks.has(task.id)}
              onToggleSelect={() => onToggleSelect(task.id)}
              isRunning={runningPipelines.has(task.id)}
              isAsking={askingTasks.has(task.id)}
            />
          ))}
          {tasks.length === 0 && (
            <div style={{ padding: '8px 14px 8px 24px', fontSize: 11, color: '#2a3642', fontStyle: 'italic' }}>
              No tasks — click + to add one
            </div>
          )}
        </>
      )}
    </div>
  );
}
