import { useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, Loader2, SkipForward, Circle, Download, RotateCcw, ExternalLink, Braces, Code2, FolderOpen, TerminalSquare } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from './SourceIcons';
import { ProjectFiles } from './ProjectFiles';
import { ChangesView } from './ChangesView';
import type { PipelinePhase, PhaseStatus } from '../types/task';

type UpperTab = 'projects' | 'changes';
type LowerTab = 'dashboard' | 'worktree' | 'context' | 'history';

const PHASE_LABELS: Record<PipelinePhase, string> = {
  grill_me: 'Grill-me',
  obsidian_save: 'Save',
  dev_plan: 'Dev Plan',
  implement: 'Implement',
  commit_pr: 'PR',
  review_loop: 'Review',
  done: 'Done',
};

const PHASE_ORDER: PipelinePhase[] = ['grill_me', 'obsidian_save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done'];

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function phaseIcon(status: PhaseStatus): ReactNode {
  switch (status) {
    case 'done': return <CheckCircle2 size={14} color="#34d399" strokeWidth={2} />;
    case 'in_progress': return <Loader2 size={14} color="#5aa5a5" strokeWidth={2} className="spin" />;
    case 'skipped': return <SkipForward size={14} color="#4d5868" strokeWidth={1.5} />;
    default: return <Circle size={14} color="#3d4856" strokeWidth={1.5} />;
  }
}

function phaseColor(status: PhaseStatus): string {
  switch (status) {
    case 'done': return '#34d399';
    case 'in_progress': return '#7dbdbd';
    case 'skipped': return '#4d5868';
    default: return '#2a3642';
  }
}

export function RightPanel({ cwd, branchName, onOpenFile, onOpenDiff, resetKey, onResetSession }: { cwd: string; branchName: string; onOpenFile?: (path: string) => void; onOpenDiff?: (path: string) => void; resetKey?: number; onResetSession?: () => void }) {
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
  const taskItemsRaw = useContextPackStore((s) => task ? s.items[task.id] : undefined);
  const taskDeltaRaw = useContextPackStore((s) => task ? s.deltaItems[task.id] : undefined);
  const taskHistory = useContextPackStore((s) => task ? s.collectHistory[task.id] : undefined) || [];

  if (!task) return <div className="right-panel" />;

  const taskProject = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const sourceOrder: Record<string, number> = { github: 0, notion: 1, slack: 2, pin: 3 };
  const taskItems = [...(taskItemsRaw || [])].sort((a, b) => (sourceOrder[a.sourceType] ?? 9) - (sourceOrder[b.sourceType] ?? 9));
  const taskDelta = taskDeltaRaw || [];
  const pipeline = task.pipeline;
  const phaseDoneCount = pipeline ? PHASE_ORDER.filter((p) => pipeline.phases[p]?.status === 'done').length : 0;

  const icon = (type: string) => type === 'github' ? <GitHubIcon size={14} color="#a1a1aa" /> : type === 'slack' ? <SlackIcon size={14} /> : type === 'notion' ? <NotionIcon size={14} color="#a1a1aa" /> : <PinIcon size={14} />;

  const upperTabs: { key: UpperTab; label: string }[] = [
    { key: 'projects', label: 'Projects' },
    { key: 'changes', label: 'Changes' },
  ];
  const lowerTabs: { key: LowerTab; label: string; badge?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', badge: pipeline?.enabled && phaseDoneCount > 0 ? phaseDoneCount : undefined },
    { key: 'worktree', label: 'Worktree' },
    { key: 'context', label: 'Context', badge: taskItems.length || undefined },
    { key: 'history', label: 'History', badge: taskHistory.length || undefined },
  ];

  return (
    <div className="right-panel">
      {/* Upper section: Projects / Changes */}
      <div style={{ height: `calc(${splitRatio * 100}% - 2px)`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div className="rp-tabs">
          {upperTabs.map((t) => (
            <button key={t.key} className={`rp-tab ${upperTab === t.key ? 'active' : ''}`} onClick={() => setUpperTab(t.key)}>
              {t.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', position: 'relative', alignSelf: 'center' }}>
            <button
              onClick={() => setShowOpenMenu(!showOpenMenu)}
              onBlur={() => setTimeout(() => setShowOpenMenu(false), 150)}
              style={{ background: 'none', border: '1px solid #2a3642', borderRadius: 5, color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 10, fontFamily: 'inherit' }}
            >
              <ExternalLink size={11} strokeWidth={1.5} />
              Open via
            </button>
            {showOpenMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowOpenMenu(false)} />
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4,
                  background: '#1a1f26', border: '1px solid #2a3642', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 4, zIndex: 50,
                  width: 180,
                }}>
                {[
                  { label: 'IntelliJ IDEA', icon: <Braces size={14} color="#5aa5a5" strokeWidth={1.5} />, cmd: `open -a "IntelliJ IDEA" "${cwd}"` },
                  { label: 'VS Code', icon: <Code2 size={14} color="#5aa5a5" strokeWidth={1.5} />, cmd: `open -a "Visual Studio Code" --args "${cwd}"` },
                  { label: 'Finder', icon: <FolderOpen size={14} color="#5aa5a5" strokeWidth={1.5} />, cmd: `open "${cwd}"` },
                  { label: 'Terminal', icon: <TerminalSquare size={14} color="#5aa5a5" strokeWidth={1.5} />, cmd: `open -a Terminal "${cwd}"` },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      invoke('run_shell_command', { cwd: '/', command: item.cmd }).catch(() => {});
                      setShowOpenMenu(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', background: 'none', border: 'none', borderRadius: 5,
                      color: '#c0c8d4', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(90,165,165,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
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
          {upperTab === 'changes' && <ChangesView key={resetKey} cwd={cwd} branchName={branchName} onOpenFile={onOpenDiff} />}
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
          const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      />

      {/* Lower section: Dashboard / Worktree / Context / History */}
      <div style={{ height: `calc(${(1 - splitRatio) * 100}% - 2px)`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div className="rp-tabs">
          {lowerTabs.map((t) => (
            <button key={t.key} className={`rp-tab ${lowerTab === t.key ? 'active' : ''}`} onClick={() => setLowerTab(t.key)}>
              {t.label}
              {t.badge && t.badge > 0 && <span className="cp-new" style={{ marginLeft:4 }}>{t.badge}</span>}
            </button>
          ))}
        </div>
        <div className="rp-content">
        {lowerTab === 'dashboard' && (
          <>
            {!pipeline?.enabled ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>⚡</div>
                <div style={{ fontSize: 12, color: '#4d5868', marginBottom: 16 }}>No pipeline active</div>
                <div style={{ fontSize: 10, color: '#3d4856', lineHeight: 1.6 }}>
                  Run <code style={{ background: '#242d38', padding: '1px 5px', borderRadius: 3 }}>/pipeline:dev-task</code> to start
                </div>
              </div>
            ) : (
              <>
                {/* Progress stepper */}
                <div className="rp-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Progress</span>
                  <button
                    onClick={() => setShowResetModal(true)}
                    title="Reset session"
                    style={{ background: 'none', border: 'none', color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}
                  >
                    <RotateCcw size={10} strokeWidth={1.5} /> Reset
                  </button>
                </div>
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16,
                  padding: '10px 12px', background: '#1a1f26', borderRadius: 8, border: '1px solid #1e2530',
                }}>
                  {PHASE_ORDER.map((phase, i) => {
                    const entry = pipeline.phases[phase] || { status: 'pending' as PhaseStatus };
                    return (
                      <span key={phase} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>{phaseIcon(entry.status)}</span>
                        <span style={{
                          fontSize: 9, color: phaseColor(entry.status),
                          fontWeight: entry.status === 'in_progress' ? 600 : 400,
                        }}>{PHASE_LABELS[phase]}</span>
                        {i < PHASE_ORDER.length - 1 && (
                          <span style={{ color: '#2a3642', fontSize: 9, margin: '0 1px' }}>→</span>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Detail table */}
                <div className="rp-section">Phases</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PHASE_ORDER.map((phase) => {
                    const entry = pipeline.phases[phase] || { status: 'pending' as PhaseStatus };
                    const isActive = entry.status === 'in_progress';
                    return (
                      <div key={phase} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6,
                        background: isActive ? 'rgba(90,165,165,0.06)' : 'transparent',
                        border: isActive ? '1px solid rgba(90,165,165,0.15)' : '1px solid transparent',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', width: 18, justifyContent: 'center' }}>{phaseIcon(entry.status)}</span>
                        <span style={{
                          fontSize: 11, color: phaseColor(entry.status), flex: 1,
                          fontWeight: isActive ? 600 : 400,
                        }}>{PHASE_LABELS[phase]}</span>
                        {entry.memo && (
                          <span style={{ fontSize: 9, color: '#4d5868', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.memo}
                          </span>
                        )}
                        {phase === 'dev_plan' && pipeline.devPlan && (
                          <button
                            onClick={async () => {
                              const fileName = `dev-plan-${task.branchName || 'task'}.md`;
                              const filePath = `~/Downloads/${fileName}`;
                              const b64 = btoa(unescape(encodeURIComponent(pipeline.devPlan!)));
                              await invoke('run_shell_command', {
                                cwd: '/',
                                command: `echo '${b64}' | base64 -d > ${filePath} && open -R ${filePath}`,
                              }).catch(() => {});
                            }}
                            title="Download dev-plan.md"
                            style={{ background: 'none', border: 'none', color: '#5aa5a5', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                          >
                            <Download size={12} strokeWidth={1.5} />
                          </button>
                        )}
                        {(entry.inputTokens || entry.outputTokens) && (
                          <span style={{ fontSize: 9, color: '#4d5868', whiteSpace: 'nowrap', fontFamily: "'Fira Code', monospace" }}>
                            {formatTokens((entry.inputTokens || 0) + (entry.outputTokens || 0))}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Total tokens */}
                {(() => {
                  const totalIn = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.inputTokens || 0), 0);
                  const totalOut = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.outputTokens || 0), 0);
                  const totalCost = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.costUsd || 0), 0);
                  if (totalIn + totalOut === 0) return null;
                  return (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px', marginTop: 8, borderTop: '1px solid #2a3642',
                      fontSize: 10, color: '#6b7585', fontFamily: "'Fira Code', monospace",
                    }}>
                      <span>Total: {formatTokens(totalIn)} in / {formatTokens(totalOut)} out</span>
                      {totalCost > 0 && <span>${totalCost.toFixed(4)}</span>}
                    </div>
                  );
                })()}


                {/* Metadata */}
                {(pipeline.complexity || pipeline.prUrl || pipeline.reviewRounds !== undefined) && (
                  <>
                    <div className="rp-section" style={{ marginTop: 14 }}>Info</div>
                    <div className="wt-info">
                      {pipeline.complexity && (
                        <div className="wt-row"><span>Complexity</span><span className="val">{pipeline.complexity}</span></div>
                      )}
                      {pipeline.prNumber && (
                        <div className="wt-row"><span>PR</span><span className="val">#{pipeline.prNumber}</span></div>
                      )}
                      {pipeline.reviewRounds !== undefined && (
                        <div className="wt-row"><span>Review rounds</span><span className="val">{pipeline.reviewRounds}</span></div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {lowerTab === 'worktree' && (
          <>
            {taskProject && (
              <>
                <div className="rp-section">Project</div>
                <div className="wt-info">
                  <div className="wt-row">
                    <span>Name</span>
                    <span className="val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: taskProject.color }} />
                      {taskProject.name}
                    </span>
                  </div>
                  {taskProject.githubOwner && taskProject.githubRepo && (
                    <div className="wt-row"><span>GitHub</span><span className="val">{taskProject.githubOwner}/{taskProject.githubRepo}</span></div>
                  )}
                  <div className="wt-row"><span>Path</span><span className="val">{taskProject.localPath || '—'}</span></div>
                </div>
              </>
            )}
            <div className="rp-section">Worktree</div>
            <div className="wt-info">
              <div className="wt-row"><span>Branch</span><span className="val">{task.branchName || '—'}</span></div>
              <div className="wt-row"><span>Path</span><span className="val">{task.worktreePath || task.repoPath || taskProject?.localPath || '—'}</span></div>
              <div className="wt-row"><span>Repo</span><span className="val">{task.repoPath || taskProject?.localPath || '—'}</span></div>
              <div className="wt-row"><span>Status</span><span className="val">{task.status}</span></div>
              <div className="wt-row"><span>Layer</span><span className="val">{task.layer || 'focus'}</span></div>
            </div>
            {task.memo && (
              <>
                <div className="rp-section">Last Memo</div>
                <div className="memo-callout">{task.memo}</div>
              </>
            )}
          </>
        )}

        {lowerTab === 'context' && (
          <>
            {taskDelta.length > 0 && (
              <>
                <div className="rp-section">⚡ Updates Since Pause</div>
                {taskDelta.slice(0, 5).map((item) => (
                  <div key={item.id} className="cp-item">
                    <div className="cp-icon">{icon(item.sourceType)}</div>
                    <div className="cp-body">
                      <div className="cp-name" style={{ color:'#eab308' }}>{item.title}</div>
                      <div className="cp-sub">{item.summary}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="rp-section">All Items ({taskItems.length})</div>
            {taskItems.map((item) => (
              <div key={item.id} className="cp-item">
                <div className="cp-icon">{icon(item.sourceType)}</div>
                <div className="cp-body">
                  <div className="cp-name">{item.title}</div>
                  <div className="cp-sub">{item.summary} {item.isNew && <span className="cp-new">NEW</span>}</div>
                </div>
              </div>
            ))}
          </>
        )}

        {lowerTab === 'history' && (
          <>
            <div className="rp-section">Search History</div>
            {taskHistory.length === 0 ? (
              <div style={{ fontSize: 11, color: '#3d4856', padding: '16px 0', textAlign: 'center' }}>No searches yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...taskHistory].reverse().map((entry) => {
                  const totalSec = Math.floor(entry.durationMs / 1000);
                  const h = Math.floor(totalSec / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  const s = totalSec % 60;
                  const duration = h > 0
                    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                    : `${m}:${String(s).padStart(2,'0')}`;
                  return (
                    <div key={entry.id} style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: '#1a1f26', border: '1px solid #1e2530',
                    }}>
                      {/* Time + duration */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: '#4d5868' }}>
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, color: '#4d5868' }}>{duration}</span>
                      </div>

                      {/* Keywords */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {entry.keywords.map((kw) => (
                          <span key={kw} style={{
                            padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            background: '#242d38', color: '#a1a1aa',
                            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                          }}>{kw}</span>
                        ))}
                      </div>

                      {/* Resources + Model */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        {entry.resources.map((r) => (
                          <span key={r} style={{
                            fontSize: 9, color: '#6b6b78', textTransform: 'capitalize',
                            padding: '1px 5px', borderRadius: 3, background: '#1e2530',
                          }}>{r}</span>
                        ))}
                        <span style={{ fontSize: 9, color: '#3d4856' }}>|</span>
                        <span style={{ fontSize: 9, color: '#7dbdbd', fontFamily: "'Fira Code', 'JetBrains Mono', monospace" }}>
                          {entry.model.replace('claude-', '').replace(/-\d+$/, '')}
                        </span>
                      </div>

                      {/* Results per source */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {entry.results.map((r) => (
                          <div key={r.type}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                              <span style={{ color: r.error ? '#ef4444' : r.itemCount > 0 ? '#34d399' : '#4d5868', width: 10 }}>
                                {r.error ? '✗' : r.itemCount > 0 ? '✓' : '○'}
                              </span>
                              <span style={{ color: '#888895', textTransform: 'capitalize', width: 50 }}>{r.type}</span>
                              <span style={{ color: r.error ? '#ef4444' : '#4d5868' }}>
                                {r.error ? 'failed' : `${r.itemCount} items`}
                              </span>
                              {r.tokenUsage && !r.error && (
                                <span style={{ color: '#3d4856', marginLeft: 'auto' }}>
                                  ~{r.tokenUsage.input + r.tokenUsage.output} tok
                                </span>
                              )}
                            </div>
                            {r.error && (
                              <div
                                onClick={() => navigator.clipboard.writeText(r.error || '')}
                                title="Click to copy"
                                style={{ fontSize: 9, color: '#4d5868', marginLeft: 16, marginTop: 2, wordBreak: 'break-all', cursor: 'pointer', userSelect: 'text', WebkitUserSelect: 'text' }}
                              >
                                {r.error.slice(0, 150)} <span style={{ color: '#3d4856' }}>📋</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Total */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginTop: 6, paddingTop: 6, borderTop: '1px solid #1e2530',
                        fontSize: 10,
                      }}>
                        <span style={{ color: '#6b6b78' }}>{entry.totalItems} items total</span>
                        {entry.totalTokens > 0 && (
                          <span style={{ color: '#3d4856' }}>~{entry.totalTokens} tokens</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
      </div>

      {/* Reset session modal */}
      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setShowResetModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#131a21', border: '1px solid #2a3642', borderRadius: 12,
              padding: '24px 28px', width: 380, boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f4f8', marginBottom: 12 }}>
              Reset Session
            </div>
            <div style={{ fontSize: 12, color: '#8b95a5', lineHeight: 1.7, marginBottom: 8 }}>
              The following will be reset:
            </div>
            <ul style={{ fontSize: 12, color: '#c0c8d4', lineHeight: 2, paddingLeft: 8, marginBottom: 16, listStyle: 'none' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />Pipeline progress (all phases)</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />Task timer (back to 00:00)</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />Claude conversation context (new session)</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5aa5a5', flexShrink: 0 }} />Task status (back to Waiting)</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />Git changes (discard all uncommitted changes)</li>
            </ul>
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 20 }}>
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  padding: '7px 16px', borderRadius: 6, fontSize: 12,
                  background: 'none', border: '1px solid #3d4856',
                  color: '#8b95a5', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Cancel</button>
              <button
                onClick={async () => {
                  // Discard git changes
                  if (cwd) {
                    await invoke('run_shell_command', { cwd, command: 'git checkout -- . 2>/dev/null' }).catch(() => {});
                    await invoke('run_shell_command', { cwd, command: 'git clean -fd 2>/dev/null' }).catch(() => {});
                    await invoke('run_shell_command', { cwd, command: 'git reset origin/develop 2>/dev/null || git reset HEAD~1 2>/dev/null' }).catch(() => {});
                    await invoke('run_shell_command', { cwd, command: 'git checkout -- . 2>/dev/null' }).catch(() => {});
                  }
                  // Reset pipeline, timer, status
                  updateTask(task.id, {
                    pipeline: undefined,
                    elapsedSeconds: 0,
                    interrupts: [],
                  });
                  useTaskStore.getState().setTaskStatus(task.id, 'waiting');
                  onResetSession?.();
                  setShowResetModal(false);
                }}
                style={{
                  padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Reset Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
