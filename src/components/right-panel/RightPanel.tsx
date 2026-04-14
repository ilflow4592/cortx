import { useState, lazy, Suspense } from 'react';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}
import { useTaskStore } from '../../stores/taskStore';
import { messageCache, sessionCache, loadingCache } from '../../utils/chatState';
import { useProjectStore } from '../../stores/projectStore';
import { useContextPackStore } from '../../stores/contextPackStore';
import { ProjectFiles } from '../ProjectFiles';
import { PHASE_ORDER } from '../../constants/pipeline';

// ChangesView는 Monaco editor 사용 → lazy로 분리해 main bundle에서 제거
const ChangesView = lazy(() => import('../ChangesView').then((m) => ({ default: m.ChangesView })));
import { DashboardTab } from './DashboardTab';
import { WorktreeTab } from './WorktreeTab';
import { ContextTab } from './ContextTab';
import { HistoryTab } from './HistoryTab';
import { usePipelineConfig } from '../../hooks/usePipelineConfig';
import { UpperTabBar, type UpperTab } from './UpperTabBar';
import { LowerTabBar, type LowerTab } from './LowerTabBar';
import { ResizeHandle } from './ResizeHandle';

export function RightPanel({
  cwd,
  branchName,
  onOpenFile,
  onOpenDiff,
  resetKey,
  onResetSession,
}: {
  cwd: string;
  branchName: string;
  onOpenFile?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  resetKey?: number;
  onResetSession?: () => void;
}) {
  const [upperTab, setUpperTab] = useState<UpperTab>('projects');
  const [lowerTab, setLowerTab] = useState<LowerTab>('dashboard');
  const [splitRatio, setSplitRatio] = useState(0.35);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showOpenMenu, setShowOpenMenu] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const pipelineConfig = usePipelineConfig(activeTaskId);
  const updateTask = useTaskStore((s) => s.updateTask);
  const projects = useProjectStore((s) => s.projects);
  // Subscribe only to the specific task's data to avoid infinite re-renders
  const task = tasks.find((t) => t.id === activeTaskId);
  const taskItemsRaw = useContextPackStore((s) => (task ? s.items[task.id] : undefined));
  const taskDeltaRaw = useContextPackStore((s) => (task ? s.deltaItems[task.id] : undefined));
  const taskHistory = useContextPackStore((s) => (task ? s.collectHistory[task.id] : undefined)) || [];

  if (!task) return <div className="right-panel" />;

  const taskProject = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const sourceOrder: Record<string, number> = { github: 0, notion: 1, slack: 2, pin: 3 };
  const taskItems = [...(taskItemsRaw || [])].sort(
    (a, b) => (sourceOrder[a.sourceType] ?? 9) - (sourceOrder[b.sourceType] ?? 9),
  );
  const taskDelta = taskDeltaRaw || [];
  const pipeline = task.pipeline;
  const phaseDoneCount = pipeline ? PHASE_ORDER.filter((p) => pipeline.phases[p]?.status === 'done').length : 0;

  const upperTabs: { key: UpperTab; label: string }[] = [
    { key: 'projects', label: 'Projects' },
    { key: 'changes', label: 'Changes' },
  ];
  const lowerTabs: { key: LowerTab; label: string; badge?: number }[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      badge: pipeline?.enabled && phaseDoneCount > 0 ? phaseDoneCount : undefined,
    },
    { key: 'worktree', label: 'Worktree' },
    { key: 'context', label: 'Context', badge: taskItems.length || undefined },
    { key: 'history', label: 'History', badge: taskHistory.length || undefined },
  ];

  return (
    <div className="right-panel">
      {/* Upper section: Projects / Changes */}
      <div
        style={{
          height: `calc(${splitRatio * 100}% - 2px)`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <UpperTabBar
          tabs={upperTabs}
          active={upperTab}
          onChange={setUpperTab}
          cwd={cwd}
          showOpenMenu={showOpenMenu}
          onToggleOpenMenu={setShowOpenMenu}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {upperTab === 'projects' && <ProjectFiles cwd={cwd} onOpenFile={onOpenFile} />}
          {upperTab === 'changes' && (
            <Suspense fallback={<div style={{ padding: 16, color: 'var(--fg-faint)', fontSize: 12 }}>Loading...</div>}>
              <ChangesView key={resetKey} cwd={cwd} branchName={branchName} onOpenFile={onOpenDiff} />
            </Suspense>
          )}
        </div>
      </div>

      <ResizeHandle splitRatio={splitRatio} onChange={setSplitRatio} />

      {/* Lower section: Dashboard / Worktree / Context / History */}
      <div
        style={{
          height: `calc(${(1 - splitRatio) * 100}% - 2px)`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <LowerTabBar tabs={lowerTabs} active={lowerTab} onChange={setLowerTab} />
        <div className="rp-content">
          {lowerTab === 'dashboard' && (
            <DashboardTab
              pipeline={pipeline}
              cwd={cwd}
              onResetClick={() => setShowResetModal(true)}
              config={pipelineConfig}
            />
          )}
          {lowerTab === 'worktree' && <WorktreeTab task={task} taskProject={taskProject} />}
          {lowerTab === 'context' && <ContextTab taskItems={taskItems} taskDelta={taskDelta} />}
          {lowerTab === 'history' && <HistoryTab taskHistory={taskHistory} />}
        </div>
      </div>

      {/* Reset session modal */}
      {showResetModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowResetModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-panel-alt)',
              border: '1px solid var(--border-strong)',
              borderRadius: 12,
              padding: '24px 28px',
              width: 380,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-primary)', marginBottom: 12 }}>
              Reset Session
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.7, marginBottom: 8 }}>
              The following will be reset:
            </div>
            <ul
              style={{
                fontSize: 12,
                color: 'var(--fg-secondary)',
                lineHeight: 2,
                paddingLeft: 8,
                marginBottom: 16,
                listStyle: 'none',
              }}
            >
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
                />
                Pipeline progress (all phases)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
                />
                Task timer (back to 00:00)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
                />
                Claude conversation context (new session)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
                />
                Task status (back to Waiting)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                Git changes (discard all uncommitted changes)
              </li>
            </ul>
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  background: 'none',
                  border: '1px solid var(--fg-dim)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Discard git changes
                  if (cwd) {
                    await invoke('run_shell_command', { cwd, command: 'git checkout -- . 2>/dev/null' }).catch(
                      () => {},
                    );
                    await invoke('run_shell_command', { cwd, command: 'git clean -fd 2>/dev/null' }).catch(() => {});
                    await invoke('run_shell_command', {
                      cwd,
                      command: 'git reset origin/develop 2>/dev/null || git reset HEAD~1 2>/dev/null',
                    }).catch(() => {});
                    await invoke('run_shell_command', { cwd, command: 'git checkout -- . 2>/dev/null' }).catch(
                      () => {},
                    );
                  }
                  // Kill all running Claude CLI processes for this task via backend PID tracking
                  await invoke('claude_stop_task', { taskId: task.id }).catch(() => {});

                  // Reset pipeline, timer, status
                  updateTask(task.id, {
                    pipeline: undefined,
                    elapsedSeconds: 0,
                    interrupts: [],
                  });
                  useTaskStore.getState().setTaskStatus(task.id, 'waiting');
                  // Clear Claude messages, session, and loading state
                  messageCache.delete(task.id);
                  sessionCache.delete(task.id);
                  loadingCache.delete(task.id);
                  onResetSession?.();
                  setShowResetModal(false);
                }}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Reset Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
