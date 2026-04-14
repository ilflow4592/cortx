import { useState } from 'react';
import { X, CheckSquare, Square, Loader2 } from 'lucide-react';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { TaskRow } from './TaskRow';
import { useIsScanning } from '../../stores/scanStatusStore';
import { useModalStore } from '../../stores/modalStore';

function ScanningIndicator() {
  const [showTip, setShowTip] = useState(false);
  return (
    <span
      onMouseEnter={(e) => {
        e.stopPropagation();
        setShowTip(true);
      }}
      onMouseLeave={() => setShowTip(false)}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        marginLeft: 4,
        color: '#818cf8',
      }}
    >
      <Loader2
        size={12}
        strokeWidth={2.5}
        style={{
          // 인라인 애니메이션 — CSS 클래스 누락 시에도 보장
          animation: 'spin 1s linear infinite',
        }}
      />
      {showTip && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 6,
            padding: '6px 10px',
            background: '#0c0c10',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--fg-muted)',
            whiteSpace: 'nowrap',
            zIndex: 100,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          프로젝트 컨텍스트가 로딩중입니다.
        </span>
      )}
    </span>
  );
}

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
  const color = hoverColor || 'var(--fg-muted)';
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
        color: 'var(--fg-faint)',
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
        e.currentTarget.style.color = 'var(--fg-faint)';
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
  onDeleteProject: (id: string, name: string) => void;
}) {
  const modal = useModalStore();
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedTasks.has(t.id));
  const isScanning = useIsScanning(project.id);

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
            <CheckSquare size={18} color="var(--accent)" strokeWidth={1.5} />
          ) : (
            <Square size={18} color="var(--fg-dim)" strokeWidth={1.5} />
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
              color: 'var(--fg-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 120,
            }}
          >
            {project.name}
          </span>
          {isScanning && <ScanningIndicator />}
          <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>{tasks.length}</span>
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
          <ProjBtn icon="+" title="Add task" onClick={() => modal.openNewTask(project.id)} />
          <ProjBtn icon="⚙" title="Settings" onClick={() => modal.openEditProject(project.id)} />
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
            <div
              style={{ padding: '8px 14px 8px 24px', fontSize: 11, color: 'var(--border-strong)', fontStyle: 'italic' }}
            >
              No tasks — click + to add one
            </div>
          )}
        </>
      )}
    </div>
  );
}
