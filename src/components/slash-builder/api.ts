/**
 * Slash command 파일 CRUD — `.claude/commands/*.md` 대상.
 *
 * builtin 커맨드는 Claude CLI 자체 소유이므로 편집 불가.
 * 각 함수는 Tauri invoke의 얇은 래퍼로 UI에서 반복되는 `projectCwd`
 * 조건부 전달을 한 곳에 모은다.
 */

export type Source = 'project' | 'user';

// SlashCommand 타입은 Rust commands/claude.rs에서 ts-rs로 자동 생성
export type { SlashCommand } from '../../types/generated/SlashCommand';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/** Project + global 스코프의 모든 커맨드를 나열. builtin은 호출자가 필터링 */
export async function listSlashCommands(projectCwd: string): Promise<SlashCommand[]> {
  return invoke('list_slash_commands', { projectCwd: projectCwd || null });
}

export async function readSlashCommand(name: string, source: string, projectCwd: string): Promise<string> {
  return invoke('read_slash_command', {
    name,
    source,
    projectCwd: source === 'project' ? projectCwd : null,
  });
}

export async function writeSlashCommand(
  name: string,
  source: Source,
  content: string,
  projectCwd: string,
): Promise<void> {
  await invoke('write_slash_command', {
    name,
    source,
    content,
    projectCwd: source === 'project' ? projectCwd : null,
  });
}

export async function deleteSlashCommand(name: string, source: string, projectCwd: string): Promise<void> {
  await invoke('delete_slash_command', {
    name,
    source,
    projectCwd: source === 'project' ? projectCwd : null,
  });
}
