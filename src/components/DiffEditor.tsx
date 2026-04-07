import { DiffEditor as MonacoDiffEditor } from '@monaco-editor/react';
import { ArrowLeft } from 'lucide-react';

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
        borderBottom: '1px solid #2a3642', flexShrink: 0, background: '#0f1419',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ArrowLeft size={16} strokeWidth={1.5} /></button>
        <span style={{
          fontSize: 11, color: '#8b95a5', fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {relativePath}
        </span>
        <span style={{ fontSize: 9, color: '#6b7585' }}>Diff</span>
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
            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
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
                'editor.background': '#0f1419',
                'editor.foreground': '#c0c8d4',
                'editorLineNumber.foreground': '#3d4856',
                'editorLineNumber.activeForeground': '#6b7585',
                'editor.lineHighlightBackground': '#1e2530',
                'editor.lineHighlightBorder': '#00000000',
                'editor.selectionBackground': 'rgba(90,165,165,0.15)',
                'editorCursor.foreground': '#5aa5a5',
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
