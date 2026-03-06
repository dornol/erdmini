import { describe, it, expect, beforeEach } from 'vitest';
import { DIALECT_OPTIONS, loadDdlOptions, saveDdlOptions } from './ddl-options';
import { DEFAULT_DDL_OPTIONS } from './ddl-export';

// Mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

describe('DIALECT_OPTIONS', () => {
  it('contains 7 dialects', () => {
    expect(DIALECT_OPTIONS).toHaveLength(7);
  });

  it('includes mysql, postgresql, sqlite', () => {
    const values = DIALECT_OPTIONS.map((o) => o.value);
    expect(values).toContain('mysql');
    expect(values).toContain('postgresql');
    expect(values).toContain('sqlite');
  });

  it('each entry has value and label', () => {
    for (const opt of DIALECT_OPTIONS) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
      expect(opt.value.length).toBeGreaterThan(0);
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('includes all expected dialects', () => {
    const values = DIALECT_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']);
  });
});

describe('loadDdlOptions', () => {
  it('returns DEFAULT_DDL_OPTIONS when localStorage is empty', () => {
    const opts = loadDdlOptions();
    expect(opts).toEqual(DEFAULT_DDL_OPTIONS);
  });

  it('merges saved options with defaults', () => {
    store['erdmini_ddl_options'] = JSON.stringify({ upperCaseKeywords: true });
    const opts = loadDdlOptions();
    expect(opts.upperCaseKeywords).toBe(true);
    // Other fields should still be default
    expect(opts.indent).toBe(DEFAULT_DDL_OPTIONS.indent);
  });

  it('handles malformed JSON gracefully', () => {
    store['erdmini_ddl_options'] = 'not json';
    const opts = loadDdlOptions();
    expect(opts).toEqual(DEFAULT_DDL_OPTIONS);
  });

  it('returns fresh object each call (no shared reference)', () => {
    const a = loadDdlOptions();
    const b = loadDdlOptions();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('saveDdlOptions', () => {
  it('saves options to localStorage', () => {
    const opts = { ...DEFAULT_DDL_OPTIONS, upperCaseKeywords: true };
    saveDdlOptions(opts);
    expect(store['erdmini_ddl_options']).toBeTruthy();
    expect(JSON.parse(store['erdmini_ddl_options']).upperCaseKeywords).toBe(true);
  });

  it('round-trips through loadDdlOptions', () => {
    const opts = {
      ...DEFAULT_DDL_OPTIONS,
      indent: 'tab' as const,
      quoteStyle: 'double' as const,
      includeComments: false,
    };
    saveDdlOptions(opts);
    const loaded = loadDdlOptions();
    expect(loaded.indent).toBe('tab');
    expect(loaded.quoteStyle).toBe('double');
    expect(loaded.includeComments).toBe(false);
  });

  it('overwrites previous saved options', () => {
    saveDdlOptions({ ...DEFAULT_DDL_OPTIONS, upperCaseKeywords: true });
    saveDdlOptions({ ...DEFAULT_DDL_OPTIONS, upperCaseKeywords: false });
    const loaded = loadDdlOptions();
    expect(loaded.upperCaseKeywords).toBe(false);
  });
});
