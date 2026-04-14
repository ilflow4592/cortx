import { useState, useCallback } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { useLayoutStore } from '../stores/layoutStore';
import { ClaudeChat } from './claude/ClaudeChat';
import { TerminalView } from './TerminalView';
import { ContextPack } from './context/ContextPack';
import { CodeEditor } from './CodeEditor';
import { DiffEditorView } from './DiffEditor';
import { PauseDialog } from './PauseDialog';
import { RightPanel } from './right-panel/RightPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { useProjectStore } from '../stores/projectStore';
import { useT } from '../i18n';
import type { InterruptReason } from '../types/task';
import { TaskHeader } from './main-panel/TaskHeader';
import { DeleteTaskDialog } from './main-panel/DeleteTaskDialog';
import { TaskTabBar, type MainTab, type TabDef } from './main-panel/TaskTabBar';

// Tauri API 동적 import (CLAUDE.md 규칙 + quality gate).
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function MainPanel() {
  const showRightPanel = useLayoutStore((s) => s.showRightPanel);
  const [activeTab, setActiveTab] = useState<MainTab>('claude');
  const [showPause, setShowPause] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editorFile, setEditorFile] = useState<{ path: string; content: string; original?: string } | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [claudeResetKey, setClaudeResetKey] = useState(0);
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const pauseWithReason = useTaskStore((s) => s.pauseWithReason);
  const removeTask = useTaskStore((s) => s.removeTask);
  const projects = useProjectStore((s) => s.projects);
  const t = useT();
  const task = tasks.find((task) => task.id === activeTaskId);
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
    } catch {
      /* skip */
    }
  }, []);

  const handleOpenDiff = useCallback(
    async (filePath: string) => {
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
      } catch {
        /* skip */
      }
    },
    [taskCwd],
  );

  if (!task) {
    return (
      <div className="main">
        <div className="empty-state">
          <div className="empty-state-inner">
            <div className="empty-state-icon" />
            <div className="empty-state-title">{t('empty.noActiveTask')}</div>
            <div className="empty-state-sub">{t('empty.noActiveTask.sub')}</div>
          </div>
        </div>
      </div>
    );
  }

  const handlePauseConfirm = (reason: InterruptReason, memo: string) => {
    useContextPackStore.getState().takeSnapshot(task.id);
    pauseWithReason(task.id, reason, memo);
    setShowPause(false);
  };

  const fileName = editorFile?.path.split('/').pop() || '';
  const tabs: TabDef[] = [
    { key: 'claude', label: 'Claude' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'context', label: 'Context Pack', badge: taskDeltaCount || undefined },
    ...(editorFile ? [{ key: 'editor' as MainTab, label: fileName, closable: true }] : []),
  ];

  const closeEditor = () => {
    setEditorFile(null);
    setActiveTab('claude');
  };

  return (
    <div className="main">
      <TaskHeader
        task={task}
        onPauseRequest={() => setShowPause(true)}
        onDeleteRequest={() => setShowDeleteConfirm(true)}
      />

      {task.status === 'active' && taskDeltaCount > 0 && (
        <div className="delta-banner">
          <span className="delta-banner-text">⚡ {taskDeltaCount} updates while you were away</span>
          <span className="delta-banner-link" onClick={() => setActiveTab('context')}>
            View changes →
          </span>
        </div>
      )}

      <TaskTabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} onCloseEditor={closeEditor} />

      <div
        className="content-split"
        style={{ gridTemplateColumns: showRightPanel ? `1fr ${rightPanelWidth}px` : '1fr' }}
      >
        <div className="chat">
          <div style={{ display: activeTab === 'claude' ? 'contents' : 'none' }}>
            <ClaudeChat
              key={`${task.id}-${claudeResetKey}`}
              taskId={task.id}
              cwd={taskCwd}
              onSwitchTab={(tab) => setActiveTab(tab as MainTab)}
            />
          </div>
          <div style={{ display: activeTab === 'terminal' ? 'contents' : 'none' }}>
            <TerminalView key={task.id} taskId={task.id} worktreePath={taskCwd} isActive={activeTab === 'terminal'} />
          </div>
          <div style={{ display: activeTab === 'context' ? 'contents' : 'none' }}>
            <ContextPack
              key={task.id}
              taskId={task.id}
              onSwitchTab={(tab) => setActiveTab(tab as MainTab)}
              isVisible={activeTab === 'context'}
            />
          </div>
          {activeTab === 'editor' &&
            editorFile &&
            (editorFile.original !== undefined ? (
              <DiffEditorView
                key={`diff-${editorFile.path}`}
                filePath={editorFile.path}
                original={editorFile.original}
                modified={editorFile.content}
                cwd={taskCwd}
                onBack={closeEditor}
              />
            ) : (
              <CodeEditor
                key={editorFile.path}
                filePath={editorFile.path}
                content={editorFile.content}
                cwd={taskCwd}
                onBack={closeEditor}
              />
            ))}
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
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
              style={{
                width: 4,
                cursor: 'col-resize',
                background: 'var(--border-strong)',
                flexShrink: 0,
                opacity: 0,
                transition: 'opacity 200ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0';
              }}
            />
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ErrorBoundary label="RightPanel">
                <RightPanel
                  cwd={taskCwd}
                  branchName={task.branchName}
                  onOpenFile={handleOpenFile}
                  onOpenDiff={handleOpenDiff}
                  resetKey={claudeResetKey}
                  onResetSession={() => setClaudeResetKey((k) => k + 1)}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </div>

      {showPause && (
        <PauseDialog onConfirm={handlePauseConfirm} onCancel={() => setShowPause(false)} defaultMemo={task.memo} />
      )}

      {showDeleteConfirm && (
        <DeleteTaskDialog
          taskTitle={task.title}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            removeTask(task.id);
            setShowDeleteConfirm(false);
          }}
        />
      )}
    </div>
  );
}
