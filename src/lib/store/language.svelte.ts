import { getLocale, setLocale } from '$lib/paraglide/runtime';

export type Locale = 'ko' | 'en' | 'zh' | 'ja';

const LOCALES: Locale[] = ['ko', 'en', 'zh', 'ja'];

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

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
