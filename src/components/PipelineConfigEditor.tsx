/**
 * In-app editor for .cortx/pipeline.json.
 * Uses Monaco editor with JSON language support.
 * Validates JSON on save and displays errors inline.
 */
import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { X, Save, AlertTriangle, FileCode, RotateCcw } from 'lucide-react';
import { invalidatePipelineConfig } from '../services/pipelineConfig';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

interface Props {
  projectPath: string;
  projectName: string;
  onClose: () => void;
}

const TEMPLATE = `{
  "names": {
    "grill_me": "Grill-me",
    "obsidian_save": "Save",
    "dev_plan": "Dev Plan",
    "implement": "Implement",
    "commit_pr": "PR",
    "review_loop": "Review",
    "done": "Done"
  },
  "models": {
    "grill_me": "Opus",
    "obsidian_save": "Opus",
    "dev_plan": "Opus",
    "implement": "Sonnet",
    "commit_pr": "Sonnet",
    "review_loop": "Opus"
  },
  "hidden": []
}
`;

export function PipelineConfigEditor({ projectPath, projectName, onClose }: Props) {
  const [content, setContent] = useState<string>('');
  const [original, setOriginal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const filePath = `${projectPath}/.cortx/pipeline.json`;

  // Load file content on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: projectPath,
          command: 'cat .cortx/pipeline.json 2>/dev/null',
        });
        const loaded = result.success && result.output.trim() ? result.output : TEMPLATE;
        setContent(loaded);
        setOriginal(loaded);
      } catch (err) {
        console.error('[cortx] Failed to load pipeline config:', err);
        setContent(TEMPLATE);
        setOriginal(TEMPLATE);
      }
      setLoading(false);
    })();
  }, [projectPath]);

  // ESC to close (only if no unsaved changes, otherwise confirm)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (content !== original) {
          if (!confirm('Unsaved changes. Discard and close?')) return;
        }
        onClose();
      }
      // Cmd+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, original, onClose]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    // Use a dark theme consistent with the app
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

  const validateJson = (text: string): string | null => {
    try {
      JSON.parse(text);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  const handleSave = async () => {
    const current = editorRef.current?.getValue() || content;
    const validationError = validateJson(current);
    if (validationError) {
      setError(`Invalid JSON: ${validationError}`);
      return;
    }
    setError('');
    setSaving(true);
    try {
      // Ensure .cortx dir exists + write via base64 to avoid escape issues
      const b64 = btoa(unescape(encodeURIComponent(current)));
      const result = await invoke<{ success: boolean; error: string }>('run_shell_command', {
        cwd: projectPath,
        command: `mkdir -p .cortx && echo '${b64}' | base64 -d > .cortx/pipeline.json`,
      });
      if (!result.success) {
        setError(result.error || 'Failed to save');
        setSaving(false);
        return;
      }
      setOriginal(current);
      setContent(current);
      setSaved(true);
      // Invalidate cache so dashboard picks up new config
      invalidatePipelineConfig(projectPath);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(`Save failed: ${err}`);
    }
    setSaving(false);
  };

  const handleRevert = () => {
    if (content === original) return;
    if (!confirm('Discard unsaved changes?')) return;
    setContent(original);
    editorRef.current?.setValue(original);
    setError('');
  };

  const handleResetToDefault = () => {
    if (!confirm('Replace current content with the default template? This does not save yet.')) return;
    setContent(TEMPLATE);
    editorRef.current?.setValue(TEMPLATE);
    setError('');
  };

  const dirty = content !== original;

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
          width: 760,
          maxWidth: '95vw',
          height: 600,
          maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
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
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <FileCode size={16} color="var(--accent)" strokeWidth={1.5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>
              Pipeline Config {dirty && <span style={{ color: '#eab308', fontSize: 11 }}>● unsaved</span>}
              {saved && <span style={{ color: '#34d399', fontSize: 11 }}>✓ saved</span>}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--fg-faint)',
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={filePath}
            >
              {projectName} · .cortx/pipeline.json
            </div>
          </div>
          <HoverIconButton
            onClick={handleResetToDefault}
            hoverColor="#eab308"
            title="Reset to default template"
          >
            <RotateCcw size={14} strokeWidth={1.5} />
          </HoverIconButton>
          <HoverIconButton onClick={handleRevert} hoverColor="var(--fg-subtle)" title="Revert unsaved changes" disabled={!dirty}>
            <X size={14} strokeWidth={1.5} />
          </HoverIconButton>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{
              padding: '6px 14px',
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
              transition: 'all 120ms ease',
            }}
          >
            <Save size={12} strokeWidth={1.5} />
            {saving ? 'Saving...' : 'Save'}
            <span style={{ fontSize: 9, color: 'var(--fg-faint)', marginLeft: 4 }}>⌘S</span>
          </button>
          <CloseButton onClose={onClose} />
        </div>

        {/* Error bar */}
        {error && (
          <div
            style={{
              padding: '8px 18px',
              background: 'rgba(239,68,68,0.08)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={12} strokeWidth={1.5} />
            {error}
          </div>
        )}

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {loading ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--fg-faint)',
                fontSize: 12,
              }}
            >
              Loading...
            </div>
          ) : (
            <Editor
              value={content}
              language="json"
              theme="cortx-dark"
              onMount={handleMount}
              onChange={(val) => {
                setContent(val || '');
                if (error) setError('');
              }}
              options={{
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                folding: true,
                tabSize: 2,
                insertSpaces: true,
                formatOnPaste: true,
                formatOnType: true,
              }}
            />
          )}
        </div>

        {/* Footer with docs link */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--border-muted)',
            fontSize: 10,
            color: 'var(--fg-faint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            Supported keys: <code style={{ color: 'var(--fg-subtle)' }}>names</code>,{' '}
            <code style={{ color: 'var(--fg-subtle)' }}>models</code>, <code style={{ color: 'var(--fg-subtle)' }}>hidden</code>
          </div>
          <div>ESC to close · ⌘S to save</div>
        </div>
      </div>
    </div>
  );
}

function HoverIconButton({
  onClick,
  hoverColor,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  hoverColor: string;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      title={title}
      style={{
        background: !disabled && hovered ? `${hoverColor}15` : 'none',
        border: `1px solid ${!disabled && hovered ? `${hoverColor}40` : 'transparent'}`,
        color: disabled ? 'var(--fg-dim)' : hovered ? hoverColor : 'var(--fg-subtle)',
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
        color: hovered ? '#ef4444' : 'var(--fg-faint)',
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
