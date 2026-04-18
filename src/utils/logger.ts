/**
 * 간단한 logger 추상화.
 *
 * - 개발 빌드 (`import.meta.env.DEV`): console 통과 (기존 동작 유지)
 * - 프로덕션 빌드: `debug` 무시, `info/warn/error` 는 recordEvent 로 telemetry
 *   스토어에 기록 (선택적 opt-in 이라 실제 전송 여부는 사용자 설정 의존)
 *
 * 목적: 32개 `console.*` 호출을 일괄 `logger.*` 로 치환해 프로덕션에서 noisy
 * debug 를 숨기고, error 를 로컬 telemetry 에 축적 (Sentry 없이도 기초 관측).
 */
import { recordEvent } from '../services/telemetry';

const DEV = import.meta.env.DEV;

function serializeArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export const logger = {
  /** 디버그 — 프로덕션에서 무시됨 */
  debug(...args: unknown[]): void {
    if (DEV) console.debug(...args);
  },

  /** 정보 — 개발엔 console, 프로덕션엔 telemetry */
  info(...args: unknown[]): void {
    if (DEV) {
      console.info(...args);
    } else {
      void recordEvent('action', 'log.info', { message: serializeArgs(args) });
    }
  },

  /** 경고 — 개발엔 console.warn, 프로덕션엔 telemetry */
  warn(...args: unknown[]): void {
    if (DEV) {
      console.warn(...args);
    } else {
      void recordEvent('action', 'log.warn', { message: serializeArgs(args) });
    }
  },

  /**
   * 에러 — 항상 기록. 개발엔 console.error + telemetry 둘 다.
   * 프로덕션에선 telemetry 만 (console 은 유저에게 보이지 않음).
   */
  error(...args: unknown[]): void {
    if (DEV) console.error(...args);
    void recordEvent('action', 'log.error', { message: serializeArgs(args) });
  },
};
