import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { ClaudeChat } from './ClaudeChat';
import { TerminalView } from './TerminalView';
import { ContextPack } from './ContextPack';
import { DiffViewer } from './DiffViewer';
import { PauseDialog } from './PauseDialog';
import { RightPanel } from './RightPanel';
import { formatTime } from '../utils/time';
import { useProjectStore } from '../stores/projectStore';
import type { InterruptReason } from '../types/task';

type Tab = 'claude' | 'terminal' | 'diff' | 'context';

export function MainPanel({ showRightPanel = true, onToggleRightPanel }: {
  showRightPanel?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('claude');
  const [showPause, setShowPause] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const startTask = useTaskStore((s) => s.startTask);
  const pauseWithReason = useTaskStore((s) => s.pauseWithReason);
  const resumeTask = useTaskStore((s) => s.resumeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);
  const removeTask = useTaskStore((s) => s.removeTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const projects = useProjectStore((s) => s.projects);
  const task = tasks.find((t) => t.id === activeTaskId);
  const taskDeltaCount = useContextPackStore((s) => (s.deltaItems[task?.id || ''] || []).length);
  const taskProject = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const taskCwd = task?.worktreePath || task?.repoPath || taskProject?.localPath || '';
  if (task) console.log('[cortx:cwd]', { worktreePath: task.worktreePath, repoPath: task.repoPath, projectPath: taskProject?.localPath, taskCwd });

  if (!task) {
    return (
      <div className="main">
        <div className="empty-state">
          <div className="empty-state-inner">
            <div className="empty-state-icon">🧠</div>
            <div className="empty-state-title">No active task</div>
            <div className="empty-state-sub">Select or create a task to get started</div>
          </div>
        </div>
      </div>
    );
  }

  const badgeCls = task.status === 'active' ? 'active' : task.status === 'paused' ? 'paused' : 'waiting';
  const statusLabel = task.status === 'active' ? 'In Progress' : task.status === 'paused' ? 'Paused' : task.status === 'waiting' ? 'Waiting' : task.status;

  const handleStart = () => startTask(task.id);
  const handlePauseConfirm = (reason: InterruptReason, memo: string) => {
    useContextPackStore.getState().takeSnapshot(task.id);
    pauseWithReason(task.id, reason, memo);
    setShowPause(false);
  };
  const handleResume = async () => {
    await useContextPackStore.getState().detectDelta(task.id, task.branchName);
    resumeTask(task.id);
  };
  const handleDone = () => setTaskStatus(task.id, 'done');

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'claude', label: '🤖 Claude' },
    { key: 'terminal', label: '⌨ Terminal' },
    { key: 'diff', label: '📋 Diff' },
    { key: 'context', label: '📦 Context Pack', badge: taskDeltaCount || undefined },
  ];

  return (
    <div className="main">
      <div className="main-header" onMouseDown={async (e) => { if (e.buttons === 1 && (e.target as HTMLElement).closest('.mh-right') === null) { try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().startDragging(); } catch {} } }} onDoubleClick={async (e) => { if ((e.target as HTMLElement).closest('.mh-right')) return; try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); const w = getCurrentWindow(); if (await w.isMaximized()) await w.unmaximize(); else await w.maximize(); } catch {} }}>
        <div className="mh-left">
          <span className="mh-title" title={task.title}>{task.title}</span>
          <span className={`mh-badge ${badgeCls}`}><span className="dot" />{statusLabel}</span>
          {task.branchName && <span className="mh-branch">{task.branchName}</span>}
        </div>
        <div className="mh-right">
          <span className="mh-timer">{formatTime(task.elapsedSeconds)}</span>
          {task.elapsedSeconds > 0 && (
            <button
              className="mh-btn"
              style={{ background: 'none', color: '#71717a', border: '1px solid #27272a', borderRadius: 5, padding: '4px 6px', fontSize: 10 }}
              onClick={() => { if (window.confirm('Reset timer, status & interrupts?')) { updateTask(task.id, { elapsedSeconds: 0, interrupts: [] }); setTaskStatus(task.id, 'waiting'); } }}
              title="Reset timer"
            >↺</button>
          )}
          {task.status === 'waiting' && <button className="mh-btn start" onClick={handleStart}>▶ Start</button>}
          {task.status === 'active' && <button className="mh-btn pause" onClick={() => setShowPause(true)}>⏸ Pause</button>}
          {task.status === 'paused' && <button className="mh-btn resume" onClick={handleResume}>▶ Resume</button>}
          {task.status !== 'done' && <button className="mh-btn done" onClick={handleDone}>✓ Done</button>}
          <button
            className="mh-btn"
            style={{ background: 'none', color: '#3f3f46', border: '1px solid #18181b' }}
            onClick={() => { if (window.confirm(`Delete task "${task.title}"?`)) removeTask(task.id); }}
            title="Delete task"
          >🗑</button>
          {onToggleRightPanel && (
            <button
              className="mh-btn"
              style={{ background: 'none', color: '#52525b', border: '1px solid #18181b', padding: '4px 8px' }}
              onClick={onToggleRightPanel}
              title="Toggle right panel ⌘⇧B"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {task.status === 'active' && taskDeltaCount > 0 && (
        <div className="delta-banner">
          <span className="delta-banner-text">⚡ {taskDeltaCount} updates while you were away</span>
          <span className="delta-banner-link" onClick={() => setActiveTab('context')}>View changes →</span>
        </div>
      )}

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
            {t.badge && t.badge > 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="content-split" style={{ gridTemplateColumns: showRightPanel ? '1fr 340px' : '1fr' }}>
        <div className="chat">
          <div style={{ display: activeTab === 'claude' ? 'contents' : 'none' }}>
            <ClaudeChat key={task.id} taskId={task.id} cwd={taskCwd} />
          </div>
          <div style={{ display: activeTab === 'terminal' ? 'contents' : 'none' }}>
            <TerminalView key={task.id} taskId={task.id} worktreePath={taskCwd} />
          </div>
          {activeTab === 'diff' && <DiffViewer key={task.id} taskId={task.id} />}
          <div style={{ display: activeTab === 'context' ? 'contents' : 'none' }}>
            <ContextPack key={task.id} taskId={task.id} />
          </div>
        </div>
        {showRightPanel && <RightPanel />}
      </div>

      {showPause && <PauseDialog onConfirm={handlePauseConfirm} onCancel={() => setShowPause(false)} defaultMemo={task.memo} />}
    </div>
  );
}
