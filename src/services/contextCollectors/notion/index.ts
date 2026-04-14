/**
 * @module contextCollectors/notion
 * Notion 페이지/데이터베이스 수집기.
 * 키워드 검색 + 지정 데이터베이스 쿼리로 관련 문서를 수집한다.
 * 관련 페이지의 본문 콘텐츠(블록)와 relation 링크까지 1단계 깊이로 가져온다.
 */

import type { ContextItem, ContextSourceConfig } from '../../../types/contextPack';
import { searchByKeywords, searchByDatabase } from './search';
import { fetchNotionPageContent } from './blocks';
import { filterByKeywordRelevance } from './filter';

export { filterNotionByRelevance } from './filter';

/**
 * Notion에서 태스크 관련 컨텍스트를 수집한다.
 * 1) 키워드 기반 전체 검색
 * 2) 설정된 데이터베이스에서 키워드 매칭
 * 3) 키워드 기반 관련성 필터 후 본문 콘텐츠를 병렬 로드
 * @param config - Notion API 토큰 및 데이터베이스 ID
 * @param keywords - 검색 키워드 (최대 3개 사용)
 * @param taskTitle - 필터링에 사용할 태스크 제목
 */
export async function collectNotion(
  config: ContextSourceConfig,
  keywords: string[],
  taskTitle?: string,
): Promise<ContextItem[]> {
  if (!config.token) return [];

  const items: ContextItem[] = [];
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };

  await searchByKeywords(keywords, headers, items);

  if (config.notionDatabaseId) {
    await searchByDatabase(config.notionDatabaseId, keywords, headers, items);
  }

  // 키워드 기반 관련성 필터 + 병렬 본문 fetch
  if (taskTitle && items.length > 2) {
    const filtered = filterByKeywordRelevance(items, taskTitle);
    await Promise.allSettled(
      filtered.map(async (item) => {
        if (!item.metadata?.fullText && item.metadata?.notionId) {
          item.metadata.fullText = await fetchNotionPageContent(item.metadata.notionId as string, headers);
        }
      }),
    );
    return filtered;
  }

  return items;
}
