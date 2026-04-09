/**
 * @module contextCollectors/notion
 * Notion 페이지/데이터베이스 수집기.
 * 키워드 검색 + 지정 데이터베이스 쿼리로 관련 문서를 수집한다.
 * AI 기반 관련성 필터링을 통해 불필요한 결과를 제거한 후,
 * 관련 페이지의 본문 콘텐츠(블록)까지 가져온다.
 */

import { invoke } from '@tauri-apps/api/core';
import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

/**
 * Notion에서 태스크 관련 컨텍스트를 수집한다.
 * 1) 키워드 기반 전체 검색
 * 2) 설정된 데이터베이스에서 키워드 매칭
 * 3) AI 관련성 필터링 후 본문 콘텐츠 로드
 * @param config - Notion API 토큰 및 데이터베이스 ID
 * @param keywords - 검색 키워드 (최대 3개 사용)
 * @param taskTitle - AI 필터링에 사용할 태스크 제목
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

  // 1. Search by keywords
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

  // 2. 설정된 Notion 데이터베이스에서 키워드와 매칭되는 항목 추가 수집
  if (config.notionDatabaseId) {
    try {
      const resp = await fetch(`https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
          page_size: 10,
        }),
      });

      if (resp.ok) {
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
      }
    } catch {
      // skip
    }
  }

  // AI 관련성 필터링 — 본문을 가져오기 전에 불필요한 결과를 제거 (API 호출 최소화)
  if (taskTitle && items.length > 2) {
    // Claude Haiku를 사용하여 빠르고 저렴하게 필터링
    // 프롬프트를 base64로 인코딩하여 shell injection 방지
    const callAI = async (prompt: string): Promise<string> => {
      try {
        const tmpFile = `/tmp/cortx-notion-filter-${Date.now()}.txt`;
        const b64 = btoa(unescape(encodeURIComponent(prompt)));
        await invoke<{ success: boolean }>('run_shell_command', {
          cwd: '/',
          command: `echo '${b64}' | base64 -d > '${tmpFile}'`,
        });
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `cat '${tmpFile}' | claude -p - --model claude-haiku-4-5-20251001 2>/dev/null; rm -f '${tmpFile}'`,
        });
        return result.success ? result.output.trim() : '';
      } catch {
        return '';
      }
    };

    const filtered = await filterNotionByRelevance(items, taskTitle, callAI);
    // Fetch fullText only for filtered items
    for (const item of filtered) {
      if (!item.metadata?.fullText && item.metadata?.notionId) {
        item.metadata.fullText = await fetchNotionPageContent(item.metadata.notionId, headers);
      }
    }
    return filtered;
  }

  return items;
}

/**
 * Notion 페이지의 블록(본문) 콘텐츠를 텍스트로 추출한다.
 * rich_text, child_page, child_database 블록을 처리한다.
 * @param pageId - Notion 페이지 ID
 * @param headers - Authorization 헤더 포함
 * @returns 페이지 본문 텍스트 (줄바꿈으로 구분)
 */
/**
 * Notion 페이지의 properties에서 relation 링크를 추출하고,
 * 링크된 페이지의 제목과 본문을 가져온다 (1단계 깊이).
 */
async function fetchNotionRelations(pageId: string, headers: Record<string, string>): Promise<string> {
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

    // Fetch linked pages (1-level deep, max 5 total)
    for (const rel of relationIds.slice(0, 5)) {
      try {
        // Get linked page title
        const linkedResp = await fetch(`https://api.notion.com/v1/pages/${rel.id}`, { headers });
        if (!linkedResp.ok) continue;
        const linkedPage = await linkedResp.json();
        const linkedTitle = extractNotionTitle(linkedPage);

        // Get linked page content (blocks)
        const linkedContent = await fetchNotionBlocks(rel.id, headers);
        if (linkedTitle || linkedContent) {
          parts.push(`\n--- ${rel.label}: ${linkedTitle || 'Untitled'} ---`);
          if (linkedContent) parts.push(linkedContent);
        }
      } catch {
        /* skip */
      }
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

/**
 * Notion 페이지의 블록(본문) 콘텐츠를 텍스트로 추출한다.
 */
async function fetchNotionBlocks(pageId: string, headers: Record<string, string>): Promise<string> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      headers,
    });
    if (!resp.ok) return '';
    const data = await resp.json();

    const texts: string[] = [];
    for (const block of data.results || []) {
      const richTexts = block[block.type]?.rich_text as Array<{ plain_text: string }> | undefined;
      if (richTexts) {
        const line = richTexts.map((t) => t.plain_text).join('');
        if (line) texts.push(line);
      }
      if (block.type === 'child_page') {
        texts.push(`[Page] ${block.child_page?.title || ''}`);
      }
      if (block.type === 'child_database') {
        texts.push(`[Database] ${block.child_database?.title || ''}`);
      }
    }
    return texts.join('\n');
  } catch {
    return '';
  }
}

/**
 * 페이지의 전체 콘텐츠를 가져온다: properties + 블록 + relation 링크 페이지.
 */
async function fetchNotionPageContent(pageId: string, headers: Record<string, string>): Promise<string> {
  const [relations, blocks] = await Promise.all([
    fetchNotionRelations(pageId, headers),
    fetchNotionBlocks(pageId, headers),
  ]);

  const parts: string[] = [];
  if (relations) parts.push(relations);
  if (blocks) parts.push('\n--- 본문 ---\n' + blocks);
  return parts.join('\n');
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

/** Notion 객체의 properties에서 title 타입 필드를 찾아 텍스트를 추출한다 */
function extractNotionTitle(obj: Record<string, unknown>): string {
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
function formatRelativeTime(iso: string): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
