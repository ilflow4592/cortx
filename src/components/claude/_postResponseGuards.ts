/**
 * Post-response guardrails — Claude 응답 완료 후 메시지 변조 및 이벤트 발행.
 * useClaudeSession.ts 에서 분리. 3가지 처리:
 *   1. Counter-question guard (grill_me 중 premature Q 번호 제거/확인 삽입)
 *   2. Canary leak 검출 + 마스킹 (prompt injection 성공 신호)
 *   3. Secret scanner (token/key 마스킹)
 *
 * 각 처리는 `setMessages` mutation 을 통해 UI 에 반영하고, 위반 시
 * `guardrailEventBus` 에 이벤트 publish + desktop notification.
 */
import type { Message } from './types';
import { applyCounterQuestionGuard, extractHighestQNumber } from './counterQuestionGuard';
import { recordViolation } from './violationTracker';
import { detectCanaryLeak, maskCanary } from './canaryGuard';
import { scanForSecrets } from './secretScanner';
import { recordAndPublish } from '../../services/guardrailEventBus';
import { sendNotification } from '../../utils/notification';

type SetMessages = (fn: (prev: Message[]) => Message[]) => void;

interface CounterQuestionGuardArgs {
  taskId: string;
  userText: string;
  messagesRef: React.RefObject<Message[]>;
  setMessages: SetMessages;
}

/**
 * Grill-me 중 역질문 응답 감시 — premature Q 번호가 있으면 제거하거나
 * 누락된 확인 문구 "이 방향으로 진행할까요?" 삽입.
 */
export function applyCounterQuestionPostGuard({
  taskId,
  userText,
  messagesRef,
  setMessages,
}: CounterQuestionGuardArgs): void {
  const allMsgs = messagesRef.current || [];
  const assistantMsgs = allMsgs.filter((m) => m.role === 'assistant');
  const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
  if (!lastAssistant) return;

  const prevMsgs = assistantMsgs.slice(0, -1);
  const currentQNumber = prevMsgs.reduce((max, m) => Math.max(max, extractHighestQNumber(m.content)), 0);
  const guardResult = applyCounterQuestionGuard({
    userText,
    responseText: lastAssistant.content,
    currentQNumber,
  });
  if (!guardResult) return;

  const targetId = lastAssistant.id;
  const markType = guardResult.violationType === 'premature_q' ? 'q_trimmed' : 'confirmation_added';
  setMessages((prev) =>
    prev.map((m) =>
      m.id === targetId
        ? {
            ...m,
            content: guardResult.correctedText,
            guardrailMarks: [...(m.guardrailMarks || []), { type: markType, detail: guardResult.violationDetail }],
          }
        : m,
    ),
  );
  recordViolation({
    taskId,
    violationType: guardResult.violationType,
    violationDetail: guardResult.violationDetail,
  });
}

interface SecretCanaryGuardArgs {
  taskId: string;
  messagesRef: React.RefObject<Message[]>;
  setMessages: SetMessages;
}

/**
 * Canary + Secret 스캔 — 응답 마지막 assistant 메시지에서 내부 honeypot 또는
 * API key/token 탐지 시 마스킹 + guardrail 이벤트 발행.
 */
export function applySecretCanaryPostGuard({ taskId, messagesRef, setMessages }: SecretCanaryGuardArgs): void {
  const allMsgs = messagesRef.current || [];
  const assistantMsgs = allMsgs.filter((m) => m.role === 'assistant');
  const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
  if (!lastAssistant) return;

  let content = lastAssistant.content;
  const newMarks: { type: 'canary_blocked' | 'secret_masked'; detail?: string }[] = [];

  if (detectCanaryLeak(content, taskId)) {
    content = maskCanary(content, taskId);
    newMarks.push({ type: 'canary_blocked' });
    void recordAndPublish('canary_leak_detected', { taskId });
    sendNotification(
      'Cortx — Prompt Injection 감지',
      'Claude가 내부 canary 토큰을 유출했습니다. 응답이 차단되었습니다.',
    );
  }

  const scan = scanForSecrets(content);
  if (scan.found) {
    content = scan.masked;
    newMarks.push({ type: 'secret_masked', detail: scan.matches.map((x) => x.type).join(', ') });
    void recordAndPublish('secret_leak_masked', {
      taskId,
      types: scan.matches.map((x) => x.type),
      count: scan.matches.length,
    });
  }

  if (newMarks.length === 0) return;
  const targetId = lastAssistant.id;
  setMessages((prev) =>
    prev.map((m) =>
      m.id === targetId ? { ...m, content, guardrailMarks: [...(m.guardrailMarks || []), ...newMarks] } : m,
    ),
  );
}
