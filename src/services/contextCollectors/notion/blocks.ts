/**
 * @module contextCollectors/notion/blocks
 *
 * @deprecated 신규 코드는 `src/services/contextSources/notion`을 사용하세요.
 *   이 헬퍼들은 Notion REST API(토큰 필요) 기반이며, OAuth Notion MCP 환경
 *   에서는 동작하지 않습니다. 토큰 기반 워크플로우가 다시 필요해질 때까지
 *   유지 목적으로 보존합니다.
 *
 * Notion page block fetching — properties/relations + body blocks.
 */

import { extractNotionTitle } from './search';
import { blocksToMarkdown } from './markdown';

/**
 * Notion 페이지의 properties에서 relation 링크를 추출하고,
 * 링크된 페이지의 제목과 본문을 가져온다 (1단계 깊이).
 */
export async function fetchNotionRelations(pageId: string, headers: Record<string, string>): Promise<string> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers });
    if (!resp.ok) return '';
    const page = await resp.json();

    const props = page.properties as
      | Record<
          string,
          {
            type: string;
            relation?: Array<{ id: string }>;
            rich_text?: Array<{ plain_text: string }>;
            title?: Array<{ plain_text: string }>;
            select?: { name: string };
            multi_select?: Array<{ name: string }>;
            date?: { start: string; end?: string };
            number?: number;
            url?: string;
            checkbox?: boolean;
          }
        >
      | undefined;

    if (!props) return '';

    const parts: string[] = [];
    const relationIds: Array<{ label: string; id: string }> = [];

    for (const [key, val] of Object.entries(props)) {
      if (!val) continue;
      // Extract readable property values
      if (val.type === 'rich_text' && val.rich_text?.length) {
        const text = val.rich_text.map((t) => t.plain_text).join('');
        if (text) parts.push(`${key}: ${text}`);
      } else if (val.type === 'select' && val.select) {
        parts.push(`${key}: ${val.select.name}`);
      } else if (val.type === 'multi_select' && val.multi_select?.length) {
        parts.push(`${key}: ${val.multi_select.map((s) => s.name).join(', ')}`);
      } else if (val.type === 'date' && val.date) {
        parts.push(`${key}: ${val.date.start}${val.date.end ? ' ~ ' + val.date.end : ''}`);
      } else if (val.type === 'number' && val.number != null) {
        parts.push(`${key}: ${val.number}`);
      } else if (val.type === 'url' && val.url) {
        parts.push(`${key}: ${val.url}`);
      } else if (val.type === 'checkbox') {
        parts.push(`${key}: ${val.checkbox ? 'Yes' : 'No'}`);
      } else if (val.type === 'relation' && val.relation?.length) {
        // Collect relation IDs for deep fetch
        for (const rel of val.relation.slice(0, 3)) {
          // max 3 per property
          relationIds.push({ label: key, id: rel.id });
        }
        parts.push(`${key}: [${val.relation.length} linked pages]`);
      }
    }

    // Fetch linked pages in parallel (1-level deep, max 5 total)
    const linkedResults = await Promise.allSettled(
      relationIds.slice(0, 5).map(async (rel) => {
        const linkedResp = await fetch(`https://api.notion.com/v1/pages/${rel.id}`, { headers });
        if (!linkedResp.ok) return null;
        const linkedPage = await linkedResp.json();
        const linkedTitle = extractNotionTitle(linkedPage);
        const linkedContent = await fetchNotionBlocks(rel.id, headers);
        return { label: rel.label, title: linkedTitle, content: linkedContent };
      }),
    );

    for (const result of linkedResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { label, title, content } = result.value;
      if (title || content) {
        parts.push(`\n--- ${label}: ${title || 'Untitled'} ---`);
        if (content) parts.push(content);
      }
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

/**
 * Notion 페이지의 블록(본문) 콘텐츠를 텍스트로 추출한다.
 * rich_text, child_page, child_database 블록을 처리한다.
 */
export async function fetchNotionBlocks(pageId: string, headers: Record<string, string>): Promise<string> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      headers,
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return blocksToMarkdown(data.results || []);
  } catch {
    return '';
  }
}

/**
 * 페이지의 전체 콘텐츠를 가져온다: properties + 블록 + relation 링크 페이지.
 */
export async function fetchNotionPageContent(pageId: string, headers: Record<string, string>): Promise<string> {
  const [relations, blocks] = await Promise.all([
    fetchNotionRelations(pageId, headers),
    fetchNotionBlocks(pageId, headers),
  ]);

  const parts: string[] = [];
  if (relations) parts.push(relations);
  if (blocks) parts.push('\n--- 본문 ---\n' + blocks);
  return parts.join('\n');
}
