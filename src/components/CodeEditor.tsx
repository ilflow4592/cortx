import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { ArrowLeft } from 'lucide-react';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

const EXT_LANG: Record<string, string> = {
  java: 'java',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  kt: 'kotlin',
  gradle: 'groovy',
  groovy: 'groovy',
  properties: 'ini',
  toml: 'ini',
  cfg: 'ini',
  conf: 'ini',
  dockerfile: 'dockerfile',
  tf: 'hcl',
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- editorRef.current is a ref, not a dependency
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
    } catch {
      /* skip */
    }
  }, [filePath, cwd, readOnly]);

  const relativePath = filePath.startsWith(cwd + '/') ? filePath.slice(cwd.length + 1) : filePath;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-strong)',
          flexShrink: 0,
          background: 'var(--bg-app)',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-subtle)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <span
          style={{
            fontSize: 11,
            color: 'var(--fg-muted)',
            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {relativePath}
        </span>
        {!readOnly && (
          <button
            onClick={saveFile}
            style={{
              background: 'var(--bg-surface-hover)',
              border: '1px solid var(--border-strong)',
              borderRadius: 4,
              color: 'var(--fg-secondary)',
              cursor: 'pointer',
              fontSize: 10,
              padding: '2px 8px',
              fontFamily: 'inherit',
            }}
          >
            Save
          </button>
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
              rules: [
                // Keywords (public, void, new, for, if, return, this, import, package)
                { token: 'keyword', foreground: 'cc7832' },
                { token: 'keyword.control', foreground: 'cc7832' },
                // Types / Classes (Member, Random, StringBuilder, LocalDateTime)
                { token: 'type', foreground: 'a9b7c6' },
                { token: 'type.identifier', foreground: 'ffc66d' },
                { token: 'class', foreground: 'ffc66d' },
                // Strings
                { token: 'string', foreground: '6a8759' },
                { token: 'string.key.json', foreground: 'cc7832' },
                { token: 'string.value.json', foreground: '6a8759' },
                // Numbers
                { token: 'number', foreground: '6897bb' },
                { token: 'number.hex', foreground: '6897bb' },
                // Comments
                { token: 'comment', foreground: '808080', fontStyle: 'italic' },
                { token: 'comment.doc', foreground: '629755', fontStyle: 'italic' },
                // Annotations (@Override, @Bean)
                { token: 'annotation', foreground: 'bbb529' },
                { token: 'tag', foreground: 'e8bf6a' },
                // Variables / identifiers
                { token: 'variable', foreground: 'a9b7c6' },
                { token: 'identifier', foreground: 'a9b7c6' },
                // Functions / methods (.getForwarder, .format, .append)
                { token: 'function', foreground: 'ffc66d' },
                { token: 'method', foreground: 'ffc66d' },
                // Operators & delimiters
                { token: 'operator', foreground: 'a9b7c6' },
                { token: 'delimiter', foreground: 'a9b7c6' },
                { token: 'delimiter.bracket', foreground: 'a9b7c6' },
                // Constants
                { token: 'constant', foreground: '9876aa' },
                // Regex
                { token: 'regexp', foreground: '6a8759' },
              ],
              colors: {
                'editor.background': 'var(--bg-app)',
                'editor.foreground': 'var(--fg-secondary)',
                'editorLineNumber.foreground': 'var(--fg-dim)',
                'editorLineNumber.activeForeground': 'var(--fg-subtle)',
                'editor.lineHighlightBackground': 'var(--border-muted)',
                'editor.lineHighlightBorder': '#00000000',
                'editor.selectionBackground': 'var(--accent-bg)',
                'editorCursor.foreground': 'var(--accent)',
                'editorIndentGuide.background': 'var(--border-strong)',
              },
            });
          }}
        />
      </div>
    </div>
  );
}
