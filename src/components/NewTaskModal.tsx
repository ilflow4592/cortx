import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { invoke } from '@tauri-apps/api/core';

export function NewTaskModal({ onClose }: { onClose: () => void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title, setTitle] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [branchName, setBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError('');

    const repo = repoPath.trim();
    const branch = branchName.trim();
    let worktreePath = '';

    // Auto-create git worktree if repo + branch provided
    if (repo && branch) {
      const slug = branch.replace(/\//g, '-');
      worktreePath = `${repo}/.worktrees/${slug}`;
      try {
        const result = await invoke<{ success: boolean; error: string }>('create_worktree', {
          repoPath: repo,
          worktreePath,
          branchName: branch,
        });
        if (!result.success) {
          // Worktree might already exist or branch exists — try without -b
          const existing = result.error;
          if (existing.includes('already exists')) {
            // Use existing worktree path, not an error
          } else {
            setError(`Worktree error: ${result.error}`);
            setCreating(false);
            return;
          }
        }
      } catch (err) {
        // Not in Tauri context (e.g. browser dev) — skip worktree
        console.warn('Worktree creation skipped:', err);
        worktreePath = '';
      }
    }

    addTask(title.trim(), repo, branch);

    // Update the task with worktree path
    setTimeout(() => {
      const state = useTaskStore.getState();
      const last = state.tasks[state.tasks.length - 1];
      if (last) {
        if (worktreePath) {
          state.updateTask(last.id, { worktreePath });
        }
        state.selectTask(last.id);
      }
    }, 0);

    setCreating(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Task</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="field">
            <span className="field-label">Task title <span style={{ color:'#6366f1' }}>*</span></span>
            <input className="field-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. API 인증 리팩토링" />
          </div>
          <div className="field">
            <span className="field-label">Repository path</span>
            <input className="field-input mono" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="e.g. /Users/ilya/Dev/my-project" />
            <span className="field-hint">Git repo root path. Worktree will be created automatically.</span>
          </div>
          <div className="field">
            <span className="field-label">Branch name</span>
            <input className="field-input mono" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. feat/auth-refactor" />
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim() || creating}>
              {creating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
