import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';

type RTab = 'worktree' | 'context' | 'memo';

export function RightPanel() {
  const [tab, setTab] = useState<RTab>('worktree');
  const { tasks, activeTaskId, updateTask } = useTaskStore();
  const { items, deltaItems } = useContextPackStore();
  const task = tasks.find((t) => t.id === activeTaskId);

  if (!task) return <div className="right-panel" />;

  const taskItems = items[task.id] || [];
  const taskDelta = deltaItems[task.id] || [];
  const newCount = taskItems.filter((i) => i.isNew).length;

  const icon = (type: string) => type === 'github' ? '🐙' : type === 'slack' ? '💬' : type === 'notion' ? '📄' : '📌';

  const tabs: { key: RTab; label: string; badge?: number }[] = [
    { key: 'worktree', label: 'Worktree' },
    { key: 'context', label: 'Context', badge: newCount || undefined },
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
            <div className="rp-section">Worktree</div>
            <div className="wt-info">
              <div className="wt-row"><span>Branch</span><span className="val">{task.branchName || '—'}</span></div>
              <div className="wt-row"><span>Path</span><span className="val">{task.worktreePath || '—'}</span></div>
              <div className="wt-row"><span>Repo</span><span className="val">{task.repoPath || '—'}</span></div>
              <div className="wt-row"><span>Status</span><span className="val">{task.status}</span></div>
            </div>
            {task.memo && (
              <>
                <div className="rp-section">Last Memo</div>
                <div className="memo-callout">{task.memo}</div>
              </>
            )}
            <div className="rp-section">Context Pack</div>
            {taskItems.length === 0 ? (
              <div style={{ fontSize:11, color:'#3f3f46', padding:'8px 0' }}>Use the Context Pack tab to collect items</div>
            ) : (
              taskItems.slice(0, 5).map((item) => (
                <div key={item.id} className="cp-item">
                  <div className="cp-icon">{icon(item.sourceType)}</div>
                  <div className="cp-body">
                    <div className="cp-name">{item.title}</div>
                    <div className="cp-sub">{item.summary} {item.isNew && <span className="cp-new">NEW</span>}</div>
                  </div>
                </div>
              ))
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
