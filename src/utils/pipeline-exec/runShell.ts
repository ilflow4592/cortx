import { invoke } from './tauri';

/** Shell command helper (exported for reuse in useClaudeSession) */
export async function runShell(command: string): Promise<{ success: boolean; output: string }> {
  return invoke<{ success: boolean; output: string }>('run_shell_command', { cwd: '/', command });
}
