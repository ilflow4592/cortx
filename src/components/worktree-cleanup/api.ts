/** Worktree 조회/삭제 Tauri 커맨드 래퍼. */

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export interface ListResult {
  success: boolean;
  output: string;
  error: string;
}

export interface RemoveResult {
  success: boolean;
  error: string;
}

export function listWorktrees(repoPath: string): Promise<ListResult> {
  return invoke('list_worktrees', { repoPath });
}

export function removeWorktree(repoPath: string, worktreePath: string): Promise<RemoveResult> {
  return invoke('remove_worktree', { repoPath, worktreePath });
}
