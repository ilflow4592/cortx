/**
 * Tauri API 모킹 — `@tauri-apps/api/core`의 invoke와 event listen을
 * window.__TAURI_INTERNALS__로 주입해 Vite 환경에서도 앱 초기 렌더 통과.
 *
 * 실제 시스템 호출 (spawn_claude 등)은 여기서 no-op. UI 회귀만 잡는 용도.
 *
 * 컨셉: `@tauri-apps/api/core`의 `invoke`는 `window.__TAURI_INTERNALS__.invoke`를
 * 호출하는 wrapper. 이를 mock handler로 대체.
 */
import type { Page } from '@playwright/test';

export type InvokeHandler = (cmd: string, args?: Record<string, unknown>) => unknown;

/** 기본 핸들러 — 대부분의 command에 빈 값/성공 반환. 필요하면 테스트에서 override */
const defaultInvokeHandler: InvokeHandler = (cmd) => {
  switch (cmd) {
    case 'plugin:sql|load':
    case 'plugin:sql|execute':
      return Promise.resolve();
    case 'plugin:sql|select':
      return Promise.resolve([]);
    case 'list_mcp_servers':
    case 'list_slash_commands':
    case 'list_worktrees':
    case 'get_changes':
      return Promise.resolve([]);
    case 'ping':
      return Promise.resolve('pong');
    default:
      return Promise.resolve(null);
  }
};

export interface ShimOptions {
  /** true(기본): localStorage 에 cortx-onboarded 를 미리 세팅해 온보딩 오버레이 차단 */
  skipOnboarding?: boolean;
}

export async function installTauriShim(
  page: Page,
  invokeHandler: InvokeHandler = defaultInvokeHandler,
  options: ShimOptions = {},
) {
  const serialized = invokeHandler.toString();
  const skipOnboarding = options.skipOnboarding ?? true;
  await page.addInitScript(
    ({ handlerSrc, skipOnboarding }: { handlerSrc: string; skipOnboarding: boolean }) => {
      const handler = new Function(`return (${handlerSrc});`)();
      const internals = {
        invoke: (cmd: string, args?: Record<string, unknown>) => {
          try {
            return Promise.resolve(handler(cmd, args));
          } catch (e) {
            return Promise.reject(e);
          }
        },
        transformCallback: <T>(cb: (arg: T) => unknown) => {
          const id = Math.floor(Math.random() * 1e9);
          (window as unknown as Record<string, unknown>)[`_tauri_cb_${id}`] = cb;
          return id;
        },
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      };
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: internals, writable: false });
      if (skipOnboarding) {
        try {
          window.localStorage.setItem('cortx-onboarded', '1');
        } catch {
          /* storage 차단 환경 — 무시 */
        }
      }
    },
    { handlerSrc: serialized, skipOnboarding },
  );
}
