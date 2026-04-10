/**
 * Lightweight i18n: t() for lookups + a React hook that subscribes to
 * language changes from settingsStore.
 *
 * Usage:
 *   import { useT } from '../i18n';
 *   const t = useT();
 *   return <span>{t('action.newTask')}</span>;
 */
import { useSettingsStore, type Language } from '../stores/settingsStore';
import { translations, type TranslationKey } from './locales';

/** Lookup with fallback to English. */
export function translate(lang: Language, key: TranslationKey): string {
  const bundle = translations[lang] as Record<string, string> | undefined;
  if (bundle && key in bundle) return bundle[key];
  return translations.en[key];
}

/**
 * React hook — returns a memoized t() bound to the current language.
 * Re-renders the caller when the language changes.
 */
export function useT() {
  const language = useSettingsStore((s) => s.language);
  return (key: TranslationKey) => translate(language, key);
}

/** Static t() — for non-React code paths (services, utils). */
export function t(key: TranslationKey): string {
  const language = useSettingsStore.getState().language;
  return translate(language, key);
}
