import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useContextPackStore } from '../stores/contextPackStore';

export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const addProject = useProjectStore((s) => s.addProject);
  const addSource = useContextPackStore((s) => s.addSource);
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubRepo, setGithubRepo] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addProject(name.trim(), localPath.trim(), githubOwner.trim(), githubRepo.trim());

    // Auto-add GitHub source for Context Pack if owner/repo provided
    if (githubOwner.trim() && githubRepo.trim()) {
      const sources = useContextPackStore.getState().sources;
      const exists = sources.some(
        (s) => s.type === 'github' && s.owner === githubOwner.trim() && s.repo === githubRepo.trim()
      );
      if (!exists) {
        addSource({
          type: 'github',
          enabled: true,
          token: '',
          owner: githubOwner.trim(),
          repo: githubRepo.trim(),
        });
      }
    }

    onClose();
  };

  // Auto-fill name from repo
  const handleRepoChange = (val: string) => {
    setGithubRepo(val);
    if (!name) setName(val);
  };

  // Auto-fill name from local path
  const handlePathChange = (val: string) => {
    setLocalPath(val);
    if (!name) {
      const parts = val.split('/');
      const last = parts[parts.length - 1];
      if (last) setName(last);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Project</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="field">
            <span className="field-label">GitHub repository</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input mono"
                style={{ flex: 1 }}
                value={githubOwner}
                onChange={(e) => setGithubOwner(e.target.value)}
                placeholder="owner"
              />
              <span style={{ color: '#3f3f46', alignSelf: 'center', fontSize: 16 }}>/</span>
              <input
                className="field-input mono"
                style={{ flex: 1 }}
                value={githubRepo}
                onChange={(e) => handleRepoChange(e.target.value)}
                placeholder="repo"
              />
            </div>
            <span className="field-hint">GitHub source will be auto-added for Context Pack.</span>
          </div>
          <div className="field">
            <span className="field-label">Local path</span>
            <input
              className="field-input mono"
              value={localPath}
              onChange={(e) => handlePathChange(e.target.value)}
              placeholder="e.g. /Users/ilya/Dev/my-project"
            />
            <span className="field-hint">Working directory for terminals.</span>
          </div>
          <div className="field">
            <span className="field-label">Project name</span>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-filled from repo or path"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create Project</button>
          </div>
        </form>
      </div>
    </div>
  );
}
