/**
 * Slash command 편집 영역 — 툴바(파일명 + source 뱃지 + dirty dot + Save 버튼)
 * + Monaco markdown editor. SlashCommandBuilder 에서 추출.
 */
import Editor, { type OnMount } from '@monaco-editor/react';
import { Save, FileCode } from 'lucide-react';
import type { SlashCommand } from './api';

interface Props {
  selected: SlashCommand;
  content: string;
  dirty: boolean;
  saving: boolean;
  onContentChange: (next: string) => void;
  onMount: OnMount;
  onSave: () => void;
}

export function EditorPanel({ selected, content, dirty, saving, onContentChange, onMount, onSave }: Props) {
  const sourceColor = selected.source === 'project' ? 'var(--accent-bright)' : '#818cf8';
  const sourceBg = selected.source === 'project' ? 'var(--accent-bg)' : 'rgba(129,140,248,0.15)';
  const sourceBorder = selected.source === 'project' ? 'var(--accent-border)' : 'rgba(129,140,248,0.3)';

  return (
    <>
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
                background: sourceBg,
                color: sourceColor,
                border: `1px solid ${sourceBorder}`,
              }}
            >
              {selected.source}
            </span>
          </div>
        </div>
        <button
          onClick={onSave}
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
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          value={content}
          language="markdown"
          theme="cortx-dark"
          onMount={onMount}
          onChange={(val) => onContentChange(val || '')}
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
  );
}
