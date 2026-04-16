/**
 * Token budget guard — 입력 크기 사전 점검.
 *
 * 정확한 토큰 카운팅은 모델 의존적이라 비용 큼. 간단한 휴리스틱:
 * - 영문: 약 4 chars = 1 token
 * - 한글: 약 2-3 chars = 1 token
 * - 코드: 약 3 chars = 1 token
 *
 * Anthropic Opus 4.6 컨텍스트 한계 1M, 안전 기본값 200K.
 */

export interface TokenBudgetCheck {
  estimatedTokens: number;
  limit: number;
  overBudget: boolean;
  ratio: number;
}

export const DEFAULT_TOKEN_LIMIT = 200_000;

/**
 * 텍스트 배열에서 총 예상 토큰 수 계산.
 * 한국어/영어 혼합 기준 보수적 추정 (chars / 2.5).
 */
export function estimateTokens(texts: string[]): number {
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  return Math.ceil(totalChars / 2.5);
}

/**
 * 컨텍스트 크기가 예산을 초과하는지 확인.
 */
export function checkTokenBudget(texts: string[], limit: number = DEFAULT_TOKEN_LIMIT): TokenBudgetCheck {
  const estimatedTokens = estimateTokens(texts);
  return {
    estimatedTokens,
    limit,
    overBudget: estimatedTokens > limit,
    ratio: estimatedTokens / limit,
  };
}

/**
 * 사람이 읽을 경고 메시지 (토스트/배너용).
 */
export function formatBudgetWarning(check: TokenBudgetCheck): string {
  const tokens = check.estimatedTokens.toLocaleString();
  const limit = check.limit.toLocaleString();
  const pct = Math.round(check.ratio * 100);
  return `입력 크기 ${tokens} 토큰 추정 — 한도 ${limit} 토큰의 ${pct}%. Context Pack/파일을 줄이세요.`;
}
