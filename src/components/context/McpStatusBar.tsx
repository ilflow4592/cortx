import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useContextPackStore } from '../../stores/contextPackStore';
import { McpIcon, GitHubIcon, SlackIcon, NotionIcon } from '../SourceIcons';
import { isClaudeActiveInTerminal } from '../../utils/terminalState';
import type { ContextSourceConfig } from '../../types/contextPack';

interface McpStatusBarProps {
  sources: ContextSourceConfig[];
  projectCwd?: string;
  taskId?: string;
  onSwitchTab?: (tab: string) => void;
}

export function McpStatusBar({ sources, projectCwd, taskId, onSwitchTab }: McpStatusBarProps) {
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
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

  return (
    <>
      {/* MCP Servers */}
      <div ref={containerRef} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div
            style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--fg-faint)' }}
          >
            MCP Servers {mcpServers.length > 0 && <span style={{ color: 'var(--fg-dim)' }}>({mcpServers.length})</span>}
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
            {[
              { key: 'project', label: 'Project MCPs', servers: mcpServers.filter((s) => s.source === 'project') },
              { key: 'local', label: 'Local MCPs', servers: mcpServers.filter((s) => s.source === 'local') },
              { key: 'user', label: 'User MCPs', servers: mcpServers.filter((s) => s.source === 'global') },
              { key: 'cloudai', label: 'claude.ai', servers: mcpServers.filter((s) => s.source === 'claude.ai') },
              { key: 'builtin', label: 'Built-in MCPs', servers: mcpServers.filter((s) => s.source === 'built-in') },
            ].map((group) => ({
              ...group,
              // Sort: connected → disabled → failed
              servers: [...group.servers].sort((a, b) => {
                const order = (s: typeof a) => s.disabled ? 1 : s.status === 'ready' ? 0 : 2;
                return order(a) - order(b);
              }),
            }))
              .filter((group) => group.servers.length > 0)
              .map((group) => (
                <div key={group.key} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-dim)', marginBottom: 4 }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {group.servers.map((server) => {
                      const isDisabled = server.disabled;
                      const needsAuth = server.status === 'auth-needed';
                      const isReady = !isDisabled && server.status === 'ready';
                      const statusIcon = isDisabled ? '○' : isReady ? '✓' : needsAuth ? '⚠' : '✗';
                      const statusColor = isDisabled ? 'var(--fg-dim)' : isReady ? '#34d399' : needsAuth ? '#eab308' : '#ef4444';
                      const statusLabel = isDisabled ? 'disabled' : isReady ? 'connected' : needsAuth ? 'auth-needed' : 'failed';
                      const isSelected = selectedServer === server.name;
                      const canToggle = true; // 모든 MCP 서버는 enable/disable 가능
                      return (
                        <div key={server.name} style={{ position: 'relative' }}>
                          <span
                            onClick={() => setSelectedServer(isSelected ? null : server.name)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              background: isDisabled ? 'transparent' : isReady ? 'rgba(52,211,153,0.06)' : 'rgba(234,179,8,0.06)',
                              border: `1px solid ${isSelected ? 'var(--accent-bright)' : isDisabled ? 'var(--bg-surface-hover)' : isReady ? 'rgba(52,211,153,0.15)' : 'rgba(234,179,8,0.15)'}`,
                              color: statusColor,
                              cursor: 'pointer',
                              opacity: isDisabled ? 0.5 : 1,
                            }}
                            title={`${server.name} · ${statusLabel}`}
                          >
                            <span style={{ fontSize: 10 }}>{statusIcon}</span>
                            {server.name}
                          </span>
                          {isSelected && (() => {
                            const configLocationMap: Record<string, string> = {
                              project: `${projectCwd || ''}/.mcp.json`,
                              local: `${projectCwd || ''}/.claude/mcp.json`,
                              global: '~/.claude.json',
                              'claude.ai': 'claude.ai (cloud)',
                              'built-in': 'built-in',
                            };
                            const configLocation = configLocationMap[server.source] || server.source;
                            return (
                              <div style={{
                                position: 'fixed', zIndex: 200,
                                background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
                                borderRadius: 8, padding: '10px 14px', width: 320, maxWidth: 'calc(100vw - 40px)',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                              }} ref={(el) => {
                                if (!el) return;
                                const chip = el.parentElement?.querySelector('span');
                                if (!chip) return;
                                const rect = chip.getBoundingClientRect();
                                const spaceRight = window.innerWidth - rect.left;
                                const spaceBelow = window.innerHeight - rect.bottom;
                                el.style.top = (spaceBelow > 200 ? rect.bottom + 4 : rect.top - el.offsetHeight - 4) + 'px';
                                el.style.left = (spaceRight > 340 ? rect.left : window.innerWidth - 340) + 'px';
                              }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 8, borderBottom: '1px solid var(--bg-surface-hover)', paddingBottom: 6 }}>
                                  {server.name.charAt(0).toUpperCase() + server.name.slice(1)} MCP Server
                                </div>

                                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
                                  <span style={{ color: 'var(--fg-faint)' }}>Status: </span>
                                  <span style={{ color: statusColor }}>{statusIcon} {statusLabel}</span>
                                </div>
                                {server.command && (
                                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
                                    <span style={{ color: 'var(--fg-faint)' }}>Command: </span>
                                    <span style={{ fontFamily: 'monospace' }}>{server.command}</span>
                                  </div>
                                )}
                                {server.args && server.args.length > 0 && (
                                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>
                                    <span style={{ color: 'var(--fg-faint)' }}>Args: </span>
                                    <span style={{ fontFamily: 'monospace' }}>{server.args.join(' ')}</span>
                                  </div>
                                )}
                                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
                                  <span style={{ color: 'var(--fg-faint)' }}>Config location: </span>
                                  <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{configLocation}</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--bg-surface-hover)', paddingTop: 6 }}>
                                  {taskId && onSwitchTab && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedServer(null);
                                        onSwitchTab!('terminal');
                                        const termPtyId = `term-${taskId}`;

                                        // Send Ctrl+C first to cancel any pending input, then cd + claude + /mcp
                                        setTimeout(() => {
                                          // Ctrl+C to clean slate
                                          invoke('pty_write', { id: termPtyId, data: '\x03' }).catch(() => {});
                                          setTimeout(() => {
                                            const cdCmd = projectCwd ? `cd ${projectCwd.replace(/ /g, '\\ ')}\r` : '';
                                            if (cdCmd) invoke('pty_write', { id: termPtyId, data: cdCmd }).catch(() => {});
                                            setTimeout(() => {
                                              invoke('pty_write', { id: termPtyId, data: `claude\r` }).catch(() => {});
                                              setTimeout(() => {
                                                invoke('pty_write', { id: termPtyId, data: `/mcp\r` }).catch(() => {});
                                              }, 2500);
                                            }, 500);
                                          }, 200);
                                        }, 300);
                                      }}
                                      style={{
                                        padding: '5px 0', background: 'none', border: 'none', fontSize: 11, color: '#60a5fa',
                                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                                      }}
                                    >
                                      Configure in Terminal
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </>
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
