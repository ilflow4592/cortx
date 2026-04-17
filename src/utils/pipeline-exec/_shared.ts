/**
 * pipeline-exec 공유 순수 유틸.
 * runPipeline (builtin) 과 runCustomPipeline (custom) 이 함께 사용.
 * 새 기능 추가 시 여기에 **순수 함수만** 둘 것 (store 접근 금지).
 */

/** [PIPELINE:...] 마커를 스트리밍 텍스트에서 제거 (UI 노출 최소화) */
export function stripMarkers(text: string): string {
  return text.replace(/\[PIPELINE:[^\]]*\]/g, '').trimStart();
}

/**
 * 마커 파싱 — 원문에서 `[PIPELINE:phase:status:memo?]` 추출.
 * `validPhaseKeys` 는 허용되는 phase 집합 (builtin/custom 모드에 따라 다름).
 * 반환: 추출된 마커 목록 + 마커 제거된 원문.
 */
export interface ParsedMarker {
  phase: string;
  status: 'in_progress' | 'done' | 'skipped' | 'pending';
  memo?: string;
  /** 원문 내 매칭 위치 (stripping 용) */
  fullMatch: string;
}

const MARKER_RE = /\[PIPELINE:(\w+):(\w+)(?::([^\]]*))?\]/g;
const VALID_STATUSES = new Set(['in_progress', 'done', 'skipped', 'pending']);

export function extractMarkers(text: string, validPhaseKeys: Set<string>): ParsedMarker[] {
  const out: ParsedMarker[] = [];
  MARKER_RE.lastIndex = 0;
  let match;
  while ((match = MARKER_RE.exec(text)) !== null) {
    const [fullMatch, phase, status, memo] = match;
    if (!validPhaseKeys.has(phase) || !VALID_STATUSES.has(status)) continue;
    out.push({
      phase,
      status: status as ParsedMarker['status'],
      memo,
      fullMatch,
    });
  }
  return out;
}

/**
 * 어시스턴트 응답이 사용자에게 질문을 던진 상태인지 휴리스틱 감지.
 * - 한국어/영어 질문 패턴 + 표준 Q1./Q2. 포맷 인식.
 * - builtin/custom 공통 — asking 상태 UI 토글에 사용.
 */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith('?') || t.endsWith('\uff1f')) return true;
  if (
    /(?:할까요|인가요|있나요|될까요|맞나요|괜찮을까요|건가요|하시나요|싶습니다|드릴까요|어떤가요|좋을까요|주세요|해줘)\s*[.?\uff1f]?\s*$/.test(
      t,
    )
  )
    return true;
  if (
    /(?:please confirm|what do you think|should we|would you|do you want|can you|is that correct|right\?|agree\?)\s*[.?]?\s*$/i.test(
      t,
    )
  )
    return true;
  const tail = t.slice(-200);
  if (/\*\*Q\d+\.\*\*/.test(tail)) return true;
  if (/(?:Q\d+[.:)]|질문\s*\d+\s*[:.)]).+[?\uff1f]/.test(tail)) return true;
  return false;
}

/** builtin 파이프라인의 고정 phase 집합 — runPipeline 에서 사용 */
export const BUILTIN_PHASE_KEYS: Set<string> = new Set([
  'grill_me',
  'save',
  'dev_plan',
  'implement',
  'commit_pr',
  'review_loop',
  'done',
]);
