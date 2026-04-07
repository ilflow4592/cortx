import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ChangedFile {
  path: string;
  status: string; // M, A, D, R, ?
}

interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'del' | 'ctx'; num: number; content: string }[];
}

type SubTab = 'files' | 'changes';

export function ChangesView({ cwd, branchName }: { cwd: string; branchName: string }) {
  const [subTab, setSubTab] = useState<SubTab>('changes');
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [allFiles, setAllFiles] = useState<ChangedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'edit'>('diff');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (cwd) loadChanges(); }, [cwd, branchName]);

  const loadChanges = async () => {
    setLoading(true);
    try {
      // Get changed files (branch diff + unstaged)
      const branchDiff = await run(`git diff --name-status origin/develop...HEAD 2>/dev/null`);
      const unstaged = await run(`git diff --name-status 2>/dev/null`);
      const staged = await run(`git diff --cached --name-status 2>/dev/null`);

      const fileMap = new Map<string, string>();
      for (const line of [...branchDiff.split('\n'), ...unstaged.split('\n'), ...staged.split('\n')]) {
        const match = line.match(/^([MADR?]+)\t(.+)/);
        if (match) fileMap.set(match[2], match[1]);
      }
      setChangedFiles([...fileMap.entries()].map(([path, status]) => ({ path, status })));

      // Get all tracked files
      const allResult = await run(`git ls-files 2>/dev/null`);
      setAllFiles(allResult.trim().split('\n').filter(Boolean).map((p) => ({ path: p, status: '' })));
    } catch { /* skip */ }
    setLoading(false);
  };

  const run = async (command: string): Promise<string> => {
    const result = await invoke<{ success: boolean; output: string }>('run_shell_command', { cwd, command });
    return result.success ? result.output : '';
  };

  const selectFile = async (file: string, mode: 'diff' | 'edit' = 'diff') => {
    setSelectedFile(file);
    setViewMode(mode);

    if (mode === 'diff') {
      const diff = await run(`git diff origin/develop...HEAD -- '${file}' 2>/dev/null || git diff -- '${file}' 2>/dev/null`);
      setDiffHunks(parseDiff(diff));
      setFileContent(null);
    } else {
      const content = await run(`head -500 '${file}'`);
      setFileContent(content);
      setDiffHunks([]);
    }
  };

  const currentFiles = subTab === 'changes' ? changedFiles : allFiles;
  const filteredFiles = currentFiles;

  if (selectedFile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #27272f', flexShrink: 0 }}>
          <button onClick={() => setSelectedFile(null)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 14 }}>←</button>
          <span style={{ fontSize: 11, color: '#8b8b95', fontFamily: "'JetBrains Mono', monospace", flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedFile}
          </span>
          <button
            onClick={() => selectFile(selectedFile, viewMode === 'diff' ? 'edit' : 'diff')}
            style={{ background: '#232330', border: '1px solid #2d2d3a', borderRadius: 4, color: '#b4b4bc', cursor: 'pointer', fontSize: 10, padding: '2px 8px', fontFamily: 'inherit' }}
          >{viewMode === 'diff' ? 'Code' : 'Diff'}</button>
        </div>

        {/* Diff view */}
        {viewMode === 'diff' && (
          <div style={{ flex: 1, overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
            {diffHunks.length === 0 && <div style={{ padding: 16, color: '#71717a', fontSize: 11 }}>No diff available</div>}
            {diffHunks.map((hunk, hi) => (
              <div key={hi}>
                <div style={{ padding: '4px 16px', color: '#818cf8', background: 'rgba(99,102,241,0.04)', fontSize: 11 }}>{hunk.header}</div>
                {hunk.lines.map((line, li) => (
                  <div key={li} style={{
                    display: 'flex', minHeight: 20,
                    background: line.type === 'add' ? 'rgba(52,211,153,0.06)' : line.type === 'del' ? 'rgba(239,68,68,0.06)' : 'transparent',
                  }}>
                    <span style={{ width: 48, textAlign: 'right', paddingRight: 12, color: '#3f3f46', flexShrink: 0, userSelect: 'none' }}>{line.num || ''}</span>
                    <span style={{
                      color: line.type === 'add' ? '#34d399' : line.type === 'del' ? '#ef4444' : '#71717a',
                      whiteSpace: 'pre', overflow: 'hidden',
                    }}>{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.content}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Code view */}
        {viewMode === 'edit' && fileContent !== null && (
          <div style={{ flex: 1, overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
            {fileContent.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex', minHeight: 20 }}>
                <span style={{ width: 48, textAlign: 'right', paddingRight: 12, color: '#3f3f46', flexShrink: 0, userSelect: 'none' }}>{i + 1}</span>
                <span style={{ color: '#b4b4bc', whiteSpace: 'pre', overflow: 'hidden' }}>{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderBottom: '1px solid #27272f', flexShrink: 0 }}>
        <button className={`ctx-filter ${subTab === 'files' ? 'active' : ''}`} onClick={() => setSubTab('files')}>
          All files
        </button>
        <button className={`ctx-filter ${subTab === 'changes' ? 'active' : ''}`} onClick={() => setSubTab('changes')}>
          Changes {changedFiles.length > 0 && <span className="count">{changedFiles.length}</span>}
        </button>
        <button onClick={loadChanges} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 11 }}>
          ↻
        </button>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 16, fontSize: 11, color: '#71717a' }}>Loading...</div>}
        {filteredFiles.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: '#71717a' }}>
            {subTab === 'changes' ? 'No changes' : 'No files'}
          </div>
        )}
        {filteredFiles.map((file) => {
          const statusColor = file.status === 'M' ? '#eab308' : file.status === 'A' ? '#34d399' : file.status === 'D' ? '#ef4444' : '#71717a';
          return (
            <button
              key={file.path}
              onClick={() => selectFile(file.path, subTab === 'changes' ? 'diff' : 'edit')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '5px 16px', background: 'none', border: 'none', borderBottom: '1px solid #ffffff06',
                color: '#b4b4bc', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'left',
              }}
            >
              {file.status && (
                <span style={{ color: statusColor, fontSize: 10, fontWeight: 600, width: 14, flexShrink: 0 }}>{file.status}</span>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
            </button>
          );
        })}
      </div>
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
