/**
 * Notion 키워드 검색 — Claude+MCP를 통해 페이지 메타데이터 목록 반환.
 * 본문은 fetch.ts에서 별도로 가져옴 (collector가 조합).
 */

import { callNotionMcp } from './client';
import type { NotionSearchHit } from './types';

const SEARCH_PROMPT = (keywords: string) =>
  `Search Notion for: ${keywords}. For each result that is a project or epic page, also list its child pages. Return ONLY a JSON array (no markdown, no preamble): [{"title":"","url":"","id":"","parent":""}]. Max {N} results. If none: []`;

/**
 * 키워드로 Notion 검색 → 메타데이터 목록 반환.
 * Claude가 mcp__notion__notion-search 계열 도구를 호출.
 */
export async function searchNotion(keywords: string[], maxItems = 10, model?: string): Promise<NotionSearchHit[]> {
  if (keywords.length === 0) return [];
  const kw = keywords.slice(0, 2).join(', ');
  const prompt = SEARCH_PROMPT(kw).replace('{N}', String(maxItems));

  const result = await callNotionMcp({
    prompt,
    toolFilter: "'mcp__notion__*'",
    maxTurns: 10, // 검색은 search → list children 등 체이닝 여유 필요
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
