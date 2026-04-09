import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BarChart3, X, CheckCircle2, Play, Square, CheckSquare, RotateCcw } from 'lucide-react';
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
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [askingTasks, setAskingTasks] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runPipelineForTask = async (taskId: string, command: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const branch = task.branchName || '';
    const title = task.title || '';
    const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
    const cwd = task.worktreePath || task.repoPath || project?.localPath || '';

    // Send command with auto-filled args — Claude CLI resolves the slash command
    const args = `${branch} ${title}`.trim();
    const prompt = `${command} ${args}`;

    const reqId = `claude-${taskId}-${Date.now()}`;
    setRunningPipelines((prev) => new Set(prev).add(taskId));

    // Clear previous messages and session — fresh start
    const { messageCache, sessionCache } = await import('./ClaudeChat');
    messageCache.delete(taskId);
    sessionCache.delete(taskId);

    // Reset timer + set active (without pausing other tasks)
    useTaskStore.getState().updateTask(taskId, { elapsedSeconds: 0, status: 'active' as const });
    // Initialize pipeline state
    if (!task.pipeline?.enabled) {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: {
          enabled: true,
          phases: {
            grill_me: { status: 'in_progress', startedAt: new Date().toISOString() },
            obsidian_save: { status: 'pending' },
            dev_plan: { status: 'pending' },
            implement: { status: 'pending' },
            commit_pr: { status: 'pending' },
            review_loop: { status: 'pending' },
            done: { status: 'pending' },
          },
        },
      });
    }

    // Add user message immediately
    const msgs = messageCache.get(taskId) || [];
    msgs.push({ id: `${reqId}-user`, role: 'user' as const, content: command });
    messageCache.set(taskId, [...msgs]);

    // Strip pipeline markers from display text
    const stripMarkers = (text: string) => text.replace(/\[PIPELINE:[^\]]*\]/g, '').trimStart();

    // Listen for data — update messageCache in real-time
    let turnCounter = 0;
    let currentResponse = '';
    const assistantId = () => `${reqId}-turn-${turnCounter}`;

    const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
      // Stop processing if task was reset
      const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      if (!currentTask?.pipeline?.enabled) return;

      try {
        const evt = JSON.parse(event.payload);

        if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
          sessionCache.set(taskId, evt.session_id);
        }

        if (evt.type === 'assistant' && evt.message?.content) {
          const textBlocks = (evt.message.content as Array<{ type: string; text?: string }>)
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text?: string }) => b.text || '');
          if (textBlocks.length > 0) {
            turnCounter++;
            currentResponse = stripMarkers(textBlocks.join(''));
            const cached = messageCache.get(taskId) || [];
            const existing = cached.findIndex((m) => m.id === assistantId());
            if (existing >= 0) {
              cached[existing] = { ...cached[existing], content: currentResponse };
            } else {
              cached.push({ id: assistantId(), role: 'assistant' as const, content: currentResponse });
            }
            messageCache.set(taskId, [...cached]);
          }
        } else if (evt.type === 'content_block_delta' && evt.delta?.text) {
          currentResponse = stripMarkers(currentResponse + evt.delta.text);
          const cached = messageCache.get(taskId) || [];
          const existing = cached.findIndex((m) => m.id === assistantId());
          if (existing >= 0) {
            cached[existing] = { ...cached[existing], content: currentResponse };
          } else {
            cached.push({ id: assistantId(), role: 'assistant' as const, content: currentResponse });
          }
          messageCache.set(taskId, [...cached]);
        }
      } catch { /* not JSON */ }
    });

    const donePromise = new Promise<void>((resolve) => {
      listen(`claude-done-${reqId}`, () => resolve());
    });

    // Context summary
    const contextSummary = [
      '## CORTX_PIPELINE_TRACKING',
      'Emit [PIPELINE:phase:status] markers. Valid phases: grill_me, obsidian_save, dev_plan, implement, commit_pr, review_loop, done.',
      '한국어로만 대화합니다.',
    ].join('\n');

    await invoke('claude_spawn', {
      id: reqId, cwd: cwd || '/', message: prompt,
      contextFiles: null, contextSummary, allowAllTools: true,
      sessionId: null, model: null,
    });

    await donePromise;
    unData();

    // Check if Claude is asking a question (last message ends with ?)
    const finalMsgs = messageCache.get(taskId) || [];
    const lastAssistant = [...finalMsgs].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content.trim().endsWith('?')) {
      setAskingTasks((prev) => new Set(prev).add(taskId));
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Cortx', { body: `${task.title} — 사용자 입력이 필요합니다` }); } catch {}
    }

    setRunningPipelines((prev) => { const n = new Set(prev); n.delete(taskId); return n; });
  };

  const runSelectedPipelines = () => {
    const selected = [...selectedTasks].filter((id) => tasks.some((t) => t.id === id && t.status !== 'done'));
    // Reset all timers to 0 simultaneously before starting
    selected.forEach((id) => useTaskStore.getState().updateTask(id, { elapsedSeconds: 0 }));
    // Start all pipelines in parallel
    selected.forEach((id) => runPipelineForTask(id, '/pipeline:dev-task'));
    setSelectedTasks(new Set());
  };
  // Clear asking state when user has responded (last message is from 'user')
  if (askingTasks.size > 0) {
    import('./ClaudeChat').then(({ messageCache: mc }) => {
      const toRemove = [...askingTasks].filter((id) => {
        const msgs = mc.get(id);
        if (!msgs || msgs.length === 0) return true;
        return msgs[msgs.length - 1].role === 'user';
      });
      if (toRemove.length > 0) {
        setAskingTasks((prev) => { const n = new Set(prev); toRemove.forEach((id) => n.delete(id)); return n; });
      }
    });
  }

  // Clear running indicator when pipeline is reset
  if (runningPipelines.size > 0) {
    const toRemove = [...runningPipelines].filter((id) => {
      const t = tasks.find((task) => task.id === id);
      return !t || !t.pipeline?.enabled || t.status === 'waiting';
    });
    if (toRemove.length > 0) {
      setRunningPipelines((prev) => { const n = new Set(prev); toRemove.forEach((id) => n.delete(id)); return n; });
    }
  }

  const nonDone = tasks.filter((t) => t.status !== 'done');
  const doneList = tasks.filter((t) => t.status === 'done');
  const totalFocus = tasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const totalInterrupts = tasks.reduce((s, t) => s + (t.interrupts?.length || 0), 0);
  const totalInterruptTime = tasks.reduce((s, t) => s + (t.interrupts || []).reduce((a, e) => a + e.durationSeconds, 0), 0);

  const handleDeleteTask = async (task: { id: string; worktreePath?: string; repoPath?: string; branchName?: string }) => {
    // Remove worktree and branch
    const repoPath = task.repoPath || '';
    if (task.worktreePath && repoPath) {
      try {
        await invoke('remove_worktree', { repoPath, worktreePath: task.worktreePath });
      } catch { /* worktree might not exist */ }
      if (task.branchName) {
        try {
          await invoke('run_shell_command', {
            cwd: repoPath,
            command: `git branch -D ${task.branchName} 2>/dev/null`,
          });
        } catch { /* branch might not exist */ }
      }
    }
    removeTask(task.id);
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
      <div className="sb-header" onMouseDown={async (e) => { if (e.buttons === 1 && (e.target as HTMLElement).tagName !== 'BUTTON') { try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().startDragging(); } catch {} } }} onDoubleClick={async (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') return; try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); const w = getCurrentWindow(); if (await w.isMaximized()) await w.unmaximize(); else await w.maximize(); } catch {} }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e8eef5' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
        </span>
        <span className="sb-title" style={{ fontSize: 10 }}>Tasks</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {projects.length === 0 && nonDone.length === 0 && doneList.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12, color: '#4d5868', lineHeight: 1.8, padding: 16 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #ffffff04', position: 'relative' }}>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const allSelected = projTasks.every((t) => selectedTasks.has(t.id));
                    if (allSelected) {
                      setSelectedTasks((prev) => { const n = new Set(prev); projTasks.forEach((t) => n.delete(t.id)); return n; });
                    } else {
                      setSelectedTasks((prev) => { const n = new Set(prev); projTasks.forEach((t) => n.add(t.id)); return n; });
                    }
                  }}
                  style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex', alignItems: 'center', zIndex: 5 }}
                >
                  {projTasks.length > 0 && projTasks.every((t) => selectedTasks.has(t.id))
                    ? <CheckSquare size={18} color="#5aa5a5" strokeWidth={1.5} />
                    : <Square size={18} color="#3d4856" strokeWidth={1.5} />}
                </span>
                <button
                  onClick={() => toggleCollapse(project.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '12px 16px 12px 30px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: project.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{project.name}</span>
                  <span style={{ fontSize: 13, color: '#6b6b78' }}>{projTasks.length}</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8, flexShrink: 0 }}>
                  <ProjBtn icon={<span style={{ display: 'inline-block', transition: 'transform 200ms ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>} title={isCollapsed ? 'Expand' : 'Collapse'} onClick={() => toggleCollapse(project.id)} />
                  {onAddTaskForProject && <ProjBtn icon="+" title="Add task" onClick={() => onAddTaskForProject(project.id)} />}
                  {onEditProject && <ProjBtn icon="⚙" title="Settings" onClick={() => onEditProject(project.id)} />}
                  <ProjBtn icon={<X size={12} strokeWidth={1.5} />} title="Delete" onClick={() => handleDeleteProject(project.id, project.name)} hoverColor="#ef4444" />
                </div>
              </div>
              {!isCollapsed && (
                <>
                  {projTasks.map((task) => (
                    <TaskRow key={task.id} task={task} isActive={activeTaskId === task.id} onSelect={() => setActiveTask(task.id)} onDelete={() => handleDeleteTask(task)} indent color={project.color} selected={selectedTasks.has(task.id)} onToggleSelect={() => toggleSelect(task.id)} isRunning={runningPipelines.has(task.id)} isAsking={askingTasks.has(task.id)} />
                  ))}
                  {projTasks.length === 0 && (
                    <div style={{ padding: '8px 14px 8px 24px', fontSize: 11, color: '#2a3642', fontStyle: 'italic' }}>
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
              <div className="sb-section" style={{ color: '#2a3642' }}>No project</div>
            )}
            {unassigned.map((task) => (
              <TaskRow key={task.id} task={task} isActive={activeTaskId === task.id} onSelect={() => setActiveTask(task.id)} onDelete={() => handleDeleteTask(task)} indent={false} selected={selectedTasks.has(task.id)} onToggleSelect={() => toggleSelect(task.id)} isRunning={runningPipelines.has(task.id)} isAsking={askingTasks.has(task.id)} />
            ))}
          </>
        )}

        {/* Done */}
        {doneList.length > 0 && (
          <>
            <div className="sb-section" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={12} color="#34d399" strokeWidth={2} /> Done</div>
            {doneList.map((task) => (
              <div key={task.id} className="task-row-wrap" style={{ padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', height: 77 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, paddingRight: 50 }}>
                  <div className="sb-dot done" />
                  <span style={{ fontSize: 13, color: '#3d4856', textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</span>
                </div>
                <span className="sb-timer">{formatTime(task.elapsedSeconds)}</span>
                <button
                  onClick={() => setTaskStatus(task.id, 'waiting')}
                  className="task-delete-btn"
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    width: 22, height: 22, borderRadius: 6,
                    background: '#1e2530', border: '1px solid #2a3642',
                    color: '#4d5868', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#34d39920'; e.currentTarget.style.color = '#34d399'; e.currentTarget.style.borderColor = '#34d39940'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#1e2530'; e.currentTarget.style.color = '#4d5868'; e.currentTarget.style.borderColor = '#2a3642'; }}
                  title="Undo — move back to waiting"
                >↩</button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Run Pipeline button */}
      {selectedTasks.size > 0 && (
        <div style={{ padding: '8px 16px' }}>
          <button
            onClick={runSelectedPipelines}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: 'rgba(90,165,165,0.1)', border: '1px solid rgba(90,165,165,0.2)',
              color: '#5aa5a5', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 200ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(90,165,165,0.2)'; e.currentTarget.style.borderColor = 'rgba(90,165,165,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(90,165,165,0.1)'; e.currentTarget.style.borderColor = 'rgba(90,165,165,0.2)'; }}
          >
            <Play size={12} strokeWidth={2} /> Run Pipeline ({selectedTasks.size})
          </button>
          {showResetConfirm && (
            <div style={{ padding: '8px 0', marginTop: 4 }}>
              <div style={{ fontSize: 11, color: '#c0c8d4', marginBottom: 6 }}>Reset {selectedTasks.size} tasks?</div>
              <div style={{ fontSize: 10, color: '#6b7585', marginBottom: 8 }}>Pipeline, timer, Claude session, git changes will be cleared.</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={async () => {
                  setShowResetConfirm(false);
                  const { messageCache, sessionCache } = await import('./ClaudeChat');
                  for (const id of selectedTasks) {
                    const t = tasks.find((task) => task.id === id);
                    if (!t) continue;
                    await invoke('claude_stop_task', { taskId: id }).catch(() => {});
                    const proj = t.projectId ? projects.find((p) => p.id === t.projectId) : null;
                    const taskCwd = t.worktreePath || t.repoPath || proj?.localPath || '';
                    if (taskCwd) {
                      await invoke('run_shell_command', { cwd: taskCwd, command: 'git checkout -- . 2>/dev/null' }).catch(() => {});
                      await invoke('run_shell_command', { cwd: taskCwd, command: 'git clean -fd 2>/dev/null' }).catch(() => {});
                      await invoke('run_shell_command', { cwd: taskCwd, command: 'git reset origin/develop 2>/dev/null' }).catch(() => {});
                      await invoke('run_shell_command', { cwd: taskCwd, command: 'git checkout -- . 2>/dev/null' }).catch(() => {});
                    }
                    useTaskStore.getState().updateTask(id, { pipeline: undefined, elapsedSeconds: 0, interrupts: [] });
                    useTaskStore.getState().setTaskStatus(id, 'waiting');
                    messageCache.delete(id);
                    sessionCache.delete(id);
                  }
                  setSelectedTasks(new Set());
                }} style={{ padding: '4px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
                <button onClick={() => setShowResetConfirm(false)} style={{ padding: '4px 12px', borderRadius: 5, fontSize: 10, background: 'none', border: '1px solid #3d4856', color: '#8b95a5', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          )}
          {!showResetConfirm && <button
            onClick={() => setShowResetConfirm(true)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: 'none', border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginTop: 6, transition: 'all 200ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; }}
          >
            <RotateCcw size={12} strokeWidth={1.5} /> Reset Selected ({selectedTasks.size})
          </button>
        </div>
      )}

      {/* Today summary */}
      <div style={{ borderTop: '1px solid #141418', paddingBottom: 12 }}>
        <div className="sb-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Today</span>
          {onShowReport && (
            <button onClick={onShowReport} className="icon-btn-subtle" style={{ background: 'none', border: 'none', color: '#3d4856', cursor: 'pointer', fontSize: 10, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 4, padding: '2px 6px' }}>
              <BarChart3 size={14} strokeWidth={1.5} /> Report
            </button>
          )}
        </div>
        <div className="sb-summary"><span>Focus</span><span className="val" style={{ color: '#7dbdbd' }}>{formatTime(totalFocus)}</span></div>
        <div className="sb-summary"><span>Interrupts</span><span className="val" style={{ color: '#eab308' }}>{totalInterrupts} ({formatTime(totalInterruptTime)})</span></div>
        <div className="sb-summary"><span>Done</span><span className="val" style={{ color: '#34d399' }}>{doneList.length}/{tasks.length}</span></div>
      </div>
    </div>
  );
}

function TaskRow({ task, isActive, onSelect, onDelete, indent, color, selected, onToggleSelect, isRunning, isAsking }: {
  task: { id: string; title: string; status: string; branchName: string; elapsedSeconds: number; pipeline?: { enabled: boolean; phases: Record<string, { status: string }> } };
  isActive: boolean; onSelect: () => void; onDelete: () => void; indent: boolean; color?: string;
  selected?: boolean; onToggleSelect?: () => void; isRunning?: boolean; isAsking?: boolean;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cls = [
    'sb-task',
    isActive ? 'active' : '',
    task.status === 'paused' ? 'is-paused' : '',
    task.status === 'waiting' ? 'is-waiting' : '',
  ].join(' ');
  const dotCls = task.status === 'active' ? 'running' : task.status === 'paused' ? 'paused' : 'waiting';

  return (
    <div className="task-row-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {onToggleSelect && task.status !== 'done' && (
        <span
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex', alignItems: 'center', zIndex: 5 }}
        >
          {selected
            ? <CheckSquare size={18} color="#5aa5a5" strokeWidth={1.5} />
            : <Square size={18} color="#3d4856" strokeWidth={1.5} />}
        </span>
      )}
      <button className={cls} onClick={onSelect} style={{
        ...(indent ? { paddingLeft: 24 } : {}),
        ...(isActive && color ? { borderLeftColor: color, boxShadow: `inset 3px 0 8px -3px ${color}50` } : {}),
      }}>
        <div className="sb-task-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div className={`sb-dot ${dotCls}`} style={{
              ...(color && task.status === 'active' ? { background: color, boxShadow: `0 0 6px ${color}80` } : {}),
              ...(isAsking ? { background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.6)' } : {}),
              ...(isRunning && !isAsking ? { background: '#5aa5a5', boxShadow: '0 0 6px rgba(90,165,165,0.6)', animation: 'pulse-glow 1.5s infinite' } : {}),
            }} />
            <span className="sb-task-name" title={task.title}>{task.title}</span>
          </div>
          <span className="sb-timer">{task.status === 'waiting' ? '--:--' : formatTime(task.elapsedSeconds)}</span>
        </div>
        {task.branchName && <div className="sb-meta"><code>{task.branchName}</code></div>}
        {task.pipeline?.enabled && (() => {
          const phases = task.pipeline.phases;
          const activePhase = Object.entries(phases).find(([, v]) => v.status === 'in_progress');
          if (isAsking) {
            return <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b' }} />
              Asking
            </div>;
          }
          if (activePhase) {
            return <div style={{ fontSize: 9, color: '#5aa5a5', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#5aa5a5', animation: 'pulse 1.2s infinite' }} />
              Running
            </div>;
          }
          return null;
        })()}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 22, height: 22, borderRadius: 6,
          background: '#1e2530', border: '1px solid #2a3642',
          color: '#4d5868', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#ef444420'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444440'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#1e2530'; e.currentTarget.style.color = '#4d5868'; e.currentTarget.style.borderColor = '#2a3642'; }}
        className="task-delete-btn"
        title="Delete task"
      ><X size={12} strokeWidth={1.5} /></button>

      {/* Inline delete confirmation */}
      {showConfirm && (
        <div style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          background: '#1e2530', border: '1px solid #ef444430', borderRadius: 8,
          padding: '8px 12px', zIndex: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 11, color: '#e8eef5' }}>
            {deleting ? 'Deleting...' : 'Delete this task?'}
          </span>
          {!deleting && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(true);
                  onDelete();
                }}
                style={{
                  padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Yes</button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }}
                style={{
                  padding: '3px 10px', borderRadius: 5, fontSize: 11,
                  background: 'none', border: '1px solid #3d4856',
                  color: '#888895', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >No</button>
            </>
          )}
          {deleting && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
        </div>
      )}
    </div>
  );
}

function ProjBtn({ icon, title, onClick, hoverColor }: { icon: React.ReactNode; title: string; onClick: () => void; hoverColor?: string }) {
  const color = hoverColor || '#a1a1aa';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: 'none', border: 'none',
        color: '#4d5868', cursor: 'pointer',
        fontSize: 16, fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.1s, background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = color; e.currentTarget.style.background = `${color}15`; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#4d5868'; e.currentTarget.style.background = 'none'; }}
    >{icon}</button>
  );
}
