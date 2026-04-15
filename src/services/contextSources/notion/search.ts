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
    // 전체 phrase (rank용)와 Notion API에 보낼 짧은 쿼리를 분리.
    // Notion /v1/search는 긴 phrase에서 매칭 못 찾으면 "최근 수정 페이지"로
    // 폴백해 완전 무관한 결과를 반환함 — 첫 구분자 앞의 짧은 쿼리만 보내서
    // 매칭 정확도 확보.
    const fullPhrase = keywords.join(' ').trim();
    const shortQuery = extractSearchPhrase(fullPhrase);

    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke<{ results?: unknown[] }>('notion_search', {
      query: shortQuery,
      pageSize: Math.min(maxItems * 3, 100),
    });
    const hits = (data.results || [])
      .map(toNotionSearchHit)
      .filter((h): h is NotionSearchHit => !!h && !!h.title && !!h.url);
    // 클라이언트 측 필터 + 재정렬 — Notion의 recent-list 폴백을 제거하고
    // 토큰 매칭 없는 결과를 드롭한다.
    const ranked = rankByMatchQuality(hits, fullPhrase);
    return filterByTokenOverlap(ranked, fullPhrase).slice(0, maxItems);
  } catch {
    // Rust Err (401/403/404/네트워크) → MCP 폴백
    return null;
  }
}

/**
 * 긴 쿼리에서 검색에 유용한 첫 phrase를 추출. Notion API가 수용 가능한 범위.
 * 구분자: ' - ', ' : ', ' / ', '(', '[', '|' (첫 등장 전까지)
 * 결과가 너무 짧으면(< 3자) 전체 그대로 반환.
 */
export function extractSearchPhrase(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return '';
  // 괄호/대괄호 접두사는 제거하고 내부 텍스트 추출 유지 ("[PMS] Country..." → "Country...")
  const bracketStripped = trimmed.replace(/^\s*[[(][^\])]*[\])]\s*/, '').trim();
  const base = bracketStripped || trimmed;
  const sepMatch = base.match(/^(.+?)\s+[-:|/]\s+/);
  const candidate = (sepMatch ? sepMatch[1] : base).trim();
  return candidate.length >= 3 ? candidate : trimmed;
}

/**
 * 쿼리 토큰 중 의미있는 수만큼 제목에 매칭되어야 통과. Notion recent-list 폴백
 * 및 "공통 단어 1개만 매칭"(예: '이관')으로 스며드는 무관 결과 차단.
 *
 * 적응형 임계값:
 * - 쿼리 토큰 1-3개: 1개 매칭 필수
 * - 쿼리 토큰 4+개: 2개 매칭 필수 (긴 쿼리일수록 유일한 공통 단어로 통과하기 쉬움)
 */
export function filterByTokenOverlap(hits: NotionSearchHit[], query: string): NotionSearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return hits;
  const required = tokens.length >= 4 ? 2 : 1;
  return hits.filter((h) => {
    const titleSet = new Set(tokenize(h.title));
    let matches = 0;
    for (const t of tokens) {
      if (titleSet.has(t)) {
        matches++;
        if (matches >= required) return true;
      }
    }
    return false;
  });
}

/** 매칭용 토큰화 — 한/영/숫자 유지, 구분자·기호는 공백 취급. 2자 미만 토큰 제거. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s\-:/|()[\],]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
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
  const fullPhrase = keywords.join(' ').trim();
  // MCP도 동일하게 짧은 쿼리로 검색하되 rank/filter는 full phrase 기준
  const shortQuery = extractSearchPhrase(fullPhrase);
  const prompt = SEARCH_PROMPT(shortQuery).replace('{N}', String(maxItems));

  const result = await callNotionMcp({
    prompt,
    toolFilter: "'mcp__notion__*'",
    maxTurns: 10,
    model,
  });

  if (!result.output) return [];
  const hits = parseSearchOutput(result.output, maxItems * 3);
  const ranked = rankByMatchQuality(hits, fullPhrase);
  return filterByTokenOverlap(ranked, fullPhrase).slice(0, maxItems);
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
