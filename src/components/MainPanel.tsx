import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { Chat } from './Chat';
import { TerminalView } from './TerminalView';
import { ContextPack } from './ContextPack';
import { DiffViewer } from './DiffViewer';
import { PauseDialog } from './PauseDialog';
import { RightPanel } from './RightPanel';
import { formatTime } from '../utils/time';
import type { InterruptReason } from '../types/task';

type Tab = 'chat' | 'terminal' | 'diff' | 'context';

export function MainPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [showPause, setShowPause] = useState(false);
  const { tasks, activeTaskId, startTask, pauseWithReason, resumeTask, setTaskStatus } = useTaskStore();
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
  const handlePauseConfirm = (reason: InterruptReason, memo: string) => {
    takeSnapshot(task.id);
    pauseWithReason(task.id, reason, memo);
    setShowPause(false);
  };
  const handleResume = () => {
    detectDelta(task.id, task.branchName);
    resumeTask(task.id);
  };
  const handleDone = () => setTaskStatus(task.id, 'done');

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'chat', label: '💬 Chat' },
    { key: 'terminal', label: '⌨ Terminal' },
    { key: 'diff', label: '📋 Diff' },
    { key: 'context', label: '📦 Context Pack', badge: taskDelta.length || undefined },
  ];

  return (
    <div className="main">
      <div className="main-header">
        <div className="mh-left">
          <span className="mh-title">{task.title}</span>
          <span className={`mh-badge ${badgeCls}`}><span className="dot" />{statusLabel}</span>
          {task.branchName && <span className="mh-branch">{task.branchName}</span>}
        </div>
        <div className="mh-right">
          <span className="mh-timer">{formatTime(task.elapsedSeconds)}</span>
          {task.status === 'waiting' && <button className="mh-btn start" onClick={handleStart}>▶ Start</button>}
          {task.status === 'active' && <button className="mh-btn pause" onClick={() => setShowPause(true)}>⏸ Pause</button>}
          {task.status === 'paused' && <button className="mh-btn resume" onClick={handleResume}>▶ Resume</button>}
          {task.status !== 'done' && <button className="mh-btn done" onClick={handleDone}>✓ Done</button>}
        </div>
      </div>

      {task.status === 'active' && taskDelta.length > 0 && (
        <div className="delta-banner">
          <span className="delta-banner-text">⚡ {taskDelta.length} updates while you were away</span>
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

      <div className="content-split">
        <div className="chat">
          {activeTab === 'chat' && <Chat taskId={task.id} />}
          {activeTab === 'terminal' && <TerminalView taskId={task.id} worktreePath={task.worktreePath || task.repoPath} />}
          {activeTab === 'diff' && <DiffViewer taskId={task.id} />}
          {activeTab === 'context' && <ContextPack taskId={task.id} />}
        </div>
        <RightPanel />
      </div>

      {showPause && <PauseDialog onConfirm={handlePauseConfirm} onCancel={() => setShowPause(false)} defaultMemo={task.memo} />}
    </div>
  );
}
