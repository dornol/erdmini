import { getLocale, setLocale, extractLocaleFromCookie } from '$lib/paraglide/runtime';

export type Locale = 'ko' | 'en' | 'zh' | 'ja';

const LOCALES: Locale[] = ['ko', 'en', 'zh', 'ja'];

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

function detectBrowserLocale(): Locale | undefined {
  if (typeof navigator === 'undefined') return undefined;
  for (const lang of navigator.languages ?? []) {
    const code = lang.split('-')[0].toLowerCase();
    if (LOCALES.includes(code as Locale)) return code as Locale;
  }
  return undefined;
}

function resolveInitialLocale(): Locale {
  // 1. Cookie (user's explicit choice)
  const cookie = extractLocaleFromCookie();
  if (cookie) return cookie as Locale;

  // 2. Browser language
  const browser = detectBrowserLocale();
  if (browser) {
    // Persist so Paraglide picks it up
    setLocale(browser, { reload: false });
    return browser;
  }

  // 3. Default: English
  return getLocale() as Locale;
}

class LanguageStore {
  current: Locale = $state(resolveInitialLocale());

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
