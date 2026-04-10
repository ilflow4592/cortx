/**
 * Settings Store — AI 연동 설정 관리
 *
 * AI 제공자(Claude, OpenAI, Ollama), 인증 방식(API Key, OAuth), 모델 ID 등을 관리한다.
 * 이 스토어만 자체적으로 localStorage에 직접 읽기/쓰기한다 (다른 스토어는 외부 subscriber 사용).
 */
import { create } from 'zustand';

/** 지원하는 AI 제공자 */
export type AIProvider = 'claude' | 'openai' | 'ollama';
/** 인증 방식: API Key 직접 입력 또는 OAuth 토큰 */
export type AuthMethod = 'api-key' | 'oauth';
/** 앱 테마 */
export type Theme = 'dark' | 'midnight' | 'light';

/** 설정 값 인터페이스 (순수 데이터만, 액션 제외) */
export interface Settings {
  aiProvider: AIProvider;
  authMethod: AuthMethod;
  apiKey: string;
  oauthClientId: string;
  oauthAccessToken: string;
  oauthRefreshToken: string;
  modelId: string;
  ollamaUrl: string;
  theme: Theme;
}

/** Settings + 액션을 합친 스토어 전체 타입 */
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
  theme: 'dark',
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...defaults,

  // 상태 변경 즉시 localStorage에 동기 저장 (다른 스토어와 달리 자체 persist)
  setSettings: (updates) => {
    set((state) => {
      const next = { ...state, ...updates };
      // 함수(액션)를 제외한 순수 데이터만 직렬화
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          aiProvider: next.aiProvider,
          authMethod: next.authMethod,
          apiKey: next.apiKey,
          oauthClientId: next.oauthClientId,
          oauthAccessToken: next.oauthAccessToken,
          oauthRefreshToken: next.oauthRefreshToken,
          modelId: next.modelId,
          ollamaUrl: next.ollamaUrl,
          theme: next.theme,
        }),
      );
      return next;
    });
  },

  // defaults를 base로 깔고 저장된 값으로 덮어쓰기 — 새 필드 추가 시 자동으로 기본값 적용
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
