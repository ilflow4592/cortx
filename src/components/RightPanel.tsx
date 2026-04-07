import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from './SourceIcons';
import type { PipelinePhase, PhaseStatus } from '../types/task';

type RTab = 'dashboard' | 'worktree' | 'context' | 'history' | 'memo';

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

function phaseIcon(status: PhaseStatus): string {
  switch (status) {
    case 'done': return '✅';
    case 'in_progress': return '🔄';
    case 'skipped': return '⏭';
    default: return '⬚';
  }
}

function phaseColor(status: PhaseStatus): string {
  switch (status) {
    case 'done': return '#34d399';
    case 'in_progress': return '#818cf8';
    case 'skipped': return '#52525e';
    default: return '#27272a';
  }
}

export function RightPanel() {
  const [tab, setTab] = useState<RTab>('dashboard');
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

  const tabs: { key: RTab; label: string; badge?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', badge: pipeline?.enabled ? phaseDoneCount : undefined },
    { key: 'worktree', label: 'Worktree' },
    { key: 'context', label: 'Context', badge: taskItems.length || undefined },
    { key: 'history', label: 'History', badge: taskHistory.length || undefined },
    { key: 'memo', label: 'Memo' },
  ];

  return (
    <div className="right-panel">
      <div className="rp-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`rp-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge && t.badge > 0 && <span className="cp-new" style={{ marginLeft:4 }}>{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="rp-content">
        {tab === 'dashboard' && (
          <>
            {!pipeline?.enabled ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>⚡</div>
                <div style={{ fontSize: 12, color: '#52525e', marginBottom: 16 }}>No pipeline active</div>
                <div style={{ fontSize: 10, color: '#3f3f46', lineHeight: 1.6 }}>
                  Run <code style={{ background: '#232330', padding: '1px 5px', borderRadius: 3 }}>/pipeline:dev-task</code> to start
                </div>
              </div>
            ) : (
              <>
                {/* Progress stepper */}
                <div className="rp-section">Progress</div>
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16,
                  padding: '10px 12px', background: '#16161e', borderRadius: 8, border: '1px solid #1e1e26',
                }}>
                  {PHASE_ORDER.map((phase, i) => {
                    const entry = pipeline.phases[phase] || { status: 'pending' as PhaseStatus };
                    return (
                      <span key={phase} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 11 }}>{phaseIcon(entry.status)}</span>
                        <span style={{
                          fontSize: 9, color: phaseColor(entry.status),
                          fontWeight: entry.status === 'in_progress' ? 600 : 400,
                        }}>{PHASE_LABELS[phase]}</span>
                        {i < PHASE_ORDER.length - 1 && (
                          <span style={{ color: '#27272a', fontSize: 9, margin: '0 1px' }}>→</span>
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
                        background: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                        border: isActive ? '1px solid rgba(99,102,241,0.15)' : '1px solid transparent',
                      }}>
                        <span style={{ fontSize: 12, width: 18, textAlign: 'center' }}>{phaseIcon(entry.status)}</span>
                        <span style={{
                          fontSize: 11, color: phaseColor(entry.status), flex: 1,
                          fontWeight: isActive ? 600 : 400,
                        }}>{PHASE_LABELS[phase]}</span>
                        {entry.memo && (
                          <span style={{ fontSize: 9, color: '#52525e', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.memo}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

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

        {tab === 'worktree' && (
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

        {tab === 'context' && (
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

        {tab === 'history' && (
          <>
            <div className="rp-section">Search History</div>
            {taskHistory.length === 0 ? (
              <div style={{ fontSize: 11, color: '#3f3f46', padding: '16px 0', textAlign: 'center' }}>No searches yet</div>
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
                      background: '#16161e', border: '1px solid #1e1e26',
                    }}>
                      {/* Time + duration */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: '#52525e' }}>
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, color: '#52525e' }}>{duration}</span>
                      </div>

                      {/* Keywords */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {entry.keywords.map((kw) => (
                          <span key={kw} style={{
                            padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            background: '#232330', color: '#a1a1aa',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>{kw}</span>
                        ))}
                      </div>

                      {/* Resources + Model */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        {entry.resources.map((r) => (
                          <span key={r} style={{
                            fontSize: 9, color: '#6b6b78', textTransform: 'capitalize',
                            padding: '1px 5px', borderRadius: 3, background: '#1e1e26',
                          }}>{r}</span>
                        ))}
                        <span style={{ fontSize: 9, color: '#3f3f46' }}>|</span>
                        <span style={{ fontSize: 9, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>
                          {entry.model.replace('claude-', '').replace(/-\d+$/, '')}
                        </span>
                      </div>

                      {/* Results per source */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {entry.results.map((r) => (
                          <div key={r.type}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                              <span style={{ color: r.error ? '#ef4444' : r.itemCount > 0 ? '#34d399' : '#52525e', width: 10 }}>
                                {r.error ? '✗' : r.itemCount > 0 ? '✓' : '○'}
                              </span>
                              <span style={{ color: '#888895', textTransform: 'capitalize', width: 50 }}>{r.type}</span>
                              <span style={{ color: r.error ? '#ef4444' : '#52525e' }}>
                                {r.error ? 'failed' : `${r.itemCount} items`}
                              </span>
                              {r.tokenUsage && !r.error && (
                                <span style={{ color: '#3f3f46', marginLeft: 'auto' }}>
                                  ~{r.tokenUsage.input + r.tokenUsage.output} tok
                                </span>
                              )}
                            </div>
                            {r.error && (
                              <div
                                onClick={() => navigator.clipboard.writeText(r.error || '')}
                                title="Click to copy"
                                style={{ fontSize: 9, color: '#52525e', marginLeft: 16, marginTop: 2, wordBreak: 'break-all', cursor: 'pointer', userSelect: 'text', WebkitUserSelect: 'text' }}
                              >
                                {r.error.slice(0, 150)} <span style={{ color: '#3f3f46' }}>📋</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Total */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginTop: 6, paddingTop: 6, borderTop: '1px solid #1e1e26',
                        fontSize: 10,
                      }}>
                        <span style={{ color: '#6b6b78' }}>{entry.totalItems} items total</span>
                        {entry.totalTokens > 0 && (
                          <span style={{ color: '#3f3f46' }}>~{entry.totalTokens} tokens</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'memo' && (
          <>
            <div className="rp-section">Context Memo</div>
            <textarea
              className="memo-textarea"
              value={task.memo}
              onChange={(e) => updateTask(task.id, { memo: e.target.value })}
              placeholder="Write notes about what you're working on..."
            />
          </>
        )}
      </div>
    </div>
  );
}
