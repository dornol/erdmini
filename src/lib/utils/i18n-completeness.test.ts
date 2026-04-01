import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const LOCALES = ['ko', 'en', 'ja', 'zh'] as const;
const BASE_LOCALE = 'ko';

function loadMessages(locale: string): Record<string, string> {
  const path = join(process.cwd(), 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const allMessages = Object.fromEntries(
  LOCALES.map((loc) => [loc, loadMessages(loc)])
) as Record<(typeof LOCALES)[number], Record<string, string>>;

const baseKeys = Object.keys(allMessages[BASE_LOCALE]).sort();

// ── Key Synchronization ──

describe('i18n key synchronization', () => {
  for (const locale of LOCALES) {
    if (locale === BASE_LOCALE) continue;

    it(`${locale}.json has all keys from ${BASE_LOCALE}.json`, () => {
      const localeKeys = new Set(Object.keys(allMessages[locale]));
      const missing = baseKeys.filter((k) => !localeKeys.has(k));
      expect(missing, `Missing keys in ${locale}.json`).toEqual([]);
    });

    it(`${locale}.json has no extra keys beyond ${BASE_LOCALE}.json`, () => {
      const baseKeySet = new Set(baseKeys);
      const localeKeys = Object.keys(allMessages[locale]);
      const extra = localeKeys.filter((k) => !baseKeySet.has(k));
      expect(extra, `Extra keys in ${locale}.json`).toEqual([]);
    });
  }
});

// ── Value Quality ──

describe('i18n value quality', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json has no empty string values`, () => {
      const empty = Object.entries(allMessages[locale])
        .filter(([, v]) => typeof v === 'string' && v.trim() === '')
        .map(([k]) => k);
      expect(empty, `Empty values in ${locale}.json`).toEqual([]);
    });
  }

  it('all locales have valid JSON structure (string values only)', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(allMessages[locale])) {
        expect(typeof value, `${locale}.${key} should be string`).toBe('string');
      }
    }
  });
});

// ── Placeholder Consistency ──

describe('i18n placeholder consistency', () => {
  // Extract {param} placeholders from a message string
  function extractPlaceholders(msg: string): string[] {
    const matches = msg.match(/\{[^}]+\}/g);
    return matches ? matches.sort() : [];
  }

  for (const locale of LOCALES) {
    if (locale === BASE_LOCALE) continue;

    it(`${locale}.json has same placeholders as ${BASE_LOCALE}.json`, () => {
      const mismatches: string[] = [];
      for (const key of baseKeys) {
        const baseVal = allMessages[BASE_LOCALE][key];
        const localeVal = allMessages[locale][key];
        if (!localeVal) continue;

        const basePlaceholders = extractPlaceholders(baseVal);
        const localePlaceholders = extractPlaceholders(localeVal);

        if (JSON.stringify(basePlaceholders) !== JSON.stringify(localePlaceholders)) {
          mismatches.push(
            `${key}: ${BASE_LOCALE}=${basePlaceholders.join(',')} vs ${locale}=${localePlaceholders.join(',')}`
          );
        }
      }
      expect(mismatches, `Placeholder mismatches in ${locale}.json`).toEqual([]);
    });
  }
});

// ── Specific New Keys (Phase 43) ──

describe('Phase 43 i18n keys exist in all locales', () => {
  const newKeys = [
    // Collab
    'collab_live', 'collab_reconnecting', 'collab_offline',
    'collab_collaborators', 'collab_you', 'collab_no_peers',
    // Share
    'share_title', 'share_search_placeholder', 'share_add',
    'share_loading', 'share_no_permissions', 'share_failed',
    'share_success', 'share_group_failed', 'share_group_success', 'share_remove',
    // Roles
    'role_owner', 'role_editor', 'role_viewer',
    // Login
    'login_username', 'login_password', 'login_sign_in',
    'login_signing_in', 'login_failed', 'login_network_error', 'login_or',
    // Labels
    'label_read_only', 'label_locked', 'label_unlock_position',
    'label_lock_position', 'label_copy_table_id', 'label_foreign_keys',
    'label_presets', 'label_enum', 'label_enum_placeholder',
    'label_domain', 'label_scale',
    // DDL
    'ddl_tab_export', 'ddl_tab_import',
    'ddl_indent_2spaces', 'ddl_indent_4spaces', 'ddl_indent_tab',
    'ddl_quote_backtick', 'ddl_quote_double', 'ddl_quote_bracket', 'ddl_quote_none',
    // Search
    'search_placeholder', 'search_no_results',
    // Shared projects
    'shared_with_me', 'shared_refresh', 'shared_no_projects',
    'shared_tables_count', 'project_create_btn', 'project_no_permission',
    // Embed & shortcuts
    'embed_loading', 'shortcut_undo', 'shortcut_redo',
  ];

  for (const key of newKeys) {
    it(`"${key}" exists in all ${LOCALES.length} locales`, () => {
      for (const locale of LOCALES) {
        expect(
          allMessages[locale][key],
          `${locale}.json missing "${key}"`
        ).toBeDefined();
        expect(
          allMessages[locale][key].trim().length,
          `${locale}.json "${key}" is empty`
        ).toBeGreaterThan(0);
      }
    });
  }
});

// ── Shortcut keys have {mod} placeholder ──

describe('shortcut keys use {mod} placeholder', () => {
  const shortcutKeys = ['shortcut_undo', 'shortcut_redo'];

  for (const key of shortcutKeys) {
    for (const locale of LOCALES) {
      it(`${locale}.${key} contains {mod} placeholder`, () => {
        expect(allMessages[locale][key]).toContain('{mod}');
      });
    }
  }
});

// ── No duplicate values in same locale (catches copy-paste errors) ──

describe('i18n no accidental key duplication', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json has no duplicate keys (JSON parse order)`, () => {
      const raw = readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf-8');
      const keys: string[] = [];
      const duplicates: string[] = [];

      // Manual key extraction to detect JSON duplicates
      for (const match of raw.matchAll(/"([^"]+)"\s*:/g)) {
        const key = match[1];
        if (keys.includes(key)) {
          duplicates.push(key);
        }
        keys.push(key);
      }

      expect(duplicates, `Duplicate keys in ${locale}.json`).toEqual([]);
    });
  }
});

// ── Total key count sanity check ──

describe('i18n total key count', () => {
  it('all locales have the same number of keys', () => {
    const counts = LOCALES.map((loc) => ({
      locale: loc,
      count: Object.keys(allMessages[loc]).length,
    }));

    const first = counts[0].count;
    for (const { locale, count } of counts) {
      expect(count, `${locale} key count`).toBe(first);
    }
  });

  it('base locale has a reasonable number of keys (>100)', () => {
    expect(baseKeys.length).toBeGreaterThan(100);
  });
});
