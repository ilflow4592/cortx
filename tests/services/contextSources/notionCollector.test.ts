import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/contextSources/notion/client', () => ({
  callNotionMcp: vi.fn(),
}));

vi.mock('../../../src/services/secrets', () => ({
  getNotionApiToken: vi.fn(),
}));

// Tauri invoke mock — notion_fetch_blocks Rust 커맨드 프록시
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { callNotionMcp } from '../../../src/services/contextSources/notion/client';
import { getNotionApiToken } from '../../../src/services/secrets';
import { invoke } from '@tauri-apps/api/core';
import { collectNotion } from '../../../src/services/contextSources/notion';
import {
  parseSearchOutput,
  rankByMatchQuality,
  extractSearchPhrase,
  filterByTokenOverlap,
} from '../../../src/services/contextSources/notion/search';
import type { NotionSearchHit } from '../../../src/services/contextSources/notion';
import { fetchNotionFullText, normalizeNotionUrl } from '../../../src/services/contextSources/notion/fetch';

describe('normalizeNotionUrl', () => {
  it('database view + 페이지 선택 URL → 페이지 canonical URL', () => {
    const input =
      'https://www.notion.so/19fdd60e86f480558badc78c2233fbbe?v=19fdd60e86f4804f9ea9000cd0c32bdf&p=341dd60e86f48114a998ef671ea63b1f&pm=s';
    expect(normalizeNotionUrl(input)).toBe('https://www.notion.so/341dd60e86f48114a998ef671ea63b1f');
  });

  it('p= 파라미터에 하이픈 포함된 page ID도 인식', () => {
    const input = 'https://www.notion.so/db?v=v1&p=341dd60e-86f4-8114-a998-ef671ea63b1f';
    expect(normalizeNotionUrl(input)).toBe('https://www.notion.so/341dd60e-86f4-8114-a998-ef671ea63b1f');
  });

  it('일반 페이지 URL은 변경 안 함', () => {
    const url = 'https://www.notion.so/title-341dd60e86f48114a998ef671ea63b1f';
    expect(normalizeNotionUrl(url)).toBe(url);
  });

  it('p= 없이 v=만 있는 DB 뷰 URL은 변경 안 함', () => {
    const url = 'https://www.notion.so/db?v=view1';
    expect(normalizeNotionUrl(url)).toBe(url);
  });

  it('Notion 도메인 아니면 변경 안 함', () => {
    const url = 'https://example.com/page?p=341dd60e86f48114a998ef671ea63b1f';
    expect(normalizeNotionUrl(url)).toBe(url);
  });

  it('잘못된 page ID 형식이면 변경 안 함', () => {
    const url = 'https://www.notion.so/db?p=not-a-valid-id';
    expect(normalizeNotionUrl(url)).toBe(url);
  });

  it('URL 파싱 실패 시 원본 반환', () => {
    expect(normalizeNotionUrl('not a url')).toBe('not a url');
  });
});

describe('parseSearchOutput', () => {
  it('순수 JSON 배열 파싱', () => {
    const out = '[{"title":"A","url":"https://notion.so/a"}]';
    expect(parseSearchOutput(out, 10)).toEqual([
      { title: 'A', url: 'https://notion.so/a', id: undefined, parent: undefined },
    ]);
  });

  it('```json 코드 펜스 감싸진 출력 파싱', () => {
    const out = '```json\n[{"title":"B","url":"https://notion.so/b"}]\n```';
    expect(parseSearchOutput(out, 10)).toHaveLength(1);
  });

  it('앞뒤 잡음 텍스트 있어도 첫 배열 추출', () => {
    const out = 'Here are the results:\n[{"title":"C","url":"https://notion.so/c"}]\nThanks';
    expect(parseSearchOutput(out, 10)).toHaveLength(1);
  });

  it('빈 배열 반환', () => {
    expect(parseSearchOutput('[]', 10)).toEqual([]);
  });

  it('JSON 파싱 실패 시 빈 배열', () => {
    expect(parseSearchOutput('not json', 10)).toEqual([]);
  });

  it('title/url 누락 항목 필터링', () => {
    const out = '[{"title":"","url":"https://x"},{"title":"OK","url":"https://y"},{"title":"Z","url":""}]';
    expect(parseSearchOutput(out, 10)).toHaveLength(1);
  });

  it('maxItems로 잘림', () => {
    const out = JSON.stringify(
      Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, url: `https://notion.so/${i}` })),
    );
    expect(parseSearchOutput(out, 3)).toHaveLength(3);
  });
});

describe('fetchNotionFullText (REST/MCP 분기)', () => {
  const restUrl = 'https://www.notion.so/341dd60e86f48114a998ef671ea63b1f';

  beforeEach(() => {
    vi.mocked(callNotionMcp).mockReset();
    vi.mocked(getNotionApiToken).mockReset();
    vi.mocked(invoke).mockReset();
  });

  it('token 있으면 Rust invoke 호출, 성공 시 MCP 호출 안 함', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test_token');
    vi.mocked(invoke).mockResolvedValue({
      results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: '본문 텍스트' }] } }],
    });

    const result = await fetchNotionFullText(restUrl);
    expect(result).toContain('본문');
    expect(invoke).toHaveBeenCalledWith('notion_fetch_blocks', { pageId: '341dd60e86f48114a998ef671ea63b1f' });
    expect(callNotionMcp).not.toHaveBeenCalled();
  });

  it('token 있고 Rust invoke가 Err (401) → MCP 자동 폴백', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_invalid');
    vi.mocked(invoke).mockRejectedValue('http 401: unauthorized');
    vi.mocked(callNotionMcp).mockResolvedValue({ output: 'fallback body', stderrPath: '/tmp/x' });

    const result = await fetchNotionFullText(restUrl);
    expect(result).toBe('fallback body');
    expect(callNotionMcp).toHaveBeenCalledOnce();
  });

  it('token 있고 404 (페이지 공유 안 됨) → MCP 폴백', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(invoke).mockRejectedValue('http 404: object_not_found');
    vi.mocked(callNotionMcp).mockResolvedValue({ output: 'mcp body', stderrPath: '/tmp/x' });

    const result = await fetchNotionFullText(restUrl);
    expect(result).toBe('mcp body');
  });

  it('token 없으면 REST 안 거치고 바로 MCP', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue(undefined);
    vi.mocked(callNotionMcp).mockResolvedValue({ output: 'mcp result', stderrPath: '/tmp/x' });

    const result = await fetchNotionFullText(restUrl);
    expect(result).toBe('mcp result');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('REST가 빈 본문 반환 시 그대로 빈 문자열 (MCP 폴백 안 함)', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(invoke).mockResolvedValue({ results: [] });

    const result = await fetchNotionFullText(restUrl);
    expect(result).toBe('');
    expect(callNotionMcp).not.toHaveBeenCalled();
  });

  it('page ID 추출 불가 URL → REST 스킵 후 MCP 폴백', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(callNotionMcp).mockResolvedValue({ output: 'mcp body', stderrPath: '/tmp/x' });

    const result = await fetchNotionFullText('https://www.notion.so/no-valid-id-here');
    expect(result).toBe('mcp body');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('extractSearchPhrase', () => {
  it("' - ' 앞의 phrase만 추출", () => {
    expect(extractSearchPhrase('NEXUS country 모듈 - Kotlin/Exposed 기반 기본 CRUD')).toBe('NEXUS country 모듈');
  });

  it("'[PMS]' 같은 접두 대괄호 제거", () => {
    expect(extractSearchPhrase('[PMS] Country 프록시 컨트롤러 추가')).toBe('Country 프록시 컨트롤러 추가');
  });

  it("' : ' 구분자도 인식", () => {
    expect(extractSearchPhrase('BE-1456 : Country 프록시')).toBe('BE-1456');
  });

  it('구분자 없으면 원본 반환', () => {
    expect(extractSearchPhrase('simple query')).toBe('simple query');
  });

  it('빈 문자열 처리', () => {
    expect(extractSearchPhrase('')).toBe('');
    expect(extractSearchPhrase('   ')).toBe('');
  });

  it('추출 결과가 너무 짧으면(< 3자) 원본 반환', () => {
    // "A - long text" → "A"는 너무 짧아 원본 유지
    expect(extractSearchPhrase('A - long descriptive text')).toBe('A - long descriptive text');
  });
});

describe('filterByTokenOverlap', () => {
  function h(title: string): NotionSearchHit {
    return { title, url: `https://notion.so/${encodeURIComponent(title)}` };
  }

  it('쿼리 토큰 하나라도 매칭되는 결과만 남김', () => {
    const hits = [h('NEXUS country 관련 작업'), h('Portlogics ID OAuth'), h('country API 리팩토링')];
    const out = filterByTokenOverlap(hits, 'NEXUS country 모듈');
    expect(out.map((x) => x.title)).toEqual(['NEXUS country 관련 작업', 'country API 리팩토링']);
  });

  it('아무 토큰도 매칭 안 되면 모두 제거 (recent-list 폴백 차단)', () => {
    const hits = [h('vibe-setup.sh'), h('AWS 인프라 정리'), h('Portlogics ID')];
    const out = filterByTokenOverlap(hits, 'NEXUS country 모듈');
    expect(out).toEqual([]);
  });

  it('빈 쿼리는 모두 통과', () => {
    const hits = [h('foo'), h('bar')];
    expect(filterByTokenOverlap(hits, '')).toEqual(hits);
  });

  it('쿼리에 의미있는 토큰(>=2자)이 없으면 필터 스킵 — 전부 통과', () => {
    // 'a' 1자만이면 tokenize 결과 빈 배열 → 필터 안 함 (원본 유지)
    const hits = [h('aa some title')];
    expect(filterByTokenOverlap(hits, 'a')).toEqual(hits);
  });

  it('대소문자 무관', () => {
    const hits = [h('Country API')];
    expect(filterByTokenOverlap(hits, 'COUNTRY')).toHaveLength(1);
  });
});

describe('rankByMatchQuality', () => {
  function hit(title: string): NotionSearchHit {
    return { title, url: `https://notion.so/${title}` };
  }

  it('완전일치가 최상위 (case-insensitive)', () => {
    const hits = [hit('country partial'), hit('Country 프록시 컨트롤러 추가'), hit('other')];
    const ranked = rankByMatchQuality(hits, 'Country 프록시 컨트롤러 추가');
    expect(ranked[0].title).toBe('Country 프록시 컨트롤러 추가');
  });

  it('접두일치 > 부분일치 > 매칭 없음', () => {
    const hits = [hit('xxx country yyy'), hit('Country API proxy'), hit('unrelated')];
    const ranked = rankByMatchQuality(hits, 'Country');
    expect(ranked.map((h) => h.title)).toEqual(['Country API proxy', 'xxx country yyy', 'unrelated']);
  });

  it('동점이면 원래 순서 보존 (API의 last_edited_time 순)', () => {
    const hits = [hit('foo'), hit('bar'), hit('baz')];
    const ranked = rankByMatchQuality(hits, 'nothing');
    expect(ranked.map((h) => h.title)).toEqual(['foo', 'bar', 'baz']);
  });

  it('빈 쿼리는 원본 순서 그대로 반환', () => {
    const hits = [hit('a'), hit('b')];
    expect(rankByMatchQuality(hits, '')).toEqual(hits);
    expect(rankByMatchQuality(hits, '   ')).toEqual(hits);
  });

  it('공백 붕괴 — 여러 공백이 단일로 취급', () => {
    const hits = [hit('Country   proxy'), hit('Country Api')];
    const ranked = rankByMatchQuality(hits, 'country proxy');
    expect(ranked[0].title).toBe('Country   proxy'); // normalized 하면 exact
  });
});

describe('searchNotion (REST/MCP 분기)', () => {
  beforeEach(() => {
    vi.mocked(callNotionMcp).mockReset();
    vi.mocked(getNotionApiToken).mockReset();
    vi.mocked(invoke).mockReset();
  });

  it('token 있으면 invoke(notion_search) 우선', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(invoke).mockResolvedValue({
      results: [
        {
          id: '341dd60e-86f4-8114-a998-ef671ea63b1f',
          url: 'https://www.notion.so/p-abc',
          // 쿼리 'country'가 제목에 포함돼야 token overlap 필터 통과
          properties: { Task: { type: 'title', title: [{ plain_text: 'country proxy controller' }] } },
          parent: { type: 'database_id', database_id: '19fdd60e-86f4-8055-8bad-c78c2233fbbe' },
        },
      ],
    });

    const hits = await (
      await import('../../../src/services/contextSources/notion/search')
    ).searchNotion(['country'], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('country proxy controller');
    expect(hits[0].url).toBe('https://www.notion.so/p-abc');
    expect(hits[0].parent).toContain('DB 19fdd60e');
    expect(callNotionMcp).not.toHaveBeenCalled();
  });

  it('token 있고 REST Err (401) → MCP 폴백', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_invalid');
    vi.mocked(invoke).mockRejectedValue('http 401: unauthorized');
    vi.mocked(callNotionMcp).mockResolvedValue({
      output: '[{"title":"country fallback","url":"https://notion.so/x"}]',
      stderrPath: '/tmp/x',
    });

    const hits = await (
      await import('../../../src/services/contextSources/notion/search')
    ).searchNotion(['country'], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('country fallback');
    expect(callNotionMcp).toHaveBeenCalledOnce();
  });

  it('token 없으면 바로 MCP', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue(undefined);
    vi.mocked(callNotionMcp).mockResolvedValue({
      output: '[{"title":"country mcp-only","url":"https://notion.so/m"}]',
      stderrPath: '/tmp/x',
    });

    const hits = await (
      await import('../../../src/services/contextSources/notion/search')
    ).searchNotion(['country'], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('country mcp-only');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('토큰 매칭 없는 결과는 제외 (Notion recent-list 폴백 차단)', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(invoke).mockResolvedValue({
      results: [
        {
          id: 'x',
          url: 'https://notion.so/a',
          properties: { Name: { type: 'title', title: [{ plain_text: 'unrelated page' }] } },
        },
        {
          id: 'y',
          url: 'https://notion.so/b',
          properties: { Name: { type: 'title', title: [{ plain_text: 'country spec' }] } },
        },
      ],
    });
    const hits = await (
      await import('../../../src/services/contextSources/notion/search')
    ).searchNotion(['country'], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('country spec');
  });

  it('REST 빈 결과도 성공 처리 (MCP 폴백 안 함)', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(invoke).mockResolvedValue({ results: [] });

    const hits = await (await import('../../../src/services/contextSources/notion/search')).searchNotion(['none'], 10);
    expect(hits).toEqual([]);
    expect(callNotionMcp).not.toHaveBeenCalled();
  });

  it('keywords 빈 배열이면 즉시 빈 배열', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    const hits = await (await import('../../../src/services/contextSources/notion/search')).searchNotion([], 10);
    expect(hits).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(callNotionMcp).not.toHaveBeenCalled();
  });

  it('title 없는 결과는 필터링', async () => {
    vi.mocked(getNotionApiToken).mockResolvedValue('ntn_test');
    vi.mocked(invoke).mockResolvedValue({
      results: [
        { id: 'x', url: 'https://notion.so/a', properties: {} }, // title 없음
        {
          id: 'y',
          url: 'https://notion.so/b',
          properties: { Name: { type: 'title', title: [{ plain_text: 'valid' }] } },
        },
      ],
    });
    const hits = await (await import('../../../src/services/contextSources/notion/search')).searchNotion(['k'], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('valid');
  });
});

describe('collectNotion', () => {
  beforeEach(() => {
    vi.mocked(callNotionMcp).mockReset();
    vi.mocked(getNotionApiToken).mockResolvedValue(undefined); // 기본은 token 없음 → MCP 경로
  });

  it('urls만 주면 검색 안 하고 fullText fetch만 수행', async () => {
    vi.mocked(callNotionMcp).mockResolvedValueOnce({ output: '본문 내용 A', stderrPath: '/tmp/x' });
    const items = await collectNotion({ urls: ['https://notion.so/page-a'] });

    expect(items).toHaveLength(1);
    expect(items[0].metadata?.fullText).toBe('본문 내용 A');
    expect(items[0].sourceType).toBe('notion');
    // 호출 1회 (fetch만, search 안 함)
    expect(callNotionMcp).toHaveBeenCalledOnce();
  });

  it('keywords 주면 검색 후 각 결과에 대해 fullText fetch', async () => {
    // 1) 검색 결과 — 쿼리 'country proxy'가 제목에 포함돼야 token overlap 필터 통과
    vi.mocked(callNotionMcp).mockResolvedValueOnce({
      output: '[{"title":"country proxy controller","url":"https://notion.so/be-1456","id":"abc"}]',
      stderrPath: '/tmp/x',
    });
    // 2) fullText fetch
    vi.mocked(callNotionMcp).mockResolvedValueOnce({ output: '본문 본문 내용', stderrPath: '/tmp/x' });

    const items = await collectNotion({ keywords: ['country', 'proxy'] });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('country proxy controller');
    expect(items[0].metadata?.fullText).toBe('본문 본문 내용');
    expect(items[0].metadata?.notionId).toBe('abc');
    expect(callNotionMcp).toHaveBeenCalledTimes(2);
  });

  it('fetch 실패해도 metadata만 유지하고 graceful 반환', async () => {
    vi.mocked(callNotionMcp).mockResolvedValueOnce({ output: null, stderrPath: '/tmp/x' });

    const items = await collectNotion({ urls: ['https://notion.so/fail'] });

    expect(items).toHaveLength(1);
    expect(items[0].metadata?.fullText).toBeUndefined();
    expect(items[0].url).toBe('https://notion.so/fail');
  });

  it('Notion이 아닌 URL은 무시', async () => {
    const items = await collectNotion({ urls: ['https://google.com', 'https://notion.so/ok'] });

    // notion.so만 처리 → fetch 1회
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://notion.so/ok');
  });

  it('중복 URL 제거', async () => {
    vi.mocked(callNotionMcp).mockResolvedValue({ output: '본문', stderrPath: '/tmp/x' });

    const items = await collectNotion({
      urls: ['https://notion.so/dup', 'https://notion.so/dup'],
    });

    expect(items).toHaveLength(1);
  });

  it('maxItems가 검색+직접 URL 합산에 적용됨', async () => {
    vi.mocked(callNotionMcp).mockResolvedValueOnce({
      output: JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ title: `t${i}`, url: `https://notion.so/s${i}` }))),
      stderrPath: '/tmp/x',
    });
    // fetch는 maxItems만큼만 호출돼야 함
    vi.mocked(callNotionMcp).mockResolvedValue({ output: '본문', stderrPath: '/tmp/x' });

    const items = await collectNotion({
      keywords: ['k'],
      urls: ['https://notion.so/direct'],
      maxItems: 3,
    });

    expect(items.length).toBeLessThanOrEqual(3);
    // 직접 URL이 먼저 (병합 순서) → 직접 URL 1개 + 검색 결과 2개 = 3개
    expect(items[0].url).toBe('https://notion.so/direct');
  });

  it('fetch가 throw해도 catch해서 metadata만 유지', async () => {
    vi.mocked(callNotionMcp).mockRejectedValueOnce(new Error('boom'));

    const items = await collectNotion({ urls: ['https://notion.so/throws'] });

    expect(items).toHaveLength(1);
    expect(items[0].metadata?.fullText).toBeUndefined();
  });
});
