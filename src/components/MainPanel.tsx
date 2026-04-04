import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { Chat } from './Chat';
import { TerminalView } from './TerminalView';
import { ContextPack } from './ContextPack';
import { RightPanel } from './RightPanel';
import { formatTime } from '../utils/time';

type Tab = 'chat' | 'terminal' | 'context';

export function MainPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const { tasks, activeTaskId, startTask, setTaskStatus } = useTaskStore();
  const { takeSnapshot, detectDelta, deltaItems } = useContextPackStore();
  const task = tasks.find((t) => t.id === activeTaskId);

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

  const taskDelta = deltaItems[task.id] || [];
  const badgeCls = task.status === 'active' ? 'active' : task.status === 'paused' ? 'paused' : 'waiting';
  const statusLabel = task.status === 'active' ? 'In Progress' : task.status === 'paused' ? 'Paused' : task.status === 'waiting' ? 'Waiting' : task.status;

  const handleStart = () => startTask(task.id);
  const handlePause = () => {
    const memo = window.prompt('Pause memo:', task.memo || '');
    if (memo !== null) { takeSnapshot(task.id); setTaskStatus(task.id, 'paused', memo); }
  };
  const handleResume = () => { detectDelta(task.id, task.branchName); setTaskStatus(task.id, 'active'); };
  const handleDone = () => setTaskStatus(task.id, 'done');

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'chat', label: '💬 Chat' },
    { key: 'terminal', label: '⌨ Terminal' },
    { key: 'context', label: '📦 Context Pack', badge: taskDelta.length || undefined },
  ];

  return (
    <div className="main">
      {/* Header */}
      <div className="main-header">
        <div className="mh-left">
          <span className="mh-title">{task.title}</span>
          <span className={`mh-badge ${badgeCls}`}>
            <span className="dot" />
            {statusLabel}
          </span>
          {task.branchName && <span className="mh-branch">{task.branchName}</span>}
        </div>
        <div className="mh-right">
          <span className="mh-timer">{formatTime(task.elapsedSeconds)}</span>
          {task.status === 'waiting' && <button className="mh-btn start" onClick={handleStart}>▶ Start</button>}
          {task.status === 'active' && <button className="mh-btn pause" onClick={handlePause}>⏸ Pause</button>}
          {task.status === 'paused' && <button className="mh-btn resume" onClick={handleResume}>▶ Resume</button>}
          {task.status !== 'done' && <button className="mh-btn done" onClick={handleDone}>✓ Done</button>}
        </div>
      </div>

      {/* Delta banner */}
      {task.status === 'active' && taskDelta.length > 0 && (
        <div className="delta-banner">
          <span className="delta-banner-text">⚡ {taskDelta.length} updates while you were away</span>
          <span className="delta-banner-link" onClick={() => setActiveTab('context')}>View changes →</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
            {t.badge && t.badge > 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Content + Right Panel */}
      <div className="content-split">
        <div className="chat">
          {activeTab === 'chat' && <Chat taskId={task.id} />}
          {activeTab === 'terminal' && <TerminalView taskId={task.id} worktreePath={task.worktreePath || task.repoPath} />}
          {activeTab === 'context' && <ContextPack taskId={task.id} />}
        </div>
        <RightPanel />
      </div>
    </div>
  );
}
