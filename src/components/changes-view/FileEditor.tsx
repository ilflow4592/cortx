import Editor from '@monaco-editor/react';
import { getLanguageFromPath } from './lang';
import { resolveThemeColors } from '../../utils/monacoTheme';

interface FileEditorProps {
  filePath: string;
  content: string;
}

export function FileEditor({ filePath, content }: FileEditorProps) {
  return (
    <div style={{ flex: 1 }}>
      <Editor
        key={filePath}
        defaultValue={content}
        language={getLanguageFromPath(filePath)}
        theme="cortx-dark"
        options={{
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
          if (!monaco.editor.getModel(null as unknown as Parameters<typeof monaco.editor.getModel>[0])) {
            monaco.editor.defineTheme('cortx-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [
                { token: 'keyword', foreground: 'cc7832' },
                { token: 'type', foreground: 'a9b7c6' },
                { token: 'type.identifier', foreground: 'ffc66d' },
                { token: 'class', foreground: 'ffc66d' },
                { token: 'string', foreground: '6a8759' },
                { token: 'number', foreground: '6897bb' },
                { token: 'comment', foreground: '808080', fontStyle: 'italic' },
                { token: 'annotation', foreground: 'bbb529' },
                { token: 'function', foreground: 'ffc66d' },
                { token: 'operator', foreground: 'a9b7c6' },
                { token: 'constant', foreground: '9876aa' },
              ],
              colors: resolveThemeColors({
                'editor.background': 'var(--bg-app)',
                'editor.foreground': 'var(--fg-secondary)',
                'editorLineNumber.foreground': 'var(--fg-dim)',
                'editorLineNumber.activeForeground': 'var(--fg-subtle)',
                'editor.lineHighlightBackground': 'var(--border-muted)',
                'editor.lineHighlightBorder': '#00000000',
                'editor.selectionBackground': 'var(--accent-bg)',
                'editorCursor.foreground': 'var(--accent)',
                'editorIndentGuide.background': 'var(--border-strong)',
              }),
            });
          }
        }}
      />
    </div>
  );
}
