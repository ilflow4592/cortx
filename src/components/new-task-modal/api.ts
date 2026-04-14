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
  return invoke<ShellResult>('run_shell_command', {
    cwd: repoPath,
    command: `git fetch origin && git checkout ${baseBranch} && git pull origin ${baseBranch}`,
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
