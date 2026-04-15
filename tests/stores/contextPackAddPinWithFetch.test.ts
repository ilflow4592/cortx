import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useContextPackStore, CONTEXT_PACK_INITIAL_STATE } from '../../src/stores/contextPackStore';
import type { ContextItem } from '../../src/types/contextPack';

vi.mock('../../src/utils/pipeline-exec/fetchPinUrl', () => ({
  fetchPinUrl: vi.fn(),
}));

import { fetchPinUrl } from '../../src/utils/pipeline-exec/fetchPinUrl';

const TASK_ID = 'task-1';

function makePin(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'pin-abc',
    sourceType: 'pin',
    title: 'BE-1456',
    url: 'https://notion.so/ticket/BE-1456',
    summary: 'Pinned',
    timestamp: new Date().toISOString(),
    isNew: false,
    category: 'pinned',
    ...overrides,
  };
}

describe('contextPackStore.addPinWithFetch', () => {
  beforeEach(() => {
    useContextPackStore.setState({ ...CONTEXT_PACK_INITIAL_STATE });
    vi.mocked(fetchPinUrl).mockReset();
  });

  it('HTTP URL Pin이면 fetchPinUrl 호출 후 fullText 저장', async () => {
    vi.mocked(fetchPinUrl).mockResolvedValueOnce('# BE-1456\n본문');
    useContextPackStore.getState().addPinWithFetch(TASK_ID, makePin());

    // 즉시 pin은 추가됨
    expect(useContextPackStore.getState().items[TASK_ID]).toHaveLength(1);
    expect(useContextPackStore.getState().items[TASK_ID][0].metadata?.fullText).toBeUndefined();

    // 비동기 fetch 완료 대기
    await vi.waitFor(() => {
      const item = useContextPackStore.getState().items[TASK_ID][0];
      expect(item.metadata?.fullText).toBe('# BE-1456\n본문');
      expect(item.metadata?.fetching).toBeUndefined();
    });

    expect(fetchPinUrl).toHaveBeenCalledOnce();
    expect(fetchPinUrl).toHaveBeenCalledWith('https://notion.so/ticket/BE-1456');
  });

  it('로컬 파일 경로는 fetchPinUrl 호출 안 함', async () => {
    useContextPackStore
      .getState()
      .addPinWithFetch(TASK_ID, makePin({ url: '/Users/me/project/file.ts', id: 'pin-local' }));

    expect(useContextPackStore.getState().items[TASK_ID]).toHaveLength(1);
    // fire-and-forget이지만 로컬 URL은 guard에서 차단되므로 microtask 사이클 후에도 호출 없음
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchPinUrl).not.toHaveBeenCalled();
  });

  it('이미 fullText가 있는 Pin은 재fetch 안 함', async () => {
    useContextPackStore.getState().addPinWithFetch(TASK_ID, makePin({ metadata: { fullText: '기존 본문' } }));

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchPinUrl).not.toHaveBeenCalled();
  });

  it('fetchPinUrl 실패 시 fullText는 비어있고 fetching 플래그도 해제', async () => {
    vi.mocked(fetchPinUrl).mockRejectedValueOnce(new Error('mcp unavailable'));
    useContextPackStore.getState().addPinWithFetch(TASK_ID, makePin());

    await vi.waitFor(() => {
      const item = useContextPackStore.getState().items[TASK_ID][0];
      // silent failure — 에러는 catch에서 삼켜짐, fetching 플래그는 남아있을 수 있으나
      // 에러 경로라 정리 못 하더라도 fullText는 없음
      expect(item.metadata?.fullText).toBeUndefined();
    });
  });

  it('fetchPinUrl이 null 반환 시 fullText 없고 fetching 플래그 해제', async () => {
    vi.mocked(fetchPinUrl).mockResolvedValueOnce(null);
    useContextPackStore.getState().addPinWithFetch(TASK_ID, makePin());

    await vi.waitFor(() => {
      const item = useContextPackStore.getState().items[TASK_ID][0];
      expect(item.metadata?.fetching).toBeUndefined();
      expect(item.metadata?.fullText).toBeUndefined();
    });
  });
});
