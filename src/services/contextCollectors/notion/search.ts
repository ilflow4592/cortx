/**
 * @module contextCollectors/notion/search
 *
 * @deprecated 신규 코드는 `src/services/contextSources/notion`을 사용하세요.
 *   Notion REST API(토큰 필요) 기반 검색 헬퍼. 토큰 기반 워크플로우 부활 시
 *   재사용 목적으로 보존.
 *
 * Notion search API helpers and shared formatting utilities.
 */

import type { ContextItem } from '../../../types/contextPack';

/** Notion 객체의 properties에서 title 타입 필드를 찾아 텍스트를 추출한다 */
export function extractNotionTitle(obj: Record<string, unknown>): string {
  const props = obj.properties as Record<string, { title?: { plain_text: string }[]; type?: string }> | undefined;
  if (!props) return '';

  for (const val of Object.values(props)) {
    if (val?.type === 'title' && val.title?.[0]?.plain_text) {
      return val.title[0].plain_text;
    }
  }
  return '';
}

/** ISO 타임스탬프를 상대 시간 문자열로 변환 (e.g., "3h ago") */
export function formatRelativeTime(iso: string): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Notion /v1/search API로 키워드 기반 전체 검색을 수행한다.
 * 결과를 ContextItem으로 변환하고, 중복을 제거하여 기존 items에 추가한다.
 */
export async function searchByKeywords(
  keywords: string[],
  headers: Record<string, string>,
  items: ContextItem[],
): Promise<void> {
  for (const keyword of keywords.slice(0, 3)) {
    try {
      const resp = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: keyword,
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
          page_size: 5,
        }),
      });

      if (!resp.ok) continue;
      const data = await resp.json();

      for (const result of data.results || []) {
        const id = `notion-${result.id}`;
        if (items.some((i) => i.id === id)) continue;

        const title = extractNotionTitle(result);
        const url = result.url || '';
        const lastEdited = result.last_edited_time || '';

        items.push({
          id,
          sourceType: 'notion',
          title: title || 'Untitled',
          url,
          summary: `${result.object === 'database' ? 'Database' : 'Page'} · edited ${formatRelativeTime(lastEdited)}`,
          timestamp: lastEdited,
          isNew: false,
          category: 'auto',
          metadata: {
            objectType: result.object,
            notionId: result.id,
          },
        });
      }
    } catch {
      // skip
    }
  }
}

/**
 * 설정된 Notion 데이터베이스에서 키워드와 매칭되는 항목을 수집한다.
 */
export async function searchByDatabase(
  databaseId: string,
  keywords: string[],
  headers: Record<string, string>,
  items: ContextItem[],
): Promise<void> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        page_size: 10,
      }),
    });

    if (!resp.ok) return;
    const data = await resp.json();
    for (const page of data.results || []) {
      const title = extractNotionTitle(page);
      const matchesKeyword = keywords.some((k) => title.toLowerCase().includes(k.toLowerCase()));
      if (!matchesKeyword) continue;

      const id = `notion-db-${page.id}`;
      if (items.some((i) => i.id === id)) continue;

      items.push({
        id,
        sourceType: 'notion',
        title: title || 'Untitled',
        url: page.url || '',
        summary: `From database · edited ${formatRelativeTime(page.last_edited_time)}`,
        timestamp: page.last_edited_time || '',
        isNew: false,
        category: 'linked',
        metadata: { notionId: page.id },
      });
    }
  } catch {
    // skip
  }
}
