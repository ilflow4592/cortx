/**
 * SQLite connection singleton.
 *
 * `@tauri-apps/plugin-sql`의 Database 인스턴스 타입 — 정적 import 없이 typeof 추론.
 * CLAUDE.md 규칙: Tauri API는 반드시 동적 import. 프로젝트 품질 게이트도 이를 강제한다.
 */

export type DbHandle = Awaited<ReturnType<(typeof import('@tauri-apps/plugin-sql'))['default']['load']>>;

let db: DbHandle | null = null;

export async function getDb(): Promise<DbHandle> {
  if (!db) {
    const { default: SqlDatabase } = await import('@tauri-apps/plugin-sql');
    db = await SqlDatabase.load('sqlite:cortx.db');
  }
  return db;
}

/**
 * 안전한 JSON.parse — 실패 시 fallback 반환하고 콘솔에 경고.
 * DB에 손상된 JSON이 있어도 loadAll* 전체가 throw되지 않도록 개별 row 단위로 보호한다.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T, context?: string): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    if (context) console.warn(`[db] JSON.parse failed (${context}):`, err);
    return fallback;
  }
}
