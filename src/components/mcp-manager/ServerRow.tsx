/** MCP 서버 한 행 — 이름/타입 뱃지/커맨드/env 키 + 편집/삭제 버튼. */
import { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import type { RawServer } from './types';
import { RowIconButton } from './buttons';

interface Props {
  server: RawServer;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}

export function ServerRow({ server, onEdit, onDelete, disabled }: Props) {
  const [hovered, setHovered] = useState(false);
  const envKeys = Object.keys(server.env);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 12,
        marginBottom: 8,
        background: hovered ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--bg-surface-hover)'}`,
        borderRadius: 8,
        transition: 'all 120ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {server.name}
            <span
              style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 3,
                background: server.server_type === 'http' ? 'rgba(129,140,248,0.15)' : 'var(--accent-bg)',
                color: server.server_type === 'http' ? '#818cf8' : 'var(--accent-bright)',
                border: `1px solid ${server.server_type === 'http' ? 'rgba(129,140,248,0.3)' : 'var(--accent-border)'}`,
              }}
            >
              {server.server_type || 'stdio'}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--fg-subtle)',
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {server.server_type === 'http' ? server.url : `${server.command} ${server.args.join(' ')}`}
          </div>
          {envKeys.length > 0 && (
            <div
              style={{
                fontSize: 9,
                color: 'var(--fg-faint)',
                marginTop: 4,
                display: 'flex',
                gap: 4,
                flexWrap: 'wrap',
              }}
            >
              {envKeys.map((k) => (
                <span
                  key={k}
                  style={{
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: 'var(--bg-chip)',
                    border: '1px solid var(--border-strong)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <RowIconButton onClick={onEdit} disabled={disabled} hoverColor="#818cf8" title="Edit">
            <Edit2 size={12} strokeWidth={1.5} />
          </RowIconButton>
          <RowIconButton onClick={onDelete} disabled={disabled} hoverColor="#ef4444" title="Remove">
            <Trash2 size={12} strokeWidth={1.5} />
          </RowIconButton>
        </div>
      </div>
    </div>
  );
}
