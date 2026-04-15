import { invoke } from './tauri';

/**
 * Shell command helper (exported for reuse in useClaudeSession).
 *
 * `timeoutSec` (optional) — Rust 백엔드가 자식 프로세스를 시간 초과 시 KILL.
 * macOS의 GNU `timeout` 부재나 Windows의 cmd `timeout` 차이를 우회 (cross-platform).
 * 미지정 시 무한 대기 (기존 동작).
 */
export async function runShell(
  command: string,
  timeoutSec?: number,
): Promise<{ success: boolean; output: string; error?: string }> {
  return invoke<{ success: boolean; output: string; error?: string }>('run_shell_command', {
    cwd: '/',
    command,
    timeoutSec: timeoutSec ?? null,
  });
}
