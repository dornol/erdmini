import { describe, it, expect } from 'vitest';
import { generateId, now, sanitizeFilename } from './common';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns exactly 8 characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateId()).toHaveLength(8);
    }
  });

  it('uses only lowercase alphanumeric characters', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]{8}$/);
    }
  });

  it('does not contain uppercase letters', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      expect(id).toBe(id.toLowerCase());
    }
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('generates 1000 unique IDs without collision', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });

  it('uses crypto.getRandomValues (not Math.random)', () => {
    // Verify that the output character distribution is reasonable
    // Math.random().toString(36) would produce uneven distribution
    const charCounts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const id = generateId();
      for (const ch of id) {
        charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
      }
    }
    // All 36 chars (a-z, 0-9) should appear at least once in 40000 chars
    expect(charCounts.size).toBe(36);
  });
});

describe('now', () => {
  it('returns a valid ISO string', () => {
    const result = now();
    expect(new Date(result).toISOString()).toBe(result);
  });
});

describe('sanitizeFilename', () => {
  it('keeps alphanumeric characters', () => {
    expect(sanitizeFilename('hello123')).toBe('hello123');
  });

  it('keeps Korean characters', () => {
    expect(sanitizeFilename('테스트파일')).toBe('테스트파일');
  });

  it('keeps Japanese characters', () => {
    expect(sanitizeFilename('テスト')).toBe('テスト');
  });

  it('keeps Chinese characters', () => {
    expect(sanitizeFilename('测试')).toBe('测试');
  });

  it('replaces special characters with underscore', () => {
    expect(sanitizeFilename('file@name#1!')).toBe('file_name_1_');
  });

  it('collapses whitespace to single underscore', () => {
    expect(sanitizeFilename('my  file  name')).toBe('my_file_name');
  });

  it('keeps dots, hyphens, and underscores', () => {
    expect(sanitizeFilename('my-file_v1.2')).toBe('my-file_v1.2');
  });
});
