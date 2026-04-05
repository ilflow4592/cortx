import { create } from 'zustand';
import type { ContextItem, ContextSnapshot, ContextSourceConfig } from '../types/contextPack';
import { collectGitHub } from '../services/contextCollectors/github';
import { collectSlack } from '../services/contextCollectors/slack';
import { collectNotion } from '../services/contextCollectors/notion';

const STORAGE_KEY = 'cortx-context-pack';

interface ContextPackState {
  items: Record<string, ContextItem[]>;
  snapshots: Record<string, ContextSnapshot>;
  sources: ContextSourceConfig[];
  keywords: Record<string, string[]>;
  isCollecting: boolean;
  lastCollectedAt: Record<string, string>;
  deltaItems: Record<string, ContextItem[]>; // items changed since pause

  // Actions
  addPin: (taskId: string, item: ContextItem) => void;
  removeItem: (taskId: string, itemId: string) => void;
  setKeywords: (taskId: string, keywords: string[]) => void;
  setSources: (sources: ContextSourceConfig[]) => void;
  updateSource: (index: number, updates: Partial<ContextSourceConfig>) => void;
  addSource: (source: ContextSourceConfig) => void;
  removeSource: (index: number) => void;

  // Collection
  collectAll: (taskId: string, branchName: string, slackChannels?: string[], taskTitle?: string) => Promise<void>;
  takeSnapshot: (taskId: string) => void;
  detectDelta: (taskId: string, branchName: string) => Promise<void>;

  // Persistence
  loadState: () => void;
  persist: () => void;
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
  lastCollectedAt: {},
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

  collectAll: async (taskId, branchName, slackChannels, taskTitle) => {
    const state = get();
    if (state.isCollecting) return;

    set({ isCollecting: true });
    const kw = state.keywords[taskId] || [];
    const collected: ContextItem[] = [];

    for (const source of state.sources) {
      if (!source.enabled) continue;

      try {
        let items: ContextItem[] = [];
        switch (source.type) {
          case 'github':
            items = await collectGitHub(source, kw, branchName);
            break;
          case 'slack':
            items = await collectSlack(source, kw, slackChannels);
            break;
          case 'notion':
            items = await collectNotion(source, kw);
            break;
        }
        collected.push(...items);
      } catch (err) {
        console.warn(`Failed to collect from ${source.type}:`, err);
      }
    }

    // Store in vector DB + semantic filter (optional, fails gracefully)
    let relevant = collected;
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

    set((s) => ({
      items: { ...s.items, [taskId]: deduped },
      isCollecting: false,
      lastCollectedAt: { ...s.lastCollectedAt, [taskId]: new Date().toISOString() },
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
        deltaItems: s.deltaItems,
      })
    );
  },
}));
