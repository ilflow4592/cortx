// Tauri API는 동적 import (CLAUDE.md 규칙 + chunk splitting).
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export async function openDialog(opts: { directory?: boolean; multiple?: boolean; title?: string }) {
  const mod = await import('@tauri-apps/plugin-dialog');
  return mod.open(opts);
}

export interface ShellResult {
  success: boolean;
  output: string;
  error: string;
}

export interface WorktreeResult {
  success: boolean;
  output: string;
  error: string;
}

export interface CortxConfig {
  setup: string[];
  archive: string[];
}

export async function listBranches(cwd: string): Promise<string[]> {
  const r = await invoke<{ success: boolean; output: string }>('run_shell_command', {
    cwd,
    command: 'git branch -a --format="%(refname:short)"',
  });
  if (!r.success) return [];
  return r.output.trim().split('\n').filter(Boolean);
}

export async function pullBaseBranch(repoPath: string, baseBranch: string): Promise<ShellResult> {
  // --all --prune: 모든 remote 의 최신 refs 받고 삭제된 원격 브랜치도 정리 —
  // ProjectSettings 의 Fetch+Pull 버튼과 동일 명령.
  return invoke<ShellResult>('run_shell_command', {
    cwd: repoPath,
    command: `git fetch --all --prune && git checkout ${baseBranch} && git pull origin ${baseBranch}`,
  });
}

export async function createWorktree(params: {
  repoPath: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
}): Promise<WorktreeResult> {
  return invoke<WorktreeResult>('create_worktree', params);
}

export async function readCortxConfig(repoPath: string): Promise<CortxConfig> {
  return invoke<CortxConfig>('read_cortx_yaml', { repoPath });
}

export async function runSetupScripts(cwd: string, scripts: string[]): Promise<void> {
  await invoke('run_setup_scripts', { cwd, scripts });
}

/**
 * 워크트리 루트의 `.gitignore` 에 `.cortx/trash/` 패턴을 보장한다.
 * Claude 가 rm 훅 차단을 우회해 삭제 대상을 `.cortx/trash/{timestamp}/` 로
 * 이동하도록 하는 컨벤션의 git 추적 차단.
 *
 * 이미 패턴이 있으면 no-op. 파일이 없으면 새로 생성.
 * 실패해도 워크트리 생성은 성공 — best effort.
 */
export async function ensureTrashGitignore(worktreePath: string): Promise<void> {
  // grep -q 로 이미 있는지 확인 후 없을 때만 append. 파일 자체가 없으면 새로 생성.
  const script = [
    `touch .gitignore`,
    `grep -qxF '.cortx/trash/' .gitignore 2>/dev/null || printf '\\n# cortx — Claude 삭제 대기 파일\\n.cortx/trash/\\n' >> .gitignore`,
  ].join(' && ');
  await invoke<ShellResult>('run_shell_command', { cwd: worktreePath, command: script });
}
