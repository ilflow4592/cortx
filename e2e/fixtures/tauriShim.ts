/**
 * Tauri API 모킹 — `@tauri-apps/api/core`의 invoke와 event listen을
 * window.__TAURI_INTERNALS__로 주입해 Vite 환경에서도 앱 초기 렌더 통과.
 *
 * 실제 시스템 호출 (spawn_claude 등)은 여기서 no-op 이지만, `plugin:event|listen`
 * 을 지원하여 테스트가 `window.__shimEmitEvent(name, payload)` 로 커스텀 이벤트
 * 를 발화할 수 있다. claude-data / claude-done 등 streaming UI 플로우 검증용.
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
      const userHandler = new Function(`return (${handlerSrc});`)();

      // event listener 저장소 — plugin:event|listen 호출 시 여기에 등록
      const listeners: Map<string, Map<number, (payload: unknown) => void>> = new Map();
      let nextListenerId = 1;
      const cbMap: Map<number, (arg: unknown) => unknown> = new Map();

      const shimInvokeHandler = (cmd: string, args?: Record<string, unknown>): unknown => {
        if (cmd === 'plugin:event|listen') {
          const event = (args?.event as string) || '';
          const cbId = args?.handler as number;
          const callback = cbMap.get(cbId);
          if (!callback) return Promise.resolve(nextListenerId++);
          const id = nextListenerId++;
          let bucket = listeners.get(event);
          if (!bucket) {
            bucket = new Map();
            listeners.set(event, bucket);
          }
          bucket.set(id, (payload) => callback({ event, id, payload }));
          return Promise.resolve(id);
        }
        if (cmd === 'plugin:event|unlisten') {
          const event = (args?.event as string) || '';
          const id = args?.eventId as number;
          listeners.get(event)?.delete(id);
          return Promise.resolve();
        }
        if (cmd === 'plugin:event|emit') {
          // 프론트엔드가 emit 호출 시 로컬 listener 에만 전달 (no-op 으로 충분)
          return Promise.resolve();
        }
        return userHandler(cmd, args);
      };

      const internals = {
        invoke: (cmd: string, args?: Record<string, unknown>) => {
          try {
            return Promise.resolve(shimInvokeHandler(cmd, args));
          } catch (e) {
            return Promise.reject(e);
          }
        },
        transformCallback: <T>(cb: (arg: T) => unknown) => {
          const id = nextListenerId++;
          cbMap.set(id, cb as (arg: unknown) => unknown);
          return id;
        },
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      };
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: internals, writable: false });

      // 테스트에서 프로그래매틱 이벤트 발화용
      const shimApi = {
        __shimEmitEvent(name: string, payload: unknown) {
          const bucket = listeners.get(name);
          if (!bucket) return;
          for (const cb of bucket.values()) cb(payload);
        },
        __shimEmitByPrefix(prefix: string, payload: unknown) {
          for (const [name, bucket] of listeners.entries()) {
            if (!name.startsWith(prefix)) continue;
            for (const cb of bucket.values()) cb(payload);
          }
        },
        __shimListenerCount(prefix: string): number {
          let n = 0;
          for (const name of listeners.keys()) if (name.startsWith(prefix)) n++;
          return n;
        },
      };
      Object.assign(window, shimApi);

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
