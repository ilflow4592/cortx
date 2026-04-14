import { useState, type ReactNode } from 'react';
import { FolderOpen, Globe } from 'lucide-react';
import {
  createProject,
  cloneAndCreateProject,
  parseGitHubUrl,
  deriveProjectName,
} from '../services/projectCreation';

// 폴더 선택 다이얼로그만 UI 로컬 관심사 — Tauri plugin-dialog 동적 로드
async function openDialog(opts: { directory?: boolean; multiple?: boolean; title?: string }) {
  const mod = await import('@tauri-apps/plugin-dialog');
  return mod.open(opts);
}

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
      const selected = await openDialog({ directory: true, multiple: false, title: 'Select project folder' });
      if (selected && typeof selected === 'string') {
        await createProject({ localPath: selected });
        onClose();
      }
    } catch {
      // 다이얼로그 취소 또는 서비스 에러 — 상세 입력 폼으로 fallback
      onSelect('open');
    }
  };

  return (
    <>
      <div className="modal-header">
        <h2>Add Project</h2>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div style={{ padding: 8 }}>
        <OptionButton
          icon={<FolderOpen size={22} strokeWidth={1.5} color="var(--accent)" />}
          label="Open project"
          desc="Select an existing local folder"
          onClick={handleOpen}
        />
        <OptionButton
          icon={<Globe size={22} strokeWidth={1.5} color="var(--accent)" />}
          label="Clone from URL"
          desc="Clone a Git repository"
          onClick={() => onSelect('clone')}
        />
      </div>
    </>
  );
}

function OptionButton({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        padding: '14px 16px',
        background: 'none',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        color: 'var(--fg-primary)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#12121a')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>{desc}</div>
      </div>
    </button>
  );
}

// ── Open existing project ──
function OpenStep({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const [localPath, setLocalPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: 'Select project folder' });
      if (selected && typeof selected === 'string') {
        setLocalPath(selected);
        if (!name) setName(deriveProjectName(selected));
      }
    } catch {
      /* cancelled */
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath) return;
    try {
      await createProject({ localPath, name: name || undefined });
      onClose();
    } catch (err) {
      setError(`Failed to add project: ${String(err)}`);
    }
  };

  return (
    <>
      <div className="modal-header">
        <h2>Open Project</h2>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>
      <form className="modal-body" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field-label">Project folder</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field-input mono"
              style={{ flex: 1 }}
              value={localPath}
              onChange={(e) => {
                setLocalPath(e.target.value);
                if (!name) setName(deriveProjectName(e.target.value));
              }}
              placeholder="/Users/ilya/Dev/my-project"
            />
            <button
              type="button"
              onClick={handleBrowse}
              style={{
                padding: '0 14px',
                background: 'var(--bg-chip)',
                border: '1px solid #27272a',
                borderRadius: 8,
                color: 'var(--fg-muted)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              Browse...
            </button>
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={!localPath}>
            Open
          </button>
        </div>
      </form>
    </>
  );
}

// ── Clone from URL ──
function CloneStep({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const [gitUrl, setGitUrl] = useState('');
  const [cloneLocation, setCloneLocation] = useState('/Users/ilya/cortx/repos');
  const [cloning, setCloning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // 라이브 프리뷰용 파싱 (UI 전용 — 실제 생성은 서비스 내부에서 재파싱)
  const { owner: githubOwner, repo: githubRepo, repoName } = parseGitHubUrl(gitUrl);
  const clonePath = repoName ? `${cloneLocation}/${repoName}` : '';

  const handleBrowse = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: 'Select clone location' });
      if (selected && typeof selected === 'string') setCloneLocation(selected);
    } catch {
      /* cancelled */
    }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl || !cloneLocation) return;
    setCloning(true);
    setError('');
    setStatus('Cloning repository...');

    try {
      await cloneAndCreateProject({ gitUrl, cloneLocation });
      setStatus('');
      setCloning(false);
      onClose();
    } catch (err) {
      setError(String(err));
      setCloning(false);
      setStatus('');
    }
  };

  return (
    <>
      <div className="modal-header">
        <h2>Clone from URL</h2>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>
      <form className="modal-body" onSubmit={handleClone}>
        <div className="field">
          <span className="field-label">Git URL</span>
          <input
            className="field-input mono"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
          />
          {githubOwner && githubRepo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
              <span style={{ fontSize: 11, color: '#34d399' }}>
                {githubOwner}/{githubRepo}
              </span>
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label">Clone location</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field-input mono"
              style={{ flex: 1 }}
              value={cloneLocation}
              onChange={(e) => setCloneLocation(e.target.value)}
              placeholder="/Users/ilya/cortx/repos"
            />
            <button
              type="button"
              onClick={handleBrowse}
              style={{
                padding: '0 14px',
                background: 'var(--bg-chip)',
                border: '1px solid #27272a',
                borderRadius: 8,
                color: 'var(--fg-muted)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              Browse...
            </button>
          </div>
          {clonePath && (
            <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
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
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={!gitUrl || !cloneLocation || cloning}>
            {cloning ? 'Cloning...' : 'Clone repository'}
          </button>
        </div>
      </form>
    </>
  );
}
