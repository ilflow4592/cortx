/**
 * Context History Store — 작업별 수집 이력/스냅샷/델타 관리.
 *
 * contextPackStore에서 분리된 관심사:
 *   - collectHistory: 수집 이력 (타임라인 표시용)
 *   - snapshots:      작업 일시정지 시점의 아이템 해시 묶음
 *   - deltaItems:     재개 시 스냅샷과 비교해 변경/신규 아이템만 추출
 *
 * Persistence: 자체 키(`cortx-context-history`)로 독립 저장.
 * 수집 파이프라인(collectAll)은 contextPackStore가 담당하고, 본 store의
 * detectDelta는 해당 pack store의 collectAll을 runtime lookup으로 호출한다.
 */
import { create } from 'zustand';
import type { ContextItem, ContextSnapshot } from '../types/contextPack';
import { useContextPackStore } from './contextPackStore';

const STORAGE_KEY = 'cortx-context-history';

/** 수집 이력 기록. 어떤 소스에서 몇 개의 아이템을 몇 초 만에 수집했는지 추적 */
export interface CollectHistoryEntry {
  id: string;
  taskId: string;
  timestamp: string;
  durationMs: number;
  keywords: string[];
  model: string;
  resources: string[];
  results: { type: string; itemCount: number; tokenUsage?: { input: number; output: number }; error?: string }[];
  totalItems: number;
  totalTokens: number;
}

interface ContextHistoryState {
  snapshots: Record<string, ContextSnapshot>;
  collectHistory: Record<string, CollectHistoryEntry[]>;
  deltaItems: Record<string, ContextItem[]>;

  // Actions
  appendHistory: (taskId: string, entry: CollectHistoryEntry) => void;
  takeSnapshot: (taskId: string) => void;
  detectDelta: (taskId: string, branchName: string) => Promise<void>;

  // Persistence
  loadState: () => void;
  persist: () => void;
}

/** 스냅샷 비교용 해시. title+summary+timestamp로 아이템 변경 여부를 판단 */
function hashItem(item: ContextItem): string {
  return `${item.title}|${item.summary}|${item.timestamp}`;
}

/** 초기 state — 테스트 reset + 신규 필드 추가 시 단일 진실 공급원 */
export const CONTEXT_HISTORY_INITIAL_STATE: Pick<ContextHistoryState, 'snapshots' | 'collectHistory' | 'deltaItems'> = {
  snapshots: {},
  collectHistory: {},
  deltaItems: {},
};

export const useContextHistoryStore = create<ContextHistoryState>((set, get) => ({
  ...CONTEXT_HISTORY_INITIAL_STATE,

  // collectAll 성공 시 pack store가 호출 — 최대 20건 유지
  appendHistory: (taskId, entry) => {
    set((s) => ({
      collectHistory: {
        ...s.collectHistory,
        [taskId]: [...(s.collectHistory[taskId] || []), entry].slice(-20),
      },
    }));
    get().persist();
  },

  // 작업 중단(pause) 시 현재 컨텍스트 상태를 스냅샷으로 저장. 재개 시 delta 비교용
  takeSnapshot: (taskId) => {
    const items = useContextPackStore.getState().items[taskId] || [];
    const snapshot: ContextSnapshot = {
      taskId,
      takenAt: new Date().toISOString(),
      itemIds: items.map((i) => i.id),
      itemHashes: Object.fromEntries(items.map((i) => [i.id, hashItem(i)])),
    };
    set((s) => ({
      snapshots: { ...s.snapshots, [taskId]: snapshot },
      deltaItems: { ...s.deltaItems, [taskId]: [] },
    }));
    get().persist();
  },

  /**
   * 작업 재개 시 delta 감지: 새로 수집한 데이터를 이전 스냅샷과 비교하여
   * 새로 추가되거나 변경된 아이템에 isNew 플래그를 붙인다.
   */
  detectDelta: async (taskId, branchName) => {
    const snapshot = get().snapshots[taskId];

    // 먼저 최신 데이터 수집 — pack store의 collectAll 호출
    await useContextPackStore.getState().collectAll(taskId, branchName);

    if (!snapshot) {
      // 스냅샷이 없으면 delta 비교 불가
      return;
    }

    const currentItems = useContextPackStore.getState().items[taskId] || [];
    const delta: ContextItem[] = [];

    for (const item of currentItems) {
      const oldHash = snapshot.itemHashes[item.id];
      if (!oldHash) {
        // 스냅샷 이후 새로 추가된 아이템
        delta.push({ ...item, isNew: true });
      } else if (oldHash !== hashItem(item)) {
        // 스냅샷 이후 내용이 변경된 아이템
        delta.push({ ...item, isNew: true });
      }
    }

    // 메인 목록(pack store)에서 변경된 아이템에 isNew 표시
    useContextPackStore.setState((s) => ({
      items: {
        ...s.items,
        [taskId]: currentItems.map((item) => ({
          ...item,
          isNew: delta.some((d) => d.id === item.id),
        })),
      },
    }));
    // pack store 자체 persist 호출
    useContextPackStore.getState().persist();

    set((s) => ({ deltaItems: { ...s.deltaItems, [taskId]: delta } }));
    get().persist();
  },

  // localStorage에서 복원. 각 필드에 기본값을 두어 이전 스키마 데이터와 호환
  loadState: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          snapshots: data.snapshots || {},
          collectHistory: data.collectHistory || {},
          deltaItems: data.deltaItems || {},
        });
        return;
      }

      // Migration: 이전에는 cortx-context-pack 하나에 history/snapshots/deltaItems가 섞여있었음.
      // 새 키가 없으면 legacy blob에서 해당 필드만 복사.
      const legacy = localStorage.getItem('cortx-context-pack');
      if (legacy) {
        const data = JSON.parse(legacy);
        const next = {
          snapshots: data.snapshots || {},
          collectHistory: data.collectHistory || {},
          deltaItems: data.deltaItems || {},
        };
        set(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // corrupt data — start fresh
    }
  },

  persist: () => {
    const s = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snapshots: s.snapshots,
        collectHistory: s.collectHistory,
        deltaItems: s.deltaItems,
      }),
    );
  },
}));
