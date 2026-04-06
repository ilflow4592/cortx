import { create } from 'zustand';
import type { ContextItem, ContextSnapshot, ContextSourceConfig } from '../types/contextPack';
import { collectGitHub } from '../services/contextCollectors/github';
import { collectSlack } from '../services/contextCollectors/slack';
import { collectNotion } from '../services/contextCollectors/notion';
import { collectViaMcp } from '../services/contextCollectors/mcpSearch';

const STORAGE_KEY = 'cortx-context-pack';

export interface SourceCollectStatus {
  type: string;
  status: 'pending' | 'collecting' | 'done' | 'error';
  itemCount: number;
  error?: string;
  tokenUsage?: { input: number; output: number };
}

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
  isCollecting: boolean;
  collectAbort: AbortController | null;
  collectProgress: SourceCollectStatus[];
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
  cancelCollect: () => void;

  // Collection
  collectAll: (taskId: string, branchName: string, slackChannels?: string[], taskTitle?: string, overrideSources?: ContextSourceConfig[], model?: string) => Promise<void>;
  takeSnapshot: (taskId: string) => void;
  detectDelta: (taskId: string, branchName: string) => Promise<void>;

  // Persistence
  loadState: () => void;
  persist: () => void;
}

/** Extract ticket IDs, branch names, and key terms from collected items */
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

function hashItem(item: ContextItem): string {
  return `${item.title}|${item.summary}|${item.timestamp}`;
}

export const useContextPackStore = create<ContextPackState>((set, get) => ({
  items: {},
  snapshots: {},
  sources: [],
  keywords: {},
  isCollecting: false,
  collectAbort: null,
  collectProgress: [],
  lastCollectedAt: {},
  collectHistory: {},
  deltaItems: {},

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

  cancelCollect: () => {
    const { collectAbort } = get();
    if (collectAbort) collectAbort.abort();
    set({ isCollecting: false, collectAbort: null });
  },

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

  collectAll: async (taskId, branchName, slackChannels, taskTitle, overrideSources, model) => {
    const state = get();
    if (state.isCollecting) return;

    const enabledSources = (overrideSources || state.sources).filter((s) => s.enabled);
    const progress: SourceCollectStatus[] = enabledSources.map((s) => ({
      type: s.type, status: 'pending', itemCount: 0,
    }));

    const abort = new AbortController();
    const startTime = Date.now();
    set({ isCollecting: true, collectAbort: abort, collectProgress: progress.map((p) => ({ ...p, status: 'collecting' })) });
    const kw = state.keywords[taskId] || [];

    // Phase 1: Notion/Slack first (to extract keywords for GitHub)
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
              items = r?.items || []; tokenUsage = r?.tokenUsage;
            }
          } else if (source.type === 'notion') {
            if (source.token) {
              items = await collectNotion(source, kw);
            } else {
              const r = await collectViaMcp('notion', kw, '', { model });
              items = r?.items || []; tokenUsage = r?.tokenUsage;
            }
          }
          if (abort.signal.aborted) return [] as ContextItem[];
          set((s) => ({
            collectProgress: s.collectProgress.map((p, i) =>
              i === idx ? { ...p, status: 'done', itemCount: (items || []).length, tokenUsage } : p
            ),
          }));
          return items || [];
        })
      );

      for (let i = 0; i < phase1.length; i++) {
        const r = phase1[i];
        if (r.status === 'fulfilled') {
          collected.push(...r.value);
        } else {
          const idx = enabledSources.indexOf(nonGithubSources[i]);
          set((s) => ({
            collectProgress: s.collectProgress.map((p, j) =>
              j === idx ? { ...p, status: 'error', error: String(r.reason) } : p
            ),
          }));
        }
      }
    }

    if (abort.signal.aborted) return;

    // Phase 2: Extract keywords from Notion/Slack results, then search GitHub
    if (githubSources.length > 0) {
      // Regex-based extraction (fast, always works)
      const regexKeywords = extractKeywordsFromItems(collected);

      // Ollama embedding-based extraction (semantic, optional)
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

      const githubKw = [...new Set([...kw, ...regexKeywords, ...semanticKeywords])];
      console.log('[cortx] GitHub search with keywords:', { original: kw, regex: regexKeywords, semantic: semanticKeywords, final: githubKw });

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
            collectProgress: s.collectProgress.map((p, i) =>
              i === idx ? { ...p, status: 'done', itemCount: (items || []).length } : p
            ),
          }));
          return items || [];
        })
      );

      for (let i = 0; i < phase2.length; i++) {
        const r = phase2[i];
        if (r.status === 'fulfilled') {
          collected.push(...r.value);
        } else {
          const idx = enabledSources.indexOf(githubSources[i]);
          set((s) => ({
            collectProgress: s.collectProgress.map((p, j) =>
              j === idx ? { ...p, status: 'error', error: String(r.reason) } : p
            ),
          }));
        }
      }
    }

    if (abort.signal.aborted) return;

    // Sort by keyword relevance: title match first, then the rest
    const sorted = kw.length > 0
      ? [...collected].sort((a, b) => {
          const aTitle = kw.some((k) => a.title.toLowerCase().includes(k.toLowerCase())) ? 0 : 1;
          const bTitle = kw.some((k) => b.title.toLowerCase().includes(k.toLowerCase())) ? 0 : 1;
          return aTitle - bTitle;
        })
      : collected;

    // Store in vector DB + semantic filter (optional, fails gracefully)
    let relevant = sorted;
    try {
      const vs = await import('../services/vectorSearch');
      const vectorItems = collected.map((item) => ({
        id: item.id, taskId, sourceType: item.sourceType,
        title: item.title, content: item.metadata?.fullText || item.summary || item.title,
        url: item.url, timestamp: item.timestamp,
      }));
      await vs.storeContextBatch(vectorItems);

      if (taskTitle && collected.length > 10) {
        const searchResults = await vs.searchContext(taskTitle, 15, taskId);
        const relevantIds = new Set(searchResults.map((r) => r.id));
        const filtered = collected.filter((item) => relevantIds.has(item.id));
        if (filtered.length > 0) relevant = filtered;
      }
    } catch {
      // Vector DB not available — use all collected items
    }

    // Merge: keep pinned items, replace auto/linked
    const existing = state.items[taskId] || [];
    const pinned = existing.filter((i) => i.category === 'pinned');
    const merged = [...pinned, ...relevant];

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Build history entry
    const finalProgress = get().collectProgress;
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
      totalTokens: finalProgress.reduce((sum, p) => sum + (p.tokenUsage ? p.tokenUsage.input + p.tokenUsage.output : 0), 0),
    };

    set((s) => ({
      items: { ...s.items, [taskId]: deduped },
      isCollecting: false,
      collectAbort: null,
      lastCollectedAt: { ...s.lastCollectedAt, [taskId]: new Date().toISOString() },
      collectHistory: {
        ...s.collectHistory,
        [taskId]: [...(s.collectHistory[taskId] || []), historyEntry].slice(-20), // keep last 20
      },
    }));
    get().persist();
  },

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

  detectDelta: async (taskId, branchName) => {
    const state = get();
    const snapshot = state.snapshots[taskId];

    // First, collect fresh data
    await get().collectAll(taskId, branchName);

    if (!snapshot) {
      // No snapshot = no delta to detect
      return;
    }

    const currentItems = get().items[taskId] || [];
    const delta: ContextItem[] = [];

    for (const item of currentItems) {
      const oldHash = snapshot.itemHashes[item.id];
      if (!oldHash) {
        // New item since snapshot
        delta.push({ ...item, isNew: true });
      } else if (oldHash !== hashItem(item)) {
        // Changed item since snapshot
        delta.push({ ...item, isNew: true });
      }
    }

    // Mark new items in the main list
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
      // ignore
    }
  },

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
      })
    );
  },
}));
