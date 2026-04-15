/**
 * @module services/secrets
 *
 * OS Keychain 기반 시크릿 저장 — Notion/GitHub/Slack API token 등 민감 정보를
 * OS 보안 저장소에 보관한다. localStorage(plaintext, DevTools 노출) 대비 암호화 +
 * OS 인증 필요.
 *
 * 백엔드: Rust commands/secrets.rs (keyring crate)
 *   macOS Keychain / Windows Credential Manager / Linux Secret Service
 *
 * 모든 시크릿은 service='cortx'로 격리. key는 자유 (예: 'notion-api-token').
 */

const SERVICE = 'cortx';

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

/**
 * 특정 key용 타입 안전한 4종 헬퍼(get/set/clear/has)를 생성.
 * Notion/GitHub/Slack 등 서비스별 래퍼를 반복 선언하지 않고 factory로 통일.
 * cortx 외부(테스트, 노드 환경)에서 invoke 실패 시 get은 undefined로 graceful fallback.
 */
function makeTokenHelpers(key: string) {
  return {
    /** 저장된 토큰 조회. 없거나 에러면 undefined. */
    async get(): Promise<string | undefined> {
      try {
        const v = await getSecret(key);
        return v && v.trim() ? v.trim() : undefined;
      } catch {
        return undefined;
      }
    },
    /** 토큰 저장. 빈 문자열이면 삭제. 형식 검증은 호출자가 책임. */
    async set(token: string): Promise<void> {
      return setSecret(key, token.trim());
    },
    /** 토큰 삭제. */
    async clear(): Promise<void> {
      return deleteSecret(key);
    },
    /** 저장 상태만 boolean으로 확인 (UI 표시용). */
    async has(): Promise<boolean> {
      const t = await this.get();
      return !!t;
    },
  };
}

// ── 서비스별 토큰 헬퍼 ────────────────────────────────────

const notionHelpers = makeTokenHelpers('notion-api-token');
const githubHelpers = makeTokenHelpers('github-pat');
const slackHelpers = makeTokenHelpers('slack-bot-token');

export const getNotionApiToken = () => notionHelpers.get();
export const setNotionApiToken = (t: string) => notionHelpers.set(t);
export const clearNotionApiToken = () => notionHelpers.clear();
export const hasNotionApiToken = () => notionHelpers.has();

export const getGithubPat = () => githubHelpers.get();
export const setGithubPat = (t: string) => githubHelpers.set(t);
export const clearGithubPat = () => githubHelpers.clear();
export const hasGithubPat = () => githubHelpers.has();

export const getSlackBotToken = () => slackHelpers.get();
export const setSlackBotToken = (t: string) => slackHelpers.set(t);
export const clearSlackBotToken = () => slackHelpers.clear();
export const hasSlackBotToken = () => slackHelpers.has();
