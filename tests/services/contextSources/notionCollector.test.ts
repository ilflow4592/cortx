import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/contextSources/notion/client', () => ({
  callNotionMcp: vi.fn(),
}));

import { callNotionMcp } from '../../../src/services/contextSources/notion/client';
import { collectNotion } from '../../../src/services/contextSources/notion';
import { parseSearchOutput } from '../../../src/services/contextSources/notion/search';

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

describe('collectNotion', () => {
  beforeEach(() => {
    vi.mocked(callNotionMcp).mockReset();
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
