import { useState, useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import type { DiffMode, DiffFile, ParsedDiff } from './diff-viewer/types';
import { parseStat, parseDiffOutput, extractStatFromDiffs } from './diff-viewer/parse';
import { Toolbar } from './diff-viewer/Toolbar';
import { FileList } from './diff-viewer/FileList';
import { DiscardConfirmDialog, type DiscardTarget } from './diff-viewer/DiscardConfirmDialog';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
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
  const [confirmDiscard, setConfirmDiscard] = useState<DiscardTarget | null>(null);

  const repoPath = task?.worktreePath || task?.repoPath || '';

  useEffect(() => {
    if (!repoPath) return;
    loadDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on repoPath/mode change
  }, [repoPath, mode]);

  // git 명령 실행 후 diff 재로드
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
  const discardFile = (path: string) =>
    runGit(`git restore ${escapePath(path)} && git clean -fd ${escapePath(path)} 2>/dev/null || true`);
  const stageAll = () => runGit('git add -A');
  const unstageAll = () => runGit('git reset');
  const discardAll = () => runGit('git checkout -- . && git clean -fd');

  const loadDiff = async () => {
    if (!repoPath) return;
    setLoading(true);
    setError('');

    try {
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
          const parsed = parseDiffOutput(result.output);
          setDiffs(parsed);
          setStat(extractStatFromDiffs(parsed));
        }
      } else {
        const result = await invoke<{ success: boolean; output: string; error: string }>('git_diff_unstaged', {
          repoPath,
        });
        if (result.success) {
          const parsed = parseDiffOutput(result.output);
          setDiffs(parsed);
          setStat(extractStatFromDiffs(parsed));
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
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        fileCount={stat.length}
        busy={busy}
        onStageAll={stageAll}
        onUnstageAll={unstageAll}
        onDiscardAllRequest={() => setConfirmDiscard({ type: 'all' })}
        onRefresh={loadDiff}
      />

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

      <FileList
        stat={stat}
        diffs={diffs}
        mode={mode}
        loading={loading}
        busy={busy}
        expandedFile={expandedFile}
        onToggleExpand={(path) => setExpandedFile(expandedFile === path ? null : path)}
        onStageFile={stageFile}
        onUnstageFile={unstageFile}
        onDiscardFileRequest={(path) => setConfirmDiscard({ type: 'file', path })}
      />

      {confirmDiscard && (
        <DiscardConfirmDialog
          target={confirmDiscard}
          onCancel={() => setConfirmDiscard(null)}
          onConfirm={async () => {
            const target = confirmDiscard;
            setConfirmDiscard(null);
            if (target.type === 'all') {
              await discardAll();
            } else if (target.path) {
              await discardFile(target.path);
            }
          }}
        />
      )}
    </div>
  );
}
