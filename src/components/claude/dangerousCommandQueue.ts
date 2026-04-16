/**
 * Dangerous command dialog queue — non-React 레이어와 React UI 연결.
 *
 * claudeEventProcessor(클래스)가 위험 명령 감지 → requestDecision()
 * 앱 루트의 DangerousCommandHost(컴포넌트)가 queue를 구독 → 모달 띄움
 * 사용자 클릭 → resolve() → processor가 await 재개
 *
 * 메모리 전용, 단일 태스크당 동시 1개 다이얼로그만 (FIFO).
 */
import type { DangerousCommandMatch } from './dangerousCommandGuard';

export type DangerChoice = 'stop' | 'continue' | 'allow_session';

export interface DangerRequest {
  id: string;
  taskId: string;
  command: string;
  matches: DangerousCommandMatch[];
  resolve: (choice: DangerChoice) => void;
}

let current: DangerRequest | null = null;
const listeners = new Set<(req: DangerRequest | null) => void>();

function notify() {
  for (const l of listeners) l(current);
}

/** 외부(클래스)에서 결정 요청 → Promise 반환 */
export function requestDangerDecision(params: Omit<DangerRequest, 'id' | 'resolve'>): Promise<DangerChoice> {
  return new Promise((resolve) => {
    current = {
      ...params,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      resolve,
    };
    notify();
  });
}

/** React 컴포넌트가 구독 */
export function subscribeDangerQueue(listener: (req: DangerRequest | null) => void): () => void {
  listeners.add(listener);
  // 즉시 현재 상태 1회 전달
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/** 사용자 결정 적용 */
export function resolveDangerDecision(id: string, choice: DangerChoice): void {
  if (!current || current.id !== id) return;
  current.resolve(choice);
  current = null;
  notify();
}

/** 전체 리셋 — 테스트/앱 종료용 */
export function clearDangerQueue(): void {
  if (current) {
    current.resolve('stop');
    current = null;
  }
  notify();
}
