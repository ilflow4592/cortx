/**
 * @module task-export/dialog
 * Tauri plugin-dialog 래퍼 — dynamic import로 chunk splitting 유지.
 */

/** save dialog 래퍼 — 사용자에게 파일 저장 위치를 묻고 경로를 반환 */
export async function save(opts: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) {
  const mod = await import('@tauri-apps/plugin-dialog');
  return mod.save(opts);
}

/** open dialog 래퍼 — 사용자에게 파일 선택을 요청 */
export async function open(opts: { multiple?: boolean; filters?: { name: string; extensions: string[] }[] }) {
  const mod = await import('@tauri-apps/plugin-dialog');
  return mod.open(opts);
}
