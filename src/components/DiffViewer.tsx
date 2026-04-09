import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTaskStore } from '../stores/taskStore';

type DiffMode = 'branch' | 'staged' | 'unstaged';

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
}

interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'del' | 'ctx'; content: string }[];
}

interface ParsedDiff {
  file: string;
  hunks: DiffHunk[];
}

export function DiffViewer({ taskId }: { taskId: string }) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const [mode, setMode] = useState<DiffMode>('branch');
  const [stat, setStat] = useState<DiffFile[]>([]);
  const [diffs, setDiffs] = useState<ParsedDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const repoPath = task?.worktreePath || task?.repoPath || '';

  useEffect(() => {
    if (!repoPath) return;
    loadDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on repoPath/mode change
  }, [repoPath, mode]);

  const loadDiff = async () => {
    if (!repoPath) return;
    setLoading(true);
    setError('');

    try {
      // Get stat
      if (mode === 'branch') {
        const statResult = await invoke<{ success: boolean; output: string; error: string }>('git_diff', {
          repoPath,
          branchName: task?.branchName || '',
        });
        if (statResult.success) setStat(parseStat(statResult.output));

        const fullResult = await invoke<{ success: boolean; output: string; error: string }>('git_diff_full', { repoPath });
        if (fullResult.success) setDiffs(parseDiffOutput(fullResult.output));
      } else if (mode === 'staged') {
        const result = await invoke<{ success: boolean; output: string; error: string }>('git_diff_staged', { repoPath });
        if (result.success) {
          setDiffs(parseDiffOutput(result.output));
          setStat(extractStatFromDiffs(parseDiffOutput(result.output)));
        }
      } else {
        const result = await invoke<{ success: boolean; output: string; error: string }>('git_diff_unstaged', { repoPath });
        if (result.success) {
          setDiffs(parseDiffOutput(result.output));
          setStat(extractStatFromDiffs(parseDiffOutput(result.output)));
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!repoPath) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <div className="empty-state-inner">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No repository</div>
          <div className="empty-state-sub">Set a repo path to view diffs</div>
        </div>
      </div>
    );
  }

  const totalAdd = stat.reduce((s, f) => s + f.additions, 0);
  const totalDel = stat.reduce((s, f) => s + f.deletions, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Mode tabs + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', borderBottom: '1px solid #141418', flexShrink: 0 }}>
        {(['branch', 'staged', 'unstaged'] as DiffMode[]).map((m) => (
          <button key={m} className={`ctx-filter ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
            {m === 'branch' ? '🌿 Branch' : m === 'staged' ? '📦 Staged' : '📝 Unstaged'}
          </button>
        ))}
        <button onClick={loadDiff} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: 12 }}>
          🔄 Refresh
        </button>
      </div>

      {/* Summary */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #141418', fontSize: 11, color: '#52525b', display: 'flex', gap: 12, flexShrink: 0 }}>
        <span>{stat.length} files</span>
        <span style={{ color: '#34d399' }}>+{totalAdd}</span>
        <span style={{ color: '#ef4444' }}>-{totalDel}</span>
        {loading && <span style={{ color: '#818cf8' }}>Loading...</span>}
      </div>

      {error && <div className="error-box" style={{ margin: 12 }}>{error}</div>}

      {/* File list + diffs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {stat.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: '#3f3f46' }}>
            No changes
          </div>
        )}
        {stat.map((file, idx) => {
          const diff = diffs.find((d) => d.file === file.path || d.file.endsWith(file.path));
          const isExpanded = expandedFile === file.path;
          return (
            <div key={`${file.path}-${idx}`}>
              <button
                onClick={() => setExpandedFile(isExpanded ? null : file.path)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                  padding: '6px 16px', background: 'none', border: 'none', borderBottom: '1px solid #ffffff06',
                  color: '#a1a1aa', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'left',
                }}
              >
                <span style={{ color: '#52525b' }}>{isExpanded ? '▼' : '▶'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
                <span style={{ color: '#34d399', flexShrink: 0 }}>+{file.additions}</span>
                <span style={{ color: '#ef4444', flexShrink: 0 }}>-{file.deletions}</span>
              </button>
              {isExpanded && diff && (
                <div style={{ background: '#08080c', borderBottom: '1px solid #141418', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.7, overflow: 'auto' }}>
                  {diff.hunks.map((hunk, hi) => (
                    <div key={hi}>
                      <div style={{ padding: '4px 16px', color: '#6366f1', background: '#6366f108' }}>{hunk.header}</div>
                      {hunk.lines.map((line, li) => (
                        <div
                          key={li}
                          style={{
                            padding: '0 16px',
                            background: line.type === 'add' ? 'rgba(52,211,153,0.06)' : line.type === 'del' ? 'rgba(239,68,68,0.06)' : 'transparent',
                            color: line.type === 'add' ? '#34d399' : line.type === 'del' ? '#ef4444' : '#52525b',
                            whiteSpace: 'pre',
                          }}
                        >
                          {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.content}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseStat(output: string): DiffFile[] {
  const lines = output.trim().split('\n');
  const files: DiffFile[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/);
    if (match) {
      const path = match[1].trim();
      const plusCount = (match[3].match(/\+/g) || []).length;
      const minusCount = (match[3].match(/-/g) || []).length;
      files.push({ path, additions: plusCount, deletions: minusCount });
    }
  }
  return files;
}

function parseDiffOutput(output: string): ParsedDiff[] {
  const diffs: ParsedDiff[] = [];
  const fileParts = output.split(/^diff --git /m).filter(Boolean);
  for (const part of fileParts) {
    const lines = part.split('\n');
    const headerLine = lines[0] || '';
    const bMatch = headerLine.match(/b\/(.+)/);
    const file = bMatch ? bMatch[1] : headerLine;
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const line of lines.slice(1)) {
      if (line.startsWith('@@')) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith('+')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1) });
        } else if (line.startsWith('-')) {
          currentHunk.lines.push({ type: 'del', content: line.slice(1) });
        } else if (line.startsWith(' ') || line === '') {
          currentHunk.lines.push({ type: 'ctx', content: line.slice(1) || '' });
        }
      }
    }
    diffs.push({ file, hunks });
  }
  return diffs;
}

function extractStatFromDiffs(diffs: ParsedDiff[]): DiffFile[] {
  return diffs.map((d) => {
    let additions = 0, deletions = 0;
    for (const h of d.hunks) for (const l of h.lines) {
      if (l.type === 'add') additions++;
      if (l.type === 'del') deletions++;
    }
    return { path: d.file, additions, deletions };
  });
}
