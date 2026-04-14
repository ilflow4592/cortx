/** `git worktree list --porcelain` 출력 파서 + Task 기반 분류. */
import type { Task } from '../../types/task';
import type { Category } from './types';

/**
 * porcelain 형식 출력에서 path/branch 페어를 추출.
 * `worktree <path>` 라인을 만나면 직전 항목을 push하고 새 항목 시작.
 */
export function parseWorktrees(output: string): { path: string; branch: string }[] {
  const entries: { path: string; branch: string }[] = [];
  let currentPath = '';
  let currentBranch = '';
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (currentPath) {
        entries.push({ path: currentPath, branch: currentBranch });
      }
      currentPath = line.slice(9).trim();
      currentBranch = '';
    } else if (line.startsWith('branch ')) {
      currentBranch = line
        .slice(7)
        .trim()
        .replace(/^refs\/heads\//, '');
    }
  }
  if (currentPath) {
    entries.push({ path: currentPath, branch: currentBranch });
  }
  return entries;
}

/**
 * worktree 엔트리를 task 상태 기반으로 분류:
 * - task 없음 → orphan (앱과 연결 끊김)
 * - task.status === 'done' → stale (정리 안전)
 * - 그 외 → active (정리하면 안 됨)
 */
export function classifyWorktree(task: Task | undefined): { category: Category; ageInDays: number } {
  if (!task) {
    return { category: 'orphan', ageInDays: Infinity };
  }
  const now = Date.now();
  const updated = new Date(task.updatedAt).getTime();
  const ageInDays = Math.floor((now - updated) / (1000 * 60 * 60 * 24));
  if (task.status === 'done') {
    return { category: 'stale', ageInDays };
  }
  return { category: 'active', ageInDays };
}
