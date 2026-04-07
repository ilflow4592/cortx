import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';

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
        borderBottom: '1px solid #27272f', flexShrink: 0, background: '#0c0c12',
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 14 }}>←</button>
        <span style={{
          fontSize: 11, color: '#8b8b95', fontFamily: "'JetBrains Mono', monospace",
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {relativePath}
        </span>
        {!readOnly && (
          <button
            onClick={saveFile}
            style={{
              background: '#232330', border: '1px solid #2d2d3a', borderRadius: 4,
              color: '#b4b4bc', cursor: 'pointer', fontSize: 10, padding: '2px 8px', fontFamily: 'inherit',
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
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
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
                'editor.background': '#0c0c12',
                'editor.foreground': '#b4b4bc',
                'editorLineNumber.foreground': '#3f3f46',
                'editorLineNumber.activeForeground': '#71717a',
                'editor.lineHighlightBackground': '#ffffff06',
                'editor.selectionBackground': '#6366f140',
                'editorCursor.foreground': '#818cf8',
                'editorIndentGuide.background': '#1e1e26',
              },
            });
          }}
        />
      </div>
    </div>
  );
}
