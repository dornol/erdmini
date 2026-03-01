export type ThemeId = 'modern' | 'classic' | 'blueprint' | 'minimal';

const STORAGE_KEY = 'erdmini_theme';
const DARK_KEY = 'erdmini_dark';

class ThemeStore {
  current = $state<ThemeId>('modern');
  darkMode = $state(false);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (saved && ['modern', 'classic', 'blueprint', 'minimal'].includes(saved)) {
        this.current = saved;
      }
      this.darkMode = localStorage.getItem(DARK_KEY) === 'true';
    }
  }

  set(id: ThemeId) {
    this.current = id;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }

  toggleDark() {
    this.darkMode = !this.darkMode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DARK_KEY, String(this.darkMode));
    }
  }
}

export const themeStore = new ThemeStore();
