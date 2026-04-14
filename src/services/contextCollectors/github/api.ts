/**
 * @module contextCollectors/github/api
 * gh CLI helper + 공유 타입.
 */

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/**
 * gh CLI를 통해 GitHub API를 호출한다.
 * Tauri의 run_shell_command로 shell에서 실행.
 * @param endpoint - GitHub API endpoint (e.g., "repos/owner/repo/commits")
 * @returns 파싱된 JSON 응답, 실패 시 null
 */
export async function ghApi(endpoint: string): Promise<unknown | null> {
  try {
    const escaped = endpoint.replace(/'/g, "'\\''");
    const result = await invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
      cwd: '/',
      command: `gh api '${escaped}' 2>/dev/null`,
    });
    if (result.success && result.output.trim()) {
      return JSON.parse(result.output);
    }
  } catch (err) {
    console.warn('[cortx:ghApi] failed:', err);
  }
  return null;
}
