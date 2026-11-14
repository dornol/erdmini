import type { SiteNamingRules, EffectiveNamingRules, NamingRuleType } from '$lib/types/naming-rules';
import { computeEffectiveRules, NAMING_RULE_TYPES } from '$lib/types/naming-rules';
import { erdStore } from '$lib/store/erd.svelte';
import { appPath } from '$lib/utils/paths';

export interface DictionarySummary {
  id: string;
  name: string;
  description: string | null;
  is_default: number;
}

class NamingRuleStore {
  /** Admin-configured site-wide rules */
  siteRules = $state<SiteNamingRules>({});
  /** Whether rules have been fetched from server */
  loaded = $state(false);
  /** Dictionary words for validation */
  dictionaryWords = $state<Set<string>>(new Set());
  dictionaries = $state<DictionarySummary[]>([]);
  dictionaryLoading = $state(false);
  dictionaryLoadError = $state(false);

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
      const res = await fetch(appPath('/api/naming-rules'));
      if (res.ok) {
        this.siteRules = await res.json();
      }
    } catch {
      // network error, keep empty rules
    }
    this.loaded = true;
  }

  /** Fetch all approved dictionary words for validation */
  async fetchDictionaries() {
    try {
      const res = await fetch(appPath('/api/dictionaries'));
      if (res.ok) {
        this.dictionaries = await res.json();
      }
    } catch {
      // ignore
    }
  }

  private dictionaryRequestId = 0;

  async fetchDictionaryWords(dictionaryId?: string) {
    const requestId = ++this.dictionaryRequestId;
    this.dictionaryLoading = true;
    this.dictionaryLoadError = false;
    this.dictionaryWords = new Set();
    try {
      // Publish words only after every page has loaded successfully.
      const params = new URLSearchParams({ limit: '200', status: 'approved' });
      if (dictionaryId) params.set('dictionaryId', dictionaryId);
      const res = await fetch(appPath(`/api/dictionary?${params}`));
      if (!res.ok) throw new Error('Dictionary request failed');
      const data = await res.json();
      if (requestId !== this.dictionaryRequestId) return;
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
        params.set('page', String(page));
        const nextRes = await fetch(appPath(`/api/dictionary?${params}`));
        if (!nextRes.ok) throw new Error('Dictionary page request failed');
        const nextData = await nextRes.json();
        if (requestId !== this.dictionaryRequestId) return;
        const nextRows: { word: string }[] = nextData.words ?? [];
        if (nextRows.length === 0) throw new Error('Incomplete dictionary response');
        for (const r of nextRows) words.add(r.word.toLowerCase());
        page++;
      }
      if (requestId === this.dictionaryRequestId) this.dictionaryWords = words;
    } catch {
      if (requestId === this.dictionaryRequestId) this.dictionaryLoadError = true;
    } finally {
      if (requestId === this.dictionaryRequestId) this.dictionaryLoading = false;
    }
  }
}

export const namingRuleStore = new NamingRuleStore();
