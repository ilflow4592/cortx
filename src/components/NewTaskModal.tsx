import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { invoke } from '@tauri-apps/api/core';
import type { TaskLayer } from '../types/task';

const layers: { value: TaskLayer; label: string; desc: string; color: string }[] = [
  { value: 'focus', label: '🎯 Focus', desc: '30min+ deep work', color: '#818cf8' },
  { value: 'batch', label: '📦 Batch', desc: 'Group similar tasks', color: '#eab308' },
  { value: 'reactive', label: '⚡ Reactive', desc: 'Quick (<2min) tasks', color: '#34d399' },
];

export function NewTaskModal({ onClose }: { onClose: () => void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const projects = useProjectStore((s) => s.projects);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [repoPath, setRepoPath] = useState(projects[0]?.localPath || '');
  const [layer, setLayer] = useState<TaskLayer>('focus');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedProject = projects.find((p) => p.id === projectId);

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    const proj = projects.find((p) => p.id === id);
    if (proj) setRepoPath(proj.localPath);
    else setRepoPath('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError('');

    const repo = repoPath.trim();

    if (repo) {
      try {
        const config = await invoke<{ setup: string[]; archive: string[] }>('read_cortx_yaml', { repoPath: repo });
        if (config.setup.length > 0) {
          await invoke('run_setup_scripts', { cwd: repo, scripts: config.setup });
        }
      } catch { /* not blocking */ }
    }

    addTask(title.trim(), repo, '');

    setTimeout(() => {
      const state = useTaskStore.getState();
      const last = state.tasks[state.tasks.length - 1];
      if (last) {
        state.updateTask(last.id, {
          layer,
          projectId: projectId || undefined,
        });
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

          {/* Project selector */}
          {projects.length > 0 && (
            <div className="field">
              <span className="field-label">Project</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => handleProjectChange('')}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                    border: !projectId ? '1px solid rgba(99,102,241,0.3)' : '1px solid #18181b',
                    background: !projectId ? 'rgba(99,102,241,0.06)' : '#06060a',
                    color: !projectId ? '#818cf8' : '#52525b',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  None
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProjectChange(p.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                      border: projectId === p.id ? `1px solid ${p.color}40` : '1px solid #18181b',
                      background: projectId === p.id ? `${p.color}0a` : '#06060a',
                      color: projectId === p.id ? p.color : '#71717a',
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          <div className="field">
            <span className="field-label">Working directory</span>
            <input
              className="field-input mono"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="e.g. /Users/ilya/Dev/my-project"
            />
            <span className="field-hint">
              {selectedProject ? `From project "${selectedProject.name}"` : 'Terminal will start in this directory.'}
            </span>
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
