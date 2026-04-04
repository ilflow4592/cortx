import { useState } from 'react';
import { useContextPackStore } from '../stores/contextPackStore';
import { useTaskStore } from '../stores/taskStore';
import { invoke } from '@tauri-apps/api/core';
import type { ContextItem } from '../types/contextPack';

export function ContextPack({ taskId }: { taskId: string }) {
  const { items, keywords, deltaItems, isCollecting, lastCollectedAt, setKeywords, addPin, removeItem, collectAll } = useContextPackStore();
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const [showPin, setShowPin] = useState(false);
  const [pinUrl, setPinUrl] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  const [kwInput, setKwInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'pinned' | 'linked' | 'auto'>('all');
  const [preview, setPreview] = useState<{ url: string; title: string; description: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const taskItems = items[taskId] || [];
  const taskDelta = deltaItems[taskId] || [];
  const taskKw = keywords[taskId] || [];
  const lastCol = lastCollectedAt[taskId];
  const filtered = filter === 'all' ? taskItems : taskItems.filter((i) => i.category === filter);
  const newCount = taskItems.filter((i) => i.isNew).length;

  const handleAddKw = () => { const k = kwInput.trim(); if (k && !taskKw.includes(k)) { setKeywords(taskId, [...taskKw, k]); setKwInput(''); } };
  const handlePin = () => { if (!pinTitle.trim()) return; addPin(taskId, { id: `pin-${Date.now().toString(36)}`, sourceType: 'pin', title: pinTitle.trim(), url: pinUrl.trim(), summary: 'Pinned', timestamp: new Date().toISOString(), isNew: false, category: 'pinned' } as ContextItem); setPinUrl(''); setPinTitle(''); setShowPin(false); };
  const icon = (t: string) => t === 'github' ? '🐙' : t === 'slack' ? '💬' : t === 'notion' ? '📄' : '📌';

  const handlePreview = async (url: string) => {
    if (!url || loadingPreview) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const result = await invoke<{ url: string; title: string; description: string; success: boolean }>('fetch_link_preview', { url });
      if (result.success) {
        setPreview({ url: result.url, title: result.title, description: result.description });
      }
    } catch { /* ignore */ }
    setLoadingPreview(false);
  };

  return (
    <div className="ctx-pack">
      <div className="ctx-header">
        {taskDelta.length > 0 && (
          <div className="ctx-delta-banner">
            <span style={{ fontWeight:600 }}>⚡ {taskDelta.length} updates</span>
            <span style={{ opacity:0.6 }}>since you paused</span>
          </div>
        )}

        <div className="ctx-section-title">Search Keywords</div>
        {taskKw.length > 0 && (
          <div className="ctx-keywords">
            {taskKw.map((kw) => (
              <span key={kw} className="ctx-kw">
                {kw}
                <button onClick={() => setKeywords(taskId, taskKw.filter((k) => k !== kw))}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="ctx-kw-input">
          <input value={kwInput} onChange={(e) => setKwInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddKw()} placeholder="Add keyword..." />
          <button onClick={handleAddKw}>+</button>
        </div>

        <div className="ctx-actions">
          <button className="ctx-btn ctx-btn-collect" disabled={isCollecting} onClick={() => collectAll(taskId, task?.branchName || '')}>
            {isCollecting ? '⏳ Collecting...' : '🔄 Collect Now'}
          </button>
          <button className="ctx-btn ctx-btn-pin" onClick={() => setShowPin(!showPin)}>📌 Pin</button>
        </div>

        {showPin && (
          <div className="ctx-pin-form">
            <input value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} placeholder="Title" />
            <input value={pinUrl} onChange={(e) => setPinUrl(e.target.value)} placeholder="URL (optional)" style={{ fontFamily:'JetBrains Mono, monospace', fontSize:11 }} />
            <div className="ctx-pin-actions">
              <button style={{ background:'none', color:'#71717a' }} onClick={() => setShowPin(false)}>Cancel</button>
              <button style={{ background:'#6366f1', color:'#fff' }} onClick={handlePin}>Pin</button>
            </div>
          </div>
        )}

        {lastCol && <div className="ctx-collected-at">Last collected: {new Date(lastCol).toLocaleTimeString()}</div>}
      </div>

      <div className="ctx-filters">
        {(['all', 'pinned', 'linked', 'auto'] as const).map((f) => {
          const c = f === 'all' ? taskItems.length : taskItems.filter((i) => i.category === f).length;
          return (
            <button key={f} className={`ctx-filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'pinned' ? '📌 Pinned' : f === 'linked' ? '🔗 Linked' : '🤖 Auto'}
              {c > 0 && <span className="count">{c}</span>}
            </button>
          );
        })}
        {newCount > 0 && <span className="ctx-new-count">{newCount} NEW</span>}
      </div>

      {/* Link preview panel */}
      {(preview || loadingPreview) && (
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #141418', background:'#08080c', flexShrink:0 }}>
          {loadingPreview ? (
            <div style={{ fontSize:11, color:'#52525b', display:'flex', alignItems:'center', gap:6 }}>
              <div className="loading-dot" /> Loading preview...
            </div>
          ) : preview && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#d4d4d8' }}>{preview.title || 'No title'}</div>
                <button onClick={() => setPreview(null)} style={{ background:'none', border:'none', color:'#3f3f46', cursor:'pointer', fontSize:14 }}>×</button>
              </div>
              {preview.description && (
                <div style={{ fontSize:11, color:'#71717a', lineHeight:1.5, marginBottom:6 }}>{preview.description.slice(0, 200)}</div>
              )}
              <a href={preview.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'#818cf8', fontFamily:"'JetBrains Mono', monospace", wordBreak:'break-all' }}>
                {preview.url}
              </a>
            </div>
          )}
        </div>
      )}

      <div className="ctx-items">
        {filtered.length === 0 ? (
          <div className="ctx-empty">
            {taskKw.length === 0 ? 'Add keywords to start collecting context' : isCollecting ? 'Collecting...' : 'No items found. Try collecting or adding pins.'}
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="cp-item" style={{ position:'relative' }}>
              <div className="cp-icon">{icon(item.sourceType)}</div>
              <div className="cp-body">
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {item.url ? (
                    <span className="cp-name" style={{ cursor:'pointer', textDecoration:'underline', textDecorationColor:'#27272a' }} onClick={() => handlePreview(item.url)}>{item.title}</span>
                  ) : (
                    <span className="cp-name">{item.title}</span>
                  )}
                  {item.isNew && <span className="cp-new">NEW</span>}
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'#3f3f46', flexShrink:0 }} title="Open in browser">↗</a>
                  )}
                </div>
                <div className="cp-sub">{item.summary}</div>
              </div>
              <button onClick={() => removeItem(taskId, item.id)} style={{ background:'none', border:'none', color:'#27272a', cursor:'pointer', fontSize:12, position:'absolute', right:0, top:8 }}>×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
