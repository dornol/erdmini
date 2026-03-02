import { describe, it, expect } from 'vitest';
import { generateId, now, sanitizeFilename } from './common';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
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
