import type { Task } from '../../types/task';
import type { Project } from '../../types/project';

export function WorktreeTab({ task, taskProject }: { task: Task; taskProject: Project | null | undefined }) {
  return (
    <>
      {taskProject && (
        <>
          <div className="rp-section">Project</div>
          <div className="wt-info">
            <div className="wt-row">
              <span>Name</span>
              <span className="val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: taskProject.color }} />
                {taskProject.name}
              </span>
            </div>
            {taskProject.githubOwner && taskProject.githubRepo && (
              <div className="wt-row">
                <span>GitHub</span>
                <span className="val">
                  {taskProject.githubOwner}/{taskProject.githubRepo}
                </span>
              </div>
            )}
            <div className="wt-row">
              <span>Path</span>
              <span className="val">{taskProject.localPath || '—'}</span>
            </div>
          </div>
        </>
      )}
      <div className="rp-section">Worktree</div>
      <div className="wt-info">
        <div className="wt-row">
          <span>Branch</span>
          <span className="val">{task.branchName || '—'}</span>
        </div>
        <div className="wt-row">
          <span>Path</span>
          <span className="val">{task.worktreePath || task.repoPath || taskProject?.localPath || '—'}</span>
        </div>
        <div className="wt-row">
          <span>Repo</span>
          <span className="val">{task.repoPath || taskProject?.localPath || '—'}</span>
        </div>
        <div className="wt-row">
          <span>Status</span>
          <span className="val">{task.status}</span>
        </div>
        <div className="wt-row">
          <span>Layer</span>
          <span className="val">{task.layer || 'focus'}</span>
        </div>
      </div>
      {task.memo && (
        <>
          <div className="rp-section">Last Memo</div>
          <div className="memo-callout">{task.memo}</div>
        </>
      )}
    </>
  );
}
