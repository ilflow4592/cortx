/**
 * @module task-export/paths
 * 기본 저장 경로 계산 — project localPath를 선호하여 사용자가 작업 중인 코드 옆에 저장되도록.
 */

import type { Task } from '../../types/task';
import type { Project } from '../../types/project';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7af]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Build the default save path for a task export.
 * Prefers project.localPath so users save alongside the code they're working on.
 * Falls back to home directory if project has no path.
 */
export function buildDefaultPath(task: Task, project: Project | null, extension: string): string {
  const slug = slugify(task.title) || 'task';
  const fileName = `${slug}.${extension}`;
  // Prefer project root, else worktree path, else just the filename (Tauri resolves to home)
  const baseDir = project?.localPath || task.worktreePath || task.repoPath || '';
  if (!baseDir) return fileName;
  const sep = baseDir.endsWith('/') ? '' : '/';
  return `${baseDir}${sep}${fileName}`;
}
