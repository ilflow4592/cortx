/**
 * @module services/secrets
 *
 * OS Keychain 기반 시크릿 저장 — Notion API token 등 민감 정보를 OS 보안 저장소에
 * 보관한다. localStorage(plaintext, DevTools 노출) 대비 암호화 + OS 인증 필요.
 *
 * 백엔드: Rust commands/secrets.rs (keyring crate)
 *   macOS Keychain / Windows Credential Manager / Linux Secret Service
 *
 * 모든 시크릿은 service='cortx'로 격리. key는 자유 (예: 'notion-api-token').
 */

const SERVICE = 'cortx';
const NOTION_KEY = 'notion-api-token';

/** Tauri 백엔드 호출 헬퍼. 동적 import로 Tauri 외부 환경 안전. */
async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/** 임의 시크릿 저장. 빈 문자열은 삭제로 처리됨 (Rust 측 약속). */
export async function setSecret(key: string, value: string): Promise<void> {
  return invoke<void>('set_secret', { service: SERVICE, key, value });
}

/** 임의 시크릿 조회. 없으면 null. */
export async function getSecret(key: string): Promise<string | null> {
  return invoke<string | null>('get_secret', { service: SERVICE, key });
}

/** 임의 시크릿 삭제. 이미 없어도 OK (idempotent). */
export async function deleteSecret(key: string): Promise<void> {
  return invoke<void>('delete_secret', { service: SERVICE, key });
}

// ── Notion API token 전용 헬퍼 ────────────────────────────

/**
 * 저장된 Notion API token 조회. 없거나 에러면 undefined.
 * cortx 외부(테스트, 노드 환경)에서 invoke 실패 시에도 graceful.
 */
export async function getNotionApiToken(): Promise<string | undefined> {
  try {
    const v = await getSecret(NOTION_KEY);
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Notion API token 저장. 빈 문자열이면 삭제.
 * 형식 검증 (ntn_xxx / secret_xxx)은 호출자가 책임.
 */
export async function setNotionApiToken(token: string): Promise<void> {
  return setSecret(NOTION_KEY, token.trim());
}

/** 저장된 Notion API token 삭제. */
export async function clearNotionApiToken(): Promise<void> {
  return deleteSecret(NOTION_KEY);
}

/** 저장 상태만 boolean으로 확인 (UI 표시용). */
export async function hasNotionApiToken(): Promise<boolean> {
  const t = await getNotionApiToken();
  return !!t;
}
