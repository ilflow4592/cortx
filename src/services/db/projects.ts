import type { Project, ProjectMetadata } from '../../types/project';
import { getDb, safeJsonParse } from './connection';

interface ProjectRow {
  id: string;
  name: string;
  local_path: string;
  github_owner: string;
  github_repo: string;
  base_branch: string;
  slack_channels: string;
  color: string;
  created_at: string;
  metadata: string | null;
}

export function rowToProject(row: ProjectRow): Project {
  const metadata = safeJsonParse<ProjectMetadata | undefined>(row.metadata, undefined, `project.metadata ${row.id}`);
  const slackChannels = safeJsonParse<string[]>(row.slack_channels, [], `project.slackChannels ${row.id}`);
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    githubOwner: row.github_owner,
    githubRepo: row.github_repo,
    baseBranch: row.base_branch,
    slackChannels: Array.isArray(slackChannels) ? slackChannels : [],
    color: row.color,
    createdAt: row.created_at,
    metadata,
  };
}

export async function loadAllProjects(): Promise<Project[]> {
  const d = await getDb();
  const rows = await d.select<ProjectRow[]>('SELECT * FROM projects ORDER BY created_at ASC');
  return rows.map(rowToProject);
}

export async function upsertProject(p: Project): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO projects (id, name, local_path, github_owner, github_repo, base_branch, slack_channels, color, created_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       local_path = excluded.local_path,
       github_owner = excluded.github_owner,
       github_repo = excluded.github_repo,
       base_branch = excluded.base_branch,
       slack_channels = excluded.slack_channels,
       color = excluded.color,
       metadata = excluded.metadata`,
    [
      p.id,
      p.name,
      p.localPath,
      p.githubOwner,
      p.githubRepo,
      p.baseBranch,
      JSON.stringify(p.slackChannels || []),
      p.color,
      p.createdAt,
      p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
}

export async function deleteProject(id: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM projects WHERE id = $1', [id]);
}
