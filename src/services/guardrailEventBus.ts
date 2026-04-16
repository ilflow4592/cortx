/**
 * In-memory guardrail event bus.
 *
 * Telemetry DB 저장과 별개로 실시간 UI 구독용 pub/sub.
 * Dashboard/StatusBar가 구독해 polling 없이 즉시 업데이트.
 *
 * ring buffer (최근 200개)만 유지 — 메모리 바운드.
 */

export type GuardrailEventName =
  | 'counter_question_violation'
  | 'context_injection_detected'
  | 'secret_leak_masked'
  | 'dangerous_command_detected'
  | 'token_budget_exceeded'
  | 'canary_leak_detected'
  | 'sensitive_file_access'
  | 'workspace_boundary_violation'
  | 'network_exfil_detected';

export interface GuardrailEvent {
  id: string;
  name: GuardrailEventName;
  timestamp: string;
  taskId?: string;
  data?: Record<string, unknown>;
}

const MAX_BUFFER = 200;
const buffer: GuardrailEvent[] = [];
const listeners = new Set<(event: GuardrailEvent) => void>();

/** 이벤트 발행 — guardrail 함수들이 호출 */
export function publishGuardrailEvent(name: GuardrailEventName, data?: Record<string, unknown>): void {
  const event: GuardrailEvent = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name,
    timestamp: new Date().toISOString(),
    taskId: typeof data?.taskId === 'string' ? data.taskId : undefined,
    data,
  };
  buffer.push(event);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      /* listener 오류는 무시 */
    }
  }
}

/** 구독 — listener 등록 + unsubscribe 반환 */
export function subscribeGuardrailEvents(listener: (event: GuardrailEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 현재 버퍼 스냅샷 반환 (초기 로드용) */
export function getRecentEvents(limit = 100): GuardrailEvent[] {
  return buffer.slice(-limit).reverse();
}

/** 시간 범위 내 이벤트 카운트 (배지용) */
export function countEventsSince(sinceMs: number): number {
  const cutoff = Date.now() - sinceMs;
  let count = 0;
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (new Date(buffer[i].timestamp).getTime() < cutoff) break;
    count++;
  }
  return count;
}

/** 테스트용 */
export function clearEventBus(): void {
  buffer.length = 0;
  listeners.clear();
}

/**
 * 편의 함수 — telemetry 기록 + bus publish 동시에.
 * guardrail 호출 지점에서 이 함수만 쓰면 양쪽 모두 업데이트됨.
 */
export async function recordAndPublish(name: GuardrailEventName, data: Record<string, unknown>): Promise<void> {
  publishGuardrailEvent(name, data);
  const { recordEvent } = await import('./telemetry');
  const kind = name === 'canary_leak_detected' ? 'error' : 'metric';
  await recordEvent(kind, name, data);
}
