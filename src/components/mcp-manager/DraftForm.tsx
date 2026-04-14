/** 신규/수정 MCP 서버 폼 — stdio/http 타입 토글 + env 편집. */
import type { CSSProperties } from 'react';
import { Save } from 'lucide-react';
import type { DraftServer } from './types';

interface Props {
  draft: DraftServer;
  setDraft: (d: DraftServer) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
}

export function DraftForm({ draft, setDraft, onSave, onCancel, saving, isEdit }: Props) {
  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: 10,
    color: 'var(--fg-subtle)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 5,
    color: 'var(--fg-primary)',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  };
  return (
    <div
      style={{
        padding: 14,
        marginBottom: 10,
        background: 'var(--bg-surface-hover)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 12 }}>
        {isEdit ? `Edit: ${draft.name}` : 'New MCP Server'}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Name</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="github"
          disabled={isEdit}
          style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Type</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['stdio', 'http'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDraft({ ...draft, type: t })}
              style={{
                padding: '5px 14px',
                borderRadius: 5,
                fontSize: 11,
                background: draft.type === t ? 'var(--accent-bg)' : 'none',
                border: `1px solid ${draft.type === t ? 'var(--accent-border)' : 'var(--border-strong)'}`,
                color: draft.type === t ? 'var(--accent-bright)' : 'var(--fg-subtle)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {draft.type === 'stdio' ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Command</label>
            <input
              value={draft.command}
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
              placeholder="npx"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Args (space-separated)</label>
            <input
              value={draft.args}
              onChange={(e) => setDraft({ ...draft, args: e.target.value })}
              placeholder="-y @modelcontextprotocol/server-github"
              style={inputStyle}
            />
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>URL</label>
          <input
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://mcp.notion.com/mcp"
            style={inputStyle}
          />
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Environment Variables (KEY=value, one per line)</label>
        <textarea
          value={draft.envText}
          onChange={(e) => setDraft({ ...draft, envText: e.target.value })}
          placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx"
          rows={4}
          style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            fontSize: 11,
            background: 'none',
            border: '1px solid var(--fg-dim)',
            color: 'var(--fg-muted)',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !draft.name.trim()}
          style={{
            padding: '6px 14px',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 500,
            background: draft.name.trim() ? 'var(--accent-bg)' : 'rgba(55,65,81,0.3)',
            border: `1px solid ${draft.name.trim() ? 'var(--accent-border)' : 'var(--border-muted)'}`,
            color: draft.name.trim() ? 'var(--accent-bright)' : 'var(--fg-faint)',
            cursor: draft.name.trim() && !saving ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Save size={11} strokeWidth={1.5} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
