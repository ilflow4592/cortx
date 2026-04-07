import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft } from 'lucide-react';

const EXT_LANG: Record<string, string> = {
  java: 'java', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', xml: 'xml', html: 'html',
  css: 'css', scss: 'scss', sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', kt: 'kotlin', gradle: 'groovy',
  groovy: 'groovy', properties: 'ini', toml: 'ini', cfg: 'ini', conf: 'ini',
  dockerfile: 'dockerfile', tf: 'hcl',
};

function getLanguage(filePath: string): string {
  const name = filePath.split('/').pop() || '';
  if (name === 'Dockerfile') return 'dockerfile';
  if (name === 'Makefile') return 'makefile';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'plaintext';
}

interface CodeEditorProps {
  filePath: string;
  content: string;
  readOnly?: boolean;
  onBack: () => void;
  cwd: string;
}

export function CodeEditor({ filePath, content, readOnly = false, onBack, cwd }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const modified = useRef(false);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeModelContent(() => {
      modified.current = true;
    });
    // Cmd+S to save
    editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [2048 + 49], // Cmd+S
      run: () => saveFile(),
    });
  };

  const saveFile = useCallback(async () => {
    if (!editorRef.current || readOnly) return;
    const value = editorRef.current.getValue();
    try {
      const escaped = filePath.replace(/'/g, "'\\''");
      // Write via base64 to avoid shell escape issues
      const b64 = btoa(unescape(encodeURIComponent(value)));
      await invoke('run_shell_command', {
        cwd,
        command: `echo '${b64}' | base64 -d > '${escaped}'`,
      });
      modified.current = false;
    } catch { /* skip */ }
  }, [filePath, cwd, readOnly]);

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
        {!readOnly && (
          <button
            onClick={saveFile}
            style={{
              background: '#242d38', border: '1px solid #2a3642', borderRadius: 4,
              color: '#c0c8d4', cursor: 'pointer', fontSize: 10, padding: '2px 8px', fontFamily: 'inherit',
            }}
          >Save</button>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <Editor
          defaultValue={content}
          language={getLanguage(filePath)}
          theme="cortx-dark"
          onMount={handleMount}
          options={{
            readOnly,
            fontSize: 13,
            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            renderLineHighlight: 'line',
            padding: { top: 8 },
            wordWrap: 'off',
            tabSize: 4,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            bracketPairColorization: { enabled: true },
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
                'editorIndentGuide.background': '#2a3642',
              },
            });
          }}
        />
      </div>
    </div>
  );
}
