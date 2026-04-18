import type { Project } from '../../types/project';
import type { Task } from '../../types/task';
import { upsertProject } from './projects';
import { upsertTask, setActiveTaskId } from './tasks';
import { logger } from '../../utils/logger';

const MIGRATION_KEY = 'cortx-migrated-to-sqlite';

export async function migrateFromLocalStorageIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    // Load from old localStorage keys
    const tasksRaw = localStorage.getItem('cortx-tasks');
    const projectsRaw = localStorage.getItem('cortx-projects');

    if (projectsRaw) {
      const data = JSON.parse(projectsRaw);
      const projects: Project[] = Array.isArray(data) ? data : data?.projects || [];
      for (const p of projects) {
        await upsertProject({
          id: p.id,
          name: p.name || '',
          localPath: p.localPath || '',
          githubOwner: p.githubOwner || '',
          githubRepo: p.githubRepo || '',
          baseBranch: p.baseBranch || 'main',
          slackChannels: Array.isArray(p.slackChannels) ? p.slackChannels : [],
          color: p.color || '#818cf8',
          createdAt: p.createdAt || new Date().toISOString(),
        });
      }
    }

    if (tasksRaw) {
      const data = JSON.parse(tasksRaw);
      const tasks: Task[] = data?.tasks || [];
      for (const t of tasks) {
        await upsertTask({
          id: t.id,
          title: t.title || '',
          status: t.status || 'waiting',
          layer: t.layer || 'focus',
          projectId: t.projectId,
          branchName: t.branchName || '',
          worktreePath: t.worktreePath || '',
          repoPath: t.repoPath || '',
          memo: t.memo || '',
          elapsedSeconds: t.elapsedSeconds || 0,
          chatHistory: Array.isArray(t.chatHistory) ? t.chatHistory : [],
          interrupts: Array.isArray(t.interrupts) ? t.interrupts : [],
          pipeline: t.pipeline,
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
        });
      }
      if (data?.activeTaskId) {
        await setActiveTaskId(data.activeTaskId);
      }
    }

    localStorage.setItem(MIGRATION_KEY, '1');
  } catch (err) {
    logger.error('[cortx] Migration from localStorage failed:', err);
  }
}
