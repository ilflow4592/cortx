import { useState, type ReactNode } from 'react';
import { FolderOpen, Globe } from 'lucide-react';
import { useProjectStore } from '../stores/projectStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

type Step = 'choose' | 'open' | 'clone';

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('choose');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: step === 'choose' ? 400 : 500 }} onClick={(e) => e.stopPropagation()}>
        {step === 'choose' && <ChooseStep onSelect={setStep} onClose={onClose} />}
        {step === 'open' && <OpenStep onClose={onClose} onBack={() => setStep('choose')} />}
        {step === 'clone' && <CloneStep onClose={onClose} onBack={() => setStep('choose')} />}
      </div>
    </div>
  );
}

// ── Step 1: Choose method ──
function ChooseStep({ onSelect, onClose }: { onSelect: (s: Step) => void; onClose: () => void }) {
  const handleOpen = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select project folder' });
      if (selected && typeof selected === 'string') {
        // Check if it's a git repo
        const result = await invoke<{ success: boolean; output: string }>('list_worktrees', { repoPath: selected });
        if (result.success) {
          createFromPath(selected);
        } else {
          // Not a git repo, still add as project
          createFromPath(selected);
        }
      }
    } catch {
      onSelect('open');
    }
  };

  const addProject = useProjectStore((s) => s.addProject);
  const addSource = useContextPackStore((s) => s.addSource);

  const createFromPath = (localPath: string) => {
    const parts = localPath.split('/');
    const name = parts[parts.length - 1] || 'project';

    // Try to detect GitHub remote
    invoke<{ success: boolean; output: string }>('list_worktrees', { repoPath: localPath }).then(() => {
      // Try git remote
      invoke<{ success: boolean; output: string; error: string }>('run_shell_command', { cwd: localPath, command: 'git remote get-url origin' }).then((r) => {
        let owner = '', repo = '';
        if (r.success) {
          const match = r.output.trim().match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
          if (match) { owner = match[1]; repo = match[2].replace(/\.git$/, ''); }
        }
        addProject(name, localPath, owner, repo);
        if (owner && repo) {
          const sources = useContextPackStore.getState().sources;
          if (!sources.some((s) => s.type === 'github' && s.owner === owner && s.repo === repo)) {
            addSource({ type: 'github', enabled: true, token: '', owner, repo });
          }
        }
        onClose();
      }).catch(() => {
        addProject(name, localPath, '', '');
        onClose();
      });
    }).catch(() => {
      addProject(name, localPath, '', '');
      onClose();
    });
  };

  return (
    <>
      <div className="modal-header">
        <h2>Add Project</h2>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div style={{ padding: 8 }}>
        <OptionButton icon={<FolderOpen size={22} strokeWidth={1.5} color="#5aa5a5" />} label="Open project" desc="Select an existing local folder" onClick={handleOpen} />
        <OptionButton icon={<Globe size={22} strokeWidth={1.5} color="#5aa5a5" />} label="Clone from URL" desc="Clone a Git repository" onClick={() => onSelect('clone')} />
      </div>
    </>
  );
}

function OptionButton({ icon, label, desc, onClick }: { icon: ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px',
        background: 'none', border: 'none', borderRadius: 10, cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left', color: '#e4e4e7',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#12121a')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#52525b', marginTop: 2 }}>{desc}</div>
      </div>
    </button>
  );
}

// ── Open existing project ──
function OpenStep({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const addProject = useProjectStore((s) => s.addProject);
  const [localPath, setLocalPath] = useState('');
  const [name, setName] = useState('');

  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select project folder' });
      if (selected && typeof selected === 'string') {
        setLocalPath(selected);
        if (!name) {
          const parts = selected.split('/');
          setName(parts[parts.length - 1] || '');
        }
      }
    } catch { /* cancelled */ }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath) return;
    addProject(name || localPath.split('/').pop() || 'project', localPath, '', '');
    onClose();
  };

  return (
    <>
      <div className="modal-header">
        <h2>Open Project</h2>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <form className="modal-body" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field-label">Project folder</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field-input mono" style={{ flex: 1 }} value={localPath} onChange={(e) => { setLocalPath(e.target.value); if (!name) setName(e.target.value.split('/').pop() || ''); }} placeholder="/Users/ilya/Dev/my-project" />
            <button type="button" onClick={handleBrowse} style={{ padding: '0 14px', background: '#18181b', border: '1px solid #27272a', borderRadius: 8, color: '#a1a1aa', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Browse...</button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
          <button type="submit" className="btn btn-primary" disabled={!localPath}>Open</button>
        </div>
      </form>
    </>
  );
}

// ── Clone from URL ──
function CloneStep({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const addProject = useProjectStore((s) => s.addProject);
  const addSource = useContextPackStore((s) => s.addSource);
  const [gitUrl, setGitUrl] = useState('');
  const [cloneLocation, setCloneLocation] = useState('/Users/ilya/cortx/repos');
  const [cloning, setCloning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Parse repo name from URL
  const repoName = (() => {
    const match = gitUrl.match(/\/([^/\s.]+?)(?:\.git)?$/);
    return match ? match[1] : '';
  })();

  const clonePath = repoName ? `${cloneLocation}/${repoName}` : '';

  // Parse GitHub owner/repo
  const githubMatch = gitUrl.match(/github\.com[:/]([^/]+)\/([^/\s.]+)/);
  const githubOwner = githubMatch ? githubMatch[1] : '';
  const githubRepo = githubMatch ? githubMatch[2].replace(/\.git$/, '') : '';

  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select clone location' });
      if (selected && typeof selected === 'string') setCloneLocation(selected);
    } catch { /* cancelled */ }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl || !cloneLocation) return;
    setCloning(true);
    setError('');
    setStatus('Cloning repository...');

    try {
      const result = await invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
        cwd: cloneLocation,
        command: `git clone ${gitUrl}`,
      });

      if (!result.success && !result.error.includes('already exists')) {
        setError(`Clone failed: ${result.error}`);
        setCloning(false);
        setStatus('');
        return;
      }

      setStatus('Setting up project...');

      addProject(repoName || 'project', clonePath, githubOwner, githubRepo);

      if (githubOwner && githubRepo) {
        const sources = useContextPackStore.getState().sources;
        if (!sources.some((s) => s.type === 'github' && s.owner === githubOwner && s.repo === githubRepo)) {
          addSource({ type: 'github', enabled: true, token: '', owner: githubOwner, repo: githubRepo });
        }
      }

      setCloning(false);
      setStatus('');
      onClose();
    } catch (err) {
      setError(`Error: ${err}`);
      setCloning(false);
      setStatus('');
    }
  };

  return (
    <>
      <div className="modal-header">
        <h2>Clone from URL</h2>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <form className="modal-body" onSubmit={handleClone}>
        <div className="field">
          <span className="field-label">Git URL</span>
          <input className="field-input mono" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/repo.git" />
          {githubOwner && githubRepo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
              <span style={{ fontSize: 11, color: '#34d399' }}>{githubOwner}/{githubRepo}</span>
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label">Clone location</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field-input mono" style={{ flex: 1 }} value={cloneLocation} onChange={(e) => setCloneLocation(e.target.value)} placeholder="/Users/ilya/cortx/repos" />
            <button type="button" onClick={handleBrowse} style={{ padding: '0 14px', background: '#18181b', border: '1px solid #27272a', borderRadius: 8, color: '#a1a1aa', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Browse...</button>
          </div>
          {clonePath && (
            <div style={{ fontSize: 10, color: '#3f3f46', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              → {clonePath}
            </div>
          )}
        </div>

        {status && (
          <div style={{ fontSize: 11, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="loading-dot" /> {status}
          </div>
        )}
        {error && <div className="error-box">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>← Back</button>
          <button type="submit" className="btn btn-primary" disabled={!gitUrl || !cloneLocation || cloning}>
            {cloning ? 'Cloning...' : 'Clone repository'}
          </button>
        </div>
      </form>
    </>
  );
}
