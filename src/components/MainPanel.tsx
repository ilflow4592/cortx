import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileText, X, Play, Pause, Check, Trash2, RotateCcw } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { ClaudeChat } from './ClaudeChat';
import { TerminalView } from './TerminalView';
import { ContextPack } from './ContextPack';
import { CodeEditor } from './CodeEditor';
import { DiffEditorView } from './DiffEditor';
import { PauseDialog } from './PauseDialog';
import { RightPanel } from './RightPanel';
import { formatTime } from '../utils/time';
import { useProjectStore } from '../stores/projectStore';
import type { InterruptReason } from '../types/task';

type Tab = 'claude' | 'terminal' | 'context' | 'editor';

export function MainPanel({ showRightPanel = true, onToggleRightPanel }: {
  showRightPanel?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('claude');
  const [showPause, setShowPause] = useState(false);
  const [editorFile, setEditorFile] = useState<{ path: string; content: string; original?: string } | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [claudeResetKey, setClaudeResetKey] = useState(0);
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

  const handleOpenFile = useCallback(async (filePath: string) => {
    try {
      const escaped = filePath.replace(/'/g, "'\\''");
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: `cat '${escaped}' 2>/dev/null | head -5000`,
      });
      if (result.success) {
        setEditorFile({ path: filePath, content: result.output });
        setActiveTab('editor');
      }
    } catch { /* skip */ }
  }, []);

  const handleOpenDiff = useCallback(async (filePath: string) => {
    try {
      const escaped = filePath.replace(/'/g, "'\\''");
      const modResult = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: `cat '${escaped}' 2>/dev/null | head -5000`,
      });
      const origResult = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: taskCwd,
        command: `git show origin/develop:'${escaped.replace(taskCwd + '/', '')}' 2>/dev/null || git show HEAD~1:'${escaped.replace(taskCwd + '/', '')}' 2>/dev/null || echo ''`,
      });
      if (modResult.success) {
        setEditorFile({
          path: filePath,
          content: modResult.output,
          original: origResult.success ? origResult.output : '',
        });
        setActiveTab('editor');
      }
    } catch { /* skip */ }
  }, [taskCwd]);


  if (!task) {
    return (
      <div className="main">
        <div className="empty-state">
          <div className="empty-state-inner">
            <div className="empty-state-icon" />
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

  const fileName = editorFile?.path.split('/').pop() || '';

  const tabs: { key: Tab; label: string; badge?: number; closable?: boolean }[] = [
    { key: 'claude', label: 'Claude' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'context', label: 'Context Pack', badge: taskDeltaCount || undefined },
    ...(editorFile ? [{ key: 'editor' as Tab, label: fileName, closable: true }] : []),
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
              style={{ background: 'none', color: '#6b7585', border: '1px solid #2a3642', borderRadius: 5, padding: '4px 6px', fontSize: 10 }}
              onClick={() => { if (window.confirm('Reset timer, status & interrupts?')) { updateTask(task.id, { elapsedSeconds: 0, interrupts: [] }); setTaskStatus(task.id, 'waiting'); } }}
              title="Reset timer"
            ><RotateCcw size={12} strokeWidth={1.5} /></button>
          )}
          {task.status === 'waiting' && <button className="mh-btn start" onClick={handleStart}><Play size={12} strokeWidth={1.5} /> Start</button>}
          {task.status === 'active' && <button className="mh-btn pause" onClick={() => setShowPause(true)}><Pause size={12} strokeWidth={1.5} /> Pause</button>}
          {task.status === 'paused' && <button className="mh-btn resume" onClick={handleResume}><Play size={12} strokeWidth={1.5} /> Resume</button>}
          {task.status !== 'done' && <button className="mh-btn done" onClick={handleDone}><Check size={12} strokeWidth={1.5} /> Done</button>}
          <button
            className="mh-btn"
            style={{ background: 'none', color: '#3d4856', border: '1px solid #1e2530' }}
            onClick={() => { if (window.confirm(`Delete task "${task.title}"?`)) removeTask(task.id); }}
            title="Delete task"
          ><Trash2 size={14} strokeWidth={1.5} /></button>
          {onToggleRightPanel && (
            <button
              className="mh-btn"
              style={{ background: 'none', color: '#4d5868', border: '1px solid #1e2530', padding: '4px 8px' }}
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
            {t.closable && <FileText size={14} strokeWidth={1.5} style={{ marginRight: 4 }} />}
            {t.label}
            {t.badge && t.badge > 0 && <span className="badge">{t.badge}</span>}
            {t.closable && (
              <span
                onClick={(e) => { e.stopPropagation(); setEditorFile(null); setActiveTab('claude'); }}
                style={{ marginLeft: 6, color: '#6b7585', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
              ><X size={12} strokeWidth={1.5} /></span>
            )}
          </button>
        ))}
      </div>

      <div className="content-split" style={{ gridTemplateColumns: showRightPanel ? `1fr ${rightPanelWidth}px` : '1fr' }}>
        <div className="chat">
          <div style={{ display: activeTab === 'claude' ? 'contents' : 'none' }}>
            <ClaudeChat key={`${task.id}-${claudeResetKey}`} taskId={task.id} cwd={taskCwd} />
          </div>
          <div style={{ display: activeTab === 'terminal' ? 'contents' : 'none' }}>
            <TerminalView key={task.id} taskId={task.id} worktreePath={taskCwd} />
          </div>
          <div style={{ display: activeTab === 'context' ? 'contents' : 'none' }}>
            <ContextPack key={task.id} taskId={task.id} />
          </div>
          {activeTab === 'editor' && editorFile && (
            editorFile.original !== undefined ? (
              <DiffEditorView
                key={`diff-${editorFile.path}`}
                filePath={editorFile.path}
                original={editorFile.original}
                modified={editorFile.content}
                cwd={taskCwd}
                onBack={() => { setEditorFile(null); setActiveTab('claude'); }}
              />
            ) : (
              <CodeEditor
                key={editorFile.path}
                filePath={editorFile.path}
                content={editorFile.content}
                cwd={taskCwd}
                onBack={() => { setEditorFile(null); setActiveTab('claude'); }}
              />
            )
          )}
        </div>
        {showRightPanel && (
          <div style={{ display: 'flex', overflow: 'hidden', position: 'relative' }}>
            <div
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startWidth = rightPanelWidth;
                const onMove = (ev: MouseEvent) => {
                  const delta = startX - ev.clientX;
                  setRightPanelWidth(Math.max(250, Math.min(700, startWidth + delta)));
                };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
              style={{ width: 4, cursor: 'col-resize', background: '#2a3642', flexShrink: 0, opacity: 0, transition: 'opacity 200ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
            />
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <RightPanel cwd={taskCwd} branchName={task.branchName} onOpenFile={handleOpenFile} onOpenDiff={handleOpenDiff} resetKey={claudeResetKey} onResetSession={() => setClaudeResetKey((k) => k + 1)} />
            </div>
          </div>
        )}
      </div>

      {showPause && <PauseDialog onConfirm={handlePauseConfirm} onCancel={() => setShowPause(false)} defaultMemo={task.memo} />}
    </div>
  );
}
