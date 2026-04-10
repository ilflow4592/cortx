import { useContextPackStore } from '../../stores/contextPackStore';
import { McpIcon, GitHubIcon, SlackIcon, NotionIcon } from '../SourceIcons';
import type { ContextSourceConfig } from '../../types/contextPack';

interface McpStatusBarProps {
  sources: ContextSourceConfig[];
}

export function McpStatusBar({ sources }: McpStatusBarProps) {
  const mcpServers = useContextPackStore((s) => s.mcpServers);
  const mcpLoading = useContextPackStore((s) => s.mcpLoading);

  return (
    <>
      {/* MCP Servers */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div
            style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--fg-faint)' }}
          >
            MCP Servers {mcpServers.length > 0 && <span style={{ color: 'var(--fg-dim)' }}>({mcpServers.length})</span>}
          </div>
          <button
            onClick={() => useContextPackStore.getState().loadMcpServers()}
            disabled={mcpLoading}
            className="icon-btn-subtle"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 10,
              color: 'var(--fg-faint)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '2px 6px',
              borderRadius: 4,
            }}
            title="Reload MCP servers from config"
          >
            {mcpLoading ? '...' : '↻ Reload'}
          </button>
        </div>
        {mcpServers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mcpServers.map((server) => {
              const needsAuth = server.status === 'auth-needed';
              return (
                <span
                  key={server.name}
                  onClick={
                    needsAuth && server.authUrl
                      ? () => {
                          import('@tauri-apps/plugin-shell')
                            .then(({ open }) => open(server.authUrl!))
                            .catch(() => {
                              window.open(server.authUrl, '_blank');
                            });
                        }
                      : undefined
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
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
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontStyle: 'italic' }}>No MCP servers configured</div>
        )}
      </div>

      {/* Connected Sources (Settings-level tokens) */}
      {sources.filter((s) => s.enabled && s.token).length > 0 && (
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
            Connected Sources
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sources
              .filter((s) => s.enabled && s.token)
              .map((source, i) => {
                const sourceIcon =
                  source.type === 'github' ? (
                    <GitHubIcon size={12} color="var(--accent-bright)" />
                  ) : source.type === 'slack' ? (
                    <SlackIcon size={12} />
                  ) : (
                    <NotionIcon size={12} color="var(--accent-bright)" />
                  );
                const name =
                  source.type === 'github'
                    ? `${source.owner}/${source.repo}`
                    : source.type === 'slack'
                      ? 'Slack'
                      : 'Notion';
                return (
                  <span
                    key={i}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(125,189,189,0.06)',
                      border: '1px solid rgba(125,189,189,0.15)',
                      fontSize: 11,
                      color: 'var(--accent-bright)',
                    }}
                  >
                    {sourceIcon} {name}
                  </span>
                );
              })}
          </div>
        </div>
      )}
    </>
  );
}
