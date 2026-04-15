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
import { parseSearchOutput } from '../../../src/services/contextSources/notion/search';
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
    // 1) 검색 결과
    vi.mocked(callNotionMcp).mockResolvedValueOnce({
      output: '[{"title":"BE-1456","url":"https://notion.so/be-1456","id":"abc"}]',
      stderrPath: '/tmp/x',
    });
    // 2) fullText fetch
    vi.mocked(callNotionMcp).mockResolvedValueOnce({ output: '본문 BE-1456', stderrPath: '/tmp/x' });

    const items = await collectNotion({ keywords: ['country', 'proxy'] });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('BE-1456');
    expect(items[0].metadata?.fullText).toBe('본문 BE-1456');
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
