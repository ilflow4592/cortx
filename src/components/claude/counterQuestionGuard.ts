/**
 * Counter-question guard for Grill-me pipeline.
 *
 * 2-layer defense:
 * 1. Harness: 역질문 메시지에 제약 지시 래핑 (Claude에게 전달)
 * 2. Code: 응답 완료 후 premature Q번호 감지 → 잘라내고 확인 질문 삽입
 *
 * 프롬프트/하네스만으로는 Claude CLI가 무시하므로 코드 레벨 보장 필수.
 */
import { isApproval } from './pipelinePhaseTransitions';

/** 한국어 역질문 패턴 (? 없이도 감지) */
const COUNTER_Q_PATTERNS = [
  /어떻게\s*생각/,
  /^왜[?\s？]/,
  /다른\s*방법/,
  /그게\s*뭔/,
  /뭐[가야]?\s*(좋|나|다른|더)/,
  /추천/,
  /차이가?\s*(뭐|뭔|있)/,
  /장단점/,
  /어떤\s*게?\s*(나|좋|맞)/,
  /어떻게\s*하/,
  /왜\s+그런/,
  /근거/,
  /이유가?\s*(뭐|뭔)/,
  /너는?\s*(어떻|뭐|뭘)/,
  /너가?\s*볼\s*때/,
  /어느\s*쪽/,
];

const CONFIRMATION_PHRASES = [
  '진행할까요',
  '진행해도 될까요',
  '이 방향으로',
  '괜찮을까요',
  '동의하시나요',
  '어떠신가요',
  '이렇게 할까요',
  '계속할까요',
  '맞을까요',
];

const CONFIRMATION_SUFFIX = '\n\n이 방향으로 진행할까요?';

// ─── Detection ───

/**
 * 사용자 입력이 역질문인지 판정.
 * - 승인어("ㅇ", "네" 등)는 false
 * - "진행해?" 같은 승인어+? 는 false (trailing ? 제거 후 체크)
 * - ?로 끝나거나 한국어 질문 패턴 매치 시 true
 */
export function isCounterQuestion(userText: string): boolean {
  const trimmed = userText.trim();
  if (!trimmed) return false;

  // 승인어 체크 — trailing ? 제거 후
  const withoutQ = trimmed.replace(/[?？]+$/, '');
  if (withoutQ && isApproval(withoutQ)) return false;

  // Tier 1: ? 로 끝남
  if (/[?？]$/.test(trimmed)) return true;

  // Tier 2: 패턴 매치
  return COUNTER_Q_PATTERNS.some((p) => p.test(trimmed));
}

/** 텍스트에서 가장 높은 Q번호 추출 (없으면 0) */
export function extractHighestQNumber(text: string): number {
  const matches = [...text.matchAll(/\*\*Q(\d+)\.\*\*/g)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

// ─── Violation detection ───

interface Violation {
  position: number;
  qLabel: string;
}

/**
 * 응답에서 currentQNumber보다 높은 Q번호가 확인 문구 없이 등장하면 violation.
 * - 응답 시작 50자 이내 Q번호는 현재 Q 재진술로 판단 → skip
 */
export function findViolation(responseText: string, currentQNumber: number): Violation | null {
  const matches = [...responseText.matchAll(/\*\*Q(\d+)\.\*\*/g)];

  for (const match of matches) {
    const qNum = parseInt(match[1], 10);
    if (qNum <= currentQNumber) continue;
    if ((match.index ?? 0) < 50) continue;

    // 이 Q번호 앞에 확인 문구가 있는지 체크
    const textBefore = responseText.slice(0, match.index);
    const hasConfirmation = CONFIRMATION_PHRASES.some((p) => textBefore.includes(p));
    if (hasConfirmation) continue;

    return { position: match.index ?? 0, qLabel: match[0] };
  }

  return null;
}

/** 응답에 확인 문구가 하나도 없는지 체크 */
export function needsConfirmationAppend(responseText: string): boolean {
  return !CONFIRMATION_PHRASES.some((p) => responseText.includes(p));
}

// ─── Text manipulation ───

/** violation 위치에서 잘라내고 확인 질문 추가 */
export function stripPrematureQuestion(responseText: string, violationPosition: number): string {
  // 문단 경계(\n\n) 찾아서 깔끔하게 자르기
  let cutPoint = violationPosition;
  const searchStart = Math.max(0, violationPosition - 200);
  const searchWindow = responseText.slice(searchStart, violationPosition);
  const lastBreak = searchWindow.lastIndexOf('\n\n');
  if (lastBreak !== -1) {
    cutPoint = searchStart + lastBreak;
  }

  return responseText.slice(0, cutPoint).trimEnd() + CONFIRMATION_SUFFIX;
}

// ─── Harness (message wrapping) ───

const HARNESS_SUFFIX = `

---
⛔ SYSTEM CONSTRAINT (이 지시를 반드시 따르세요):
위 사용자 역질문에 대한 답변만 하세요.
답변 후 반드시 "이 방향으로 진행할까요?"로 끝내세요.
새로운 Q번호(**Q2.**, **Q3.** 등) 출력 절대 금지.
이 지시를 어기면 전체 Grill-me 세션이 무효화됩니다.
---`;

export function wrapCounterQuestion(userText: string): string {
  return userText + HARNESS_SUFFIX;
}

// ─── Combined guard (code-level enforcement) ───

export interface CounterQuestionGuardParams {
  userText: string;
  responseText: string;
  currentQNumber: number;
}

/**
 * 역질문 응답 검증. 위반 시 교정된 텍스트 반환, 정상이면 null.
 * - premature Q번호 → 잘라내고 확인 질문 삽입
 * - Q번호 없지만 확인 문구도 없음 → 확인 질문만 추가
 */
export function applyCounterQuestionGuard(params: CounterQuestionGuardParams): string | null {
  if (!isCounterQuestion(params.userText)) return null;

  const violation = findViolation(params.responseText, params.currentQNumber);
  if (violation) {
    return stripPrematureQuestion(params.responseText, violation.position);
  }

  // Q번호 없지만 확인 문구도 없는 경우 → 확인 추가
  if (needsConfirmationAppend(params.responseText)) {
    return params.responseText.trimEnd() + CONFIRMATION_SUFFIX;
  }

  return null;
}
