/**
 * Slash Command Builder — GUI for creating/editing/deleting .claude/commands/*.md
 * files for both project-local and global scopes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Plus, Save, RotateCw, AlertCircle, Slash, FileCode } from 'lucide-react';
import {
  listSlashCommands,
  readSlashCommand,
  writeSlashCommand,
  deleteSlashCommand,
  type SlashCommand,
  type Source,
} from './slash-builder/api';
import { CategoryList } from './slash-builder/CommandList';
import { CreateForm } from './slash-builder/CreateForm';
import { HoverIconButton, CloseButton } from './slash-builder/buttons';

interface Props {
  projectCwd: string;
  onClose: () => void;
}

const NEW_TEMPLATE = `# {{title}}

Brief description of what this command does.

## Instructions

When invoked, do the following:

1. First step
2. Second step
3. Final step

Use $ARGUMENTS for any arguments passed to the command.
`;

export function SlashCommandBuilder({ projectCwd, onClose }: Props) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SlashCommand | null>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SlashCommand | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState<Source>('project');
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listSlashCommands(projectCwd);
      // builtin 커맨드는 Claude CLI가 직접 처리 — 편집 불가
      const editable = list.filter((c) => c.source !== 'builtin');
      setCommands(editable);
    } catch (err) {
      setError(`Failed to load: ${err}`);
    }
    setLoading(false);
  }, [projectCwd]);

  useEffect(() => {
    load();
  }, [load]);

  // Load selected command's content
  useEffect(() => {
    if (!selected) {
      setContent('');
      setOriginal('');
      return;
    }
    (async () => {
      try {
        const text = await readSlashCommand(selected.name, selected.source, projectCwd);
        setContent(text);
        setOriginal(text);
      } catch (err) {
        setError(`Failed to read: ${err}`);
      }
    })();
  }, [selected, projectCwd]);

  const handleSave = async () => {
    if (!selected) return;
    const current = editorRef.current?.getValue() || content;
    setSaving(true);
    setError('');
    try {
      await writeSlashCommand(selected.name, selected.source as Source, current, projectCwd);
      setOriginal(current);
      setContent(current);
      await load();
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
    setSaving(false);
  };

  // ESC + Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmDelete) {
          setConfirmDelete(null);
        } else if (creating) {
          setCreating(false);
        } else if (selected && content !== original) {
          if (confirm('Unsaved changes. Discard?')) setSelected(null);
        } else if (selected) {
          setSelected(null);
        } else {
          onClose();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && selected) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDelete, creating, selected, content, original, onClose]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('cortx-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': 'var(--bg-surface)',
        'editor.foreground': 'var(--fg-secondary)',
        'editorLineNumber.foreground': 'var(--fg-dim)',
        'editorCursor.foreground': 'var(--accent-bright)',
        'editor.selectionBackground': 'var(--border-strong)',
        'editor.lineHighlightBackground': 'var(--bg-surface-hover)',
      },
    });
    monaco.editor.setTheme('cortx-dark');
  };

  const handleDelete = async (cmd: SlashCommand) => {
    setSaving(true);
    setError('');
    try {
      await deleteSlashCommand(cmd.name, cmd.source, projectCwd);
      if (selected?.name === cmd.name) {
        setSelected(null);
      }
      await load();
    } catch (err) {
      setError(`Delete failed: ${err}`);
    }
    setSaving(false);
    setConfirmDelete(null);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!/^[a-zA-Z0-9:_-]+$/.test(name)) {
      setError('Name must contain only letters, numbers, colon, hyphen, underscore');
      return;
    }
    if (commands.some((c) => c.name === name && c.source === newSource)) {
      setError(`${newSource} command "${name}" already exists`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const initialContent = NEW_TEMPLATE.replace('{{title}}', name);
      await writeSlashCommand(name, newSource, initialContent, projectCwd);
      await load();
      setSelected({ name, source: newSource, description: '' });
      setCreating(false);
      setNewName('');
    } catch (err) {
      setError(`Create failed: ${err}`);
    }
    setSaving(false);
  };

  const dirty = selected && content !== original;
  const projectCommands = commands.filter((c) => c.source === 'project');
  const userCommands = commands.filter((c) => c.source === 'user');

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
        aria-label="Close slash command builder"
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
        style={{
          width: 960,
          maxWidth: '95vw',
          height: 640,
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
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <Slash size={16} color="var(--accent)" strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' }}>Slash Command Builder</div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--fg-faint)',
                marginTop: 2,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {projectCommands.length} project · {userCommands.length} global
            </div>
          </div>
          <HoverIconButton onClick={load} disabled={loading || saving} hoverColor="var(--accent)" title="Reload">
            <RotateCw size={14} strokeWidth={1.5} />
          </HoverIconButton>
          <CloseButton onClose={onClose} />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '8px 18px',
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

        {/* Body: 2-column layout */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: command list */}
          <div
            style={{
              width: 260,
              borderRight: '1px solid var(--border-muted)',
              overflowY: 'auto',
              padding: 10,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => {
                setCreating(true);
                setSelected(null);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                background: creating ? 'rgba(129,140,248,0.15)' : 'rgba(129,140,248,0.08)',
                border: '1px solid rgba(129,140,248,0.3)',
                color: '#818cf8',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 10,
              }}
            >
              <Plus size={11} strokeWidth={2} /> New Command
            </button>

            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-faint)', fontSize: 11 }}>Loading...</div>
            ) : (
              <>
                <CategoryList
                  title="Project"
                  description={projectCwd || '(no project selected)'}
                  commands={projectCommands}
                  selected={selected}
                  onSelect={(cmd) => {
                    setCreating(false);
                    setSelected(cmd);
                  }}
                  onDelete={setConfirmDelete}
                  disabled={saving || !projectCwd}
                />
                <CategoryList
                  title="Global"
                  description="~/.claude/commands"
                  commands={userCommands}
                  selected={selected}
                  onSelect={(cmd) => {
                    setCreating(false);
                    setSelected(cmd);
                  }}
                  onDelete={setConfirmDelete}
                  disabled={saving}
                />
              </>
            )}
          </div>

          {/* Right: editor or create form */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {creating ? (
              <CreateForm
                name={newName}
                setName={setNewName}
                source={newSource}
                setSource={setNewSource}
                projectCwd={projectCwd}
                onCreate={handleCreate}
                onCancel={() => {
                  setCreating(false);
                  setNewName('');
                  setError('');
                }}
                saving={saving}
              />
            ) : selected ? (
              <>
                {/* Editor toolbar */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <FileCode size={13} color="var(--accent)" strokeWidth={1.5} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--fg-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      /{selected.name}
                      {dirty && <span style={{ color: '#eab308', fontSize: 10 }}>●</span>}
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: selected.source === 'project' ? 'var(--accent-bg)' : 'rgba(129,140,248,0.15)',
                          color: selected.source === 'project' ? 'var(--accent-bright)' : '#818cf8',
                          border: `1px solid ${selected.source === 'project' ? 'var(--accent-border)' : 'rgba(129,140,248,0.3)'}`,
                        }}
                      >
                        {selected.source}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 5,
                      fontSize: 11,
                      fontWeight: 500,
                      background: dirty ? 'var(--accent-bg)' : 'rgba(55,65,81,0.3)',
                      border: `1px solid ${dirty ? 'var(--accent-border)' : 'var(--border-muted)'}`,
                      color: dirty ? 'var(--accent-bright)' : 'var(--fg-faint)',
                      cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Save size={11} strokeWidth={1.5} />
                    {saving ? 'Saving...' : 'Save'}
                    <span style={{ fontSize: 9, color: 'var(--fg-faint)', marginLeft: 2 }}>⌘S</span>
                  </button>
                </div>
                {/* Monaco editor */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <Editor
                    value={content}
                    language="markdown"
                    theme="cortx-dark"
                    onMount={handleMount}
                    onChange={(val) => setContent(val || '')}
                    options={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      tabSize: 2,
                      insertSpaces: true,
                    }}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--fg-faint)',
                  fontSize: 12,
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <FileCode size={32} strokeWidth={1} color="var(--border-strong)" />
                Select a command or create a new one
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm delete */}
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
              Delete command?
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--fg-subtle)',
                marginBottom: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              /{confirmDelete.name} ({confirmDelete.source})
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
                onClick={() => handleDelete(confirmDelete)}
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
