import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from './SourceIcons';
import { formatTime } from '../utils/time';

type RTab = 'worktree' | 'context' | 'history' | 'log' | 'memo';

const reasonLabel: Record<string, string> = {
  interrupt: '🔔 Interrupted',
  'other-task': '🔄 Task switch',
  break: '☕ Break',
  meeting: '📅 Meeting',
  other: '💭 Other',
};

export function RightPanel() {
  const [tab, setTab] = useState<RTab>('worktree');
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
  const newCount = taskItems.filter((i) => i.isNew).length;
  const interrupts = task.interrupts || [];
  const totalInterruptTime = interrupts.reduce((s, e) => s + e.durationSeconds, 0);

  const icon = (type: string) => type === 'github' ? <GitHubIcon size={14} color="#a1a1aa" /> : type === 'slack' ? <SlackIcon size={14} /> : type === 'notion' ? <NotionIcon size={14} color="#a1a1aa" /> : <PinIcon size={14} />;

  const tabs: { key: RTab; label: string; badge?: number }[] = [
    { key: 'worktree', label: 'Worktree' },
    { key: 'context', label: 'Context', badge: newCount || undefined },
    { key: 'history', label: 'History', badge: taskHistory.length || undefined },
    { key: 'log', label: 'Log', badge: interrupts.length || undefined },
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
            <div className="rp-section">Context Pack ({taskItems.length})</div>
            {taskItems.length === 0 ? (
              <div style={{ fontSize:11, color:'#3f3f46', padding:'8px 0' }}>Use the Context Pack tab to collect items</div>
            ) : (
              <>
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
                  const duration = entry.durationMs < 1000
                    ? `${entry.durationMs}ms`
                    : `${(entry.durationMs / 1000).toFixed(1)}s`;
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

        {tab === 'log' && (
          <>
            <div className="rp-section">Interrupt Log</div>
            {interrupts.length > 0 && (
              <div className="wt-info" style={{ marginBottom:14 }}>
                <div className="wt-row"><span>Total interrupts</span><span className="val">{interrupts.length}</span></div>
                <div className="wt-row"><span>Time lost</span><span className="val" style={{ color:'#eab308' }}>{formatTime(totalInterruptTime)}</span></div>
              </div>
            )}
            {interrupts.length === 0 ? (
              <div style={{ fontSize:11, color:'#3f3f46', padding:'16px 0', textAlign:'center' }}>No interrupts recorded yet</div>
            ) : (
              <div style={{ position:'relative', paddingLeft:16 }}>
                {/* Timeline line */}
                <div style={{ position:'absolute', left:5, top:0, bottom:0, width:1, background:'#18181b' }} />
                {[...interrupts].reverse().map((entry) => (
                  <div key={entry.id} style={{ position:'relative', paddingBottom:16, paddingLeft:16 }}>
                    {/* Dot */}
                    <div style={{
                      position:'absolute', left:-4, top:4, width:8, height:8, borderRadius:'50%',
                      background: entry.resumedAt ? '#eab308' : '#ef4444',
                      boxShadow: entry.resumedAt ? 'none' : '0 0 6px rgba(239,68,68,0.4)',
                    }} />
                    <div style={{ fontSize:11, color:'#71717a', marginBottom:2 }}>
                      {reasonLabel[entry.reason] || entry.reason}
                    </div>
                    {entry.memo && (
                      <div style={{ fontSize:12, color:'#a1a1aa', marginBottom:2 }}>"{entry.memo}"</div>
                    )}
                    <div style={{ fontSize:10, color:'#3f3f46', display:'flex', gap:8 }}>
                      <span>{new Date(entry.pausedAt).toLocaleTimeString()}</span>
                      {entry.resumedAt && (
                        <>
                          <span>→</span>
                          <span>{new Date(entry.resumedAt).toLocaleTimeString()}</span>
                          <span style={{ color:'#eab308' }}>{formatTime(entry.durationSeconds)}</span>
                        </>
                      )}
                      {!entry.resumedAt && <span style={{ color:'#ef4444' }}>Still paused</span>}
                    </div>
                  </div>
                ))}
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
