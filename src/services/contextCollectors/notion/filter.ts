/**
 * @module contextCollectors/notion/filter
 *
 * @deprecated 신규 코드는 `src/services/contextSources/notion`을 사용하세요.
 *   토큰 기반 REST 수집기와 짝을 이루던 필터. 통합 모듈이 자체적으로 maxItems
 *   상한을 적용하므로 별도 키워드 필터 불필요. 토큰 워크플로우 부활 시 재사용.
 */

import type { ContextItem } from '../../../types/contextPack';

/**
 * 태스크 제목의 토큰과 아이템 제목의 겹침 정도로 스코어링한 뒤,
 * 상위 5개를 선택한다. 매칭되는 아이템이 없으면 원본 리스트에서 상위 5개.
 */
export function filterByKeywordRelevance(items: ContextItem[], taskTitle: string): ContextItem[] {
  const titleTokens = taskTitle
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const scored = items.map((item) => ({
    item,
    score: titleTokens.filter((tok) => item.title.toLowerCase().includes(tok)).length,
  }));
  const relevant = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (relevant.length > 0 ? relevant.map((s) => s.item) : items).slice(0, 5);
}
