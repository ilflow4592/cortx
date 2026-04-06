import { useState, useEffect } from 'react';
import { useContextPackStore } from '../stores/contextPackStore';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { invoke } from '@tauri-apps/api/core';
import type { ContextItem } from '../types/contextPack';
import { GitHubIcon, SlackIcon, NotionIcon, McpIcon, PinIcon } from './SourceIcons';

export function ContextPack({ taskId }: { taskId: string }) {
  const isCollecting = useContextPackStore((s) => s.isCollecting);
  const collectProgress = useContextPackStore((s) => s.collectProgress);
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
  const [showKeywords, setShowKeywords] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState('');
  const storedKeywords = useContextPackStore((s) => s.keywords[taskId]) || [];
  const [collectModel, setCollectModel] = useState('claude-haiku-4-5-20251001');
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

  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const sourceOrder: Record<string, number> = { github: 0, notion: 1, slack: 2, pin: 3 };
  const sortedItems = [...taskItems].sort((a, b) => (sourceOrder[a.sourceType] ?? 9) - (sourceOrder[b.sourceType] ?? 9));
  const filtered = sourceFilter ? sortedItems.filter((i) => i.sourceType === sourceFilter) : sortedItems;
  const newCount = taskItems.filter((i) => i.isNew).length;
  type ServiceType = 'github' | 'notion' | 'slack' | 'other';

  interface McpServerStatus {
    name: string;
    command: string;
    status: 'ready' | 'auth-needed' | 'unknown';
    authUrl?: string;
    serviceType: ServiceType;
    env: Record<string, string>;
  }

  const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
  const [searchResources, setSearchResources] = useState<Set<ServiceType>>(new Set(['github']));
  const [mcpLoading, setMcpLoading] = useState(false);
  const [vectorStatus, setVectorStatus] = useState<{ ollama: boolean; qdrant: boolean }>({ ollama: false, qdrant: false });
  const [relatedItems, setRelatedItems] = useState<{ id: string; taskId: string; sourceType: string; title: string; content: string; url: string; timestamp: string }[]>([]);
  const [searchingRelated, setSearchingRelated] = useState(false);

  const AUTH_CHECKS: Record<string, { cmd: string; authUrl: string }> = {
    github: { cmd: 'gh auth status 2>&1', authUrl: 'https://github.com/settings/tokens' },
    notion: { cmd: 'echo ok', authUrl: 'https://www.notion.so/my-integrations' },
    slack: { cmd: 'echo ok', authUrl: 'https://api.slack.com/apps' },
  };

  const detectServiceType = (name: string): ServiceType => {
    const n = name.toLowerCase();
    if (n.includes('github')) return 'github';
    if (n.includes('notion')) return 'notion';
    if (n.includes('slack')) return 'slack';
    return 'other';
  };

  const loadMcpServers = async () => {
    setMcpLoading(true);
    try {
      const servers = await invoke<{ name: string; command: string; args: string[]; env: Record<string, string>; server_type: string; url: string }[]>('list_mcp_servers');
      const statuses: McpServerStatus[] = [];

      for (const server of servers) {
        const serviceType = detectServiceType(server.name);
        const matchKey = Object.keys(AUTH_CHECKS).find((k) => server.name.toLowerCase().includes(k));
        if (matchKey) {
          const check = AUTH_CHECKS[matchKey];
          try {
            const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
              cwd: '/', command: check.cmd,
            });
            const authed = result.success || result.output.includes('Logged in') || result.output.includes('ok');
            statuses.push({
              name: server.name, command: server.command, env: server.env || {},
              status: authed ? 'ready' : 'auth-needed',
              authUrl: check.authUrl, serviceType,
            });
          } catch {
            statuses.push({ name: server.name, command: server.command, env: server.env || {}, status: 'auth-needed', authUrl: check.authUrl, serviceType });
          }
        } else {
          statuses.push({ name: server.name, command: server.command, env: server.env || {}, status: 'unknown', serviceType });
        }
      }

      setMcpServers(statuses);

      // Auto-enable search resources for ready services
      const readyServices = new Set<ServiceType>(
        statuses
          .filter((s) => s.status === 'ready' && s.serviceType !== 'other')
          .map((s) => s.serviceType)
      );
      if (readyServices.size > 0) setSearchResources(readyServices);
    } catch { /* no MCP servers */ }
    setMcpLoading(false);
  };

  useEffect(() => {
    loadMcpServers();
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
    const store = useContextPackStore.getState();
    const currentKw = store.keywords[taskId];
    if (!currentKw || currentKw.length === 0) {
      const autoKeywords = [task?.branchName].filter(Boolean) as string[];
      store.setKeywords(taskId, autoKeywords);
    }

    // Build sources from selected search resources + MCP server tokens
    const mcpSources: Array<{ type: 'github' | 'slack' | 'notion'; enabled: boolean; token: string; owner?: string; repo?: string }> = [];

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
          } catch { /* ignore */ }
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
        type: resType, enabled: true, token: '',
        owner, repo,
        ...(settingsSource?.slackChannel ? { slackChannel: settingsSource.slackChannel } : {}),
        ...(settingsSource?.notionDatabaseId ? { notionDatabaseId: settingsSource.notionDatabaseId } : {}),
      });
    }

    // Merge with existing configured sources, MCP sources take priority
    const existingSources = store.sources;
    const mergedTypes = new Set(mcpSources.map((s) => s.type));
    const finalSources = [
      ...mcpSources,
      ...existingSources.filter((s) => !mergedTypes.has(s.type)),
    ];

    console.log('[cortx] collecting with sources:', JSON.stringify(finalSources.map((s) => ({ type: s.type, token: s.token ? 'yes' : 'no', owner: s.owner, repo: s.repo, enabled: s.enabled }))));
    store.collectAll(taskId, task?.branchName || '', project?.slackChannels, task?.title, finalSources as typeof existingSources, collectModel);
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
    useContextPackStore.getState().setKeywords(taskId, current.filter((k) => k !== kw));
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
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#52525e' }}>
              MCP Servers {mcpServers.length > 0 && <span style={{ color: '#3f3f46' }}>({mcpServers.length})</span>}
            </div>
            <button
              onClick={loadMcpServers}
              disabled={mcpLoading}
              style={{
                background: 'none', border: 'none', fontSize: 10, color: '#52525e',
                cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px',
              }}
              title="Reload MCP servers from config"
            >{mcpLoading ? '...' : '↻ Reload'}</button>
          </div>
          {mcpServers.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {mcpServers.map((server) => {
                const isReady = server.status === 'ready' || server.status === 'unknown';
                const needsAuth = server.status === 'auth-needed';
                return (
                  <span
                    key={server.name}
                    onClick={needsAuth && server.authUrl ? () => {
                      import('@tauri-apps/plugin-shell').then(({ open }) => open(server.authUrl!)).catch(() => {
                        window.open(server.authUrl, '_blank');
                      });
                    } : undefined}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6, fontSize: 11,
                      background: needsAuth ? 'rgba(234,179,8,0.06)' : 'rgba(52,211,153,0.06)',
                      border: `1px solid ${needsAuth ? 'rgba(234,179,8,0.15)' : 'rgba(52,211,153,0.15)'}`,
                      color: needsAuth ? '#eab308' : '#34d399',
                      cursor: needsAuth ? 'pointer' : 'default',
                    }}
                    title={needsAuth ? `Click to authenticate ${server.name}` : `${server.name} — ready`}
                  >
                    <McpIcon size={12} />
                    {server.name}
                    {needsAuth && <span style={{ fontSize: 9 }}>⚠</span>}
                  </span>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#3f3f46', fontStyle: 'italic' }}>No MCP servers configured</div>
          )}
        </div>

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

        {/* Search Resources */}
        {(() => {
          const searchableServices = mcpServers.filter(
            (s) => s.serviceType !== 'other' && s.status === 'ready'
          );
          // Deduplicate by serviceType
          const uniqueServices = searchableServices.filter(
            (s, i, arr) => arr.findIndex((x) => x.serviceType === s.serviceType) === i
          );
          if (uniqueServices.length === 0) return null;

          const serviceIcons: Record<ServiceType, React.ReactNode> = {
            github: <GitHubIcon size={12} color="currentColor" />,
            notion: <NotionIcon size={12} color="currentColor" />,
            slack: <SlackIcon size={12} />,
            other: null,
          };

          return (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#52525e', marginBottom: 6 }}>
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
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                        background: checked ? 'rgba(99,102,241,0.08)' : '#16161e',
                        border: `1px solid ${checked ? 'rgba(99,102,241,0.25)' : '#232330'}`,
                        color: checked ? '#818cf8' : '#52525e',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${checked ? '#818cf8' : '#3f3f46'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0 }}>
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
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: showKeywords ? 8 : 0 }}
            onClick={() => setShowKeywords(!showKeywords)}
          >
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#52525e' }}>
              Search Keywords ({storedKeywords.length})
            </span>
            <span style={{ fontSize: 10, color: '#52525e' }}>{showKeywords ? '▾' : '▸'}</span>
          </div>

          {showKeywords && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {storedKeywords.map((kw) => (
                  <span key={kw} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 4, fontSize: 11,
                    background: '#232330', color: '#a1a1aa',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {kw}
                    <button onClick={() => handleRemoveKeyword(kw)} style={{
                      background: 'none', border: 'none', color: '#52525e', cursor: 'pointer',
                      fontSize: 12, padding: 0, lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
                {storedKeywords.length === 0 && (
                  <span style={{ fontSize: 11, color: '#52525e', fontStyle: 'italic' }}>No keywords — branch name will be used</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); } }}
                  placeholder="e.g. BE-1390, 오토부킹"
                  style={{
                    flex: 1, background: '#16161e', border: '1px solid #232330', borderRadius: 6,
                    padding: '5px 10px', fontSize: 11, color: '#d4d4d8', fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none',
                  }}
                />
                <button onClick={handleAddKeyword} style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: '#232330', border: '1px solid #32323c', color: '#888895',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Add</button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="ctx-actions">
          {isCollecting ? (
            <button className="ctx-btn ctx-btn-collect" onClick={() => useContextPackStore.getState().cancelCollect()} style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              ✕ Cancel
            </button>
          ) : (
            <button className="ctx-btn ctx-btn-collect" onClick={handleCollect}>
              🔄 Collect Now
            </button>
          )}
          <button className="ctx-btn ctx-btn-pin" onClick={() => setShowPin(!showPin)}>📌 Pin</button>
          <div style={{ position: 'relative' }}>
            <select
              value={collectModel}
              onChange={(e) => setCollectModel(e.target.value)}
              title="Model for MCP search (Notion/Slack)"
              style={{
                appearance: 'none', WebkitAppearance: 'none',
                background: '#16161e', border: '1px solid #232330', borderRadius: 6,
                padding: '6px 24px 6px 10px', fontSize: 11, color: '#6b6b78',
                fontFamily: "'JetBrains Mono', monospace", outline: 'none', cursor: 'pointer',
                height: '100%',
              }}
            >
              <option value="claude-haiku-4-5-20251001">Haiku</option>
              <option value="claude-sonnet-4-6-20260620">Sonnet</option>
              <option value="claude-opus-4-6-20260620">Opus</option>
            </select>
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: '#52525e', pointerEvents: 'none' }}>▼</span>
          </div>
        </div>

        {/* Collection progress */}
        {collectProgress.length > 0 && (isCollecting || collectProgress.some((p) => p.status === 'done' || p.status === 'error')) && (
          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {collectProgress.map((p) => (
              <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>
                  {p.status === 'pending' && <span style={{ color: '#52525e' }}>○</span>}
                  {p.status === 'collecting' && <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
                  {p.status === 'done' && <span style={{ color: '#34d399' }}>✓</span>}
                  {p.status === 'error' && <span style={{ color: '#ef4444' }}>✗</span>}
                </span>
                <span style={{ color: p.status === 'collecting' ? '#d4d4d8' : '#888895', textTransform: 'capitalize' }}>
                  {p.type}
                </span>
                {p.status === 'done' && (
                  <span style={{ color: '#52525e' }}>
                    — {p.itemCount} items
                    {p.tokenUsage && (
                      <span style={{ marginLeft: 6, color: '#3f3f46' }}>
                        (~{p.tokenUsage.input + p.tokenUsage.output} tok)
                      </span>
                    )}
                  </span>
                )}
                {p.status === 'error' && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: '#ef4444' }}>— failed</span>
                    {p.error && (
                      <span
                        onClick={() => navigator.clipboard.writeText(p.error || '')}
                        title="Click to copy"
                        style={{ color: '#52525e', fontSize: 10, marginTop: 2, wordBreak: 'break-all', maxWidth: 400, cursor: 'pointer', userSelect: 'text', WebkitUserSelect: 'text' }}
                      >
                        {p.error.slice(0, 200)} <span style={{ color: '#3f3f46' }}>📋</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {/* Total token usage */}
            {collectProgress.some((p) => p.tokenUsage) && (
              <div style={{ fontSize: 10, color: '#3f3f46', marginTop: 4, textAlign: 'right' }}>
                Total: ~{collectProgress.reduce((sum, p) => sum + (p.tokenUsage ? p.tokenUsage.input + p.tokenUsage.output : 0), 0)} tokens
              </div>
            )}
          </div>
        )}

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

      {/* Item count + source filters + clear */}
      {taskItems.length > 0 && (() => {
        const sourceCounts: Record<string, number> = {};
        taskItems.forEach((i) => { sourceCounts[i.sourceType] = (sourceCounts[i.sourceType] || 0) + 1; });
        const sourceTypes = Object.keys(sourceCounts);

        return (
          <div className="ctx-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setSourceFilter(null)}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                  background: sourceFilter === null ? 'rgba(99,102,241,0.08)' : 'none',
                  border: sourceFilter === null ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  color: sourceFilter === null ? '#818cf8' : '#6b6b78',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >All ({taskItems.length})</button>
              {sourceTypes.map((st) => (
                <button
                  key={st}
                  onClick={() => setSourceFilter(sourceFilter === st ? null : st)}
                  style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: sourceFilter === st ? 'rgba(99,102,241,0.08)' : 'none',
                    border: sourceFilter === st ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                    color: sourceFilter === st ? '#818cf8' : '#6b6b78',
                    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                  }}
                >
                  {icon(st)}
                  {st} ({sourceCounts[st]})
                </button>
              ))}
              {newCount > 0 && <span className="ctx-new-count">{newCount} NEW</span>}
            </div>
            <button
              onClick={() => useContextPackStore.getState().clearCollected(taskId)}
              style={{
                background: 'none', border: 'none', fontSize: 10, color: '#52525e',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Clear collected</button>
          </div>
        );
      })()}

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
            {isCollecting ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                <div style={{ fontSize: 13, color: '#888895' }}>Searching via MCP...</div>
                <div style={{ fontSize: 11, color: '#52525e' }}>This may take a few seconds</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>📎</div>
                <div style={{ marginBottom: 6 }}>Drop files or URLs here to pin them</div>
                <div style={{ color: '#52525e', fontSize: 11 }}>or click "Collect Now" to gather from connected sources</div>
              </div>
            )}
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
