/**
 * Notion 페이지 본문 fetch — Claude+MCP를 통해 단일 페이지의 plain text 반환.
 *
 * URL 한 건당 한 번 호출. 결과 ContextItem.metadata.fullText로 저장된다.
 * 실패 시 null 반환 — 호출부가 graceful하게 metadata만 사용하도록 함.
 */

import { callNotionMcp } from './client';

const FETCH_PROMPT = (url: string) =>
  `Call mcp__notion__notion-fetch (or notion-search → notion-fetch) for this URL and return ONLY the page content as plain text. No JSON wrapping, no markdown code fences, no preamble.\n\nURL: ${url}`;

/** URL의 fullText fetch. 실패 시 null. */
export async function fetchNotionFullText(url: string): Promise<string | null> {
  const result = await callNotionMcp({
    prompt: FETCH_PROMPT(url),
    toolFilter: "'mcp__notion__*'",
  });
  return result.output;
}

/** URL이 Notion 도메인인지 검사. */
export function isNotionUrl(url: string): boolean {
  return url.includes('notion.so') || url.includes('notion.site');
}
