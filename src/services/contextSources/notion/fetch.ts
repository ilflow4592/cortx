/**
 * Notion 페이지 본문 fetch — Claude+MCP를 통해 단일 페이지의 body 블록만 반환.
 *
 * URL 한 건당 한 번 호출. 결과 ContextItem.metadata.fullText로 저장된다.
 * 실패 시 null 반환 — 호출부가 graceful하게 metadata만 사용하도록 함.
 *
 * 정책: properties / "댓글" 헤더 / 헤더 위 모든 메타는 제외. "댓글" 섹션
 * 아래의 실제 body 블록(Appendix, Context, 코드, 리스트 등)만 반환.
 * 이 부분이 task spec의 본질이고 properties는 cortx UI/Pin title로 이미 표시됨.
 *
 * 속도: notion-fetch 한 번이면 body까지 다 옴. max-turns 3로 chain 차단.
 */

import { callNotionMcp } from './client';

/**
 * Notion URL을 정규화. 데이터베이스 뷰 안에 특정 페이지가 열린 형식
 * (`...?v=...&p={pageId}`)에서 `p=` 페이지 ID를 추출해 canonical page URL로 변환.
 *
 * 변환 안 하면 notion-fetch가 root DB ID로 호출돼 "데이터베이스에 본문 없음"
 * 응답을 받음 (실제 본문은 p= 페이지에 있음).
 *
 * 예:
 *   https://notion.so/{dbId}?v=...&p={pageId} → https://notion.so/{pageId}
 *   https://notion.so/title-{pageId}           → 그대로
 *   https://notion.so/{pageId}                  → 그대로
 */
export function normalizeNotionUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('notion')) return url;
    const pParam = u.searchParams.get('p');
    if (pParam && /^[0-9a-f]{32}$/i.test(pParam.replace(/-/g, ''))) {
      return `https://www.notion.so/${pParam}`;
    }
    return url;
  } catch {
    return url;
  }
}

const FETCH_PROMPT = (url: string) =>
  `Use mcp__notion__notion-fetch on this URL once.

Output ONLY the body content (the part AFTER the comments section / "댓글" / "Comments").
SKIP entirely:
- Page title
- All page properties (status, type, sprint, dates, etc.)
- "댓글" / "Comments" header and comment list

Return body blocks as plain markdown (preserve headings, lists, code, callouts).
No preamble, no JSON wrap, no code fences around the whole output.
If the page has no body below comments, output an empty string.

URL: ${url}`;

/** URL의 body fetch. 실패 시 null. 단일 MCP 호출 가정으로 max-turns/timeout 작게. */
export async function fetchNotionFullText(url: string): Promise<string | null> {
  const normalized = normalizeNotionUrl(url);
  const result = await callNotionMcp({
    prompt: FETCH_PROMPT(normalized),
    toolFilter: "'mcp__notion__*'",
    // notion-fetch 1회 + 응답 1회면 충분. chain 차단으로 속도 ↑
    maxTurns: 3,
    // 정상 케이스 6-10초. 30초 상한이면 hang 방지하면서 정상 동작 모두 커버
    timeoutSec: 30,
  });
  return result.output;
}

/** URL이 Notion 도메인인지 검사. */
export function isNotionUrl(url: string): boolean {
  return url.includes('notion.so') || url.includes('notion.site');
}
