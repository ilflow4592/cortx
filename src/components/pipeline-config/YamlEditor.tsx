import Editor, { type OnMount } from '@monaco-editor/react';

interface YamlEditorProps {
  value: string;
  loading: boolean;
  onMount: OnMount;
  onChange: (v: string) => void;
}

export function YamlEditor({ value, loading, onMount, onChange }: YamlEditorProps) {
  return (
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
          value={value}
          language="json"
          theme="cortx-dark"
          onMount={onMount}
          onChange={(val) => onChange(val || '')}
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
  );
}
