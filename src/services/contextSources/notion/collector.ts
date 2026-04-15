/**
 * Notion 통합 collector — search + 병렬 fetch 조합.
 *
 * 단일 진실 공급원: 어떤 호출 경로(Pin 추가, 자동 수집, 파이프라인 lazy fetch)
 * 든 동일 결과 형태(ContextItem with fullText)를 반환한다.
 *
 * 정책: **always fetch fullText**. 검색 결과/직접 URL 모두 본문까지 가져와
 * /pipeline:dev-task가 즉시 활용 가능한 상태로 만든다. 실패한 본문은 metadata
 * 만 유지하고 graceful하게 반환.
 */

import type { ContextItem } from '../../../types/contextPack';
import { searchNotion } from './search';
import { fetchNotionFullText, isNotionUrl } from './fetch';
import type { CollectNotionOptions, NotionSearchHit } from './types';

export type { CollectNotionOptions, NotionSearchHit } from './types';
export { isNotionUrl } from './fetch';

const DEFAULT_PARALLELISM = 4;
const DEFAULT_MAX_ITEMS = 10;

/**
 * 키워드/URL을 받아 Notion ContextItem 목록을 반환.
 * - keywords + urls 동시 사용 가능 (검색 결과와 직접 URL 병합)
 * - 중복 URL 제거
 * - 모든 항목에 대해 fullText fetch (병렬, parallelism 제한)
 * - fetch 실패 시 metadata만 유지
 */
export async function collectNotion(opts: CollectNotionOptions): Promise<ContextItem[]> {
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const parallelism = opts.parallelism ?? DEFAULT_PARALLELISM;

  // 1) 검색 + 직접 URL 병합
  const searchHits: NotionSearchHit[] = opts.keywords?.length
    ? await searchNotion(opts.keywords, maxItems, opts.model)
    : [];
  const directHits: NotionSearchHit[] = (opts.urls ?? []).filter(isNotionUrl).map((url) => ({
    title: deriveTitleFromUrl(url),
    url,
  }));

  const merged = dedupeByUrl([...directHits, ...searchHits]).slice(0, maxItems);
  if (merged.length === 0) return [];

  // 2) fullText 병렬 fetch (동시성 제한)
  const fullTexts = await mapWithLimit(merged, parallelism, async (hit) => {
    try {
      return await fetchNotionFullText(hit.url);
    } catch {
      return null;
    }
  });

  // 3) ContextItem 생성
  const now = new Date().toISOString();
  return merged.map((hit, idx) => {
    const text = fullTexts[idx];
    const metadata: Record<string, string> = {};
    if (hit.id) metadata.notionId = hit.id;
    if (hit.parent) metadata.parent = hit.parent;
    if (text) metadata.fullText = text;
    return {
      id: `notion-${stableHash(hit.url)}`,
      sourceType: 'notion',
      title: hit.title || hit.url,
      url: hit.url,
      summary: hit.parent ? `Notion · ${hit.parent}` : 'Notion',
      timestamp: now,
      isNew: false,
      category: 'auto',
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    } as ContextItem;
  });
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

/** Promise.all + 동시성 제한 (간단 worker pool). */
async function mapWithLimit<T, U>(items: T[], limit: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** URL 마지막 path 세그먼트에서 제목 추정. Notion URL 패턴 무관 안전. */
function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
    // Notion URL은 보통 ".../page-name-xxxxx" 형태 — page-name 추출 시도
    const stripped = last.replace(/-?[0-9a-f]{32}$/i, '').replace(/-/g, ' ');
    return stripped.trim() || u.hostname;
  } catch {
    return url;
  }
}

/** URL을 stable id로 변환 (간단 djb2 hash). */
function stableHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
