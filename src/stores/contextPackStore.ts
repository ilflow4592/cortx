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
import { invoke } from '@tauri-apps/api/core';
import type { ContextItem, ContextSnapshot, ContextSourceConfig } from '../types/contextPack';
import { collectGitHub } from '../services/contextCollectors/github';
import { collectSlack } from '../services/contextCollectors/slack';
import { collectNotion } from '../services/contextCollectors/notion';
import { collectViaMcp } from '../services/contextCollectors/mcpSearch';

const STORAGE_KEY = 'cortx-context-pack';

type ServiceType = 'github' | 'notion' | 'slack' | 'obsidian' | 'other';

export interface McpServerStatus {
  name: string;
  command: string;
  status: 'ready' | 'auth-needed' | 'unknown';
  authUrl?: string;
  serviceType: ServiceType;
  env: Record<string, string>;
}

const AUTH_CHECKS: Record<string, { cmd: string; authUrl: string }> = {
  github: { cmd: 'gh auth status 2>&1', authUrl: 'https://github.com/settings/tokens' },
  notion: { cmd: 'echo ok', authUrl: 'https://www.notion.so/my-integrations' },
  slack: { cmd: 'echo ok', authUrl: 'https://api.slack.com/apps' },
};

function detectServiceType(name: string): ServiceType {
  const n = name.toLowerCase();
  if (n.includes('github')) return 'github';
  if (n.includes('notion')) return 'notion';
  if (n.includes('slack')) return 'slack';
  if (n.includes('obsidian')) return 'obsidian';
  return 'other';
}

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

  // MCP servers (loaded once at app start)
  mcpServers: McpServerStatus[];
  mcpLoading: boolean;
  loadMcpServers: () => Promise<void>;

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

/** Notion/Slack에서 수집한 아이템에서 JIRA 티켓 ID, 브랜치명, PR 번호를 정규식으로 추출 */
function extractKeywordsFromItems(items: ContextItem[]): string[] {
  const keywords = new Set<string>();
  for (const item of items) {
    const text = `${item.title} ${item.summary}`;
    // Ticket IDs: BE-1390, FE-123, PROJ-456, etc.
    const tickets = text.match(/[A-Z]{2,}-\d+/g);
    if (tickets) tickets.forEach((t) => keywords.add(t));
    // Branch-like patterns: feat/xxx, fix/xxx, hotfix/xxx
    const branches = text.match(/(?:feat|fix|hotfix|chore|refactor)\/[^\s,)]+/g);
    if (branches) branches.forEach((b) => keywords.add(b));
    // PR references: #1234
    const prs = text.match(/#(\d{3,})/g);
    if (prs) prs.forEach((p) => keywords.add(p));
  }
  return [...keywords].slice(0, 10); // Limit to avoid too many queries
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
  mcpServers: [],
  mcpLoading: false,

  loadMcpServers: async () => {
    set({ mcpLoading: true });
    try {
      const servers =
        await invoke<
          {
            name: string;
            command: string;
            args: string[];
            env: Record<string, string>;
            server_type: string;
            url: string;
          }[]
        >('list_mcp_servers');
      const statuses: McpServerStatus[] = [];
      for (const server of servers) {
        const serviceType = detectServiceType(server.name);
        const matchKey = Object.keys(AUTH_CHECKS).find((k) => server.name.toLowerCase().includes(k));
        if (matchKey) {
          const check = AUTH_CHECKS[matchKey];
          try {
            const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
              cwd: '/',
              command: check.cmd,
            });
            const authed = result.success || result.output.includes('Logged in') || result.output.includes('ok');
            statuses.push({
              name: server.name,
              command: server.command,
              env: server.env || {},
              status: authed ? 'ready' : 'auth-needed',
              authUrl: check.authUrl,
              serviceType,
            });
          } catch {
            statuses.push({
              name: server.name,
              command: server.command,
              env: server.env || {},
              status: 'auth-needed',
              authUrl: check.authUrl,
              serviceType,
            });
          }
        } else {
          statuses.push({
            name: server.name,
            command: server.command,
            env: server.env || {},
            status: 'unknown',
            serviceType,
          });
        }
      }
      set({ mcpServers: statuses, mcpLoading: false });
    } catch {
      set({ mcpLoading: false });
    }
  },

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
   * 2-phase 컨텍스트 수집 파이프라인.
   * Phase 1: Notion/Slack을 병렬 수집 → 티켓 ID, 브랜치명 등 키워드 추출.
   * Phase 2: 추출된 키워드로 GitHub PR/이슈 검색 (더 정확한 결과).
   * 수집 후 벡터 DB에 저장하고 시맨틱 필터링으로 관련도 높은 아이템만 유지.
   */
  collectAll: async (taskId, branchName, slackChannels, taskTitle, overrideSources, model) => {
    const state = get();
    if (state.collecting[taskId]) return; // 해당 task 중복 실행 방지

    const enabledSources = (overrideSources || state.sources).filter((s) => s.enabled);
    const progress: SourceCollectStatus[] = enabledSources.map((s) => ({
      type: s.type,
      status: 'pending',
      itemCount: 0,
    }));

    const abort = new AbortController();
    const startTime = Date.now();
    set((s) => ({
      collecting: { ...s.collecting, [taskId]: true },
      collectAborts: { ...s.collectAborts, [taskId]: abort },
      collectProgresses: {
        ...s.collectProgresses,
        [taskId]: progress.map((p) => ({ ...p, status: 'collecting' as const })),
      },
    }));
    const kw = state.keywords[taskId] || [];

    // Phase 1: Notion/Slack을 먼저 수집하여 GitHub 검색용 키워드를 추출
    const nonGithubSources = enabledSources.filter((s) => s.type !== 'github');
    const githubSources = enabledSources.filter((s) => s.type === 'github');

    const collected: ContextItem[] = [];

    // Run Notion/Slack in parallel
    if (nonGithubSources.length > 0) {
      const phase1 = await Promise.allSettled(
        nonGithubSources.map(async (source) => {
          if (abort.signal.aborted) return [] as ContextItem[];
          const idx = enabledSources.indexOf(source);
          let items: ContextItem[] = [];
          let tokenUsage: { input: number; output: number } | undefined;
          if (source.type === 'slack') {
            if (source.token) {
              items = await collectSlack(source, kw, slackChannels);
            } else {
              const r = await collectViaMcp('slack', kw, '', { model });
              items = r?.items || [];
              tokenUsage = r?.tokenUsage;
            }
          } else if (source.type === 'notion') {
            if (source.token) {
              items = await collectNotion(source, kw, taskTitle);
            } else {
              const r = await collectViaMcp('notion', kw, '', { model });
              items = r?.items || [];
              tokenUsage = r?.tokenUsage;
            }
          } else if (source.type === 'obsidian') {
            const r = await collectViaMcp('obsidian', kw, '', { model });
            items = r?.items || [];
            tokenUsage = r?.tokenUsage;
          }
          if (abort.signal.aborted) return [] as ContextItem[];
          set((s) => ({
            collectProgresses: {
              ...s.collectProgresses,
              [taskId]: (s.collectProgresses[taskId] || []).map((p, i) =>
                i === idx ? { ...p, status: 'done', itemCount: (items || []).length, tokenUsage } : p,
              ),
            },
          }));
          return items || [];
        }),
      );

      for (let i = 0; i < phase1.length; i++) {
        const r = phase1[i];
        if (r.status === 'fulfilled') {
          collected.push(...r.value);
        } else {
          const idx = enabledSources.indexOf(nonGithubSources[i]);
          set((s) => ({
            collectProgresses: {
              ...s.collectProgresses,
              [taskId]: (s.collectProgresses[taskId] || []).map((p, j) =>
                j === idx ? { ...p, status: 'error', error: String(r.reason) } : p,
              ),
            },
          }));
        }
      }
    }

    if (abort.signal.aborted) return;

    // Phase 2: Phase 1 결과에서 키워드를 추출한 뒤 GitHub 검색
    if (githubSources.length > 0) {
      // 정규식 기반 추출 (빠르고 안정적)
      const regexKeywords = extractKeywordsFromItems(collected);

      // Ollama 임베딩 기반 시맨틱 키워드 추출 (선택적, Ollama 미실행 시 skip)
      let semanticKeywords: string[] = [];
      if (collected.length > 0) {
        try {
          const vs = await import('../services/vectorSearch');
          const texts = collected.map((item) => `${item.title} ${item.summary}`);
          const query = kw.join(' ') || taskTitle || '';
          semanticKeywords = await vs.extractKeywords(query, texts, 5);
        } catch {
          // Ollama not available — use regex only
        }
      }

      // 사용자 키워드 + 정규식 키워드 + 시맨틱 키워드를 합쳐서 중복 제거
      const githubKw = [...new Set([...kw, ...regexKeywords, ...semanticKeywords])];
      console.log('[cortx] GitHub search with keywords:', {
        original: kw,
        regex: regexKeywords,
        semantic: semanticKeywords,
        final: githubKw,
      });

      const phase2 = await Promise.allSettled(
        githubSources.map(async (source) => {
          if (abort.signal.aborted) return [] as ContextItem[];
          const idx = enabledSources.indexOf(source);
          let items: ContextItem[] = [];
          if (source.token && source.owner && source.repo) {
            items = await collectGitHub(source, githubKw, branchName);
          } else {
            const r = await collectViaMcp('github', githubKw, '', { owner: source.owner, repo: source.repo, model });
            items = r?.items || [];
          }
          if (abort.signal.aborted) return [] as ContextItem[];
          set((s) => ({
            collectProgresses: {
              ...s.collectProgresses,
              [taskId]: (s.collectProgresses[taskId] || []).map((p, i) =>
                i === idx ? { ...p, status: 'done', itemCount: (items || []).length } : p,
              ),
            },
          }));
          return items || [];
        }),
      );

      for (let i = 0; i < phase2.length; i++) {
        const r = phase2[i];
        if (r.status === 'fulfilled') {
          collected.push(...r.value);
        } else {
          const idx = enabledSources.indexOf(githubSources[i]);
          set((s) => ({
            collectProgresses: {
              ...s.collectProgresses,
              [taskId]: (s.collectProgresses[taskId] || []).map((p, j) =>
                j === idx ? { ...p, status: 'error', error: String(r.reason) } : p,
              ),
            },
          }));
        }
      }
    }

    if (abort.signal.aborted) return;

    // 키워드가 제목에 포함된 아이템을 상위로 정렬 (간단한 relevance ranking)
    const sorted =
      kw.length > 0
        ? [...collected].sort((a, b) => {
            const aTitle = kw.some((k) => a.title.toLowerCase().includes(k.toLowerCase())) ? 0 : 1;
            const bTitle = kw.some((k) => b.title.toLowerCase().includes(k.toLowerCase())) ? 0 : 1;
            return aTitle - bTitle;
          })
        : collected;

    // 벡터 DB 저장 + 시맨틱 필터링 (Ollama/Qdrant 미실행 시 전체 아이템 사용)
    let relevant = sorted;
    try {
      const vs = await import('../services/vectorSearch');
      const vectorItems = collected.map((item) => ({
        id: item.id,
        taskId,
        sourceType: item.sourceType,
        title: item.title,
        content: item.metadata?.fullText || item.summary || item.title,
        url: item.url,
        timestamp: item.timestamp,
      }));
      await vs.storeContextBatch(vectorItems);

      // 아이템이 10개 이상이면 시맨틱 검색으로 상위 15개만 필터링
      if (taskTitle && collected.length > 10) {
        const searchResults = await vs.searchContext(taskTitle, 15, taskId);
        const relevantIds = new Set(searchResults.map((r) => r.id));
        const filtered = collected.filter((item) => relevantIds.has(item.id));
        if (filtered.length > 0) relevant = filtered;
      }
    } catch {
      // Vector DB not available — use all collected items
    }

    // pinned 아이템 보존 + 새로 수집된 아이템 병합
    const existing = state.items[taskId] || [];
    const pinned = existing.filter((i) => i.category === 'pinned');
    const merged = [...pinned, ...relevant];

    // id 기준 중복 제거 (pinned가 먼저이므로 pinned 우선)

    const seen = new Set<string>();
    const deduped = merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // 수집 이력 기록 (UI에서 과거 수집 결과 조회용, 최대 20건 유지)
    const finalProgress = get().collectProgresses[taskId] || [];
    const historyEntry: CollectHistoryEntry = {
      id: `ch-${Date.now().toString(36)}`,
      taskId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      keywords: kw,
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
        [taskId]: [...(s.collectHistory[taskId] || []), historyEntry].slice(-20), // keep last 20
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
