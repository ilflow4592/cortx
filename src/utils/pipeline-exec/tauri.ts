/**
 * Tauri API 동적 import 래퍼 (CLAUDE.md 규칙 + quality gate 훅).
 * Shared between runShell / runPipeline to avoid duplicating dynamic imports.
 */

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export async function listen<T>(event: string, handler: (ev: { payload: T }) => void): Promise<() => void> {
  const mod = await import('@tauri-apps/api/event');
  return mod.listen<T>(event, handler);
}
