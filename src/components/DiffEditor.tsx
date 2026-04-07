import { DiffEditor as MonacoDiffEditor } from '@monaco-editor/react';

const EXT_LANG: Record<string, string> = {
  java: 'java', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', xml: 'xml', html: 'html',
  css: 'css', sql: 'sql', sh: 'shell', py: 'python', kt: 'kotlin', gradle: 'groovy',
  properties: 'ini', toml: 'ini',
};

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'plaintext';
}

interface Props {
  filePath: string;
  original: string;
  modified: string;
  onBack: () => void;
  cwd: string;
}

export function DiffEditorView({ filePath, original, modified, onBack, cwd }: Props) {
  const relativePath = filePath.startsWith(cwd + '/') ? filePath.slice(cwd.length + 1) : filePath;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid #27272f', flexShrink: 0, background: '#0c0c12',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 14 }}>←</button>
        <span style={{
          fontSize: 11, color: '#8b8b95', fontFamily: "'JetBrains Mono', monospace",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {relativePath}
        </span>
        <span style={{ fontSize: 9, color: '#71717a' }}>Diff</span>
      </div>
      <div style={{ flex: 1 }}>
        <MonacoDiffEditor
          original={original}
          modified={modified}
          language={getLanguage(filePath)}
          theme="cortx-dark"
          options={{
            readOnly: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            renderSideBySide: false,
            padding: { top: 8 },
            wordWrap: 'off',
            smoothScrolling: true,
          }}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme('cortx-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#0c0c12',
                'editor.foreground': '#b4b4bc',
                'editorLineNumber.foreground': '#3f3f46',
                'editorLineNumber.activeForeground': '#71717a',
                'editor.lineHighlightBackground': '#ffffff06',
                'editor.selectionBackground': '#6366f140',
                'editorCursor.foreground': '#818cf8',
                'diffEditor.insertedTextBackground': '#34d39920',
                'diffEditor.removedTextBackground': '#ef444420',
              },
            });
          }}
        />
      </div>
    </div>
  );
}
