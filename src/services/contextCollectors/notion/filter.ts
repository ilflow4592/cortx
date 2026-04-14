/**
 * @module contextCollectors/notion/filter
 * Notion 검색 결과를 태스크 제목과의 관련성으로 필터링한다.
 * - 키워드 토큰 기반 스코어링 (동기, 빠름)
 * - AI 기반 필터링 (비동기, 정확도 높음)
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

/**
 * AI를 사용하여 Notion 검색 결과의 태스크 관련성을 판별한다.
 * 2개 이하면 필터링 없이 반환. AI 실패 시 전체 반환 (graceful degradation).
 * @param items - 필터링할 Notion 아이템
 * @param taskTitle - 관련성 판단 기준이 되는 태스크 제목
 * @param callAI - AI 호출 함수 (외부에서 주입)
 * @returns 관련성이 있는 아이템만 필터링된 목록
 */
export async function filterNotionByRelevance(
  items: ContextItem[],
  taskTitle: string,
  callAI: (prompt: string) => Promise<string>,
): Promise<ContextItem[]> {
  if (items.length <= 2) return items;

  const itemList = items.map((item, i) => `[${i}] ${item.title}`).join('\n');

  const prompt = `You are filtering Notion search results for relevance to a developer's task.

Task: "${taskTitle}"

Search results:
${itemList}

Return ONLY the indices of items directly relevant to this task, as comma-separated numbers (e.g. "0,3").
If none are relevant, return "none".
Be very selective — only include items that are clearly about this specific task or directly needed to implement it.`;

  try {
    const response = await callAI(prompt);
    const cleaned = response.trim().toLowerCase();

    if (cleaned === 'none' || cleaned === '') return [];

    const indices = cleaned
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n) && n >= 0 && n < items.length);

    return indices.length > 0 ? indices.map((i) => items[i]) : items;
  } catch {
    return items;
  }
}
