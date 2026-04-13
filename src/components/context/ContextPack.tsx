import { useState, useEffect } from 'react';
import { RefreshCw, Pin, Paperclip } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useContextPackStore } from '../../stores/contextPackStore';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import type { ContextItem } from '../../types/contextPack';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from '../SourceIcons';
import { McpStatusBar } from './McpStatusBar';
import { ContextItemCard } from './ContextItemCard';
import { PinDialog } from './PinDialog';
import { CollectProgress } from './CollectProgress';

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-opus-4-6', label: 'Opus' },
];

type ServiceType = 'github' | 'notion' | 'slack' | 'obsidian' | 'other';

function sourceIcon(t: string) {
  if (t === 'github') return <GitHubIcon size={14} color="var(--fg-muted)" />;
  if (t === 'slack') return <SlackIcon size={14} />;
  if (t === 'notion') return <NotionIcon size={14} color="var(--fg-muted)" />;
  return <PinIcon size={14} />;
}

export function ContextPack({ taskId }: { taskId: string }) {
  const isCollecting = useContextPackStore((s) => s.collecting[taskId] || false);
  const collectProgress = useContextPackStore((s) => s.collectProgresses[taskId] || []);
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
  const [showKeywords, setShowKeywords] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState('');
  const storedKeywords = useContextPackStore((s) => s.keywords[taskId]) || [];
  const [collectModel, setCollectModel] = useState('claude-haiku-4-5-20251001');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ url: string; title: string; description: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const mcpServers = useContextPackStore((s) => s.mcpServers);
  const [searchResources, setSearchResources] = useState<Set<ServiceType>>(new Set(['github']));

  // Tauri native file drop handler
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let lastDropTime = 0;

    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        getCurrentWindow()
          .onDragDropEvent((event) => {
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
          })
          .then((fn) => {
            unlisten = fn;
          });
      })
      .catch(() => {}); // Not in Tauri context

    return () => {
      unlisten?.();
    };
  }, [taskId]);

  useEffect(() => {
    // Clear this task's progress on mount
    const store = useContextPackStore.getState();
    useContextPackStore.setState({ collectProgresses: { ...store.collectProgresses, [taskId]: [] } });
  }, [taskId]);

  // Auto-enable search resources when mcpServers change
  useEffect(() => {
    const readyServices = new Set<ServiceType>(
      mcpServers.filter((s) => s.status === 'ready' && s.serviceType !== 'other').map((s) => s.serviceType),
    );
    if (readyServices.size > 0) setSearchResources(readyServices);
  }, [mcpServers]);

  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const sourceOrder: Record<string, number> = { github: 0, notion: 1, slack: 2, obsidian: 3, pin: 4 };
  const sortedItems = [...taskItems].sort(
    (a, b) => (sourceOrder[a.sourceType] ?? 9) - (sourceOrder[b.sourceType] ?? 9),
  );
  const filtered = sourceFilter ? sortedItems.filter((i) => i.sourceType === sourceFilter) : sortedItems;
  const newCount = taskItems.filter((i) => i.isNew).length;

  const handleCollect = () => {
    const store = useContextPackStore.getState();
    const currentKw = store.keywords[taskId];
    if (!currentKw || currentKw.length === 0) {
      const autoKeywords = [task?.branchName].filter(Boolean) as string[];
      store.setKeywords(taskId, autoKeywords);
    }

    // Build sources from selected search resources + MCP server tokens
    const mcpSources: Array<{
      type: ServiceType;
      enabled: boolean;
      token: string;
      owner?: string;
      repo?: string;
    }> = [];

    for (const resType of searchResources) {
      if (resType === 'other') continue;
      const mcpServer = mcpServers.find((s) => s.serviceType === resType && s.status === 'ready');
      if (!mcpServer) continue;

      // Extract token: MCP env → Settings source → empty (gh CLI fallback for GitHub)
      const env = mcpServer.env || {};
      let token = '';

      // 1. Try MCP env vars
      if (resType === 'github') {
        token = env.GITHUB_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
      } else if (resType === 'notion') {
        token = env.NOTION_API_KEY || '';
        if (!token && env.OPENAPI_MCP_HEADERS) {
          try {
            const headers = JSON.parse(env.OPENAPI_MCP_HEADERS);
            token = (headers.Authorization || headers.authorization || '').replace(/^Bearer\s+/i, '');
          } catch {
            /* ignore */
          }
        }
        if (!token) token = Object.values(env).find((v) => v.startsWith('ntn_') || v.startsWith('secret_')) || '';
      } else if (resType === 'slack') {
        token = env.SLACK_BOT_TOKEN || env.SLACK_TOKEN || Object.values(env).find((v) => v.startsWith('xoxb-')) || '';
      }

      // Get owner/repo from project or Settings source (but don't use settings token — use MCP instead)
      const settingsSource = store.sources.find((s) => s.type === resType);
      const owner = project?.githubOwner || settingsSource?.owner || '';
      const repo = project?.githubRepo || settingsSource?.repo || '';

      // MCP-connected services: always use MCP (no token = MCP path in collectAll)
      mcpSources.push({
        type: resType,
        enabled: true,
        token: '',
        owner,
        repo,
        ...(settingsSource?.slackChannel ? { slackChannel: settingsSource.slackChannel } : {}),
        ...(settingsSource?.notionDatabaseId ? { notionDatabaseId: settingsSource.notionDatabaseId } : {}),
      });
    }

    // Merge with existing configured sources, MCP sources take priority
    const existingSources = store.sources;
    const mergedTypes = new Set<string>(mcpSources.map((s) => s.type));
    const finalSources = [...mcpSources, ...existingSources.filter((s) => !mergedTypes.has(s.type))];

    console.log(
      '[cortx] collecting with sources:',
      JSON.stringify(
        finalSources.map((s) => ({
          type: s.type,
          token: s.token ? 'yes' : 'no',
          owner: s.owner,
          repo: s.repo,
          enabled: s.enabled,
        })),
      ),
    );
    store.collectAll(
      taskId,
      task?.branchName || '',
      project?.slackChannels,
      task?.title,
      finalSources as typeof existingSources,
      collectModel,
    );
  };

  const handleAddKeyword = () => {
    const kw = keywordDraft.trim();
    if (!kw) return;
    const current = useContextPackStore.getState().keywords[taskId] || [];
    if (!current.includes(kw)) {
      useContextPackStore.getState().setKeywords(taskId, [...current, kw]);
    }
    setKeywordDraft('');
  };

  const handleRemoveKeyword = (kw: string) => {
    const current = useContextPackStore.getState().keywords[taskId] || [];
    useContextPackStore.getState().setKeywords(
      taskId,
      current.filter((k) => k !== kw),
    );
  };

  const handlePreview = async (url: string) => {
    if (!url || loadingPreview) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const result = await invoke<{ url: string; title: string; description: string; success: boolean }>(
        'fetch_link_preview',
        { url },
      );
      if (result.success) setPreview({ url: result.url, title: result.title, description: result.description });
    } catch {
      /* ignore */
    }
    setLoadingPreview(false);
  };

  const lastCol = lastCollectedAt;

  return (
    <div className="ctx-pack" style={{ position: 'relative' }}>
      {/* Drop overlay */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: 'var(--accent-bg)',
            border: '2px dashed var(--accent)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', color: 'var(--accent-bright)' }}>
            <div style={{ marginBottom: 8 }}>
              <Paperclip size={32} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files or URLs here</div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>They'll be pinned to this task's context</div>
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
          <div
            style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: project.color }} />
            {project.githubOwner && project.githubRepo ? (
              <span>
                {project.githubOwner}/{project.githubRepo}
              </span>
            ) : (
              <span>{project.name}</span>
            )}
          </div>
        )}

        <McpStatusBar sources={sources} />

        {/* Search Resources */}
        {(() => {
          const searchableServices = mcpServers.filter((s) => s.serviceType !== 'other' && s.status === 'ready');
          // Deduplicate by serviceType
          const uniqueServices = searchableServices.filter(
            (s, i, arr) => arr.findIndex((x) => x.serviceType === s.serviceType) === i,
          );
          if (uniqueServices.length === 0) return null;

          const serviceIcons: Record<ServiceType, React.ReactNode> = {
            github: <GitHubIcon size={12} color="currentColor" />,
            notion: <NotionIcon size={12} color="currentColor" />,
            slack: <SlackIcon size={12} />,
            obsidian: <span style={{ fontSize: 12 }}>📓</span>,
            other: null,
          };

          return (
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'var(--fg-faint)',
                  marginBottom: 6,
                }}
              >
                Search Resources
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {uniqueServices.map((s) => {
                  const checked = searchResources.has(s.serviceType);
                  return (
                    <button
                      key={s.serviceType}
                      onClick={() => {
                        setSearchResources((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.serviceType)) next.delete(s.serviceType);
                          else next.add(s.serviceType);
                          return next;
                        });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        background: checked ? 'var(--accent-bg)' : 'var(--bg-chip)',
                        border: `1px solid ${checked ? 'var(--accent-bg)' : 'var(--bg-surface-hover)'}`,
                        color: checked ? 'var(--accent-bright)' : 'var(--fg-faint)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          border: `1.5px solid ${checked ? 'var(--accent-bright)' : 'var(--fg-dim)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 8,
                          flexShrink: 0,
                        }}
                      >
                        {checked && '✓'}
                      </span>
                      {serviceIcons[s.serviceType]}
                      <span style={{ textTransform: 'capitalize' }}>{s.serviceType}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Search keywords */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              marginBottom: showKeywords ? 8 : 0,
            }}
            onClick={() => setShowKeywords(!showKeywords)}
          >
            <span
              style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--fg-faint)' }}
            >
              Search Keywords ({storedKeywords.length})
            </span>
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{showKeywords ? '▾' : '▸'}</span>
          </div>

          {showKeywords && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {storedKeywords.map((kw) => (
                  <span
                    key={kw}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      background: 'var(--bg-surface-hover)',
                      color: 'var(--fg-muted)',
                      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                    }}
                  >
                    {kw}
                    <button
                      onClick={() => handleRemoveKeyword(kw)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--fg-faint)',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  placeholder="e.g. BE-1390, 오토부킹"
                  style={{
                    flex: 1,
                    background: 'var(--bg-chip)',
                    border: '1px solid var(--bg-surface-hover)',
                    borderRadius: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    color: 'var(--fg-primary)',
                    fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleAddKeyword}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    background: 'var(--bg-surface-hover)',
                    border: '1px solid var(--fg-dim)',
                    color: '#888895',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="ctx-actions">
          {isCollecting ? (
            <button
              className="ctx-btn ctx-btn-collect"
              onClick={() => useContextPackStore.getState().cancelCollect(taskId)}
              style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            >
              ✕ Cancel
            </button>
          ) : (
            <button
              className="ctx-btn ctx-btn-collect"
              onClick={handleCollect}
              disabled={storedKeywords.length === 0 && taskItems.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                ...(storedKeywords.length === 0 && taskItems.length === 0
                  ? { opacity: 0.4, cursor: 'not-allowed' }
                  : {}),
              }}
            >
              <RefreshCw size={13} /> Collect Now
            </button>
          )}
          <button
            className="ctx-btn ctx-btn-pin"
            onClick={() => setShowPin(!showPin)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Pin size={13} /> Pin
          </button>
          {/* Custom model dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="icon-btn-subtle"
              style={{
                background: 'var(--bg-chip)',
                border: '1px solid var(--bg-surface-hover)',
                borderRadius: 6,
                padding: '6px 24px 6px 10px',
                fontSize: 11,
                color: 'var(--fg-subtle)',
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Model for MCP search (Notion/Slack)"
            >
              {MODEL_OPTIONS.find((m) => m.value === collectModel)?.label ?? 'Haiku'}
              <span style={{ fontSize: 8, color: 'var(--fg-faint)', marginLeft: 4 }}>▼</span>
            </button>
            {showModelMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowModelMenu(false)} />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    zIndex: 100,
                    background: '#1e2430',
                    border: '1px solid #2d3748',
                    borderRadius: 8,
                    padding: '4px 0',
                    minWidth: 110,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setCollectModel(m.value);
                        setShowModelMenu(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        padding: '6px 12px',
                        fontSize: 12,
                        border: 'none',
                        background: 'none',
                        color: collectModel === m.value ? '#e879a8' : 'var(--fg-muted)',
                        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                        cursor: 'pointer',
                        fontWeight: collectModel === m.value ? 600 : 400,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <span style={{ width: 14, textAlign: 'center' }}>{collectModel === m.value ? '✓' : ''}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <CollectProgress progress={collectProgress} isCollecting={isCollecting} />

        {showPin && <PinDialog taskId={taskId} onClose={() => setShowPin(false)} />}

        {lastCol && <div className="ctx-collected-at">Last collected: {new Date(lastCol).toLocaleTimeString()}</div>}
      </div>

      {/* Item count + source filters + clear */}
      {taskItems.length > 0 &&
        (() => {
          const sourceCounts: Record<string, number> = {};
          taskItems.forEach((i) => {
            sourceCounts[i.sourceType] = (sourceCounts[i.sourceType] || 0) + 1;
          });
          const sourceTypes = Object.keys(sourceCounts);

          return (
            <div
              className="ctx-filters"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setSourceFilter(null)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 500,
                    background: sourceFilter === null ? 'var(--accent-bg)' : 'none',
                    border: sourceFilter === null ? '1px solid var(--accent-bg)' : '1px solid transparent',
                    color: sourceFilter === null ? 'var(--accent-bright)' : 'var(--fg-subtle)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  All ({taskItems.length})
                </button>
                {sourceTypes.map((st) => (
                  <button
                    key={st}
                    onClick={() => setSourceFilter(sourceFilter === st ? null : st)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 500,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: sourceFilter === st ? 'var(--accent-bg)' : 'none',
                      border: sourceFilter === st ? '1px solid var(--accent-bg)' : '1px solid transparent',
                      color: sourceFilter === st ? 'var(--accent-bright)' : 'var(--fg-subtle)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textTransform: 'capitalize',
                    }}
                  >
                    {sourceIcon(st)}
                    {st} ({sourceCounts[st]})
                  </button>
                ))}
                {newCount > 0 && <span className="ctx-new-count">{newCount} NEW</span>}
              </div>
              <button
                onClick={() => useContextPackStore.getState().clearCollected(taskId)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 10,
                  color: 'var(--fg-faint)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Clear collected
              </button>
            </div>
          );
        })()}

      {/* Link preview */}
      {(preview || loadingPreview) && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-muted)', background: 'var(--bg-app)', flexShrink: 0 }}>
          {loadingPreview ? (
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="loading-dot" /> Loading preview...
            </div>
          ) : (
            preview && (
              <div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>{preview.title || 'No title'}</div>
                  <button
                    onClick={() => setPreview(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 14 }}
                  >
                    ×
                  </button>
                </div>
                {preview.description && (
                  <div style={{ fontSize: 11, color: '#888895', lineHeight: 1.5, marginBottom: 6 }}>
                    {preview.description.slice(0, 200)}
                  </div>
                )}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 10,
                    color: 'var(--accent-bright)',
                    fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                    wordBreak: 'break-all',
                  }}
                >
                  {preview.url}
                </a>
              </div>
            )
          )}
        </div>
      )}

      {/* Items */}
      <div className="ctx-items">
        {filtered.length === 0 ? (
          <div className="ctx-empty">
            {isCollecting ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                <div style={{ fontSize: 13, color: '#888895' }}>Searching via MCP...</div>
                <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>This may take a few seconds</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginBottom: 12, opacity: 0.3 }}>
                  <Paperclip size={28} strokeWidth={1.5} />
                </div>
                <div style={{ marginBottom: 6 }}>Drop files or URLs here to pin them</div>
                <div style={{ color: 'var(--fg-faint)', fontSize: 11 }}>
                  or click "Collect Now" to gather from connected sources
                </div>
              </div>
            )}
          </div>
        ) : (
          filtered.map((item) => (
            <ContextItemCard key={item.id} taskId={taskId} item={item} onPreview={handlePreview} />
          ))
        )}
      </div>
    </div>
  );
}
