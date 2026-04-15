/**
 * @module contextCollectors/notion
 *
 * @deprecated 신규 코드는 `src/services/contextSources/notion`을 사용하세요.
 *
 * 이 모듈은 Notion **REST API**(`Authorization: Bearer ${token}`) 기반 수집기로,
 * 사용자가 Notion 통합 토큰을 직접 발급/저장한 환경에서만 동작합니다. OAuth
 * Notion MCP(Notion 공식 원격 MCP) 환경에서는 토큰이 Claude CLI 내부에 보관돼
 * 있어 cortx가 직접 호출할 수 없으므로 이 경로는 빈 결과만 반환합니다
 * (`if (!config.token) return []`).
 *
 * 통합된 신모듈(`contextSources/notion`)은 Claude+MCP 호출을 단일 진실 공급원
 * 으로 통합하고 OAuth/토큰 두 환경 모두에서 동작합니다. 본 모듈은 토큰 기반
 * 워크플로우 사용자가 다시 등장할 경우 재활용할 수 있도록 보존하지만,
 * 새 호출부 추가는 금지하고 기존 사용처는 점진적으로 신모듈로 전환하세요.
 *
 * 키워드 검색 + 지정 데이터베이스 쿼리로 관련 문서를 수집하고, 관련 페이지의
 * 본문 콘텐츠(블록)와 relation 링크까지 1단계 깊이로 가져옵니다.
 */

import type { ContextItem, ContextSourceConfig } from '../../../types/contextPack';
import { searchByKeywords, searchByDatabase } from './search';
import { fetchNotionPageContent } from './blocks';
import { filterByKeywordRelevance } from './filter';

/**
 * @deprecated `contextSources/notion`의 `collectNotion`을 사용하세요.
 *
 * Notion에서 태스크 관련 컨텍스트를 수집한다 (REST API 기반).
 * 1) 키워드 기반 전체 검색
 * 2) 설정된 데이터베이스에서 키워드 매칭
 * 3) 키워드 기반 관련성 필터 후 본문 콘텐츠를 병렬 로드
 * @param config - Notion API 토큰 및 데이터베이스 ID (token 없으면 빈 배열)
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
