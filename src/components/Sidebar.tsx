import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { formatTime } from '../utils/time';

export function Sidebar({ onShowReport }: { onShowReport?: () => void }) {
  const { tasks, activeTaskId, setActiveTask, removeTask } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const nonDone = tasks.filter((t) => t.status !== 'done');
  const doneList = tasks.filter((t) => t.status === 'done');
  const totalFocus = tasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const totalInterrupts = tasks.reduce((s, t) => s + (t.interrupts?.length || 0), 0);
  const totalInterruptTime = tasks.reduce((s, t) => s + (t.interrupts || []).reduce((a, e) => a + e.durationSeconds, 0), 0);

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Delete task "${title}"?`)) removeTask(id);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group tasks by project
  const projectGroups = projects.map((proj) => ({
    project: proj,
    tasks: nonDone.filter((t) => t.projectId === proj.id),
  })).filter((g) => g.tasks.length > 0);

  const unassigned = nonDone.filter((t) => !t.projectId || !projects.some((p) => p.id === t.projectId));

  return (
    <div className="sidebar">
      <div className="sb-header"><span className="sb-title">Tasks</span></div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {nonDone.length === 0 && doneList.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: '#3f3f46' }}>
            No tasks yet. Click + to create one.
          </div>
        )}

        {/* Project groups */}
        {projectGroups.map(({ project, tasks: projTasks }) => {
          const isCollapsed = collapsedProjects.has(project.id);
          return (
            <div key={project.id}>
              <button
                onClick={() => toggleCollapse(project.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
                  background: 'none', border: 'none', borderBottom: '1px solid #ffffff04', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: project.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', flex: 1 }}>{project.name}</span>
                <span style={{ fontSize: 10, color: '#3f3f46' }}>{projTasks.length}</span>
                <span style={{ fontSize: 10, color: '#27272a', marginLeft: 4 }}>{isCollapsed ? '▶' : '▼'}</span>
              </button>
              {!isCollapsed && projTasks.map((task) => (
                <TaskRow key={task.id} task={task} isActive={activeTaskId === task.id} onSelect={() => setActiveTask(task.id)} onDelete={() => handleDelete(task.id, task.title)} indent />
              ))}
            </div>
          );
        })}

        {/* Unassigned tasks */}
        {unassigned.length > 0 && (
          <>
            {projectGroups.length > 0 && (
              <div className="sb-section" style={{ color: '#27272a' }}>No project</div>
            )}
            {unassigned.map((task) => (
              <TaskRow key={task.id} task={task} isActive={activeTaskId === task.id} onSelect={() => setActiveTask(task.id)} onDelete={() => handleDelete(task.id, task.title)} indent={false} />
            ))}
          </>
        )}

        {/* Done */}
        {doneList.length > 0 && (
          <>
            <div className="sb-section">✅ Done</div>
            {doneList.map((task) => (
              <div key={task.id} style={{ padding: '6px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="sb-dot done" />
                  <span style={{ fontSize: 13, color: '#3f3f46', textDecoration: 'line-through' }}>{task.title}</span>
                </div>
                <span className="sb-timer">{formatTime(task.elapsedSeconds)}</span>
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
    <div style={{ position: 'relative' }}>
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
        style={{ position: 'absolute', right: 8, top: 10, background: 'none', border: 'none', color: '#27272a', cursor: 'pointer', fontSize: 12, opacity: 0, transition: 'opacity 0.1s' }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
        title="Delete task"
      >×</button>
    </div>
  );
}
