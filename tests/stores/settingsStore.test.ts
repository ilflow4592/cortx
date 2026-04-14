import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, SETTINGS_INITIAL_STATE } from '../../src/stores/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset to defaults (override language to 'en' for deterministic tests regardless of navigator locale)
    useSettingsStore.setState({ ...SETTINGS_INITIAL_STATE, language: 'en' });
  });

  describe('setSettings', () => {
    it('updates specified fields without touching others', () => {
      useSettingsStore.getState().setSettings({ theme: 'light' });
      const state = useSettingsStore.getState();
      expect(state.theme).toBe('light');
      expect(state.aiProvider).toBe('claude');
      expect(state.modelId).toBe('claude-sonnet-4-20250514');
    });

    it('persists settings to localStorage', () => {
      useSettingsStore.getState().setSettings({ apiKey: 'sk-test-123', theme: 'midnight' });
      const raw = localStorage.getItem('cortx-settings');
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw!);
      expect(data.apiKey).toBe('sk-test-123');
      expect(data.theme).toBe('midnight');
    });

    it('multiple setSettings calls merge correctly', () => {
      useSettingsStore.getState().setSettings({ theme: 'light' });
      useSettingsStore.getState().setSettings({ language: 'ko' });
      const state = useSettingsStore.getState();
      expect(state.theme).toBe('light');
      expect(state.language).toBe('ko');
    });
  });

  describe('loadSettings', () => {
    it('loads persisted settings from localStorage', () => {
      localStorage.setItem('cortx-settings', JSON.stringify({ theme: 'light', language: 'ko', apiKey: 'sk-loaded' }));
      useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();
      expect(state.theme).toBe('light');
      expect(state.language).toBe('ko');
      expect(state.apiKey).toBe('sk-loaded');
    });

    it('applies defaults for missing fields', () => {
      localStorage.setItem('cortx-settings', JSON.stringify({ apiKey: 'sk-partial' }));
      useSettingsStore.getState().loadSettings();
      const state = useSettingsStore.getState();
      expect(state.apiKey).toBe('sk-partial');
      // Fields not in storage should use defaults
      expect(state.modelId).toBe('claude-sonnet-4-20250514');
      expect(state.ollamaUrl).toBe('http://localhost:11434');
    });

    it('handles missing localStorage gracefully', () => {
      localStorage.removeItem('cortx-settings');
      expect(() => useSettingsStore.getState().loadSettings()).not.toThrow();
    });

    it('handles corrupted JSON gracefully', () => {
      localStorage.setItem('cortx-settings', '{invalid json');
      expect(() => useSettingsStore.getState().loadSettings()).not.toThrow();
    });
  });

  describe('theme switching', () => {
    it('cycles through all theme values', () => {
      const themes = ['dark', 'midnight', 'light'] as const;
      for (const theme of themes) {
        useSettingsStore.getState().setSettings({ theme });
        expect(useSettingsStore.getState().theme).toBe(theme);
      }
    });
  });

  describe('language switching', () => {
    it('persists language changes', () => {
      useSettingsStore.getState().setSettings({ language: 'ko' });
      const raw = JSON.parse(localStorage.getItem('cortx-settings')!);
      expect(raw.language).toBe('ko');
    });
  });
});
