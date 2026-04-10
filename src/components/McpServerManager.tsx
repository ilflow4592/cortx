/**
 * MCP Server Manager — add, edit, and remove MCP servers without editing
 * ~/.claude.json by hand.
 */
import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2, X, Server, Edit2, Save, RotateCw, AlertCircle } from 'lucide-react';
import { useContextPackStore } from '../stores/contextPackStore';

interface Props {
  onClose: () => void;
}

interface RawServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  server_type: string;
  url: string;
}

interface DraftServer {
  name: string;
  type: 'stdio' | 'http';
  command: string;
  args: string; // space-separated
  envText: string; // KEY=value per line
  url: string;
}

function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function stringifyEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function emptyDraft(): DraftServer {
  return { name: '', type: 'stdio', command: 'npx', args: '', envText: '', url: '' };
}

export function McpServerManager({ onClose }: Props) {
  const [servers, setServers] = useState<RawServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftServer>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadMcpServers = useContextPackStore((s) => s.loadMcpServers);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await invoke<RawServer[]>('list_mcp_servers');
      setServers(list);
    } catch (err) {
      setError(`Failed to load: ${err}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async data load
    load();
  }, [load]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (adding || editing) {
          setAdding(false);
          setEditing(null);
        } else if (confirmDelete) {
          setConfirmDelete(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [adding, editing, confirmDelete, onClose]);

  const startEdit = (server: RawServer) => {
    setEditing(server.name);
    setAdding(false);
    setDraft({
      name: server.name,
      type: server.server_type === 'http' ? 'http' : 'stdio',
      command: server.command,
      args: server.args.join(' '),
      envText: stringifyEnv(server.env),
      url: server.url,
    });
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setDraft(emptyDraft());
  };

  const cancelDraft = () => {
    setAdding(false);
    setEditing(null);
    setDraft(emptyDraft());
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Split args respecting basic quoting
      const argsArray = draft.args
        .trim()
        .match(/(?:[^\s"]+|"[^"]*")+/g)
        ?.map((a) => a.replace(/^"|"$/g, '')) || [];
      await invoke('upsert_mcp_server', {
        server: {
          name: draft.name.trim(),
          server_type: draft.type,
          command: draft.type === 'stdio' ? draft.command : null,
          args: draft.type === 'stdio' ? argsArray : null,
          env: parseEnvText(draft.envText),
          url: draft.type === 'http' ? draft.url : null,
        },
      });
      cancelDraft();
      await load();
      // Refresh the global mcp servers cache used by ContextPack
      loadMcpServers();
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
    setSaving(false);
  };

  const remove = async (name: string) => {
    setSaving(true);
    setError('');
    try {
      await invoke('remove_mcp_server', { name });
      await load();
      loadMcpServers();
    } catch (err) {
      setError(`Delete failed: ${err}`);
    }
    setSaving(false);
    setConfirmDelete(null);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: '#0c0c12',
          border: '1px solid #2a3642',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e2530',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <Server size={18} color="#5aa5a5" strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e8eef5' }}>MCP Servers</div>
            <div style={{ fontSize: 10, color: '#4d5868', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              ~/.claude.json · {servers.length} configured
            </div>
          </div>
          <HoverIconButton onClick={load} disabled={loading || saving} hoverColor="#5aa5a5" title="Reload">
            <RotateCw size={14} strokeWidth={1.5} />
          </HoverIconButton>
          <button
            onClick={startAdd}
            disabled={adding || editing !== null}
            style={{
              padding: '6px 12px',
              borderRadius: 5,
              fontSize: 11,
              background: 'rgba(129,140,248,0.15)',
              border: '1px solid rgba(129,140,248,0.35)',
              color: adding || editing !== null ? '#4d5868' : '#818cf8',
              cursor: adding || editing !== null ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus size={11} strokeWidth={2} /> Add
          </button>
          <CloseButton onClose={onClose} />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '8px 20px',
              background: 'rgba(239,68,68,0.08)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <AlertCircle size={12} strokeWidth={1.5} /> {error}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading && <div style={{ color: '#4d5868', fontSize: 12, textAlign: 'center', padding: 32 }}>Loading...</div>}

          {/* Add form */}
          {adding && <DraftForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancelDraft} saving={saving} isEdit={false} />}

          {/* Server list */}
          {!loading && !adding && servers.length === 0 && (
            <div style={{ color: '#4d5868', fontSize: 12, textAlign: 'center', padding: 32 }}>
              No MCP servers configured. Click "Add" to create one.
            </div>
          )}

          {!loading && servers.map((server) =>
            editing === server.name ? (
              <DraftForm
                key={server.name}
                draft={draft}
                setDraft={setDraft}
                onSave={save}
                onCancel={cancelDraft}
                saving={saving}
                isEdit
              />
            ) : (
              <ServerRow
                key={server.name}
                server={server}
                onEdit={() => startEdit(server)}
                onDelete={() => setConfirmDelete(server.name)}
                disabled={adding || editing !== null || saving}
              />
            ),
          )}
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 380,
              background: '#0c0c12',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eef5', marginBottom: 8 }}>
              Remove MCP server?
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#6b7585',
                marginBottom: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {confirmDelete}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'none',
                  border: '1px solid #3d4856',
                  color: '#8b95a5',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => remove(confirmDelete)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServerRow({
  server,
  onEdit,
  onDelete,
  disabled,
}: {
  server: RawServer;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const envKeys = Object.keys(server.env);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 12,
        marginBottom: 8,
        background: hovered ? '#141821' : '#0a0e14',
        border: `1px solid ${hovered ? '#2a3642' : '#141821'}`,
        borderRadius: 8,
        transition: 'all 120ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eef5', display: 'flex', alignItems: 'center', gap: 8 }}>
            {server.name}
            <span
              style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 3,
                background: server.server_type === 'http' ? 'rgba(129,140,248,0.15)' : 'rgba(90,165,165,0.15)',
                color: server.server_type === 'http' ? '#818cf8' : '#7dbdbd',
                border: `1px solid ${server.server_type === 'http' ? 'rgba(129,140,248,0.3)' : 'rgba(90,165,165,0.3)'}`,
              }}
            >
              {server.server_type || 'stdio'}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#6b7585',
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {server.server_type === 'http'
              ? server.url
              : `${server.command} ${server.args.join(' ')}`}
          </div>
          {envKeys.length > 0 && (
            <div
              style={{
                fontSize: 9,
                color: '#4d5868',
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
                    background: '#1a1f26',
                    border: '1px solid #2a3642',
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

function DraftForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  isEdit,
}: {
  draft: DraftServer;
  setDraft: (d: DraftServer) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
}) {
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    color: '#6b7585',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: '#0a0e14',
    border: '1px solid #2a3642',
    borderRadius: 5,
    color: '#e8eef5',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  };
  return (
    <div
      style={{
        padding: 14,
        marginBottom: 10,
        background: '#141821',
        border: '1px solid #2a3642',
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
                background: draft.type === t ? 'rgba(90,165,165,0.15)' : 'none',
                border: `1px solid ${draft.type === t ? 'rgba(90,165,165,0.4)' : '#2a3642'}`,
                color: draft.type === t ? '#7dbdbd' : '#6b7585',
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
            border: '1px solid #3d4856',
            color: '#8b95a5',
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
            background: draft.name.trim() ? 'rgba(90,165,165,0.15)' : 'rgba(55,65,81,0.3)',
            border: `1px solid ${draft.name.trim() ? 'rgba(90,165,165,0.4)' : '#1e2530'}`,
            color: draft.name.trim() ? '#7dbdbd' : '#4d5868',
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

function HoverIconButton({
  onClick,
  disabled,
  hoverColor,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  hoverColor: string;
  title: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: !disabled && hovered ? `${hoverColor}15` : 'none',
        border: `1px solid ${!disabled && hovered ? `${hoverColor}40` : 'transparent'}`,
        color: disabled ? '#3d4856' : hovered ? hoverColor : '#6b7585',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

function RowIconButton({
  onClick,
  disabled,
  hoverColor,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  hoverColor: string;
  title: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 26,
        height: 26,
        borderRadius: 5,
        background: !disabled && hovered ? `${hoverColor}15` : 'transparent',
        border: `1px solid ${!disabled && hovered ? `${hoverColor}40` : '#1e2530'}`,
        color: disabled ? '#2a3642' : hovered ? hoverColor : '#6b7585',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(239,68,68,0.1)' : 'none',
        border: `1px solid ${hovered ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
        color: hovered ? '#ef4444' : '#4d5868',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}
