/**
 * Context Pack Store — 작업별 컨텍스트(외부 정보) 수집 및 관리
 *
 * GitHub PR/이슈, Slack 메시지, Notion 페이지 등을 수집하여 작업에 연결한다.
 * 수집 파이프라인: Notion/Slack 먼저 수집 → 키워드 추출 → GitHub 검색 (2-phase).
 * 벡터 DB(Ollama 임베딩)를 통한 시맨틱 필터링도 지원하며, 실패 시 graceful fallback.
 *
 * Snapshot/Delta/History는 contextHistoryStore로 분리됨 (별도 persistence key).
 * Persistence: 자체 persist() 메서드로 localStorage에 저장.
 */
import { create } from 'zustand';
import type { ContextItem, ContextSourceConfig } from '../types/contextPack';
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
import { useContextHistoryStore, type CollectHistoryEntry } from './contextHistoryStore';

// MCP 관련 상태는 별도 store(mcpStore)로 분리됨 — 수집 관심사와 무관.
// 기존 `import { McpServerStatus } from '../stores/contextPackStore'`는
// re-export로 뒤로 호환.
export type { McpServerStatus } from './mcpStore';

// fetchPinUrl 모듈 promise를 모듈 로드 시점에 시작 — 첫 Pin fetch 시 import 대기 0.
// 동적 import 유지 이유: 테스트 환경에서 vi.mock 격리 + 순환 의존 회피.
const fetchPinUrlModule = import('../utils/pipeline-exec/fetchPinUrl');
// History entry 타입은 history store로 이동했지만, 기존 import 경로 호환을 위해 re-export.
export type { CollectHistoryEntry } from './contextHistoryStore';

const STORAGE_KEY = 'cortx-context-pack';

/** 개별 소스의 수집 진행 상태 (UI 진행률 표시용) */
export interface SourceCollectStatus {
  type: string;
  status: 'pending' | 'collecting' | 'done' | 'error';
  itemCount: number;
  error?: string;
  tokenUsage?: { input: number; output: number };
}

interface ContextPackState {
  items: Record<string, ContextItem[]>;
  sources: ContextSourceConfig[];
  keywords: Record<string, string[]>;
  collecting: Record<string, boolean>; // per-task collecting state
  collectAborts: Record<string, AbortController>; // per-task abort controllers
  collectProgresses: Record<string, SourceCollectStatus[]>; // per-task progress
  lastCollectedAt: Record<string, string>;

  // Actions
  addPin: (taskId: string, item: ContextItem) => void;
  /** addPin + HTTP URL이면 백그라운드로 본문 fetch (Notion/GitHub/Slack MCP). */
  addPinWithFetch: (taskId: string, item: ContextItem) => void;
  removeItem: (taskId: string, itemId: string) => void;
  setKeywords: (taskId: string, keywords: string[]) => void;
  setSources: (sources: ContextSourceConfig[]) => void;
  updateSource: (index: number, updates: Partial<ContextSourceConfig>) => void;
  addSource: (source: ContextSourceConfig) => void;
  removeSource: (index: number) => void;

  clearCollected: (taskId: string) => void;
  cancelCollect: (taskId: string) => void;
  /** 태스크 삭제 시 호출 — 해당 taskId 에 연결된 모든 per-task 데이터 제거 + persist */
  purgeTask: (taskId: string) => void;

  // Collection
  collectAll: (
    taskId: string,
    branchName: string,
    slackChannels?: string[],
    taskTitle?: string,
    overrideSources?: ContextSourceConfig[],
    model?: string,
  ) => Promise<void>;

  // Persistence
  loadState: () => void;
  persist: () => void;
}

/** 초기 state — 테스트 reset + 신규 필드 추가 시 단일 진실 공급원 */
export const CONTEXT_PACK_INITIAL_STATE: Pick<
  ContextPackState,
  'items' | 'sources' | 'keywords' | 'collecting' | 'collectAborts' | 'collectProgresses' | 'lastCollectedAt'
> = {
  items: {},
  sources: [],
  keywords: {},
  collecting: {},
  collectAborts: {},
  collectProgresses: {},
  lastCollectedAt: {},
};

export const useContextPackStore = create<ContextPackState>((set, get) => ({
  ...CONTEXT_PACK_INITIAL_STATE,

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

  // Pin 추가 + HTTP URL이면 fire-and-forget으로 백그라운드 fullText fetch 큐에 등록.
  // 파이프라인 시작 시점의 fetchPinUrl 블로킹(45-120초)을 Pin 추가 시점으로 이동.
  // 호출자(handlePin)는 즉시 리턴 받고 onClose() 가능 — UI 절대 블록 안 함.
  // fetchPinUrl 실패 시 runPipeline.ts lazy fetch 폴백이 커버.
  //
  // 핵심: addPin 호출 시점에 metadata.fetching='1'을 동기적으로 박아 즉시
  // [fetching…] 배지를 띄운다 (microtask 지연 없음). 모듈 import는 모듈 로드
  // 시점에 미리 시작해 첫 fetch의 import 대기 비용 0.
  addPinWithFetch: (taskId, item) => {
    const url = item.url;
    const willFetch = !!url && url.startsWith('http') && !item.metadata?.fullText && item.metadata?.fetching !== '1';
    // willFetch면 fetching 플래그를 metadata에 동기 주입 → 카드 즉시 [fetching…] 표시
    const itemToAdd: ContextItem = willFetch
      ? { ...item, metadata: { ...(item.metadata || {}), fetching: '1' } }
      : item;
    get().addPin(taskId, itemToAdd);
    if (!willFetch || !url) return;

    // 모듈 로드는 import 시작 → 첫 호출 비용 분산. setTimeout(0)으로 다음 tick에 실행해
    // addPin의 set() 렌더가 먼저 처리되도록 양보 (UI 응답성 최대화).
    setTimeout(() => {
      void (async () => {
        try {
          const { fetchPinUrl } = await fetchPinUrlModule;
          const content = await fetchPinUrl(url);
          set((s) => ({
            items: {
              ...s.items,
              [taskId]: (s.items[taskId] || []).map((i) => {
                if (i.id !== item.id) return i;
                const rest = { ...(i.metadata || {}) };
                delete rest.fetching;
                return content ? { ...i, metadata: { ...rest, fullText: content } } : { ...i, metadata: rest };
              }),
            },
          }));
          get().persist();
        } catch {
          // 실패 시 fetching 플래그만 정리
          set((s) => ({
            items: {
              ...s.items,
              [taskId]: (s.items[taskId] || []).map((i) => {
                if (i.id !== item.id) return i;
                const rest = { ...(i.metadata || {}) };
                delete rest.fetching;
                return { ...i, metadata: rest };
              }),
            },
          }));
        }
      })();
    }, 0);
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

  purgeTask: (taskId) => {
    const { collectAborts } = get();
    collectAborts[taskId]?.abort();
    set((s) => {
      const strip = <T>(m: Record<string, T>) => {
        if (!(taskId in m)) return m;
        const next = { ...m };
        delete next[taskId];
        return next;
      };
      return {
        items: strip(s.items),
        keywords: strip(s.keywords),
        collecting: strip(s.collecting),
        collectAborts: strip(s.collectAborts),
        collectProgresses: strip(s.collectProgresses),
        lastCollectedAt: strip(s.lastCollectedAt),
      };
    });
    get().persist();
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
   * 여기서는 store 상태(progress·abort) 조율만 담당한다. 수집 이력은
   * contextHistoryStore로 위임.
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

    // 수집 이력 — history store에 위임
    const finalProgress = get().collectProgresses[taskId] || [];

    // pinned 보존 + 신규 아이템 병합. functional set으로 현재 state(s)에서 pinned를
    // 다시 읽어 collect 중에 추가된 Pin도 안전하게 보존한다.
    // (이전엔 collectAll 시작 시점에 캡처한 state를 사용해 race condition 발생 —
    //  Collect 진행 중 사용자가 Pin 추가하면 완료 시점에 덮어쓰여 사라졌음)
    let totalItems = 0;
    let pinnedCount = 0;
    set((s) => {
      const currentExisting = s.items[taskId] || [];
      const currentPinned = currentExisting.filter((i) => i.category === 'pinned');
      const seen = new Set<string>();
      const deduped = [...currentPinned, ...relevant].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      pinnedCount = currentPinned.length;
      totalItems = deduped.length - pinnedCount;
      return {
        items: { ...s.items, [taskId]: deduped },
        collecting: { ...s.collecting, [taskId]: false },
        collectAborts: { ...s.collectAborts, [taskId]: undefined as unknown as AbortController },
        lastCollectedAt: { ...s.lastCollectedAt, [taskId]: new Date().toISOString() },
      };
    });

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
      totalItems,
      totalTokens: finalProgress.reduce(
        (sum, p) => sum + (p.tokenUsage ? p.tokenUsage.input + p.tokenUsage.output : 0),
        0,
      ),
    };
    useContextHistoryStore.getState().appendHistory(taskId, historyEntry);
    get().persist();
  },

  // localStorage에서 복원. 각 필드에 기본값을 두어 이전 스키마 데이터와 호환.
  // snapshots/collectHistory/deltaItems는 contextHistoryStore가 로드.
  loadState: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          items: data.items || {},
          sources: data.sources || [],
          keywords: data.keywords || {},
          lastCollectedAt: data.lastCollectedAt || {},
        });
      }
    } catch {
      // corrupt data — start fresh
    }
  },

  // 런타임 전용 필드(collecting, collectAborts, collectProgresses)는 직렬화에서 제외.
  // history 관련 필드는 contextHistoryStore가 별도 key로 persist.
  persist: () => {
    const s = get();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: s.items,
        sources: s.sources,
        keywords: s.keywords,
        lastCollectedAt: s.lastCollectedAt,
      }),
    );
  },
}));
