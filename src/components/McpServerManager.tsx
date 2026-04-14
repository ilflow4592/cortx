/**
 * MCP Server Manager — add, edit, and remove MCP servers without editing
 * ~/.claude.json by hand.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Server, RotateCw, AlertCircle } from 'lucide-react';
import { useMcpStore } from '../stores/mcpStore';
import type { RawServer, DraftServer } from './mcp-manager/types';
import { listMcpServers, removeMcpServer, upsertMcpServer, stringifyEnv, emptyDraft } from './mcp-manager/api';
import { ServerRow } from './mcp-manager/ServerRow';
import { DraftForm } from './mcp-manager/DraftForm';
import { HoverIconButton, CloseButton } from './mcp-manager/buttons';

interface Props {
  onClose: () => void;
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
  const loadMcpServers = useMcpStore((s) => s.load);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listMcpServers();
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
      await upsertMcpServer(draft);
      cancelDraft();
      await load();
      loadMcpServers(); // refresh ContextPack의 전역 mcp 캐시
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
    setSaving(false);
  };

  const remove = async (name: string) => {
    setSaving(true);
    setError('');
    try {
      await removeMcpServer(name);
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Close MCP server manager"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'default',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="MCP Server Manager"
        style={{
          width: 720,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <Server size={18} color="var(--accent)" strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' }}>MCP Servers</div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--fg-faint)',
                marginTop: 2,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ~/.claude.json · {servers.length} configured
            </div>
          </div>
          <HoverIconButton onClick={load} disabled={loading || saving} hoverColor="var(--accent)" title="Reload">
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
              color: adding || editing !== null ? 'var(--fg-faint)' : '#818cf8',
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
          {loading && (
            <div style={{ color: 'var(--fg-faint)', fontSize: 12, textAlign: 'center', padding: 32 }}>Loading...</div>
          )}

          {adding && (
            <DraftForm
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={cancelDraft}
              saving={saving}
              isEdit={false}
            />
          )}

          {!loading && !adding && servers.length === 0 && (
            <div style={{ color: 'var(--fg-faint)', fontSize: 12, textAlign: 'center', padding: 32 }}>
              No MCP servers configured. Click &quot;Add&quot; to create one.
            </div>
          )}

          {!loading &&
            servers.map((server) =>
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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            aria-label="Cancel delete"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(null);
            }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              border: 'none',
              padding: 0,
              cursor: 'default',
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: 380,
              background: 'var(--bg-panel)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: 18,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 8 }}>
              Remove MCP server?
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--fg-subtle)',
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
                  border: '1px solid var(--fg-dim)',
                  color: 'var(--fg-muted)',
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
