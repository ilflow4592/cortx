import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink, Braces, Code2, FolderOpen, TerminalSquare } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { messageCache, sessionCache } from '../../utils/chatState';
import { useProjectStore } from '../../stores/projectStore';
import { useContextPackStore } from '../../stores/contextPackStore';
import { ProjectFiles } from '../ProjectFiles';
import { ChangesView } from '../ChangesView';
import { PHASE_ORDER } from '../../constants/pipeline';
import { DashboardTab } from './DashboardTab';
import { WorktreeTab } from './WorktreeTab';
import { ContextTab } from './ContextTab';
import { HistoryTab } from './HistoryTab';

type UpperTab = 'projects' | 'changes';
type LowerTab = 'dashboard' | 'worktree' | 'context' | 'history';

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
        <div className="rp-tabs">
          {upperTabs.map((t) => (
            <button
              key={t.key}
              className={`rp-tab ${upperTab === t.key ? 'active' : ''}`}
              onClick={() => setUpperTab(t.key)}
            >
              {t.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', position: 'relative', alignSelf: 'center' }}>
            <button
              onClick={() => setShowOpenMenu(!showOpenMenu)}
              onBlur={() => setTimeout(() => setShowOpenMenu(false), 150)}
              className="icon-btn-subtle"
              style={{
                background: 'none',
                border: '1px solid #2a3642',
                borderRadius: 5,
                color: '#6b7585',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                fontSize: 10,
                fontFamily: 'inherit',
              }}
            >
              <ExternalLink size={11} strokeWidth={1.5} />
              Open via
            </button>
            {showOpenMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowOpenMenu(false)} />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    background: '#1a1f26',
                    border: '1px solid #2a3642',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    padding: 4,
                    zIndex: 50,
                    width: 180,
                  }}
                >
                  {[
                    {
                      label: 'IntelliJ IDEA',
                      icon: <Braces size={14} color="#5aa5a5" strokeWidth={1.5} />,
                      cmd: `open -a "IntelliJ IDEA" "${cwd}"`,
                    },
                    {
                      label: 'VS Code',
                      icon: <Code2 size={14} color="#5aa5a5" strokeWidth={1.5} />,
                      cmd: `open -a "Visual Studio Code" --args "${cwd}"`,
                    },
                    {
                      label: 'Finder',
                      icon: <FolderOpen size={14} color="#5aa5a5" strokeWidth={1.5} />,
                      cmd: `open "${cwd}"`,
                    },
                    {
                      label: 'Terminal',
                      icon: <TerminalSquare size={14} color="#5aa5a5" strokeWidth={1.5} />,
                      cmd: `open -a Terminal "${cwd}"`,
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        invoke('run_shell_command', { cwd: '/', command: item.cmd }).catch(() => {});
                        setShowOpenMenu(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        borderRadius: 5,
                        color: '#c0c8d4',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(90,165,165,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none';
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {upperTab === 'projects' && <ProjectFiles cwd={cwd} onOpenFile={onOpenFile} />}
          {upperTab === 'changes' && (
            <ChangesView key={resetKey} cwd={cwd} branchName={branchName} onOpenFile={onOpenDiff} />
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div
        style={{ height: 4, cursor: 'row-resize', background: '#2a3642', flexShrink: 0 }}
        onMouseDown={(e) => {
          const startY = e.clientY;
          const panel = e.currentTarget.parentElement;
          if (!panel) return;
          const startHeight = panel.clientHeight;
          const startRatio = splitRatio;
          const onMove = (ev: MouseEvent) => {
            const delta = ev.clientY - startY;
            const newRatio = Math.max(0.15, Math.min(0.85, startRatio + delta / startHeight));
            setSplitRatio(newRatio);
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      />

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
        <div className="rp-tabs">
          {lowerTabs.map((t) => (
            <button
              key={t.key}
              className={`rp-tab ${lowerTab === t.key ? 'active' : ''}`}
              onClick={() => setLowerTab(t.key)}
            >
              {t.label}
              {t.badge && t.badge > 0 && (
                <span className="cp-new" style={{ marginLeft: 4 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="rp-content">
          {lowerTab === 'dashboard' && (
            <DashboardTab
              pipeline={pipeline}
              cwd={cwd}
              onResetClick={() => setShowResetModal(true)}
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
              background: '#131a21',
              border: '1px solid #2a3642',
              borderRadius: 12,
              padding: '24px 28px',
              width: 380,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f4f8', marginBottom: 12 }}>Reset Session</div>
            <div style={{ fontSize: 12, color: '#8b95a5', lineHeight: 1.7, marginBottom: 8 }}>
              The following will be reset:
            </div>
            <ul
              style={{
                fontSize: 12,
                color: '#c0c8d4',
                lineHeight: 2,
                paddingLeft: 8,
                marginBottom: 16,
                listStyle: 'none',
              }}
            >
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />
                Pipeline progress (all phases)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />
                Task timer (back to 00:00)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />
                Claude conversation context (new session)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />
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
                  border: '1px solid #3d4856',
                  color: '#8b95a5',
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
                  // Clear Claude messages and session
                  messageCache.delete(task.id);
                  sessionCache.delete(task.id);
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
