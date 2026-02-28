import { getLocale, setLocale } from '$lib/paraglide/runtime';

class LanguageStore {
  current = $state(getLocale());

  toggle() {
    const next = this.current === 'ko' ? 'en' : 'ko';
    setLocale(next as 'ko' | 'en', { reload: false });
    this.current = next;
  }

  set(locale: 'ko' | 'en') {
    setLocale(locale, { reload: false });
    this.current = locale;
  }
}

export const languageStore = new LanguageStore();
