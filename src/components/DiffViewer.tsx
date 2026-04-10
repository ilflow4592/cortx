import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Minus, Trash2, RotateCw } from 'lucide-react';
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

  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<{ type: 'file' | 'all'; path?: string } | null>(null);

  const repoPath = task?.worktreePath || task?.repoPath || '';

  useEffect(() => {
    if (!repoPath) return;
    loadDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on repoPath/mode change
  }, [repoPath, mode]);

  // Run a git command and reload the diff afterward
  const runGit = async (command: string) => {
    if (!repoPath) return;
    setBusy(true);
    try {
      const result = await invoke<{ success: boolean; error: string }>('run_shell_command', {
        cwd: repoPath,
        command,
      });
      if (!result.success && result.error) {
        setError(result.error);
      }
      await loadDiff();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const escapePath = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;

  const stageFile = (path: string) => runGit(`git add ${escapePath(path)}`);
  const unstageFile = (path: string) => runGit(`git restore --staged ${escapePath(path)}`);
  const discardFile = (path: string) => runGit(`git restore ${escapePath(path)} && git clean -fd ${escapePath(path)} 2>/dev/null || true`);
  const stageAll = () => runGit('git add -A');
  const unstageAll = () => runGit('git reset');
  const discardAll = () => runGit('git checkout -- . && git clean -fd');

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

        const fullResult = await invoke<{ success: boolean; output: string; error: string }>('git_diff_full', {
          repoPath,
        });
        if (fullResult.success) setDiffs(parseDiffOutput(fullResult.output));
      } else if (mode === 'staged') {
        const result = await invoke<{ success: boolean; output: string; error: string }>('git_diff_staged', {
          repoPath,
        });
        if (result.success) {
          setDiffs(parseDiffOutput(result.output));
          setStat(extractStatFromDiffs(parseDiffOutput(result.output)));
        }
      } else {
        const result = await invoke<{ success: boolean; output: string; error: string }>('git_diff_unstaged', {
          repoPath,
        });
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        {(['branch', 'staged', 'unstaged'] as DiffMode[]).map((m) => (
          <button key={m} className={`ctx-filter ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
            {m === 'branch' ? '🌿 Branch' : m === 'staged' ? '📦 Staged' : '📝 Unstaged'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {mode === 'unstaged' && stat.length > 0 && (
            <HeaderButton onClick={stageAll} disabled={busy} color="#34d399" title="Stage all changes">
              <Plus size={11} strokeWidth={2} /> Stage All
            </HeaderButton>
          )}
          {mode === 'staged' && stat.length > 0 && (
            <HeaderButton onClick={unstageAll} disabled={busy} color="#eab308" title="Unstage all">
              <Minus size={11} strokeWidth={2} /> Unstage All
            </HeaderButton>
          )}
          {mode === 'unstaged' && stat.length > 0 && (
            <HeaderButton
              onClick={() => setConfirmDiscard({ type: 'all' })}
              disabled={busy}
              color="#ef4444"
              title="Discard all unstaged changes"
            >
              <Trash2 size={11} strokeWidth={2} /> Discard All
            </HeaderButton>
          )}
          <button
            onClick={loadDiff}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: busy ? 'var(--border-strong)' : 'var(--fg-subtle)',
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
            title="Refresh"
          >
            <RotateCw size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: 11,
          color: 'var(--fg-subtle)',
          display: 'flex',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span>{stat.length} files</span>
        <span style={{ color: '#34d399' }}>+{totalAdd}</span>
        <span style={{ color: '#ef4444' }}>-{totalDel}</span>
        {loading && <span style={{ color: '#818cf8' }}>Loading...</span>}
      </div>

      {error && (
        <div className="error-box" style={{ margin: 12 }}>
          {error}
        </div>
      )}

      {/* File list + diffs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {stat.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: 'var(--fg-faint)' }}>No changes</div>
        )}
        {stat.map((file, idx) => {
          const diff = diffs.find((d) => d.file === file.path || d.file.endsWith(file.path));
          const isExpanded = expandedFile === file.path;
          return (
            <div key={`${file.path}-${idx}`}>
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 16px',
                  borderBottom: '1px solid #ffffff06',
                  color: 'var(--fg-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                }}
              >
                <button
                  onClick={() => setExpandedFile(isExpanded ? null : file.path)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'none',
                    border: 'none',
                    color: 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    textAlign: 'left',
                    minWidth: 0,
                    padding: 0,
                  }}
                >
                  <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>{isExpanded ? '▼' : '▶'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.path}
                  </span>
                  <span style={{ color: '#34d399', flexShrink: 0 }}>+{file.additions}</span>
                  <span style={{ color: '#ef4444', flexShrink: 0 }}>-{file.deletions}</span>
                </button>
                {/* Row actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                  {mode === 'unstaged' && (
                    <>
                      <RowButton
                        onClick={() => stageFile(file.path)}
                        disabled={busy}
                        color="#34d399"
                        title="Stage this file"
                      >
                        <Plus size={11} strokeWidth={2} />
                      </RowButton>
                      <RowButton
                        onClick={() => setConfirmDiscard({ type: 'file', path: file.path })}
                        disabled={busy}
                        color="#ef4444"
                        title="Discard changes"
                      >
                        <Trash2 size={11} strokeWidth={1.5} />
                      </RowButton>
                    </>
                  )}
                  {mode === 'staged' && (
                    <RowButton
                      onClick={() => unstageFile(file.path)}
                      disabled={busy}
                      color="#eab308"
                      title="Unstage this file"
                    >
                      <Minus size={11} strokeWidth={2} />
                    </RowButton>
                  )}
                </div>
              </div>
              {isExpanded && diff && (
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    lineHeight: 1.7,
                    overflow: 'auto',
                  }}
                >
                  {diff.hunks.map((hunk, hi) => (
                    <div key={hi}>
                      <div style={{ padding: '4px 16px', color: '#6366f1', background: '#6366f108' }}>
                        {hunk.header}
                      </div>
                      {hunk.lines.map((line, li) => (
                        <div
                          key={li}
                          style={{
                            padding: '0 16px',
                            background:
                              line.type === 'add'
                                ? 'rgba(52,211,153,0.06)'
                                : line.type === 'del'
                                  ? 'rgba(239,68,68,0.06)'
                                  : 'transparent',
                            color: line.type === 'add' ? '#34d399' : line.type === 'del' ? '#ef4444' : 'var(--fg-subtle)',
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

      {/* Confirm discard modal */}
      {confirmDiscard && (
        <div
          onClick={() => setConfirmDiscard(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: '90vw',
              background: 'var(--bg-panel)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 8 }}>
              {confirmDiscard.type === 'all' ? 'Discard all unstaged changes?' : 'Discard file changes?'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--fg-subtle)',
                marginBottom: 16,
                fontFamily: confirmDiscard.type === 'file' ? "'JetBrains Mono', monospace" : 'inherit',
              }}
            >
              {confirmDiscard.type === 'file'
                ? confirmDiscard.path
                : 'All uncommitted changes in unstaged files will be lost. This cannot be undone.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDiscard(null)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'none',
                  border: '1px solid var(--fg-dim)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const target = confirmDiscard;
                  setConfirmDiscard(null);
                  if (target.type === 'all') {
                    await discardAll();
                  } else if (target.path) {
                    await discardFile(target.path);
                  }
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 500,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Trash2 size={11} strokeWidth={1.5} /> Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderButton({
  onClick,
  disabled,
  color,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '4px 10px',
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 500,
        background: disabled ? 'rgba(55,65,81,0.2)' : hovered ? `${color}20` : `${color}10`,
        border: `1px solid ${disabled ? 'var(--border-muted)' : `${color}35`}`,
        color: disabled ? 'var(--fg-dim)' : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

function RowButton({
  onClick,
  disabled,
  color,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        background: disabled ? 'transparent' : hovered ? `${color}20` : 'transparent',
        border: `1px solid ${disabled ? 'transparent' : hovered ? `${color}40` : 'transparent'}`,
        color: disabled ? 'var(--border-strong)' : hovered ? color : 'var(--fg-faint)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
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
    let additions = 0,
      deletions = 0;
    for (const h of d.hunks)
      for (const l of h.lines) {
        if (l.type === 'add') additions++;
        if (l.type === 'del') deletions++;
      }
    return { path: d.file, additions, deletions };
  });
}
