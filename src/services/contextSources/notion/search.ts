/**
 * Notion 키워드 검색 — 토큰이 있으면 REST `/v1/search`, 없거나 실패 시 Claude+MCP.
 * 본문은 fetch.ts에서 별도로 가져옴 (collector가 조합).
 *
 * REST 검색 제약: integration에 명시적으로 공유된 페이지만 반환. 부모 DB에
 * integration을 추가하면 하위 페이지 일괄 커버. 공유 범위가 좁으면 결과 적음 →
 * 그땐 MCP 쪽이 더 많이 찾을 수 있지만, 일관성을 위해 REST 성공 시 그대로 사용.
 */

import { callNotionMcp } from './client';
import { getNotionApiToken } from '../../secrets';
import type { NotionSearchHit } from './types';

const SEARCH_PROMPT = (keywords: string) =>
  `Search Notion for: ${keywords}. For each result that is a project or epic page, also list its child pages. Return ONLY a JSON array (no markdown, no preamble): [{"title":"","url":"","id":"","parent":""}]. Max {N} results. If none: []`;

/** 키워드로 Notion 검색 → 메타데이터 목록 반환. REST 우선 + MCP 폴백. */
export async function searchNotion(keywords: string[], maxItems = 10, model?: string): Promise<NotionSearchHit[]> {
  if (keywords.length === 0) return [];

  const token = await getNotionApiToken();
  if (token) {
    const restResults = await searchViaRest(keywords, maxItems);
    // REST 성공 시 그대로 사용 (빈 배열도 성공으로 간주 — 공유 범위 결정은 사용자 몫)
    if (restResults !== null) return restResults;
  }

  // MCP 폴백 (토큰 없거나 REST Err)
  return searchViaMcp(keywords, maxItems, model);
}

/** Rust proxy(notion_search)를 통해 REST `/v1/search` 호출. 실패 시 null. */
async function searchViaRest(keywords: string[], maxItems: number): Promise<NotionSearchHit[] | null> {
  try {
    const query = keywords.slice(0, 2).join(' ');
    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke<{ results?: unknown[] }>('notion_search', {
      query,
      pageSize: Math.min(maxItems * 2, 50), // 여유를 두고 가져와서 필터 후 slice
    });
    return (data.results || [])
      .map(toNotionSearchHit)
      .filter((h): h is NotionSearchHit => !!h && !!h.title && !!h.url)
      .slice(0, maxItems);
  } catch {
    // Rust Err (401/403/404/네트워크) → MCP 폴백
    return null;
  }
}

/** Notion REST 응답 객체를 NotionSearchHit로 변환. title 추출 실패 시 null. */
function toNotionSearchHit(raw: unknown): NotionSearchHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.replace(/-/g, '') : undefined;
  const url = typeof obj.url === 'string' ? obj.url : '';
  const title = extractTitle(obj.properties);
  const parent = extractParentLabel(obj.parent);
  return { id, url, title, parent };
}

/** properties에서 type === 'title' 속성의 plain_text 추출. */
function extractTitle(props: unknown): string {
  if (!props || typeof props !== 'object') return '';
  for (const val of Object.values(props as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as { type?: string; title?: Array<{ plain_text?: string }> };
    if (v.type === 'title' && Array.isArray(v.title)) {
      return v.title
        .map((t) => t?.plain_text ?? '')
        .join('')
        .trim();
    }
  }
  return '';
}

/** parent 필드에서 사람이 읽을 라벨 추출 (database/page/workspace). */
function extractParentLabel(parent: unknown): string | undefined {
  if (!parent || typeof parent !== 'object') return undefined;
  const p = parent as { type?: string; database_id?: string; page_id?: string };
  if (p.type === 'database_id' && p.database_id) return `DB ${p.database_id.slice(0, 8)}`;
  if (p.type === 'page_id' && p.page_id) return `Page ${p.page_id.slice(0, 8)}`;
  if (p.type === 'workspace') return 'Workspace';
  return undefined;
}

/** 기존 Claude+MCP 경로. REST 토큰 없거나 REST 실패 시 fallback. */
async function searchViaMcp(keywords: string[], maxItems: number, model?: string): Promise<NotionSearchHit[]> {
  const kw = keywords.slice(0, 2).join(', ');
  const prompt = SEARCH_PROMPT(kw).replace('{N}', String(maxItems));

  const result = await callNotionMcp({
    prompt,
    toolFilter: "'mcp__notion__*'",
    maxTurns: 10,
    model,
  });

  if (!result.output) return [];
  return parseSearchOutput(result.output, maxItems);
}

/** Claude가 반환한 JSON 배열을 파싱. ```json 코드 펜스 / 잡음 텍스트 허용. */
export function parseSearchOutput(output: string, maxItems: number): NotionSearchHit[] {
  // ```json 코드 펜스 제거
  const cleaned = output.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');
  // 첫 번째 [...]를 추출 — Claude가 앞뒤 텍스트 붙일 가능성
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, maxItems)
      .filter(
        (x): x is { title?: string; url?: string; id?: string; parent?: string } => typeof x === 'object' && x !== null,
      )
      .map((x) => ({
        title: String(x.title ?? '').trim(),
        url: String(x.url ?? '').trim(),
        id: x.id ? String(x.id).trim() : undefined,
        parent: x.parent ? String(x.parent).trim() : undefined,
      }))
      .filter((h) => h.title && h.url);
  } catch {
    return [];
  }
}
