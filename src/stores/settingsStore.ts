/**
 * Settings Store — 앱 UI/텔레메트리 설정 관리.
 *
 * Claude CLI 인증/모델은 CLI 자체가 `~/.claude/`에서 관리하므로 여기서는 다루지 않는다.
 * 과거 API key/OAuth/modelId/aiProvider 등 필드가 있었으나 실사용처가 dead code 뿐이라 제거됐다.
 */
import { create } from 'zustand';

/** 앱 테마 */
export type Theme = 'dark' | 'midnight' | 'light';
/** UI 언어 */
export type Language = 'en' | 'ko';

/** 설정 값 인터페이스 (순수 데이터만, 액션 제외) */
export interface Settings {
  theme: Theme;
  language: Language;
  /** Opt-in local telemetry. Default OFF. */
  telemetryEnabled: boolean;
  /** Optional remote endpoint for flushing collected events. Empty = local only. */
  telemetryEndpoint: string;
  /** Opt-in Verifier LLM for complex rule evaluation (uses Haiku, costs tokens). Default OFF. */
  verifierLlmEnabled: boolean;
}

/** Settings + 액션을 합친 스토어 전체 타입 */
export interface SettingsState extends Settings {
  setSettings: (updates: Partial<Settings>) => void;
  loadSettings: () => void;
}

const STORAGE_KEY = 'cortx-settings';

// Auto-detect initial language from browser (ko if Korean system, else en)
const initialLang: Language = typeof navigator !== 'undefined' && navigator.language?.startsWith('ko') ? 'ko' : 'en';

/** 초기 state — 테스트 reset + 신규 필드 추가 시 단일 진실 공급원 */
export const SETTINGS_INITIAL_STATE: Settings = {
  theme: 'dark',
  language: initialLang,
  telemetryEnabled: false,
  telemetryEndpoint: '',
  verifierLlmEnabled: false,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...SETTINGS_INITIAL_STATE,

  // 상태 변경 즉시 localStorage에 동기 저장 (다른 스토어와 달리 자체 persist)
  setSettings: (updates) => {
    set((state) => {
      const next = { ...state, ...updates };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          theme: next.theme,
          language: next.language,
          telemetryEnabled: next.telemetryEnabled,
          telemetryEndpoint: next.telemetryEndpoint,
          verifierLlmEnabled: next.verifierLlmEnabled,
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
        set({ ...SETTINGS_INITIAL_STATE, ...data });
      }
    } catch {
      // ignore
    }
  },
}));
