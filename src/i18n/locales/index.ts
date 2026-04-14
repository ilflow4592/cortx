/**
 * Locale barrel — combines all per-locale dictionaries into the
 * master `translations` map keyed by Language code.
 */
import { en } from './en';
import { ko } from './ko';

export type Language = 'en' | 'ko';

export const LANGUAGES: { id: Language; label: string; nativeName: string }[] = [
  { id: 'en', label: 'English', nativeName: 'English' },
  { id: 'ko', label: 'Korean', nativeName: '한국어' },
];

// `en` is the source of truth; other locales are Partial<typeof en>.
export const translations = {
  en,
  ko,
} as const;

export type TranslationKey = keyof typeof en;
