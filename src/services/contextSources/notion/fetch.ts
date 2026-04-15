/**
 * Notion 페이지 본문 fetch — token이 있으면 REST API 직접 호출(1-2초), 없으면
 * Claude+MCP를 통해 fallback (5-15초).
 *
 * 정책: properties / "댓글" 헤더 / 헤더 위 모든 메타는 제외. "댓글" 섹션
 * 아래의 실제 body 블록(Appendix, Context, 코드, 리스트 등)만 반환.
 * 이 부분이 task spec의 본질이고 properties는 cortx UI/Pin title로 이미 표시됨.
 *
 * 자동 폴백: REST가 401/403/404/빈 본문 반환하면 MCP로 자동 재시도. 토큰
 * 만료/공유 누락 시 silent recovery.
 *
 * URL 한 건당 한 번 호출. 결과 ContextItem.metadata.fullText로 저장된다.
 * 실패 시 null 반환 — 호출부가 graceful하게 metadata만 사용하도록 함.
 */

import { callNotionMcp } from './client';
import { getNotionApiToken } from '../../secrets';

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

/** URL에서 32자 hex page ID 추출 (하이픈 유무 무관). 못 찾으면 null. */
function extractPageId(url: string): string | null {
  // canonical 형태: notion.so/{pageId} 또는 notion.so/title-{pageId}
  // 32-hex 또는 8-4-4-4-12 형식 매칭
  const m = url.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[0-9a-f]{32})/i);
  return m ? m[1].replace(/-/g, '') : null;
}

/**
 * REST API로 body 블록만 fetch. Rust 백엔드(notion_fetch_blocks)를 proxy로 사용해
 * WebView의 CORS 제약 우회. 토큰은 Rust가 Keychain에서 직접 읽어 TS 레이어엔
 * 노출 안 됨.
 *
 * 반환: 성공 시 markdown, 실패(auth/share/network) 시 null, 빈 본문이면 빈 문자열.
 * null/empty/content 3-state로 자동 폴백 판단.
 */
async function fetchBodyViaRest(url: string): Promise<string | null> {
  const pageId = extractPageId(normalizeNotionUrl(url));
  if (!pageId) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke<{ results?: unknown[] }>('notion_fetch_blocks', { pageId });
    const { blocksToMarkdown } = await import('../../contextCollectors/notion/markdown');
    const md = blocksToMarkdown((data.results || []) as never[]).trim();
    return md; // '' 가능 (genuine empty body)
  } catch {
    // Rust 측 Err (HTTP 4xx/5xx, token 부재, 네트워크) → MCP 폴백
    return null;
  }
}

/** URL의 body fetch. token 있으면 REST 우선 + 실패 시 MCP 폴백. */
export async function fetchNotionFullText(url: string): Promise<string | null> {
  const token = await getNotionApiToken();
  if (token) {
    const restResult = await fetchBodyViaRest(url);
    if (restResult !== null) return restResult;
  }
  // MCP 경로 (fallback 또는 token 없을 때)
  const normalized = normalizeNotionUrl(url);
  const result = await callNotionMcp({
    prompt: FETCH_PROMPT(normalized),
    toolFilter: "'mcp__notion__*'",
    maxTurns: 3,
    timeoutSec: 30,
  });
  return result.output;
}

/** URL이 Notion 도메인인지 검사. */
export function isNotionUrl(url: string): boolean {
  return url.includes('notion.so') || url.includes('notion.site');
}
