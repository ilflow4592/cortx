/**
 * Review Queue dismissal store — 사용자가 "처리 완료" 표시한 item 추적.
 *
 * 메모리 전용. 앱 재시작 시 초기화 (의도: 영구 무시 방지).
 */

const dismissed = new Set<string>();
const listeners = new Set<() => void>();

export function isDismissed(itemId: string): boolean {
  return dismissed.has(itemId);
}

export function dismiss(itemId: string): void {
  dismissed.add(itemId);
  for (const l of listeners) l();
}

export function undismiss(itemId: string): void {
  dismissed.delete(itemId);
  for (const l of listeners) l();
}

export function subscribeDismiss(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDismissed(): void {
  dismissed.clear();
  for (const l of listeners) l();
}
