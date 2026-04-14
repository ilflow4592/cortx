import { useState, useCallback, lazy, Suspense } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { useLayoutStore } from '../stores/layoutStore';
import { ClaudeChat } from './claude/ClaudeChat';
import { ContextPack } from './context/ContextPack';
import { PauseDialog } from './PauseDialog';
import { RightPanel } from './right-panel/RightPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { useProjectStore } from '../stores/projectStore';
import { useT } from '../i18n';
import type { InterruptReason } from '../types/task';
import { TaskHeader } from './main-panel/TaskHeader';
import { DeleteTaskDialog } from './main-panel/DeleteTaskDialog';
import { TaskTabBar, type MainTab, type TabDef } from './main-panel/TaskTabBar';

// Monaco editor는 ~600KB라 lazy chunk로 분리 — 사용자가 editor 탭 열기 전까지 로드 안함
const CodeEditor = lazy(() => import('./CodeEditor').then((m) => ({ default: m.CodeEditor })));
const DiffEditorView = lazy(() => import('./DiffEditor').then((m) => ({ default: m.DiffEditorView })));
// xterm은 ~344KB — Terminal 탭 활성 전엔 로드하지 않음
const TerminalView = lazy(() => import('./TerminalView').then((m) => ({ default: m.TerminalView })));

// Tauri API 동적 import (CLAUDE.md 규칙 + quality gate).
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function MainPanel() {
  const showRightPanel = useLayoutStore((s) => s.showRightPanel);
  const [activeTab, setActiveTabRaw] = useState<MainTab>('claude');
  // 한 번 활성화되면 unmount 안 됨 — PTY 세션 유지 + xterm chunk 재로드 방지.
  // setActiveTabRaw와 동기화하여 effect 회피 (cascading render 방지).
  const [terminalEverActive, setTerminalEverActive] = useState(false);
  const selectTab = useCallback((tab: MainTab) => {
    setActiveTabRaw(tab);
    if (tab === 'terminal') setTerminalEverActive(true);
  }, []);
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
        selectTab('editor');
      }
    } catch {
      /* skip */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectTab은 stable callback
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
          selectTab('editor');
        }
      } catch {
        /* skip */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectTab은 stable callback
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
    selectTab('claude');
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
          <span className="delta-banner-link" onClick={() => selectTab('context')}>
            View changes →
          </span>
        </div>
      )}

      <TaskTabBar tabs={tabs} activeTab={activeTab} onSelect={selectTab} onCloseEditor={closeEditor} />

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
              onSwitchTab={(tab) => selectTab(tab as MainTab)}
            />
          </div>
          {terminalEverActive && (
            <div style={{ display: activeTab === 'terminal' ? 'contents' : 'none' }}>
              <Suspense
                fallback={
                  <div style={{ padding: 16, color: 'var(--fg-faint)', fontSize: 12 }}>Loading terminal...</div>
                }
              >
                <TerminalView
                  key={task.id}
                  taskId={task.id}
                  worktreePath={taskCwd}
                  isActive={activeTab === 'terminal'}
                />
              </Suspense>
            </div>
          )}
          <div style={{ display: activeTab === 'context' ? 'contents' : 'none' }}>
            <ContextPack
              key={task.id}
              taskId={task.id}
              onSwitchTab={(tab) => selectTab(tab as MainTab)}
              isVisible={activeTab === 'context'}
            />
          </div>
          {activeTab === 'editor' && editorFile && (
            <Suspense
              fallback={<div style={{ padding: 20, color: 'var(--fg-faint)', fontSize: 12 }}>Loading editor...</div>}
            >
              {editorFile.original !== undefined ? (
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
              )}
            </Suspense>
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
