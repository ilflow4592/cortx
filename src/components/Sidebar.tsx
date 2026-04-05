import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { formatTime } from '../utils/time';

export function Sidebar({ onShowReport, onEditProject, onAddTaskForProject }: { onShowReport?: () => void; onAddTask?: () => void; onEditProject?: (id: string) => void; onAddTaskForProject?: (projectId: string) => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);
  const projects = useProjectStore((s) => s.projects);
  const removeProject = useProjectStore((s) => s.removeProject);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const nonDone = tasks.filter((t) => t.status !== 'done');
  const doneList = tasks.filter((t) => t.status === 'done');
  const totalFocus = tasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const totalInterrupts = tasks.reduce((s, t) => s + (t.interrupts?.length || 0), 0);
  const totalInterruptTime = tasks.reduce((s, t) => s + (t.interrupts || []).reduce((a, e) => a + e.durationSeconds, 0), 0);

  const handleDeleteTask = (id: string, title: string) => {
    if (window.confirm(`Delete task "${title}"?`)) removeTask(id);
  };

  const handleDeleteProject = (id: string, name: string) => {
    const projTasks = tasks.filter((t) => t.projectId === id);
    const msg = projTasks.length > 0
      ? `Delete project "${name}" and its ${projTasks.length} tasks?`
      : `Delete project "${name}"?`;
    if (window.confirm(msg)) {
      projTasks.forEach((t) => removeTask(t.id));
      removeProject(id);
    }
  };

  const toggleCollapse = (id: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // All projects (even empty ones)
  const projectGroups = projects.map((proj) => ({
    project: proj,
    tasks: nonDone.filter((t) => t.projectId === proj.id),
  }));

  const unassigned = nonDone.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId));

  return (
    <div className="sidebar">
      <div className="sb-header">
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
        </span>
        <span className="sb-title" style={{ fontSize: 10 }}>Tasks</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {projects.length === 0 && nonDone.length === 0 && doneList.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12, color: '#52525e', lineHeight: 1.8, padding: 16 }}>
            <div>
              No projects yet.<br />
              Click 📁 in the dock to add a project.
            </div>
          </div>
        )}

        {/* Project groups */}
        {projectGroups.map(({ project, tasks: projTasks }) => {
          const isCollapsed = collapsedProjects.has(project.id);
          return (
            <div key={project.id}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #ffffff04' }}>
                <button
                  onClick={() => toggleCollapse(project.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '12px 16px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: project.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#a1a1aa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                  <span style={{ fontSize: 13, color: '#6b6b78' }}>{projTasks.length}</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8, flexShrink: 0 }}>
                  <ProjBtn icon="▼" title={isCollapsed ? 'Expand' : 'Collapse'} onClick={() => toggleCollapse(project.id)} />
                  {onAddTaskForProject && <ProjBtn icon="+" title="Add task" onClick={() => onAddTaskForProject(project.id)} />}
                  {onEditProject && <ProjBtn icon="⚙" title="Settings" onClick={() => onEditProject(project.id)} />}
                  <ProjBtn icon="×" title="Delete" onClick={() => handleDeleteProject(project.id, project.name)} hoverColor="#ef4444" />
                </div>
              </div>
              {!isCollapsed && (
                <>
                  {projTasks.map((task) => (
                    <TaskRow key={task.id} task={task} isActive={activeTaskId === task.id} onSelect={() => setActiveTask(task.id)} onDelete={() => handleDeleteTask(task.id, task.title)} indent />
                  ))}
                  {projTasks.length === 0 && (
                    <div style={{ padding: '8px 14px 8px 24px', fontSize: 11, color: '#27272a', fontStyle: 'italic' }}>
                      No tasks — click + to add one
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Unassigned tasks */}
        {unassigned.length > 0 && (
          <>
            {projects.length > 0 && (
              <div className="sb-section" style={{ color: '#27272a' }}>No project</div>
            )}
            {unassigned.map((task) => (
              <TaskRow key={task.id} task={task} isActive={activeTaskId === task.id} onSelect={() => setActiveTask(task.id)} onDelete={() => handleDeleteTask(task.id, task.title)} indent={false} />
            ))}
          </>
        )}

        {/* Done */}
        {doneList.length > 0 && (
          <>
            <div className="sb-section">✅ Done</div>
            {doneList.map((task) => (
              <div key={task.id} className="task-row-wrap" style={{ padding: '6px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="sb-dot done" />
                  <span style={{ fontSize: 13, color: '#3f3f46', textDecoration: 'line-through' }}>{task.title}</span>
                </div>
                <span className="sb-timer">{formatTime(task.elapsedSeconds)}</span>
                <button
                  onClick={() => setTaskStatus(task.id, 'waiting')}
                  className="task-delete-btn"
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 22, height: 22, borderRadius: 6,
                    background: '#18181b', border: '1px solid #27272a',
                    color: '#52525b', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#34d39920'; e.currentTarget.style.color = '#34d399'; e.currentTarget.style.borderColor = '#34d39940'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#18181b'; e.currentTarget.style.color = '#52525b'; e.currentTarget.style.borderColor = '#27272a'; }}
                  title="Undo — move back to waiting"
                >↩</button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Today summary */}
      <div style={{ borderTop: '1px solid #141418' }}>
        <div className="sb-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Today</span>
          {onShowReport && (
            <button onClick={onShowReport} style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>
              📊 Report
            </button>
          )}
        </div>
        <div className="sb-summary"><span>Focus</span><span className="val" style={{ color: '#818cf8' }}>{formatTime(totalFocus)}</span></div>
        <div className="sb-summary"><span>Interrupts</span><span className="val" style={{ color: '#eab308' }}>{totalInterrupts} ({formatTime(totalInterruptTime)})</span></div>
        <div className="sb-summary"><span>Done</span><span className="val" style={{ color: '#34d399' }}>{doneList.length}/{tasks.length}</span></div>
      </div>
    </div>
  );
}

function TaskRow({ task, isActive, onSelect, onDelete, indent }: {
  task: { id: string; title: string; status: string; branchName: string; elapsedSeconds: number };
  isActive: boolean; onSelect: () => void; onDelete: () => void; indent: boolean;
}) {
  const cls = [
    'sb-task',
    isActive ? 'active' : '',
    task.status === 'paused' ? 'is-paused' : '',
    task.status === 'waiting' ? 'is-waiting' : '',
  ].join(' ');
  const dotCls = task.status === 'active' ? 'running' : task.status === 'paused' ? 'paused' : 'waiting';

  return (
    <div className="task-row-wrap" style={{ position: 'relative' }}>
      <button className={cls} onClick={onSelect} style={indent ? { paddingLeft: 24 } : undefined}>
        <div className="sb-task-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className={`sb-dot ${dotCls}`} />
            <span className="sb-task-name">{task.title}</span>
          </div>
          <span className="sb-timer">{task.status === 'waiting' ? '--:--' : formatTime(task.elapsedSeconds)}</span>
        </div>
        {task.branchName && <div className="sb-meta"><code>{task.branchName}</code></div>}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 22, height: 22, borderRadius: 6,
          background: '#18181b', border: '1px solid #27272a',
          color: '#52525b', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#ef444420'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444440'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#18181b'; e.currentTarget.style.color = '#52525b'; e.currentTarget.style.borderColor = '#27272a'; }}
        className="task-delete-btn"
        title="Delete task"
      >×</button>
    </div>
  );
}

function ProjBtn({ icon, title, onClick, hoverColor }: { icon: string; title: string; onClick: () => void; hoverColor?: string }) {
  const color = hoverColor || '#a1a1aa';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: 'none', border: 'none',
        color: '#52525e', cursor: 'pointer',
        fontSize: 16, fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.1s, background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = color; e.currentTarget.style.background = `${color}15`; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#52525e'; e.currentTarget.style.background = 'none'; }}
    >{icon}</button>
  );
}
