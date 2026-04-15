import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useContextPackStore, CONTEXT_PACK_INITIAL_STATE } from '../../src/stores/contextPackStore';
import type { ContextItem } from '../../src/types/contextPack';

vi.mock('../../src/services/contextCollection', () => ({
  runPhase1: vi.fn(),
  runPhase2GitHub: vi.fn(),
  extractRegexKeywords: vi.fn(() => []),
  extractSemanticKeywords: vi.fn(async () => []),
  mergeKeywords: vi.fn((u: string[]) => u),
  rankByKeywordMatch: vi.fn((items: ContextItem[]) => items),
  filterByVectorSearch: vi.fn(async (items: ContextItem[]) => items),
}));

vi.mock('../../src/services/pipeline-exec/fetchPinUrl', () => ({
  fetchPinUrl: vi.fn(),
}));

import { runPhase1, runPhase2GitHub } from '../../src/services/contextCollection';

const TASK_ID = 'task-1';

function makePin(id: string, title = id): ContextItem {
  return {
    id,
    sourceType: 'pin',
    title,
    url: '',
    summary: 'Pinned',
    timestamp: new Date().toISOString(),
    isNew: false,
    category: 'pinned',
  };
}

function makeAuto(id: string): ContextItem {
  return {
    id,
    sourceType: 'notion',
    title: id,
    url: `https://notion.so/${id}`,
    summary: 'Auto',
    timestamp: new Date().toISOString(),
    isNew: false,
    category: 'auto',
  };
}

describe('collectAll race condition (Pin during Collect)', () => {
  beforeEach(() => {
    useContextPackStore.setState({
      ...CONTEXT_PACK_INITIAL_STATE,
      sources: [{ type: 'notion', enabled: true, token: '', owner: '', repo: '' }],
    });
    vi.mocked(runPhase1).mockReset();
    vi.mocked(runPhase2GitHub).mockReset();
  });

  it('Collect 진행 중 추가된 Pin이 완료 시점에 보존됨', async () => {
    // 시작 시점 Pin
    useContextPackStore.getState().addPin(TASK_ID, makePin('pin-existing'));

    // runPhase1이 100ms 걸리는 동안 새 Pin 추가
    vi.mocked(runPhase1).mockImplementation(async () => {
      // collect 진행 중 다른 작업으로 Pin 추가 시뮬레이션
      useContextPackStore.getState().addPin(TASK_ID, makePin('pin-during-collect'));
      await new Promise((r) => setTimeout(r, 50));
      return [makeAuto('auto-1')];
    });
    vi.mocked(runPhase2GitHub).mockResolvedValue([]);

    await useContextPackStore.getState().collectAll(TASK_ID, 'feat/test');

    const finalItems = useContextPackStore.getState().items[TASK_ID];
    const ids = finalItems.map((i) => i.id);

    // 시작 시점 Pin + Collect 중 추가된 Pin 모두 보존 + collected 추가
    expect(ids).toContain('pin-existing');
    expect(ids).toContain('pin-during-collect');
    expect(ids).toContain('auto-1');
    expect(finalItems.filter((i) => i.category === 'pinned')).toHaveLength(2);
  });

  it('수집된 auto 아이템이 기존 pinned 위에 추가됨', async () => {
    useContextPackStore.getState().addPin(TASK_ID, makePin('pin-1'));
    vi.mocked(runPhase1).mockResolvedValue([makeAuto('auto-1'), makeAuto('auto-2')]);
    vi.mocked(runPhase2GitHub).mockResolvedValue([]);

    await useContextPackStore.getState().collectAll(TASK_ID, 'feat/test');

    const finalItems = useContextPackStore.getState().items[TASK_ID];
    expect(finalItems).toHaveLength(3);
    // pinned가 먼저 (구현 순서)
    expect(finalItems[0].id).toBe('pin-1');
  });

  it('동일 ID 중복 제거 — pinned 우선', async () => {
    useContextPackStore.getState().addPin(TASK_ID, makePin('shared-id', 'pinned-version'));
    vi.mocked(runPhase1).mockResolvedValue([makeAuto('shared-id')]);
    vi.mocked(runPhase2GitHub).mockResolvedValue([]);

    await useContextPackStore.getState().collectAll(TASK_ID, 'feat/test');

    const finalItems = useContextPackStore.getState().items[TASK_ID];
    const shared = finalItems.find((i) => i.id === 'shared-id');
    // pinned가 먼저 들어가서 dedup에서 살아남음
    expect(shared?.category).toBe('pinned');
    expect(shared?.title).toBe('pinned-version');
  });

  it('Collect 완료 시 collecting 플래그 해제', async () => {
    vi.mocked(runPhase1).mockResolvedValue([]);
    vi.mocked(runPhase2GitHub).mockResolvedValue([]);

    await useContextPackStore.getState().collectAll(TASK_ID, 'feat/test');

    expect(useContextPackStore.getState().collecting[TASK_ID]).toBe(false);
    expect(useContextPackStore.getState().lastCollectedAt[TASK_ID]).toBeTruthy();
  });
});
