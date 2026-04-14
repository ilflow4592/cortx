/**
 * 현재 작업의 프로젝트 이름/GitHub owner/repo 표시. 색상 도트 포함.
 */
import type { Project } from '../../types/project';

export function ProjectSourceBadge({ project }: { project: Project | null }) {
  if (!project) return null;
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--fg-subtle)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 3, background: project.color }} />
      {project.githubOwner && project.githubRepo ? (
        <span>
          {project.githubOwner}/{project.githubRepo}
        </span>
      ) : (
        <span>{project.name}</span>
      )}
    </div>
  );
}
