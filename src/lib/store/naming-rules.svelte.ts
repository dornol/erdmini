import type { SiteNamingRules, EffectiveNamingRules, NamingRuleType } from '$lib/types/naming-rules';
import { computeEffectiveRules, NAMING_RULE_TYPES } from '$lib/types/naming-rules';
import { erdStore } from '$lib/store/erd.svelte';

class NamingRuleStore {
  /** Admin-configured site-wide rules */
  siteRules = $state<SiteNamingRules>({});
  /** Whether rules have been fetched from server */
  loaded = $state(false);
  /** Dictionary words for validation */
  dictionaryWords = $state<Set<string>>(new Set());

  /** Effective rules = merged admin + project overrides */
  get effectiveRules(): EffectiveNamingRules {
    return computeEffectiveRules(this.siteRules, erdStore.schema.namingRules);
  }

  /** Whether any naming rule is active */
  get hasActiveRules(): boolean {
    return NAMING_RULE_TYPES.some(t => this.siteRules[t]?.enabled);
  }

  /** Whether a specific rule allows project override */
  canOverride(ruleType: NamingRuleType): boolean {
    return this.siteRules[ruleType]?.allowOverride ?? false;
  }

  /** Fetch site naming rules from server */
  async fetchSiteRules() {
    try {
      const res = await fetch('/api/naming-rules');
      if (res.ok) {
        this.siteRules = await res.json();
      }
    } catch {
      // network error, keep empty rules
    }
    this.loaded = true;
  }

  /** Fetch all approved dictionary words for validation */
  async fetchDictionaryWords() {
    try {
      // Fetch all approved words (up to 10000) for naming validation
      const res = await fetch('/api/dictionary?limit=200&status=approved');
      if (!res.ok) return;
      const data = await res.json();
      const words: Set<string> = new Set();
      // API returns { words: WordRow[], total }
      const rows: { word: string }[] = data.words ?? [];
      for (const r of rows) {
        words.add(r.word.toLowerCase());
      }
      // If there are more pages, fetch them all
      const total: number = data.total ?? 0;
      let page = 2;
      while (words.size < total) {
        const nextRes = await fetch(`/api/dictionary?limit=200&page=${page}&status=approved`);
        if (!nextRes.ok) break;
        const nextData = await nextRes.json();
        const nextRows: { word: string }[] = nextData.words ?? [];
        if (nextRows.length === 0) break;
        for (const r of nextRows) words.add(r.word.toLowerCase());
        page++;
      }
      this.dictionaryWords = words;
    } catch {
      // ignore
    }
  }
}

export const namingRuleStore = new NamingRuleStore();
