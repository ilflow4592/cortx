/**
 * In-app editor for .cortx/pipeline.json.
 * Uses Monaco editor with JSON language support.
 * Validates JSON on save and displays errors inline.
 */
import { useEffect, useRef, useState } from 'react';
import { type OnMount } from '@monaco-editor/react';
import { invalidatePipelineConfig } from '../services/pipelineConfig';
import { resolveThemeColors } from '../utils/monacoTheme';
import { type PipelineConfigEditorProps, TEMPLATE, validateJson } from './pipeline-config/types';
import { readPipelineConfig, writePipelineConfig } from './pipeline-config/api';
import { YamlEditor } from './pipeline-config/YamlEditor';
import { ConfigPreview, ConfigFooter } from './pipeline-config/ConfigPreview';
import { ConfigHeader } from './pipeline-config/ConfigHeader';

export function PipelineConfigEditor({ projectPath, projectName, onClose }: PipelineConfigEditorProps) {
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
        const result = await readPipelineConfig(projectPath);
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
      colors: resolveThemeColors({
        'editor.background': 'var(--bg-surface)',
        'editor.foreground': 'var(--fg-secondary)',
        'editorLineNumber.foreground': 'var(--fg-dim)',
        'editorCursor.foreground': 'var(--accent-bright)',
        'editor.selectionBackground': 'var(--border-strong)',
        'editor.lineHighlightBackground': 'var(--bg-surface-hover)',
      }),
    });
    monaco.editor.setTheme('cortx-dark');
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
      const result = await writePipelineConfig(projectPath, current);
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
        aria-label="Close pipeline config editor"
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
          position: 'relative',
          zIndex: 1,
        }}
      >
        <ConfigHeader
          projectName={projectName}
          filePath={filePath}
          dirty={dirty}
          saving={saving}
          saved={saved}
          onSave={handleSave}
          onRevert={handleRevert}
          onResetToDefault={handleResetToDefault}
          onClose={onClose}
        />

        <ConfigPreview error={error} />

        <YamlEditor
          value={content}
          loading={loading}
          onMount={handleMount}
          onChange={(val) => {
            setContent(val);
            if (error) setError('');
          }}
        />

        <ConfigFooter />
      </div>
    </div>
  );
}
