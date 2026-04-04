import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { invoke } from '@tauri-apps/api/core';
import type { TaskLayer } from '../types/task';

const layers: { value: TaskLayer; label: string; desc: string; color: string }[] = [
  { value: 'focus', label: '🎯 Focus', desc: '30min+ deep work', color: '#818cf8' },
  { value: 'batch', label: '📦 Batch', desc: 'Group similar tasks', color: '#eab308' },
  { value: 'reactive', label: '⚡ Reactive', desc: 'Quick (<2min) tasks', color: '#34d399' },
];

export function NewTaskModal({ onClose }: { onClose: () => void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title, setTitle] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [branchName, setBranchName] = useState('');
  const [layer, setLayer] = useState<TaskLayer>('focus');
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
        // Run setup scripts from cortx.yaml
        if (result.success && worktreePath) {
          try {
            const config = await invoke<{ setup: string[]; archive: string[] }>('read_cortx_yaml', { repoPath: repo });
            if (config.setup.length > 0) {
              await invoke('run_setup_scripts', { cwd: worktreePath, scripts: config.setup });
            }
          } catch { /* no cortx.yaml or scripts failed — not blocking */ }
        }
      } catch (err) {
        console.warn('Worktree creation skipped:', err);
        worktreePath = '';
      }
    }

    addTask(title.trim(), repo, branch);

    setTimeout(() => {
      const state = useTaskStore.getState();
      const last = state.tasks[state.tasks.length - 1];
      if (last) {
        const updates: Partial<typeof last> = { layer };
        if (worktreePath) updates.worktreePath = worktreePath;
        state.updateTask(last.id, updates);
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
            <span className="field-label">Layer</span>
            <div style={{ display:'flex', gap:6 }}>
              {layers.map((l) => (
                <button key={l.value} type="button" onClick={() => setLayer(l.value)} style={{
                  flex:1, padding:'8px 8px', borderRadius:8, fontSize:11, fontWeight:500, textAlign:'center',
                  border: layer === l.value ? `1px solid ${l.color}40` : '1px solid #18181b',
                  background: layer === l.value ? `${l.color}0a` : '#06060a',
                  color: layer === l.value ? l.color : '#71717a',
                  cursor:'pointer', fontFamily:'inherit',
                }}>
                  {l.label}<br/><span style={{ fontSize:9, opacity:0.6 }}>{l.desc}</span>
                </button>
              ))}
            </div>
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
