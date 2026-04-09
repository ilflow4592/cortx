import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor from '@monaco-editor/react';
import { ArrowLeft, RotateCw, Undo2, Trash2 } from 'lucide-react';

const EXT_LANG: Record<string, string> = {
  java: 'java', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', xml: 'xml', html: 'html',
  css: 'css', sql: 'sql', sh: 'shell', py: 'python', kt: 'kotlin', gradle: 'groovy',
  properties: 'ini', toml: 'ini',
};
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'plaintext';
}

interface ChangedFile {
  path: string;
  status: string; // M, A, D, R, ?
}

interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'del' | 'ctx'; num: number; content: string }[];
}


export function ChangesView({ cwd, branchName, onOpenFile }: { cwd: string; branchName: string; onOpenFile?: (path: string) => void }) {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState<{ type: 'file' | 'all'; path?: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'edit'>('diff');
  const [loading, setLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback(async (command: string): Promise<string> => {
    const result = await invoke<{ success: boolean; output: string }>('run_shell_command', { cwd, command });
    return result.success ? result.output : '';
  }, [cwd]);

  const loadChanges = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const branchDiff = await run(`git diff --name-status origin/develop...HEAD 2>/dev/null || git diff --name-status HEAD~5 2>/dev/null`);
      const staged = await run(`git diff --cached --name-status 2>/dev/null`);
      const unstaged = await run(`git diff --name-status 2>/dev/null`);

      const fileMap = new Map<string, string>();
      for (const line of [...branchDiff.split('\n'), ...unstaged.split('\n'), ...staged.split('\n')]) {
        const match = line.match(/^([MADR?]+)\t(.+)/);
        if (match) fileMap.set(match[2], match[1]);
      }
      setChangedFiles([...fileMap.entries()].map(([path, status]) => ({ path, status })));
    } catch { /* skip */ }
    setLoading(false);
  }, [run]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not cascading
    if (cwd) loadChanges(true);
    pollRef.current = setInterval(() => { if (cwd) loadChanges(false); }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [cwd, branchName, loadChanges]);

  const requestDiscardFile = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDiscard({ type: 'file', path: filePath });
  };

  const requestDiscardAll = () => {
    setConfirmDiscard({ type: 'all' });
  };

  const executeDiscard = async () => {
    if (!confirmDiscard) return;
    if (confirmDiscard.type === 'file' && confirmDiscard.path) {
      const escaped = confirmDiscard.path.replace(/'/g, "'\\''");
      // Try unstaged first, then revert committed changes
      await run(`git checkout -- '${escaped}' 2>/dev/null`);
      await run(`git checkout origin/develop -- '${escaped}' 2>/dev/null`);
    } else if (confirmDiscard.type === 'all') {
      // Reset all: unstaged + staged + committed (back to develop base)
      await run(`git checkout -- . 2>/dev/null`);
      await run(`git clean -fd 2>/dev/null`);
      await run(`git reset origin/develop 2>/dev/null || git reset HEAD~1 2>/dev/null`);
      await run(`git checkout -- . 2>/dev/null`);
    }
    setConfirmDiscard(null);
    await loadChanges(true);
  };

  const selectFile = async (file: string, mode: 'diff' | 'edit' = 'diff') => {
    setSelectedFile(file);
    setViewMode(mode);

    if (mode === 'diff') {
      const escaped = file.replace(/'/g, "'\\''");
      // Try multiple diff strategies: branch diff → staged → unstaged → HEAD~1
      let diff = await run(`git diff origin/develop...HEAD -- '${escaped}' 2>/dev/null`);
      if (!diff.trim()) diff = await run(`git diff --cached -- '${escaped}' 2>/dev/null`);
      if (!diff.trim()) diff = await run(`git diff -- '${escaped}' 2>/dev/null`);
      if (!diff.trim()) diff = await run(`git diff HEAD~1 -- '${escaped}' 2>/dev/null`);
      setDiffHunks(parseDiff(diff));
      setFileContent(null);
    } else {
      const content = await run(`head -500 '${file}'`);
      setFileContent(content);
      setDiffHunks([]);
    }
  };

  const filteredFiles = changedFiles;

  if (selectedFile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #2a3642', flexShrink: 0 }}>
          <button onClick={() => setSelectedFile(null)} style={{ background: 'none', border: 'none', color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ArrowLeft size={16} strokeWidth={1.5} /></button>
          <span style={{ fontSize: 11, color: '#8b95a5', fontFamily: "'Fira Code', 'JetBrains Mono', monospace", flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedFile}
          </span>
          {onOpenFile && (
            <button
              onClick={() => onOpenFile(`${cwd}/${selectedFile}`)}
              style={{ background: '#242d38', border: '1px solid #2a3642', borderRadius: 4, color: '#c0c8d4', cursor: 'pointer', fontSize: 10, padding: '2px 8px', fontFamily: 'inherit' }}
            >Open</button>
          )}
        </div>

        {/* Diff view */}
        {viewMode === 'diff' && (
          <div style={{ flex: 1, overflowY: 'auto', fontFamily: "'Fira Code', 'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
            {diffHunks.length === 0 && <div style={{ padding: 16, color: '#6b7585', fontSize: 11 }}>No diff available</div>}
            {diffHunks.map((hunk, hi) => (
              <div key={hi}>
                <div style={{ padding: '4px 16px', color: '#7dbdbd', background: 'rgba(90,165,165,0.04)', fontSize: 11 }}>{hunk.header}</div>
                {hunk.lines.map((line, li) => (
                  <div key={li} style={{
                    display: 'flex', minHeight: 20,
                    background: line.type === 'add' ? 'rgba(52,211,153,0.06)' : line.type === 'del' ? 'rgba(239,68,68,0.06)' : 'transparent',
                  }}>
                    <span style={{ width: 48, textAlign: 'right', paddingRight: 12, color: '#3d4856', flexShrink: 0, userSelect: 'none' }}>{line.num || ''}</span>
                    <span style={{
                      color: line.type === 'add' ? '#34d399' : line.type === 'del' ? '#ef4444' : '#6b7585',
                      whiteSpace: 'pre', overflow: 'hidden',
                    }}>{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.content}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Code view — Monaco editor */}
        {viewMode === 'edit' && fileContent !== null && (
          <div style={{ flex: 1 }}>
            <Editor
              key={selectedFile}
              defaultValue={fileContent}
              language={getLanguageFromPath(selectedFile)}
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
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderBottom: '1px solid #2a3642', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#8b95a5', fontWeight: 500 }}>
          Changes {changedFiles.length > 0 && <span style={{ color: '#5aa5a5' }}>{changedFiles.length}</span>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {changedFiles.length > 0 && (
            <button onClick={requestDiscardAll} title="Discard all changes" style={{ background: 'none', border: 'none', color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          )}
          <button onClick={() => loadChanges(true)} title="Refresh" style={{ background: 'none', border: 'none', color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <RotateCw size={14} strokeWidth={1.5} />
          </button>
        </span>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 16, fontSize: 11, color: '#6b7585' }}>Loading...</div>}
        {filteredFiles.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: '#6b7585' }}>
            No changes
          </div>
        )}
        {filteredFiles.map((file) => {
          const statusColor = file.status === 'M' ? '#eab308' : file.status === 'A' ? '#34d399' : file.status === 'D' ? '#ef4444' : '#6b7585';
          return (
            <button
              key={file.path}
              onClick={() => onOpenFile ? onOpenFile(`${cwd}/${file.path}`) : selectFile(file.path, 'diff')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '5px 16px', background: 'none', border: 'none', borderBottom: '1px solid #ffffff06',
                color: '#c0c8d4', cursor: 'pointer', fontFamily: "'Fira Code', 'JetBrains Mono', monospace", fontSize: 11, textAlign: 'left',
              }}
            >
              {file.status && (
                <span style={{ color: statusColor, fontSize: 10, fontWeight: 600, width: 14, flexShrink: 0 }}>{file.status}</span>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file.path}</span>
              {file.status && (
                <span
                  onClick={(e) => requestDiscardFile(file.path, e)}
                  title="Discard changes"
                  style={{ color: '#6b7585', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 2px' }}
                >
                  <Undo2 size={12} strokeWidth={1.5} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Inline confirm modal */}
      {confirmDiscard && (
        <div style={{
          padding: '10px 14px', borderTop: '1px solid #2a3642', flexShrink: 0,
          background: '#1a1f26', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: '#c0c8d4' }}>
            {confirmDiscard.type === 'all'
              ? `Discard all ${changedFiles.length} changes?`
              : `Discard ${confirmDiscard.path?.split('/').pop()}?`}
          </span>
          <span style={{ fontSize: 10, color: '#6b7585' }}>This cannot be undone.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={executeDiscard}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Discard</button>
            <button
              onClick={() => setConfirmDiscard(null)}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 10,
                background: 'none', border: '1px solid #3d4856',
                color: '#8b95a5', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseDiff(output: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let lineNum = 0;

  for (const line of output.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      lineNum = match ? parseInt(match[1]) - 1 : 0;
      current = { header: line, lines: [] };
      hunks.push(current);
    } else if (current) {
      if (line.startsWith('+')) {
        lineNum++;
        current.lines.push({ type: 'add', num: lineNum, content: line.slice(1) });
      } else if (line.startsWith('-')) {
        current.lines.push({ type: 'del', num: 0, content: line.slice(1) });
      } else if (line.startsWith(' ') || line === '') {
        lineNum++;
        current.lines.push({ type: 'ctx', num: lineNum, content: line.slice(1) || '' });
      }
    }
  }
  return hunks;
}
