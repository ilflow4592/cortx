/** Worktree cleanup 도메인 타입. */

export type Category = 'orphan' | 'stale' | 'active';

export interface WorktreeEntry {
  projectId: string;
  projectName: string;
  worktreePath: string;
  branch: string;
  taskId?: string;
  taskTitle?: string;
  taskStatus?: string;
  updatedAt?: string;
  category: Category;
  ageInDays: number;
  selected: boolean;
}

export const STALE_THRESHOLD_DAYS = 30;
