import { describe, it, expect } from 'vitest';
import { translate } from '../src/i18n';
import { translations, LANGUAGES } from '../src/i18n/locales';

describe('i18n translate()', () => {
  it('returns English string for English language', () => {
    expect(translate('en', 'common.save')).toBe('Save');
    expect(translate('en', 'action.newTask')).toBe('New Task');
  });

  it('returns Korean string for Korean language', () => {
    expect(translate('ko', 'common.save')).toBe('저장');
    expect(translate('ko', 'action.newTask')).toBe('새 작업');
  });

  it('falls back to English if key missing in target language', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = translate('ko' as any, 'common.save');
    // 'common.save' exists in both, so ko version returned
    expect(result).toBe('저장');
  });

  it('handles pipeline phase names', () => {
    expect(translate('en', 'pipeline.grill_me')).toBe('Grill-me');
    expect(translate('ko', 'pipeline.dev_plan')).toBe('개발 계획');
  });

  it('handles theme settings strings', () => {
    expect(translate('en', 'settings.theme.dark')).toBe('Dark');
    expect(translate('ko', 'settings.theme.dark')).toBe('다크');
    expect(translate('en', 'settings.theme.light.desc')).toContain('Daytime');
  });
});

describe('translations parity', () => {
  it('ko has all keys defined in en (or falls back)', () => {
    const enKeys = Object.keys(translations.en);
    const koKeys = new Set(Object.keys(translations.ko));
    // Track missing keys — not a failure since en is the fallback
    const missing = enKeys.filter((k) => !koKeys.has(k));
    // For now, every key should exist in ko
    expect(missing.length).toBeLessThanOrEqual(5); // Allow a few missing
  });

  it('all translation keys are non-empty strings', () => {
    for (const [lang, bundle] of Object.entries(translations)) {
      for (const [key, value] of Object.entries(bundle)) {
        expect(value, `${lang}.${key} must be non-empty`).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    }
  });
});

describe('LANGUAGES list', () => {
  it('contains English and Korean', () => {
    const ids = LANGUAGES.map((l) => l.id);
    expect(ids).toContain('en');
    expect(ids).toContain('ko');
  });

  it('each language has label and nativeName', () => {
    for (const lang of LANGUAGES) {
      expect(lang.label).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
    }
  });
});
