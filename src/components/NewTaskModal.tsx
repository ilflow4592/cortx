import { useState, useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import type { TaskLayer } from '../types/task';

// Tauri API는 동적 import (CLAUDE.md 규칙 + chunk splitting).
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}
async function open(opts: { directory?: boolean; multiple?: boolean; title?: string }) {
  const mod = await import('@tauri-apps/plugin-dialog');
  return mod.open(opts);
}

const layers: { value: TaskLayer; label: string; desc: string; color: string }[] = [
  { value: 'focus', label: '🎯 Focus', desc: '30min+ deep work', color: '#818cf8' },
  { value: 'batch', label: '📦 Batch', desc: 'Group similar tasks', color: '#eab308' },
  { value: 'reactive', label: '⚡ Reactive', desc: 'Quick (<2min) tasks', color: '#34d399' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function NewTaskModal({ onClose, defaultProjectId }: { onClose: () => void; defaultProjectId?: string }) {
  const addTask = useTaskStore((s) => s.addTask);
  const projects = useProjectStore((s) => s.projects);
  const [title, setTitle] = useState('');
  const [customBranch, setCustomBranch] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '');
  const [layer, setLayer] = useState<TaskLayer>('focus');
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');

  const selectedProject = projects.find((p) => p.id === projectId);

  // Fetch branches when project changes
  useEffect(() => {
    if (!selectedProject?.localPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard reset, not cascading
      setBranches([]);
      return;
    }
    invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: selectedProject.localPath,
      command: 'git branch -a --format="%(refname:short)"',
    })
      .then((r) => {
        if (r.success) setBranches(r.output.trim().split('\n').filter(Boolean));
      })
      .catch(() => {});
  }, [selectedProject?.localPath]);

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
      branchName = customBranch.trim() || `cortx/${slugify(title)}`;
      worktreePath = `${repoPath}/.worktrees/${slugify(branchName)}`;
      const baseBranch = project?.baseBranch || 'main';

      // Pull latest base branch first
      setStatus(`Pulling latest ${baseBranch}...`);
      try {
        const fetchResult = await invoke<{ success: boolean; error: string }>('run_shell_command', {
          cwd: repoPath,
          command: `git fetch origin && git checkout ${baseBranch} && git pull origin ${baseBranch}`,
        });
        if (!fetchResult.success) {
          setError(`Base branch "${baseBranch}" not found. Check project settings.\n${fetchResult.error}`);
          setCreating(false);
          setStatus('');
          return;
        }
      } catch (err) {
        setError(`Failed to checkout base branch "${baseBranch}": ${err}`);
        setCreating(false);
        setStatus('');
        return;
      }

      setStatus('Creating worktree...');
      console.log('[cortx] create_worktree params:', { repoPath, worktreePath, branchName, baseBranch });

      try {
        const result = await invoke<{ success: boolean; output: string; error: string }>('create_worktree', {
          repoPath,
          worktreePath,
          branchName,
          baseBranch,
        });
        console.log('[cortx] create_worktree result:', result);

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
        } catch {
          /* no cortx.yaml */
        }
      } catch (err) {
        // Not in Tauri context or git error
        console.warn('Worktree creation skipped:', err);
        worktreePath = repoPath; // fallback to repo root
        branchName = '';
      }
    }

    setStatus('Creating task...');

    const taskId = addTask(title.trim(), repoPath, branchName, {
      layer,
      projectId: projectId || undefined,
      worktreePath: worktreePath || repoPath,
    });

    setCreating(false);
    setStatus('');
    onClose();

    // Select task AFTER modal is closed and React settles
    requestAnimationFrame(() => {
      useTaskStore.getState().selectTask(taskId);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Task</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {/* Task title */}
          <div className="field">
            <span className="field-label">
              Task title <span style={{ color: '#6366f1' }}>*</span>
            </span>
            <input
              className="field-input"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. API 인증 리팩토링"
            />
            {/* Branch name */}
            {selectedProject?.localPath && (
              <div className="field">
                <span className="field-label">Branch name</span>
                <input
                  className="field-input mono"
                  style={{ fontSize: 12 }}
                  value={customBranch}
                  onChange={(e) => setCustomBranch(e.target.value)}
                  placeholder={title.trim() ? `cortx/${slugify(title)}` : 'e.g. feat/auth-refactor'}
                />
              </div>
            )}

            {title.trim() && selectedProject?.localPath && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--fg-subtle)',
                  marginTop: 2,
                  marginBottom: 4,
                  fontFamily: "'JetBrains Mono', monospace",
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span>{customBranch.trim() || `cortx/${slugify(title)}`}</span>
                <span style={{ color: 'var(--border-muted)' }}>·</span>
                <span>.worktrees/{slugify(title)}</span>
                <span style={{ color: 'var(--border-muted)' }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  from
                  <span style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowBranchPicker(!showBranchPicker)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: 'var(--bg-chip)',
                        border: '1px solid var(--border-muted)',
                        color: '#818cf8',
                        cursor: 'pointer',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {selectedProject.baseBranch || 'main'} ⌃
                    </button>
                    {showBranchPicker && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          marginTop: 4,
                          zIndex: 50,
                          width: 240,
                          background: 'var(--bg-chip)',
                          border: '1px solid var(--border-muted)',
                          borderRadius: 8,
                          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ padding: '8px', borderBottom: '1px solid #1e1e26' }}>
                          <input
                            autoFocus
                            value={branchSearch}
                            onChange={(e) => setBranchSearch(e.target.value)}
                            placeholder="Search branch..."
                            style={{
                              width: '100%',
                              background: 'none',
                              border: 'none',
                              outline: 'none',
                              color: 'var(--fg-primary)',
                              fontSize: 12,
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>
                        <div style={{ maxHeight: 180, overflowY: 'auto', padding: 4 }}>
                          {branches
                            .filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
                            .map((b) => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => {
                                  useProjectStore.getState().updateProject(selectedProject.id, { baseBranch: b });
                                  setShowBranchPicker(false);
                                  setBranchSearch('');
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  width: '100%',
                                  padding: '6px 10px',
                                  background:
                                    b === (selectedProject.baseBranch || 'main') ? 'rgba(99,102,241,0.08)' : 'none',
                                  border: 'none',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 11,
                                  color: b === (selectedProject.baseBranch || 'main') ? 'var(--fg-primary)' : '#888895',
                                  textAlign: 'left',
                                }}
                              >
                                <span style={{ width: 14 }}>
                                  {b === (selectedProject.baseBranch || 'main') ? '✓' : ''}
                                </span>
                                {b}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Project selector */}
          {projects.length > 0 && (
            <div className="field">
              <span className="field-label">Project</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setProjectId('')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    border: !projectId ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--bg-chip)',
                    background: !projectId ? 'rgba(99,102,241,0.06)' : 'var(--bg-surface)',
                    color: !projectId ? '#818cf8' : 'var(--fg-subtle)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  None
                </button>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProjectId(p.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 500,
                      border: projectId === p.id ? `1px solid ${p.color}40` : '1px solid var(--bg-chip)',
                      background: projectId === p.id ? `${p.color}0a` : 'var(--bg-surface)',
                      color: projectId === p.id ? p.color : '#71717a',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                    {p.name}
                  </button>
                ))}
              </div>
              {selectedProject && !selectedProject.localPath && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#eab308',
                    marginTop: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  ⚠ Project has no local path set.
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const selected = await open({
                          directory: true,
                          multiple: false,
                          title: 'Select project folder',
                        });
                        if (selected && typeof selected === 'string') {
                          useProjectStore.getState().updateProject(selectedProject.id, { localPath: selected });
                        }
                      } catch {
                        /* cancelled */
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontFamily: 'inherit',
                      textDecoration: 'underline',
                    }}
                  >
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
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLayer(l.value)}
                  style={{
                    flex: 1,
                    padding: '8px 8px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    textAlign: 'center',
                    border: layer === l.value ? `1px solid ${l.color}40` : '1px solid var(--bg-chip)',
                    background: layer === l.value ? `${l.color}0a` : 'var(--bg-surface)',
                    color: layer === l.value ? l.color : '#71717a',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {l.label}
                  <br />
                  <span style={{ fontSize: 9, opacity: 0.6 }}>{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status / Error */}
          {creating && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(99,102,241,0.04)',
                border: '1px solid rgba(99,102,241,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div className="spinner" />
              <div>
                <div style={{ fontSize: 12, color: '#d4d4d8', fontWeight: 500 }}>{status || 'Creating task...'}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>Setting up worktree and environment</div>
              </div>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={creating}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim() || creating}>
              {creating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
