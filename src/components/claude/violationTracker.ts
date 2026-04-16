/**
 * Per-task violation counter with anomaly detection.
 *
 * 동일 태스크에서 반복 위반 시 사용자에게 알림.
 * 메모리 전용 — 앱 재시작 시 초기화됨 (의도된 단순함).
 */
import { sendNotification } from '../../utils/notification';
import { recordEvent } from '../../services/telemetry';
import type { ViolationType } from './counterQuestionGuard';

/** 태스크별 위반 카운트. taskId → count */
const violationCounts = new Map<string, number>();

/** 알림을 이미 띄운 태스크 (중복 방지) — taskId 집합 */
const notifiedTasks = new Set<string>();

/** 이 횟수부터 anomaly로 판단 */
const ANOMALY_THRESHOLD = 3;

/**
 * 위반 발생 기록. telemetry 전송 + anomaly 감지.
 * 반환값: 이번 위반이 anomaly인지 여부 (UI에서 배너 표시 등 활용)
 */
export function recordViolation(params: { taskId: string; violationType: ViolationType; violationDetail?: string }): {
  count: number;
  isAnomaly: boolean;
} {
  const prev = violationCounts.get(params.taskId) ?? 0;
  const count = prev + 1;
  violationCounts.set(params.taskId, count);

  const isAnomaly = count >= ANOMALY_THRESHOLD;

  // Telemetry (사용자가 opt-in 한 경우만 실제 저장)
  void recordEvent('metric', 'counter_question_violation', {
    violationType: params.violationType,
    violationDetail: params.violationDetail,
    count,
    isAnomaly,
  });

  // Anomaly 발생 시 1회만 UI 알림
  if (isAnomaly && !notifiedTasks.has(params.taskId)) {
    notifiedTasks.add(params.taskId);
    sendNotification(
      'Cortx — Claude 규칙 반복 위반',
      `이 태스크에서 Claude가 역질문 처리 규칙을 ${count}회 어겼습니다. 코드 레벨 가드가 자동 교정 중입니다.`,
    );
  }

  return { count, isAnomaly };
}

/** 태스크의 현재 위반 카운트 조회 (UI 배너용) */
export function getViolationCount(taskId: string): number {
  return violationCounts.get(taskId) ?? 0;
}

/** 태스크 종료/리셋 시 카운트 초기화 */
export function resetViolations(taskId: string): void {
  violationCounts.delete(taskId);
  notifiedTasks.delete(taskId);
}

/** 전체 상태 초기화 — 테스트/디버깅용 */
export function clearAllViolations(): void {
  violationCounts.clear();
  notifiedTasks.clear();
}
