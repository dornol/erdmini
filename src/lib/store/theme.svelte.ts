export type ThemeId = 'modern' | 'classic' | 'blueprint' | 'minimal';

const STORAGE_KEY = 'erdmini_theme';

class ThemeStore {
  current = $state<ThemeId>('modern');

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (saved && ['modern', 'classic', 'blueprint', 'minimal'].includes(saved)) {
        this.current = saved;
      }
    }
  }

  set(id: ThemeId) {
    this.current = id;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }
}

export const themeStore = new ThemeStore();
