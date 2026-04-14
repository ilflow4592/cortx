/**
 * MCP 서버 CRUD — `~/.claude.json` 대상 Tauri 커맨드 래퍼.
 */
import type { RawServer, DraftServer } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function listMcpServers(): Promise<RawServer[]> {
  return invoke('list_mcp_servers');
}

export async function removeMcpServer(name: string): Promise<void> {
  await invoke('remove_mcp_server', { name });
}

export async function upsertMcpServer(draft: DraftServer): Promise<void> {
  // args 문자열을 기본 quoting 처리 후 배열로 분해
  const argsArray =
    draft.args
      .trim()
      .match(/(?:[^\s"]+|"[^"]*")+/g)
      ?.map((a) => a.replace(/^"|"$/g, '')) || [];

  await invoke('upsert_mcp_server', {
    server: {
      name: draft.name.trim(),
      server_type: draft.type,
      command: draft.type === 'stdio' ? draft.command : null,
      args: draft.type === 'stdio' ? argsArray : null,
      env: parseEnvText(draft.envText),
      url: draft.type === 'http' ? draft.url : null,
    },
  });
}

/** `KEY=value` 줄 단위 텍스트 → 객체. 빈 줄·주석(#)은 skip */
export function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

export function stringifyEnv(env: Record<string, string | undefined>): string {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

export function emptyDraft(): DraftServer {
  return { name: '', type: 'stdio', command: 'npx', args: '', envText: '', url: '' };
}
