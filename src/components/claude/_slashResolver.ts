/**
 * Slash command 해석 — useClaudeSession 에서 추출.
 *
 * `/pipeline:dev-task` 같은 명령을 .claude/commands/<path>.md 파일로 매핑,
 * $ARGUMENTS / {TASK_ID} / {TASK_NAME} 치환 후 실제 prompt 반환.
 *
 * pipeline:* 계열은 자동으로 branch + title 을 args 로 채움 (사용자가 직접
 * 인자 안 넣어도 됨).
 */
import { useTaskStore } from '../../stores/taskStore';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export async function resolveSlashCommand(text: string, taskId: string, cwd: string): Promise<string> {
  if (!text.startsWith('/')) return text;

  const parts = text.slice(1).split(/\s+/);
  const cmdName = parts[0];
  let args = parts.slice(1).join(' ');

  // pipeline:* → 현재 태스크의 branch/title 로 자동 채움
  const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (cmdName.startsWith('pipeline:') && currentTask) {
    const branch = currentTask.branchName || '';
    const title = currentTask.title || '';
    if (!args.trim()) {
      args = `${branch} ${title}`.trim();
    }
  }

  // .claude/commands/<path>.md 파일 조회 (project 우선 → user global)
  const skillKey = cmdName.replace(/:/g, '/');
  const filePath = skillKey + '.md';
  for (const base of [`${cwd}/.claude/commands`, '~/.claude/commands']) {
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: `cat "${base}/${filePath}" 2>/dev/null`,
      });
      if (result.success && result.output.trim()) {
        let prompt = result.output;
        prompt = prompt.replace(/\$ARGUMENTS/g, args);
        if (currentTask) {
          prompt = prompt.replace(/\{TASK_ID\}/g, currentTask.branchName || '');
          prompt = prompt.replace(/\{TASK_NAME\}/g, currentTask.title || '');
        }
        return prompt;
      }
    } catch {
      /* continue */
    }
  }

  return text;
}
