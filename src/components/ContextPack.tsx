import { useState, useEffect } from 'react';
import { useContextPackStore } from '../stores/contextPackStore';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { invoke } from '@tauri-apps/api/core';
import type { ContextItem } from '../types/contextPack';
import { GitHubIcon, SlackIcon, NotionIcon, McpIcon, PinIcon } from './SourceIcons';

export function ContextPack({ taskId }: { taskId: string }) {
  const isCollecting = useContextPackStore((s) => s.isCollecting);
  const sources = useContextPackStore((s) => s.sources);
  const taskItemsRaw = useContextPackStore((s) => s.items[taskId]);
  const taskDeltaRaw = useContextPackStore((s) => s.deltaItems[taskId]);
  const lastCollectedAt = useContextPackStore((s) => s.lastCollectedAt[taskId]);
  const taskItems = taskItemsRaw || [];
  const taskDelta = taskDeltaRaw || [];
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const projects = useProjectStore((s) => s.projects);
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const [showPin, setShowPin] = useState(false);
  const [pinUrl, setPinUrl] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  const [preview, setPreview] = useState<{ url: string; title: string; description: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Tauri native file drop handler
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let lastDropTime = 0;

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    getCurrentWindow().onDragDropEvent((event) => {
      const payload = event.payload as { type: string; paths?: string[] };
      if (payload.type === 'enter' || payload.type === 'over') {
        setIsDragging(true);
      } else if (payload.type === 'drop') {
        setIsDragging(false);

        // Debounce: ignore duplicate drop events within 500ms
        const now = Date.now();
        if (now - lastDropTime < 500) return;
        lastDropTime = now;

        const paths = payload.paths || [];
        const store = useContextPackStore.getState();
        const existing = store.items[taskId] || [];
        for (const filePath of paths) {
          if (existing.some((item) => item.url === filePath)) continue;
          const fileName = filePath.split('/').pop() || filePath;
          store.addPin(taskId, {
            id: `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            sourceType: 'pin',
            title: fileName,
            url: filePath,
            summary: `File · ${filePath}`,
            timestamp: new Date().toISOString(),
            isNew: false,
            category: 'pinned',
          } as ContextItem);
        }
      } else {
        setIsDragging(false);
      }
    }).then((fn) => { unlisten = fn; });
    }).catch(() => {}); // Not in Tauri context

    return () => { unlisten?.(); };
  }, [taskId]);

  const filtered = taskItems;
  const newCount = taskItems.filter((i) => i.isNew).length;
  const [mcpServers, setMcpServers] = useState<{ name: string; command: string }[]>([]);
  const [vectorStatus, setVectorStatus] = useState<{ ollama: boolean; qdrant: boolean }>({ ollama: false, qdrant: false });
  const [relatedItems, setRelatedItems] = useState<{ id: string; taskId: string; sourceType: string; title: string; content: string; url: string; timestamp: string }[]>([]);
  const [searchingRelated, setSearchingRelated] = useState(false);

  useEffect(() => {
    invoke<{ name: string; command: string; args: string[] }[]>('list_mcp_servers')
      .then((servers) => setMcpServers(servers))
      .catch(() => {});
    import('../services/vectorSearch').then((vs) => vs.checkVectorServices().then(setVectorStatus)).catch(() => {});
  }, []);

  // Search for related context from other tasks
  const handleSearchRelated = async () => {
    if (!task?.title) return;
    setSearchingRelated(true);
    try {
      const vs = await import('../services/vectorSearch');
      const results = await vs.searchGlobalContext(task.title, 5);
      setRelatedItems(results.filter((r) => r.taskId !== taskId));
    } catch { /* vector search unavailable */ }
    setSearchingRelated(false);
  };

  const icon = (t: string) => t === 'github' ? <GitHubIcon size={14} color="#a1a1aa" /> : t === 'slack' ? <SlackIcon size={14} /> : t === 'notion' ? <NotionIcon size={14} color="#a1a1aa" /> : <PinIcon size={14} />;

  const handleCollect = () => {
    const autoKeywords = [task?.title, task?.branchName].filter(Boolean) as string[];
    useContextPackStore.getState().setKeywords(taskId, autoKeywords);
    useContextPackStore.getState().collectAll(taskId, task?.branchName || '', project?.slackChannels, task?.title);
  };

  const handlePin = () => {
    if (!pinTitle.trim()) return;
    useContextPackStore.getState().addPin(taskId, { id: `pin-${Date.now().toString(36)}`, sourceType: 'pin', title: pinTitle.trim(), url: pinUrl.trim(), summary: 'Pinned', timestamp: new Date().toISOString(), isNew: false, category: 'pinned' } as ContextItem);
    setPinUrl(''); setPinTitle(''); setShowPin(false);
  };

  const handlePreview = async (url: string) => {
    if (!url || loadingPreview) return;
    setLoadingPreview(true); setPreview(null);
    try {
      const result = await invoke<{ url: string; title: string; description: string; success: boolean }>('fetch_link_preview', { url });
      if (result.success) setPreview({ url: result.url, title: result.title, description: result.description });
    } catch { /* ignore */ }
    setLoadingPreview(false);
  };

  const lastCol = lastCollectedAt;

  return (
    <div className="ctx-pack" style={{ position: 'relative' }}>
      {/* Drop overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(99,102,241,0.08)', border: '2px dashed #6366f1',
          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', color: '#818cf8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files or URLs here</div>
            <div style={{ fontSize: 11, color: '#6b6b78', marginTop: 4 }}>They'll be pinned to this task's context</div>
          </div>
        </div>
      )}
      <div className="ctx-header">
        {/* Delta banner */}
        {taskDelta.length > 0 && (
          <div className="ctx-delta-banner">
            <span style={{ fontWeight: 600 }}>⚡ {taskDelta.length} updates</span>
            <span style={{ opacity: 0.6 }}>since you paused</span>
          </div>
        )}

        {/* Source info */}
        {project && (
          <div style={{ fontSize: 11, color: '#6b6b78', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: project.color }} />
            {project.githubOwner && project.githubRepo
              ? <span>{project.githubOwner}/{project.githubRepo}</span>
              : <span>{project.name}</span>
            }
          </div>
        )}

        {/* MCP Servers */}
        {mcpServers.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#52525e', marginBottom: 6 }}>MCP Servers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {mcpServers.map((server) => (
                <span key={server.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
                  fontSize: 11, color: '#34d399',
                }}>
                  <McpIcon size={12} />
                  {server.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Vector DB status */}
        {(vectorStatus.ollama || vectorStatus.qdrant) && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 4, fontSize: 10,
              background: vectorStatus.ollama && vectorStatus.qdrant ? 'rgba(52,211,153,0.06)' : 'rgba(234,179,8,0.06)',
              color: vectorStatus.ollama && vectorStatus.qdrant ? '#34d399' : '#eab308',
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
              Semantic search {vectorStatus.ollama && vectorStatus.qdrant ? 'active' : 'partial'}
            </span>
            <button
              onClick={handleSearchRelated}
              disabled={searchingRelated || !(vectorStatus.ollama && vectorStatus.qdrant)}
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 10,
                background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)',
                color: '#818cf8', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {searchingRelated ? '...' : '🔍 Find related'}
            </button>
          </div>
        )}

        {/* Related items from other tasks */}
        {relatedItems.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#52525e', marginBottom: 6 }}>Related from other tasks</div>
            {relatedItems.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: 12 }}>
                <span style={{ fontSize: 11, marginTop: 2 }}>
                  {item.sourceType === 'github' ? <GitHubIcon size={12} color="#888895" /> : item.sourceType === 'slack' ? <SlackIcon size={12} /> : <NotionIcon size={12} color="#888895" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: '#52525e', marginTop: 1 }}>{item.content?.slice(0, 80)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Connected Sources */}
        {sources.filter(s => s.enabled && s.token).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#52525e', marginBottom: 6 }}>Connected Sources</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sources.filter(s => s.enabled && s.token).map((source, i) => {
                const sourceIcon = source.type === 'github' ? <GitHubIcon size={12} color="#818cf8" /> : source.type === 'slack' ? <SlackIcon size={12} /> : <NotionIcon size={12} color="#818cf8" />;
                const name = source.type === 'github' ? `${source.owner}/${source.repo}` : source.type === 'slack' ? 'Slack' : 'Notion';
                return (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)',
                    fontSize: 11, color: '#818cf8',
                  }}>
                    {sourceIcon} {name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="ctx-actions">
          <button className="ctx-btn ctx-btn-collect" disabled={isCollecting} onClick={handleCollect}>
            {isCollecting ? '⏳ Collecting...' : '🔄 Collect Now'}
          </button>
          <button className="ctx-btn ctx-btn-pin" onClick={() => setShowPin(!showPin)}>📌 Pin</button>
        </div>

        {showPin && (
          <div className="ctx-pin-form">
            <input value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} placeholder="Title" />
            <input value={pinUrl} onChange={(e) => setPinUrl(e.target.value)} placeholder="URL (optional)" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }} />
            <div className="ctx-pin-actions">
              <button style={{ background: 'none', color: '#888895' }} onClick={() => setShowPin(false)}>Cancel</button>
              <button style={{ background: '#6366f1', color: '#fff' }} onClick={handlePin}>Pin</button>
            </div>
          </div>
        )}

        {lastCol && <div className="ctx-collected-at">Last collected: {new Date(lastCol).toLocaleTimeString()}</div>}
      </div>

      {/* Item count + NEW badge */}
      {taskItems.length > 0 && (
        <div className="ctx-filters">
          <span style={{ fontSize: 11, color: '#6b6b78' }}>{taskItems.length} items</span>
          {newCount > 0 && <span className="ctx-new-count">{newCount} NEW</span>}
        </div>
      )}

      {/* Link preview */}
      {(preview || loadingPreview) && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e1e26', background: '#111118', flexShrink: 0 }}>
          {loadingPreview ? (
            <div style={{ fontSize: 11, color: '#6b6b78', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="loading-dot" /> Loading preview...
            </div>
          ) : preview && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d8' }}>{preview.title || 'No title'}</div>
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: '#52525e', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
              {preview.description && <div style={{ fontSize: 11, color: '#888895', lineHeight: 1.5, marginBottom: 6 }}>{preview.description.slice(0, 200)}</div>}
              <a href={preview.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{preview.url}</a>
            </div>
          )}
        </div>
      )}

      {/* Items */}
      <div className="ctx-items">
        {filtered.length === 0 ? (
          <div className="ctx-empty">
            {isCollecting ? 'Collecting...' : filtered.length === 0 ? (
              <div>
                <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>📎</div>
                <div style={{ marginBottom: 6 }}>Drop files or URLs here to pin them</div>
                <div style={{ color: '#52525e', fontSize: 11 }}>or click "Collect Now" to gather from connected sources</div>
              </div>
            ) : null}
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="cp-item" style={{ position: 'relative' }}>
              <div className="cp-icon">{icon(item.sourceType)}</div>
              <div className="cp-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.url ? (
                    <span className="cp-name" style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#32323c' }} onClick={() => handlePreview(item.url)}>{item.title}</span>
                  ) : (
                    <span className="cp-name">{item.title}</span>
                  )}
                  {item.isNew && <span className="cp-new">NEW</span>}
                  {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#52525e', flexShrink: 0 }} title="Open in browser">↗</a>}
                </div>
                <div className="cp-sub">{item.summary}</div>
              </div>
              <button onClick={() => useContextPackStore.getState().removeItem(taskId, item.id)} style={{ background: 'none', border: 'none', color: '#32323c', cursor: 'pointer', fontSize: 12, position: 'absolute', right: 0, top: 8 }}>×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
