/**
 * Notion 키워드 검색 — Claude+MCP 단일 경로.
 *
 * 이전엔 토큰 있으면 REST `/v1/search` 우선 + MCP 폴백 구조였으나, Notion 공개
 * REST의 검색 품질이 불안정(긴 phrase 매칭 시 recent-list 폴백, 공통 단어 1개만
 * 겹쳐도 통과 등)해 걷어내고 MCP 직행으로 단순화. MCP는 Claude가 Notion 내부
 * 검색 도구를 활용해 더 자연스러운 결과 제공.
 *
 * 본문은 fetch.ts에서 별도로 가져옴 (Pin fetch는 여전히 REST 우선 유지 —
 * 단일 페이지 fetch는 REST가 빠르고 안정적).
 */

import { callNotionMcp } from './client';
import type { NotionSearchHit } from './types';

const SEARCH_PROMPT = (keywords: string) =>
  `Search Notion for: ${keywords}. For each result that is a project or epic page, also list its child pages. Return ONLY a JSON array (no markdown, no preamble): [{"title":"","url":"","id":"","parent":""}]. Max {N} results. If none: []`;

/** 키워드로 Notion 검색 → 메타데이터 목록 반환. MCP 단일 경로. */
export async function searchNotion(keywords: string[], maxItems = 10, model?: string): Promise<NotionSearchHit[]> {
  if (keywords.length === 0) return [];
  return searchViaMcp(keywords, maxItems, model);
}

/**
 * 완전일치 → 접두일치 → 부분일치 → API fuzzy 순으로 재정렬.
 * 동점이면 원래 순서(= Notion API의 last_edited_time 내림차순) 보존.
 */
export function rankByMatchQuality(hits: NotionSearchHit[], query: string): NotionSearchHit[] {
  const q = normalizeForMatch(query);
  if (!q) return hits;
  return [...hits]
    .map((h, idx) => ({ h, idx, score: matchScore(h.title, q) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.h);
}

function matchScore(title: string, normalizedQuery: string): number {
  const t = normalizeForMatch(title);
  if (!t) return 0;
  if (t === normalizedQuery) return 3;
  if (t.startsWith(normalizedQuery)) return 2;
  if (t.includes(normalizedQuery)) return 1;
  return 0;
}

/** 매칭용 정규화 — 대소문자 무시 + 공백 붕괴. 한국어는 그대로 유지. */
function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Claude+MCP 검색 경로 — 단일 쿼리 사용. Claude가 프롬프트 지시에 따라 관련
 *  결과만 반환하므로 추가 필터는 생략 (과도한 client 필터가 유효 결과 제거했음).
 *  완전일치 우선 정렬만 유지 (정렬은 누락 없음). */
async function searchViaMcp(keywords: string[], maxItems: number, model?: string): Promise<NotionSearchHit[]> {
  const fullPhrase = keywords.join(' ').trim();
  const prompt = SEARCH_PROMPT(fullPhrase).replace('{N}', String(maxItems));

  const result = await callNotionMcp({
    prompt,
    toolFilter: "'mcp__notion__*'",
    maxTurns: 10,
    model,
  });

  if (!result.output) return [];
  const hits = parseSearchOutput(result.output, maxItems);
  return rankByMatchQuality(hits, fullPhrase);
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
