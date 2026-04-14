import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ChangedFile, DiffHunk } from './changes-view/types';
import { parseDiff } from './changes-view/parse';
import { runShell, fetchChangedFiles, fetchFileDiff } from './changes-view/api';
import { FileRow } from './changes-view/FileRow';
import { DiffHunkView } from './changes-view/DiffHunkView';
import { FileEditor } from './changes-view/FileEditor';
import { ToolBar } from './changes-view/ToolBar';

export function ChangesView({
  cwd,
  branchName,
  onOpenFile,
}: {
  cwd: string;
  branchName: string;
  onOpenFile?: (path: string) => void;
}) {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState<{ type: 'file' | 'all'; path?: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'edit'>('diff');
  const [loading, setLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback((command: string) => runShell(cwd, command), [cwd]);

  const loadChanges = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const files = await fetchChangedFiles(cwd);
        setChangedFiles(files);
      } catch {
        /* skip */
      }
      setLoading(false);
    },
    [cwd],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not cascading
    if (cwd) loadChanges(true);
    pollRef.current = setInterval(() => {
      if (cwd) loadChanges(false);
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
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
      const diff = await fetchFileDiff(cwd, file);
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-strong)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSelectedFile(null)}
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
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedFile}
          </span>
          {onOpenFile && (
            <button
              onClick={() => onOpenFile(`${cwd}/${selectedFile}`)}
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
              Open
            </button>
          )}
        </div>

        {/* Diff view */}
        {viewMode === 'diff' && <DiffHunkView hunks={diffHunks} />}

        {/* Code view — Monaco editor */}
        {viewMode === 'edit' && fileContent !== null && (
          <FileEditor filePath={selectedFile} content={fileContent} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ToolBar count={changedFiles.length} onDiscardAll={requestDiscardAll} onRefresh={() => loadChanges(true)} />

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-subtle)' }}>Loading...</div>}
        {filteredFiles.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: 'var(--fg-subtle)' }}>No changes</div>
        )}
        {filteredFiles.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            onSelect={() => (onOpenFile ? onOpenFile(`${cwd}/${file.path}`) : selectFile(file.path, 'diff'))}
            onDiscard={(e) => requestDiscardFile(file.path, e)}
          />
        ))}
      </div>

      {/* Inline confirm modal */}
      {confirmDiscard && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border-strong)',
            flexShrink: 0,
            background: 'var(--bg-chip)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>
            {confirmDiscard.type === 'all'
              ? `Discard all ${changedFiles.length} changes?`
              : `Discard ${confirmDiscard.path?.split('/').pop()}?`}
          </span>
          <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>This cannot be undone.</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={executeDiscard}
              style={{
                padding: '4px 12px',
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 600,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#ef4444',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Discard
            </button>
            <button
              onClick={() => setConfirmDiscard(null)}
              style={{
                padding: '4px 12px',
                borderRadius: 5,
                fontSize: 10,
                background: 'none',
                border: '1px solid var(--fg-dim)',
                color: 'var(--fg-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
