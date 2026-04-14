/**
 * Context Pack Store — 작업별 컨텍스트(외부 정보) 수집 및 관리
 *
 * GitHub PR/이슈, Slack 메시지, Notion 페이지 등을 수집하여 작업에 연결한다.
 * 수집 파이프라인: Notion/Slack 먼저 수집 → 키워드 추출 → GitHub 검색 (2-phase).
 * 벡터 DB(Ollama 임베딩)를 통한 시맨틱 필터링도 지원하며, 실패 시 graceful fallback.
 *
 * Snapshot/Delta: 작업 중단 시 스냅샷을 찍고, 재개 시 변경분만 감지하여 표시.
 * Persistence: 자체 persist() 메서드로 localStorage에 저장.
 */
import { create } from 'zustand';
import type { ContextItem, ContextSnapshot, ContextSourceConfig } from '../types/contextPack';
import {
  runPhase1,
  runPhase2GitHub,
  extractRegexKeywords,
  extractSemanticKeywords,
  mergeKeywords,
  rankByKeywordMatch,
  filterByVectorSearch,
  type ProgressUpdater,
} from '../services/contextCollection';

// MCP 관련 상태는 별도 store(mcpStore)로 분리됨 — 수집 관심사와 무관.
// 기존 `import { McpServerStatus } from '../stores/contextPackStore'`는
// re-export로 뒤로 호환.
export type { McpServerStatus } from './mcpStore';

const STORAGE_KEY = 'cortx-context-pack';

/** 개별 소스의 수집 진행 상태 (UI 진행률 표시용) */
export interface SourceCollectStatus {
  type: string;
  status: 'pending' | 'collecting' | 'done' | 'error';
  itemCount: number;
  error?: string;
  tokenUsage?: { input: number; output: number };
}

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

interface ContextPackState {
  items: Record<string, ContextItem[]>;
  snapshots: Record<string, ContextSnapshot>;
  sources: ContextSourceConfig[];
  keywords: Record<string, string[]>;
  collecting: Record<string, boolean>; // per-task collecting state
  collectAborts: Record<string, AbortController>; // per-task abort controllers
  collectProgresses: Record<string, SourceCollectStatus[]>; // per-task progress
  lastCollectedAt: Record<string, string>;
  collectHistory: Record<string, CollectHistoryEntry[]>; // taskId -> history
  deltaItems: Record<string, ContextItem[]>; // items changed since pause

  // Actions
  addPin: (taskId: string, item: ContextItem) => void;
  removeItem: (taskId: string, itemId: string) => void;
  setKeywords: (taskId: string, keywords: string[]) => void;
  setSources: (sources: ContextSourceConfig[]) => void;
  updateSource: (index: number, updates: Partial<ContextSourceConfig>) => void;
  addSource: (source: ContextSourceConfig) => void;
  removeSource: (index: number) => void;

  clearCollected: (taskId: string) => void;
  cancelCollect: (taskId: string) => void;

  // Collection
  collectAll: (
    taskId: string,
    branchName: string,
    slackChannels?: string[],
    taskTitle?: string,
    overrideSources?: ContextSourceConfig[],
    model?: string,
  ) => Promise<void>;
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

export const useContextPackStore = create<ContextPackState>((set, get) => ({
  items: {},
  snapshots: {},
  sources: [],
  keywords: {},
  collecting: {},
  collectAborts: {},
  collectProgresses: {},
  lastCollectedAt: {},
  collectHistory: {},
  deltaItems: {},

  // 사용자가 수동으로 고정(pin)한 아이템. clearCollected에서도 삭제되지 않음
  addPin: (taskId, item) => {
    set((s) => {
      const existing = s.items[taskId] || [];
      return {
        items: { ...s.items, [taskId]: [...existing, { ...item, category: 'pinned' as const }] },
      };
    });
    get().persist();
  },

  removeItem: (taskId, itemId) => {
    set((s) => ({
      items: {
        ...s.items,
        [taskId]: (s.items[taskId] || []).filter((i) => i.id !== itemId),
      },
    }));
    get().persist();
  },

  cancelCollect: (taskId) => {
    const { collectAborts } = get();
    if (collectAborts[taskId]) collectAborts[taskId].abort();
    set((s) => ({
      collecting: { ...s.collecting, [taskId]: false },
      collectAborts: { ...s.collectAborts, [taskId]: undefined as unknown as AbortController },
    }));
  },

  // 자동 수집된 아이템만 제거하고 pinned 아이템은 보존
  clearCollected: (taskId) => {
    set((s) => ({
      items: {
        ...s.items,
        [taskId]: (s.items[taskId] || []).filter((i) => i.category === 'pinned'),
      },
    }));
    get().persist();
  },

  setKeywords: (taskId, keywords) => {
    set((s) => ({ keywords: { ...s.keywords, [taskId]: keywords } }));
    get().persist();
  },

  setSources: (sources) => {
    set({ sources });
    get().persist();
  },

  updateSource: (index, updates) => {
    set((s) => {
      const sources = [...s.sources];
      sources[index] = { ...sources[index], ...updates };
      return { sources };
    });
    get().persist();
  },

  addSource: (source) => {
    set((s) => ({ sources: [...s.sources, source] }));
    get().persist();
  },

  removeSource: (index) => {
    set((s) => ({ sources: s.sources.filter((_, i) => i !== index) }));
    get().persist();
  },

  /**
   * 2-phase 컨텍스트 수집 파이프라인 오케스트레이터.
   *
   * 실제 수집/키워드/필터 로직은 `services/contextCollection`에 위치하고,
   * 여기서는 store 상태(progress·abort·history) 조율만 담당한다.
   */
  collectAll: async (taskId, branchName, slackChannels, taskTitle, overrideSources, model) => {
    const state = get();
    if (state.collecting[taskId]) return;

    const enabledSources = (overrideSources || state.sources).filter((s) => s.enabled);
    const abort = new AbortController();
    const startTime = Date.now();

    set((s) => ({
      collecting: { ...s.collecting, [taskId]: true },
      collectAborts: { ...s.collectAborts, [taskId]: abort },
      collectProgresses: {
        ...s.collectProgresses,
        [taskId]: enabledSources.map((src) => ({
          type: src.type,
          status: 'collecting',
          itemCount: 0,
        })),
      },
    }));

    // 서비스 계층에 넘길 progress updater — store 구조 의존을 격리
    const onProgress: ProgressUpdater = (sourceIdx, patch) => {
      set((s) => ({
        collectProgresses: {
          ...s.collectProgresses,
          [taskId]: (s.collectProgresses[taskId] || []).map((p, i) => (i === sourceIdx ? { ...p, ...patch } : p)),
        },
      }));
    };

    const userKw = state.keywords[taskId] || [];

    // Phase 1: Notion/Slack/MCP
    const phase1Items = await runPhase1(enabledSources, enabledSources, {
      branchName,
      slackChannels,
      taskTitle,
      model,
      userKeywords: userKw,
      abort: abort.signal,
      onProgress,
    });
    if (abort.signal.aborted) return;

    // Phase 2: GitHub — Phase 1 결과에서 키워드 파생 후 검색
    const githubSources = enabledSources.filter((s) => s.type === 'github');
    let phase2Items: ContextItem[] = [];
    if (githubSources.length > 0) {
      const regex = extractRegexKeywords(phase1Items);
      const query = userKw.join(' ') || taskTitle || '';
      const semantic = await extractSemanticKeywords(phase1Items, query);
      const githubKw = mergeKeywords(userKw, regex, semantic);
      phase2Items = await runPhase2GitHub(enabledSources, enabledSources, githubKw, {
        branchName,
        slackChannels,
        taskTitle,
        model,
        abort: abort.signal,
        onProgress,
      });
    }
    if (abort.signal.aborted) return;

    const collected = [...phase1Items, ...phase2Items];

    // 1차: 키워드 매칭 기반 순위 → 2차: 벡터 필터 (graceful fallback)
    const ranked = rankByKeywordMatch(collected, userKw);
    const relevant = await filterByVectorSearch(ranked, taskTitle || '', taskId);

    // pinned 보존 + 신규 아이템 병합 (id 기준 중복 제거, pinned 우선)
    const existing = state.items[taskId] || [];
    const pinned = existing.filter((i) => i.category === 'pinned');
    const seen = new Set<string>();
    const deduped = [...pinned, ...relevant].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // 수집 이력 — 최대 20건 유지
    const finalProgress = get().collectProgresses[taskId] || [];
    const historyEntry: CollectHistoryEntry = {
      id: `ch-${Date.now().toString(36)}`,
      taskId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      keywords: userKw,
      model: model || 'default',
      resources: enabledSources.map((s) => s.type),
      results: finalProgress.map((p) => ({
        type: p.type,
        itemCount: p.itemCount,
        tokenUsage: p.tokenUsage,
        ...(p.error ? { error: p.error } : {}),
      })),
      totalItems: deduped.length - pinned.length,
      totalTokens: finalProgress.reduce(
        (sum, p) => sum + (p.tokenUsage ? p.tokenUsage.input + p.tokenUsage.output : 0),
        0,
      ),
    };

    set((s) => ({
      items: { ...s.items, [taskId]: deduped },
      collecting: { ...s.collecting, [taskId]: false },
      collectAborts: { ...s.collectAborts, [taskId]: undefined as unknown as AbortController },
      lastCollectedAt: { ...s.lastCollectedAt, [taskId]: new Date().toISOString() },
      collectHistory: {
        ...s.collectHistory,
        [taskId]: [...(s.collectHistory[taskId] || []), historyEntry].slice(-20),
      },
    }));
    get().persist();
  },

  // 작업 중단(pause) 시 현재 컨텍스트 상태를 스냅샷으로 저장. 재개 시 delta 비교용
  takeSnapshot: (taskId) => {
    const items = get().items[taskId] || [];
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
    const state = get();
    const snapshot = state.snapshots[taskId];

    // 먼저 최신 데이터 수집
    await get().collectAll(taskId, branchName);

    if (!snapshot) {
      // 스냅샷이 없으면 delta 비교 불가
      return;
    }

    const currentItems = get().items[taskId] || [];
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

    // 메인 목록에서 변경된 아이템에 isNew 표시
    set((s) => ({
      items: {
        ...s.items,
        [taskId]: currentItems.map((item) => ({
          ...item,
          isNew: delta.some((d) => d.id === item.id),
        })),
      },
      deltaItems: { ...s.deltaItems, [taskId]: delta },
    }));
    get().persist();
  },

  // localStorage에서 복원. 각 필드에 기본값을 두어 이전 스키마 데이터와 호환
  loadState: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          items: data.items || {},
          snapshots: data.snapshots || {},
          sources: data.sources || [],
          keywords: data.keywords || {},
          lastCollectedAt: data.lastCollectedAt || {},
          collectHistory: data.collectHistory || {},
          deltaItems: data.deltaItems || {},
        });
      }
    } catch {
      // corrupt data — start fresh
    }
  },

  // 런타임 전용 필드(isCollecting, collectAbort, collectProgress)는 직렬화에서 제외
  persist: () => {
    const s = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: s.items,
        snapshots: s.snapshots,
        sources: s.sources,
        keywords: s.keywords,
        lastCollectedAt: s.lastCollectedAt,
        collectHistory: s.collectHistory,
        deltaItems: s.deltaItems,
      }),
    );
  },
}));
