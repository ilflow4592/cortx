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
 * Working tree 변경사항만 반환 (IntelliJ Commit 탭과 동일 의미).
 * staged + unstaged + untracked — 이미 커밋된 브랜치 diff 는 제외.
 * 같은 파일이 여러 곳에 등장하면 마지막 status 코드가 이긴다.
 */
export async function fetchChangedFiles(cwd: string): Promise<ChangedFile[]> {
  const staged = await runShell(cwd, `git diff --cached --name-status 2>/dev/null`);
  const unstaged = await runShell(cwd, `git diff --name-status 2>/dev/null`);
  // untracked — git diff 에 잡히지 않는 새 파일 포함.
  const untracked = await runShell(cwd, `git ls-files --others --exclude-standard 2>/dev/null`);

  const fileMap = new Map<string, string>();
  for (const line of [...unstaged.split('\n'), ...staged.split('\n')]) {
    const match = line.match(/^([MADR?]+)\t(.+)/);
    if (match) fileMap.set(match[2], match[1]);
  }
  for (const path of untracked.split('\n')) {
    const trimmed = path.trim();
    if (trimmed && !fileMap.has(trimmed)) fileMap.set(trimmed, '?');
  }
  return [...fileMap.entries()].map(([path, status]) => ({ path, status }));
}

/**
 * 단일 파일에 대한 diff 텍스트를 여러 전략으로 시도 — 최초로 비어있지 않은
 * 결과를 반환. 우선순위: branch diff > staged > unstaged > HEAD~1.
 */
/**
 * Working tree 기준 단일 파일 diff — staged > unstaged > untracked 순.
 * 이미 커밋된 브랜치 diff 는 조회하지 않음 (Changes 탭 정책 일치).
 */
export async function fetchFileDiff(cwd: string, file: string): Promise<string> {
  const escaped = file.replace(/'/g, "'\\''");
  let diff = await runShell(cwd, `git diff --cached -- '${escaped}' 2>/dev/null`);
  if (!diff.trim()) diff = await runShell(cwd, `git diff -- '${escaped}' 2>/dev/null`);
  // untracked 파일은 git diff 로 안 잡힘 — index 없이 파일 대비 /dev/null 로 diff.
  if (!diff.trim()) diff = await runShell(cwd, `git diff --no-index -- /dev/null '${escaped}' 2>/dev/null`);
  return diff;
}
