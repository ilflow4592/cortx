import { create } from 'zustand';

export type AIProvider = 'claude' | 'openai' | 'ollama';

export interface Settings {
  aiProvider: AIProvider;
  apiKey: string;
  modelId: string;
  ollamaUrl: string;
}

export interface SettingsState extends Settings {
  setSettings: (updates: Partial<Settings>) => void;
  loadSettings: () => void;
}

const STORAGE_KEY = 'cortx-settings';

const defaults: Settings = {
  aiProvider: 'claude',
  apiKey: '',
  modelId: 'claude-sonnet-4-20250514',
  ollamaUrl: 'http://localhost:11434',
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...defaults,

  setSettings: (updates) => {
    set((state) => {
      const next = { ...state, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        aiProvider: next.aiProvider,
        apiKey: next.apiKey,
        modelId: next.modelId,
        ollamaUrl: next.ollamaUrl,
      }));
      return next;
    });
  },

  loadSettings: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set(data);
      }
    } catch {
      // ignore
    }
  },
}));
