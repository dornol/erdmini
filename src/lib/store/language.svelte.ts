import { getLocale, setLocale } from '$lib/paraglide/runtime';

export type Locale = 'ko' | 'en' | 'zh' | 'ja';

const LOCALES: Locale[] = ['ko', 'en', 'zh', 'ja'];

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

/**
 * Trust Paraglide's configured strategy chain (localStorage →
 * preferredLanguage → baseLocale) as the single source of truth.
 * The previous custom resolution layered cookie/browser detection on
 * top, which clobbered the user's saved choice on refresh — text would
 * stay in the persisted locale (read directly via Paraglide's
 * getLocale) while this store reported a different value to the UI.
 */
class LanguageStore {
  current: Locale = $state(getLocale() as Locale);

  toggle() {
    const idx = LOCALES.indexOf(this.current);
    const next = LOCALES[(idx + 1) % LOCALES.length];
    this.set(next);
  }

  set(locale: Locale) {
    setLocale(locale, { reload: false });
    this.current = locale;
  }
}

export const languageStore = new LanguageStore();
