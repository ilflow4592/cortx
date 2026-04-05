import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { TaskLayer } from '../types/task';

const layers: { value: TaskLayer; label: string; desc: string; color: string }[] = [
  { value: 'focus', label: '🎯 Focus', desc: '30min+ deep work', color: '#818cf8' },
  { value: 'batch', label: '📦 Batch', desc: 'Group similar tasks', color: '#eab308' },
  { value: 'reactive', label: '⚡ Reactive', desc: 'Quick (<2min) tasks', color: '#34d399' },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

export function NewTaskModal({ onClose, defaultProjectId }: { onClose: () => void; defaultProjectId?: string }) {
  const addTask = useTaskStore((s) => s.addTask);
  const projects = useProjectStore((s) => s.projects);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '');
  const [layer, setLayer] = useState<TaskLayer>('focus');
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const selectedProject = projects.find((p) => p.id === projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError('');

    const project = selectedProject;
    const repoPath = project?.localPath || '';
    let branchName = '';
    let worktreePath = '';

    // Auto-create worktree if project has a local path
    if (repoPath) {
      const slug = slugify(title);
      branchName = `cortx/${slug}`;
      worktreePath = `${repoPath}/.worktrees/${slug}`;

      setStatus('Creating worktree...');

      try {
        // Create worktree with new branch
        const result = await invoke<{ success: boolean; output: string; error: string }>('create_worktree', {
          repoPath,
          worktreePath,
          branchName,
          baseBranch: project?.baseBranch || null,
        });

        if (!result.success) {
          if (result.error.includes('already exists')) {
            // Worktree already exists, reuse it
            setStatus('Using existing worktree...');
          } else {
            setError(`Worktree error: ${result.error}`);
            setCreating(false);
            setStatus('');
            return;
          }
        } else {
          setStatus('Worktree created!');
        }

        // Run setup scripts
        setStatus('Running setup scripts...');
        try {
          const config = await invoke<{ setup: string[]; archive: string[] }>('read_cortx_yaml', { repoPath });
          if (config.setup.length > 0) {
            await invoke('run_setup_scripts', { cwd: worktreePath, scripts: config.setup });
          }
        } catch { /* no cortx.yaml */ }

      } catch (err) {
        // Not in Tauri context or git error
        console.warn('Worktree creation skipped:', err);
        worktreePath = repoPath; // fallback to repo root
        branchName = '';
      }
    }

    setStatus('Creating task...');

    addTask(title.trim(), repoPath, branchName);

    setTimeout(() => {
      const state = useTaskStore.getState();
      const last = state.tasks[state.tasks.length - 1];
      if (last) {
        state.updateTask(last.id, {
          layer,
          projectId: projectId || undefined,
          worktreePath: worktreePath || repoPath,
        });
        state.selectTask(last.id);
      }
    }, 0);

    setCreating(false);
    setStatus('');
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
          {/* Task title */}
          <div className="field">
            <span className="field-label">Task title <span style={{ color: '#6366f1' }}>*</span></span>
            <input className="field-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. API 인증 리팩토링" />
            {title.trim() && selectedProject?.localPath && (
              <div style={{ fontSize: 10, color: '#3f3f46', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                Branch: cortx/{slugify(title)} · .worktrees/{slugify(title)}
              </div>
            )}
          </div>

          {/* Project selector */}
          {projects.length > 0 && (
            <div className="field">
              <span className="field-label">Project</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" onClick={() => setProjectId('')} style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                  border: !projectId ? '1px solid rgba(99,102,241,0.3)' : '1px solid #18181b',
                  background: !projectId ? 'rgba(99,102,241,0.06)' : '#06060a',
                  color: !projectId ? '#818cf8' : '#52525b',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>None</button>
                {projects.map((p) => (
                  <button key={p.id} type="button" onClick={() => setProjectId(p.id)} style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                    border: projectId === p.id ? `1px solid ${p.color}40` : '1px solid #18181b',
                    background: projectId === p.id ? `${p.color}0a` : '#06060a',
                    color: projectId === p.id ? p.color : '#71717a',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                    {p.name}
                  </button>
                ))}
              </div>
              {selectedProject && !selectedProject.localPath && (
                <div style={{ fontSize: 11, color: '#eab308', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠ Project has no local path set.
                  <button type="button" onClick={async () => {
                    try {
                      const selected = await open({ directory: true, multiple: false, title: 'Select project folder' });
                      if (selected && typeof selected === 'string') {
                        useProjectStore.getState().updateProject(selectedProject.id, { localPath: selected });
                      }
                    } catch { /* cancelled */ }
                  }} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', textDecoration: 'underline' }}>
                    Set path
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Layer */}
          <div className="field">
            <span className="field-label">Layer</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {layers.map((l) => (
                <button key={l.value} type="button" onClick={() => setLayer(l.value)} style={{
                  flex: 1, padding: '8px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500, textAlign: 'center',
                  border: layer === l.value ? `1px solid ${l.color}40` : '1px solid #18181b',
                  background: layer === l.value ? `${l.color}0a` : '#06060a',
                  color: layer === l.value ? l.color : '#71717a',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {l.label}<br /><span style={{ fontSize: 9, opacity: 0.6 }}>{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status / Error */}
          {status && (
            <div style={{ fontSize: 11, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="loading-dot" /> {status}
            </div>
          )}
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
