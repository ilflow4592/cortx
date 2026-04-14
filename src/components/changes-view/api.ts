/** Changes view용 git 헬퍼 — runShell wrapper + 상태/diff 조회. */
import type { ChangedFile } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/** cwd에서 shell 명령 실행, 성공 시 stdout 반환 (실패는 빈 문자열). */
export async function runShell(cwd: string, command: string): Promise<string> {
  const result = await invoke<{ success: boolean; output: string }>('run_shell_command', { cwd, command });
  return result.success ? result.output : '';
}

/**
 * 브랜치 diff + staged + unstaged 결과를 합쳐 ChangedFile 목록 반환.
 * 같은 파일이 여러 곳에 등장하면 마지막 status 코드가 이긴다.
 */
export async function fetchChangedFiles(cwd: string): Promise<ChangedFile[]> {
  const branchDiff = await runShell(
    cwd,
    `git diff --name-status origin/develop...HEAD 2>/dev/null || git diff --name-status HEAD~5 2>/dev/null`,
  );
  const staged = await runShell(cwd, `git diff --cached --name-status 2>/dev/null`);
  const unstaged = await runShell(cwd, `git diff --name-status 2>/dev/null`);

  const fileMap = new Map<string, string>();
  for (const line of [...branchDiff.split('\n'), ...unstaged.split('\n'), ...staged.split('\n')]) {
    const match = line.match(/^([MADR?]+)\t(.+)/);
    if (match) fileMap.set(match[2], match[1]);
  }
  return [...fileMap.entries()].map(([path, status]) => ({ path, status }));
}

/**
 * 단일 파일에 대한 diff 텍스트를 여러 전략으로 시도 — 최초로 비어있지 않은
 * 결과를 반환. 우선순위: branch diff > staged > unstaged > HEAD~1.
 */
export async function fetchFileDiff(cwd: string, file: string): Promise<string> {
  const escaped = file.replace(/'/g, "'\\''");
  let diff = await runShell(cwd, `git diff origin/develop...HEAD -- '${escaped}' 2>/dev/null`);
  if (!diff.trim()) diff = await runShell(cwd, `git diff --cached -- '${escaped}' 2>/dev/null`);
  if (!diff.trim()) diff = await runShell(cwd, `git diff -- '${escaped}' 2>/dev/null`);
  if (!diff.trim()) diff = await runShell(cwd, `git diff HEAD~1 -- '${escaped}' 2>/dev/null`);
  return diff;
}
