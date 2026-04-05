import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { Chat } from './Chat';
import { ClaudeChat } from './ClaudeChat';
import { TerminalView } from './TerminalView';
import { ContextPack } from './ContextPack';
import { DiffViewer } from './DiffViewer';
import { PauseDialog } from './PauseDialog';
import { RightPanel } from './RightPanel';
import { formatTime } from '../utils/time';
import { callAI } from '../services/ai';
import { useSettingsStore } from '../stores/settingsStore';
import { useProjectStore } from '../stores/projectStore';
import type { InterruptReason, ChatMessage } from '../types/task';

type Tab = 'chat' | 'claude' | 'terminal' | 'diff' | 'context';

export function MainPanel({ showRightPanel = true, onToggleRightPanel }: {
  showRightPanel?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('claude');
  const [showPause, setShowPause] = useState(false);
  const { tasks, activeTaskId, startTask, pauseWithReason, resumeTask, setTaskStatus, removeTask } = useTaskStore();
  const { takeSnapshot, detectDelta, deltaItems } = useContextPackStore();
  const projects = useProjectStore((s) => s.projects);
  const task = tasks.find((t) => t.id === activeTaskId);
  const taskProject = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  // Resolve working directory: task worktreePath > task repoPath > project localPath
  const taskCwd = task?.worktreePath || task?.repoPath || taskProject?.localPath || '';

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
  const handleResume = async () => {
    await detectDelta(task.id, task.branchName);
    resumeTask(task.id);

    // Generate AI briefing
    const settings = useSettingsStore.getState();
    const cpStore = useContextPackStore.getState();
    const delta = cpStore.deltaItems[task.id] || [];
    const lastInterrupt = (task.interrupts || []).filter(e => e.resumedAt === null)[0];

    const resolvedKey = (settings.authMethod === 'oauth' && settings.oauthAccessToken) ? settings.oauthAccessToken : settings.apiKey;
    if (resolvedKey && (delta.length > 0 || task.memo)) {
      const briefingPrompt = [
        'You are a concise assistant. Generate a short resume briefing (3-5 bullet points) for the developer.',
        `Task: "${task.title}"`,
        task.memo ? `Last memo: "${task.memo}"` : '',
        lastInterrupt ? `Paused because: ${lastInterrupt.reason} - "${lastInterrupt.memo}"` : '',
        delta.length > 0 ? `\n${delta.length} updates while away:\n${delta.slice(0, 5).map(d => `- [${d.sourceType}] ${d.title}`).join('\n')}` : '',
        '\nKeep it brief and actionable. Use bullet points.',
      ].filter(Boolean).join('\n');

      try {
        const provider = task.modelOverride?.provider || settings.aiProvider;
        const modelId = task.modelOverride?.modelId || settings.modelId;
        const response = await callAI({
          provider, apiKey: resolvedKey, modelId, ollamaUrl: settings.ollamaUrl,
          authMethod: (settings.authMethod === 'oauth' && settings.oauthAccessToken) ? 'oauth' : 'api-key',
          oauthToken: settings.oauthAccessToken,
          messages: [{ id: '0', role: 'user', content: briefingPrompt, timestamp: '' }],
          taskTitle: task.title,
        });

        const briefingMsg: ChatMessage = {
          id: `briefing-${Date.now().toString(36)}`,
          role: 'assistant',
          content: `📋 **Resume Briefing**\n\n${response}`,
          model: modelId,
          timestamp: new Date().toISOString(),
        };
        useTaskStore.getState().addChatMessage(task.id, briefingMsg);
        setActiveTab('chat');
      } catch {
        // Briefing failed silently — not critical
      }
    }
  };
  const handleDone = () => setTaskStatus(task.id, 'done');

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'claude', label: '🤖 Claude' },
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

      <div className="content-split" style={{ gridTemplateColumns: showRightPanel ? '1fr 340px' : '1fr' }}>
        <div className="chat">
          {activeTab === 'claude' && <ClaudeChat taskId={task.id} cwd={taskCwd} />}
          {activeTab === 'chat' && <Chat taskId={task.id} />}
          {activeTab === 'terminal' && <TerminalView taskId={task.id} worktreePath={taskCwd} />}
          {activeTab === 'diff' && <DiffViewer taskId={task.id} />}
          {activeTab === 'context' && <ContextPack taskId={task.id} />}
        </div>
        {showRightPanel && <RightPanel />}
      </div>

      {showPause && <PauseDialog onConfirm={handlePauseConfirm} onCancel={() => setShowPause(false)} defaultMemo={task.memo} />}
    </div>
  );
}
