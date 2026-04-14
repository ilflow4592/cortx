import { useState, useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import type { TaskLayer } from '../types/task';
import { slugify } from './new-task-modal/types';
import { listBranches, pullBaseBranch, createWorktree, readCortxConfig, runSetupScripts } from './new-task-modal/api';
import { TaskFormFields } from './new-task-modal/TaskFormFields';
import { CreateWorktreeProgress } from './new-task-modal/CreateWorktreeProgress';
import { ModalBackdrop } from './common/ModalBackdrop';

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

  const selectedProject = projects.find((p) => p.id === projectId);

  // Fetch branches when project changes
  useEffect(() => {
    if (!selectedProject?.localPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard reset, not cascading
      setBranches([]);
      return;
    }
    listBranches(selectedProject.localPath)
      .then((bs) => setBranches(bs))
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
        const fetchResult = await pullBaseBranch(repoPath, baseBranch);
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

      try {
        const result = await createWorktree({ repoPath, worktreePath, branchName, baseBranch });

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
          const config = await readCortxConfig(repoPath);
          if (config.setup.length > 0) {
            await runSetupScripts(worktreePath, config.setup);
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
    <ModalBackdrop onClose={onClose} ariaLabel="New Task">
      <div className="modal-header">
        <h2>New Task</h2>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>
      <form className="modal-body" onSubmit={handleSubmit}>
        <TaskFormFields
          title={title}
          setTitle={setTitle}
          customBranch={customBranch}
          setCustomBranch={setCustomBranch}
          projectId={projectId}
          setProjectId={setProjectId}
          layer={layer}
          setLayer={setLayer}
          projects={projects}
          selectedProject={selectedProject}
          branches={branches}
          showBranchPicker={showBranchPicker}
          setShowBranchPicker={setShowBranchPicker}
        />

        <CreateWorktreeProgress creating={creating} status={status} error={error} />

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || creating}>
            {creating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
