import { create } from 'zustand';

export type AIProvider = 'claude' | 'openai' | 'ollama';
export type AuthMethod = 'api-key' | 'oauth';

export interface Settings {
  aiProvider: AIProvider;
  authMethod: AuthMethod;
  apiKey: string;
  oauthClientId: string;
  oauthAccessToken: string;
  oauthRefreshToken: string;
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
  authMethod: 'oauth',
  apiKey: '',
  oauthClientId: '',
  oauthAccessToken: '',
  oauthRefreshToken: '',
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
        authMethod: next.authMethod,
        apiKey: next.apiKey,
        oauthClientId: next.oauthClientId,
        oauthAccessToken: next.oauthAccessToken,
        oauthRefreshToken: next.oauthRefreshToken,
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
        set({ ...defaults, ...data });
      }
    } catch {
      // ignore
    }
  },
}));
