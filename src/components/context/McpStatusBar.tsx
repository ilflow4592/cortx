import { useState, useEffect, useRef } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { GitHubIcon, SlackIcon, NotionIcon } from '../SourceIcons';
import { ServerChip } from './ServerChip';
import { ServerDropdown } from './ServerDropdown';
import type { ContextSourceConfig } from '../../types/contextPack';

interface McpStatusBarProps {
  sources: ContextSourceConfig[];
  projectCwd?: string;
  taskId?: string;
  onSwitchTab?: (tab: string) => void;
}

/**
 * MCP server status bar — orchestrates grouped MCP server chips
 * (project / local / user / claude.ai / built-in) and the optional
 * "Connected Sources" summary for configured tokens (GitHub / Slack / Notion).
 *
 * Per-chip detail + Terminal configuration action lives in `ServerDropdown`.
 */
export function McpStatusBar({ sources, projectCwd, taskId, onSwitchTab }: McpStatusBarProps) {
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 팝오버 닫기
  useEffect(() => {
    if (!selectedServer) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedServer(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedServer]);
  const mcpServers = useContextPackStore((s) => s.mcpServers);
  const mcpLoading = useContextPackStore((s) => s.mcpLoading);

  const groups = [
    { key: 'project', label: 'Project MCPs', source: 'project' },
    { key: 'local', label: 'Local MCPs', source: 'local' },
    { key: 'user', label: 'User MCPs', source: 'global' },
    { key: 'cloudai', label: 'claude.ai', source: 'claude.ai' },
    { key: 'builtin', label: 'Built-in MCPs', source: 'built-in' },
  ] as const;

  const groupedServers = groups
    .map((group) => ({
      ...group,
      // Sort: connected → disabled → failed
      servers: [...mcpServers.filter((s) => s.source === group.source)].sort((a, b) => {
        const order = (s: typeof a) => (s.disabled ? 1 : s.status === 'ready' ? 0 : 2);
        return order(a) - order(b);
      }),
    }))
    .filter((group) => group.servers.length > 0);

  const connectedSources = sources.filter((s) => s.enabled && s.token);

  return (
    <>
      {/* MCP Servers */}
      <div ref={containerRef} style={{ marginBottom: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--fg-faint)',
            }}
          >
            MCP Servers{' '}
            {mcpServers.length > 0 && (
              <span style={{ color: 'var(--fg-dim)' }}>({mcpServers.length})</span>
            )}
          </div>
          <button
            onClick={() => useContextPackStore.getState().loadMcpServers(projectCwd)}
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
        {mcpLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>MCP 서버 로딩 중...</span>
          </div>
        ) : mcpServers.length > 0 ? (
          <>
            {groupedServers.map((group) => (
              <div key={group.key} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'var(--fg-dim)',
                    marginBottom: 4,
                  }}
                >
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.servers.map((server) => {
                    const isSelected = selectedServer === server.name;
                    return (
                      <div key={server.name} style={{ position: 'relative' }}>
                        <ServerChip
                          server={server}
                          isSelected={isSelected}
                          onSelect={() => setSelectedServer(isSelected ? null : server.name)}
                        />
                        {isSelected && (
                          <ServerDropdown
                            server={server}
                            projectCwd={projectCwd}
                            taskId={taskId}
                            configuring={configuring}
                            onSwitchTab={onSwitchTab}
                            onConfigureStart={() => setConfiguring(true)}
                            onConfigureEnd={() => setConfiguring(false)}
                            onClose={() => setSelectedServer(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontStyle: 'italic' }}>
            No MCP servers configured
          </div>
        )}
      </div>

      {/* Connected Sources (Settings-level tokens) */}
      {connectedSources.length > 0 && (
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
            {connectedSources.map((source, i) => {
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
