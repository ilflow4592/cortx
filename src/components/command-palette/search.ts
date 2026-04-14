/**
 * Command palette 검색 유틸 — 경계 인식 매칭과 필터 헬퍼.
 * 순수 함수라 훅/컴포넌트 외부에서도 테스트 가능.
 */

/**
 * Boundary-aware match: query가 텍스트의 단어 경계에서 시작해야 매치.
 * 경계: 문자열 시작, 공백, `-_/()[].,:`
 *
 * - "ex" → "Export" ✓ (시작)
 * - "ex" → "context" ✗ (단어 중간)
 * - "/" → "Run Pipeline (/pipeline:dev-task)" ✓ (괄호 뒤)
 * - "run" → "prune" ✗
 */
export function matchesAtBoundary(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const lower = text.toLowerCase();
  const boundaryRe = /[\s\-_/()[\].,:]/;
  let idx = 0;
  while ((idx = lower.indexOf(q, idx)) !== -1) {
    if (idx === 0 || boundaryRe.test(lower[idx - 1])) return true;
    idx++;
  }
  return false;
}

/**
 * 키워드 또는 레이블 중 하나라도 매치하면 true.
 * 액션 리스트에서 `keywords` 배열을 이용한 동의어 검색 용도.
 */
export function matchesLabelOrKeywords(query: string, label: string, keywords: string[] = []): boolean {
  if (!query.trim()) return true;
  if (matchesAtBoundary(label, query)) return true;
  return keywords.some((k) => matchesAtBoundary(k, query));
}
