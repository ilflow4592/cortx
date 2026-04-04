import { useTaskStore } from '../stores/taskStore';
import { formatTime } from '../utils/time';
import type { TaskLayer } from '../types/task';

const layerLabels: Record<TaskLayer, { label: string; icon: string }> = {
  focus: { label: 'Focus Slots', icon: '🎯' },
  batch: { label: 'Batch Queue', icon: '📦' },
  reactive: { label: 'Reactive', icon: '⚡' },
};

export function Sidebar() {
  const { tasks, activeTaskId, setActiveTask, removeTask } = useTaskStore();
  const nonDone = tasks.filter((t) => t.status !== 'done');
  const doneList = tasks.filter((t) => t.status === 'done');
  const totalFocus = tasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const totalInterrupts = tasks.reduce((s, t) => s + (t.interrupts?.length || 0), 0);
  const totalInterruptTime = tasks.reduce((s, t) => s + (t.interrupts || []).reduce((a, e) => a + e.durationSeconds, 0), 0);

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Delete task "${title}"?`)) removeTask(id);
  };

  // Group by layer
  const focusTasks = nonDone.filter((t) => (t.layer || 'focus') === 'focus');
  const batchTasks = nonDone.filter((t) => t.layer === 'batch');
  const reactiveTasks = nonDone.filter((t) => t.layer === 'reactive');

  const groups = [
    { layer: 'focus' as TaskLayer, tasks: focusTasks },
    { layer: 'batch' as TaskLayer, tasks: batchTasks },
    { layer: 'reactive' as TaskLayer, tasks: reactiveTasks },
  ].filter((g) => g.tasks.length > 0);

  return (
    <div className="sidebar">
      <div className="sb-header"><span className="sb-title">Tasks</span></div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {nonDone.length === 0 && doneList.length === 0 && (
          <div style={{ padding:'32px 16px', textAlign:'center', fontSize:12, color:'#3f3f46' }}>
            No tasks yet. Click + to create one.
          </div>
        )}

        {groups.map((group) => (
          <div key={group.layer}>
            <div className="sb-section">
              {layerLabels[group.layer].icon} {layerLabels[group.layer].label}
            </div>
            {group.tasks.map((task) => {
              const cls = [
                'sb-task',
                activeTaskId === task.id ? 'active' : '',
                task.status === 'paused' ? 'is-paused' : '',
                task.status === 'waiting' ? 'is-waiting' : '',
              ].join(' ');
              const dotCls = task.status === 'active' ? 'running' : task.status === 'paused' ? 'paused' : 'waiting';
              return (
                <div key={task.id} style={{ position:'relative' }}>
                  <button className={cls} onClick={() => setActiveTask(task.id)}>
                    <div className="sb-task-row">
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className={`sb-dot ${dotCls}`} />
                        <span className="sb-task-name">{task.title}</span>
                      </div>
                      <span className="sb-timer">{task.status === 'waiting' ? '--:--' : formatTime(task.elapsedSeconds)}</span>
                    </div>
                    {task.branchName && <div className="sb-meta"><code>{task.branchName}</code></div>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(task.id, task.title); }}
                    style={{ position:'absolute', right:8, top:10, background:'none', border:'none', color:'#27272a', cursor:'pointer', fontSize:12, opacity:0, transition:'opacity 0.1s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                    title="Delete task"
                  >×</button>
                </div>
              );
            })}
          </div>
        ))}

        {doneList.length > 0 && (
          <>
            <div className="sb-section">✅ Done</div>
            {doneList.map((task) => (
              <div key={task.id} style={{ padding:'6px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div className="sb-dot done" />
                  <span style={{ fontSize:13, color:'#3f3f46', textDecoration:'line-through' }}>{task.title}</span>
                </div>
                <span className="sb-timer">{formatTime(task.elapsedSeconds)}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <div style={{ borderTop:'1px solid #141418' }}>
        <div className="sb-section">Today</div>
        <div className="sb-summary"><span>Focus</span><span className="val" style={{ color:'#818cf8' }}>{formatTime(totalFocus)}</span></div>
        <div className="sb-summary"><span>Interrupts</span><span className="val" style={{ color:'#eab308' }}>{totalInterrupts} ({formatTime(totalInterruptTime)})</span></div>
        <div className="sb-summary"><span>Done</span><span className="val" style={{ color:'#34d399' }}>{doneList.length}/{tasks.length}</span></div>
      </div>
    </div>
  );
}
