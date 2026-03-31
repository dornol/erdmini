import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRun, mockPrepare, mockGet, mockAll } = vi.hoisted(() => {
  const mockRun = vi.fn();
  const mockGet = vi.fn();
  const mockAll = vi.fn((): unknown[] => []);
  const mockPrepare = vi.fn((_sql: string) => ({ run: mockRun, get: mockGet, all: mockAll }));
  return { mockRun, mockPrepare, mockGet, mockAll };
});

vi.mock('$lib/server/db', () => ({
  default: { prepare: mockPrepare },
}));

vi.mock('./auth/password', () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed_${pw}`),
  verifyPassword: vi.fn(async (hash: string, pw: string) => hash === `hashed_${pw}`),
}));

import {
  listWords,
  createWord,
  updateWord,
  updateWordStatus,
  deleteWord,
  listCategories,
  countPendingWords,
  importWords,
  createDictShareToken,
  validateDictShareToken,
  verifyDictSharePassword,
  listDictShareTokens,
  deleteDictShareToken,
} from './dictionary';
import type Database from 'better-sqlite3';

const db = { prepare: mockPrepare } as unknown as Database.Database;

describe('dictionary', () => {
  beforeEach(() => {
    mockRun.mockClear();
    mockPrepare.mockClear();
    mockGet.mockClear();
    mockAll.mockClear();
  });

  // ── listWords ────────────────────────────────────────────────────

  describe('listWords', () => {
    it('returns words and total count', () => {
      mockGet.mockReturnValueOnce({ cnt: 3 });
      mockAll.mockReturnValueOnce([
        { id: '1', word: 'seq', meaning: '일련번호', description: null, category: null, created_by: 'u1', created_at: '', updated_at: '' },
        { id: '2', word: 'nm', meaning: '명', description: null, category: '접미어', created_by: 'u1', created_at: '', updated_at: '' },
      ]);

      const result = listWords(db);
      expect(result.total).toBe(3);
      expect(result.words).toHaveLength(2);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT COUNT'));
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT *'));
    });

    it('applies search filter', () => {
      mockGet.mockReturnValueOnce({ cnt: 0 });
      mockAll.mockReturnValueOnce([]);

      listWords(db, { search: 'test' });
      // status=approved (default) + search LIKE params
      expect(mockGet).toHaveBeenCalledWith('approved', '%test%', '%test%');
    });

    it('applies category filter', () => {
      mockGet.mockReturnValueOnce({ cnt: 0 });
      mockAll.mockReturnValueOnce([]);

      listWords(db, { category: '접미어' });
      expect(mockGet).toHaveBeenCalledWith('approved', '접미어');
    });

    it('applies empty category filter for uncategorized', () => {
      mockGet.mockReturnValueOnce({ cnt: 0 });
      mockAll.mockReturnValueOnce([]);

      listWords(db, { category: '' });
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('IS NULL'));
    });

    it('applies pagination', () => {
      mockGet.mockReturnValueOnce({ cnt: 100 });
      mockAll.mockReturnValueOnce([]);

      listWords(db, { page: 3, limit: 20 });
      // status param + LIMIT 20 OFFSET 40
      expect(mockAll).toHaveBeenCalledWith('approved', 20, 40);
    });

    it('defaults to page 1 limit 50 with status=approved', () => {
      mockGet.mockReturnValueOnce({ cnt: 0 });
      mockAll.mockReturnValueOnce([]);

      listWords(db);
      expect(mockGet).toHaveBeenCalledWith('approved');
      expect(mockAll).toHaveBeenCalledWith('approved', 50, 0);
    });

    it('filters by pending status', () => {
      mockGet.mockReturnValueOnce({ cnt: 0 });
      mockAll.mockReturnValueOnce([]);

      listWords(db, { status: 'pending' });
      expect(mockGet).toHaveBeenCalledWith('pending');
    });

    it('combines search and category filters', () => {
      mockGet.mockReturnValueOnce({ cnt: 0 });
      mockAll.mockReturnValueOnce([]);

      listWords(db, { search: 'foo', category: 'bar' });
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('LIKE'));
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('category = ?'));
    });
  });

  // ── createWord ───────────────────────────────────────────────────

  describe('createWord', () => {
    it('inserts word and returns created row', () => {
      const mockRow = { id: 'abc', word: 'seq', meaning: '일련번호', description: null, category: null, status: 'approved', created_by: 'u1', created_at: '', updated_at: '' };
      mockGet.mockReturnValueOnce(mockRow);

      const result = createWord(db, { word: 'seq', meaning: '일련번호' }, 'u1');
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO word_dictionary'));
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String), // id
        'seq',
        '일련번호',
        null,       // description
        null,       // category
        'approved', // status (default)
        'u1',
      );
      expect(result).toEqual(mockRow);
    });

    it('creates word with pending status', () => {
      mockGet.mockReturnValueOnce({});

      createWord(db, { word: 'test', meaning: 'test', status: 'pending' }, 'u1');
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String), 'test', 'test', null, null, 'pending', 'u1',
      );
    });

    it('trims whitespace from inputs', () => {
      mockGet.mockReturnValueOnce({});

      createWord(db, { word: '  seq  ', meaning: '  일련번호  ', description: '  desc  ', category: '  cat  ' }, 'u1');
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'seq',
        '일련번호',
        'desc',
        'cat',
        'approved',
        'u1',
      );
    });

    it('stores empty description and category as null', () => {
      mockGet.mockReturnValueOnce({});

      createWord(db, { word: 'x', meaning: 'y', description: '', category: '' }, 'u1');
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String), 'x', 'y', null, null, 'approved', 'u1',
      );
    });
  });

  // ── updateWord ───────────────────────────────────────────────────

  describe('updateWord', () => {
    it('updates only provided fields', () => {
      updateWord(db, 'id1', { meaning: 'new meaning' });
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('meaning = ?'));
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('updated_at'));
      expect(mockRun).toHaveBeenCalledWith('new meaning', 'id1');
    });

    it('updates multiple fields', () => {
      updateWord(db, 'id1', { word: 'new', meaning: 'val', category: 'cat' });
      expect(mockRun).toHaveBeenCalledWith('new', 'val', 'cat', 'id1');
    });

    it('does nothing when patch is empty', () => {
      updateWord(db, 'id1', {});
      expect(mockPrepare).not.toHaveBeenCalled();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('sets description to null when empty string', () => {
      updateWord(db, 'id1', { description: '' });
      expect(mockRun).toHaveBeenCalledWith(null, 'id1');
    });

    it('sets category to null when null passed', () => {
      updateWord(db, 'id1', { category: null });
      expect(mockRun).toHaveBeenCalledWith(null, 'id1');
    });
  });

  // ── updateWordStatus ──────────────────────────────────────────────

  describe('updateWordStatus', () => {
    it('approves a pending word', () => {
      updateWordStatus(db, 'id1', 'approved');
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SET status = ?'));
      expect(mockRun).toHaveBeenCalledWith('approved', 'id1');
    });

    it('rejects a pending word', () => {
      updateWordStatus(db, 'id1', 'rejected');
      expect(mockRun).toHaveBeenCalledWith('rejected', 'id1');
    });
  });

  // ── countPendingWords ────────────────────────────────────────────

  describe('countPendingWords', () => {
    it('returns count of pending words', () => {
      mockGet.mockReturnValueOnce({ cnt: 5 });
      expect(countPendingWords(db)).toBe(5);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining("status = 'pending'"));
    });
  });

  // ── deleteWord ───────────────────────────────────────────────────

  describe('deleteWord', () => {
    it('deletes by id', () => {
      deleteWord(db, 'id1');
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM word_dictionary'));
      expect(mockRun).toHaveBeenCalledWith('id1');
    });
  });

  // ── listCategories ───────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns distinct categories', () => {
      mockAll.mockReturnValueOnce([{ category: '접두어' }, { category: '접미어' }]);

      const result = listCategories(db);
      expect(result).toEqual(['접두어', '접미어']);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DISTINCT category'));
    });

    it('returns empty array when no categories', () => {
      mockAll.mockReturnValueOnce([]);
      expect(listCategories(db)).toEqual([]);
    });
  });

  // ── importWords ──────────────────────────────────────────────────

  describe('importWords', () => {
    it('creates new words', () => {
      // Mock transaction
      const txFn = vi.fn((fn: () => void) => {
        const wrappedFn = () => fn();
        return wrappedFn;
      });
      (db as any).transaction = txFn;
      mockGet.mockReturnValue(undefined); // no existing word

      const result = importWords(db, [
        { word: 'seq', meaning: '일련번호' },
        { word: 'nm', meaning: '명' },
      ], 'u1');

      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('updates existing words', () => {
      const txFn = vi.fn((fn: () => void) => {
        const wrappedFn = () => fn();
        return wrappedFn;
      });
      (db as any).transaction = txFn;
      mockGet.mockReturnValue({ id: 'existing' }); // word exists

      const result = importWords(db, [
        { word: 'seq', meaning: '일련번호 (수정)' },
      ], 'u1');

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
    });

    it('skips empty entries and reports errors', () => {
      const txFn = vi.fn((fn: () => void) => {
        const wrappedFn = () => fn();
        return wrappedFn;
      });
      (db as any).transaction = txFn;

      const result = importWords(db, [
        { word: '', meaning: 'test' },
        { word: 'test', meaning: '' },
      ], 'u1');

      expect(result.created).toBe(0);
      expect(result.errors).toHaveLength(2);
    });
  });

  // ── createDictShareToken ─────────────────────────────────────────

  describe('createDictShareToken', () => {
    it('creates token without password or expiry', async () => {
      const result = await createDictShareToken(db, 'user1');
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dictionary_share_tokens'));
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String), // id
        expect.any(String), // token (64 hex)
        null,               // password_hash
        'user1',
        null,               // expires_at
      );
      expect(result.token).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(result.token)).toBe(true);
      expect(result.expiresAt).toBeNull();
    });

    it('creates token with password', async () => {
      const result = await createDictShareToken(db, 'user1', { password: 'secret' });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'hashed_secret',
        'user1',
        null,
      );
      expect(result.token).toHaveLength(64);
    });

    it('creates token with expiry', async () => {
      const before = Date.now();
      const result = await createDictShareToken(db, 'user1', { expiresInDays: 30 });
      const after = Date.now();

      expect(result.expiresAt).not.toBeNull();
      const expiresMs = new Date(result.expiresAt!).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000);
      expect(expiresMs).toBeLessThanOrEqual(after + thirtyDaysMs + 1000);
    });

    it('creates token with both password and expiry', async () => {
      const result = await createDictShareToken(db, 'user1', { password: 'pw', expiresInDays: 7 });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'hashed_pw',
        'user1',
        expect.any(String), // ISO date
      );
      expect(result.token).toHaveLength(64);
      expect(result.expiresAt).not.toBeNull();
    });

    it('generates unique tokens', async () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = await createDictShareToken(db, 'user1');
        tokens.add(result.token);
      }
      expect(tokens.size).toBe(10);
    });
  });

  // ── validateDictShareToken ───────────────────────────────────────

  describe('validateDictShareToken', () => {
    it('returns token info when valid (no password)', () => {
      mockGet.mockReturnValueOnce({ id: 't1', password_hash: null, expires_at: null });
      const result = validateDictShareToken(db, 'sometoken');
      expect(result).toEqual({ id: 't1', hasPassword: false });
    });

    it('returns hasPassword true when password set', () => {
      mockGet.mockReturnValueOnce({ id: 't1', password_hash: 'hash123', expires_at: null });
      const result = validateDictShareToken(db, 'sometoken');
      expect(result).toEqual({ id: 't1', hasPassword: true });
    });

    it('returns null for non-existent token', () => {
      mockGet.mockReturnValueOnce(undefined);
      expect(validateDictShareToken(db, 'bad')).toBeNull();
    });

    it('returns null for expired token', () => {
      mockGet.mockReturnValueOnce({
        id: 't1',
        password_hash: null,
        expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
      });
      expect(validateDictShareToken(db, 'expired')).toBeNull();
    });

    it('returns valid for non-expired token', () => {
      mockGet.mockReturnValueOnce({
        id: 't1',
        password_hash: null,
        expires_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      });
      const result = validateDictShareToken(db, 'valid');
      expect(result).toEqual({ id: 't1', hasPassword: false });
    });
  });

  // ── verifyDictSharePassword ──────────────────────────────────────

  describe('verifyDictSharePassword', () => {
    it('returns true for correct password', async () => {
      mockGet.mockReturnValueOnce({ password_hash: 'hashed_correct' });
      expect(await verifyDictSharePassword(db, 't1', 'correct')).toBe(true);
    });

    it('returns false for wrong password', async () => {
      mockGet.mockReturnValueOnce({ password_hash: 'hashed_correct' });
      expect(await verifyDictSharePassword(db, 't1', 'wrong')).toBe(false);
    });

    it('returns false when token has no password', async () => {
      mockGet.mockReturnValueOnce({ password_hash: null });
      expect(await verifyDictSharePassword(db, 't1', 'any')).toBe(false);
    });

    it('returns false when token not found', async () => {
      mockGet.mockReturnValueOnce(undefined);
      expect(await verifyDictSharePassword(db, 'bad', 'any')).toBe(false);
    });
  });

  // ── listDictShareTokens ──────────────────────────────────────────

  describe('listDictShareTokens', () => {
    it('returns mapped token list', () => {
      mockAll.mockReturnValueOnce([
        { id: 't1', token: 'abc', password_hash: null, created_by: 'u1', created_at: '2024-01-01', expires_at: null },
        { id: 't2', token: 'def', password_hash: 'hash', created_by: 'u2', created_at: '2024-01-02', expires_at: '2024-12-31' },
      ]);

      const result = listDictShareTokens(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 't1', token: 'abc', hasPassword: false, createdBy: 'u1', createdAt: '2024-01-01', expiresAt: null });
      expect(result[1]).toEqual({ id: 't2', token: 'def', hasPassword: true, createdBy: 'u2', createdAt: '2024-01-02', expiresAt: '2024-12-31' });
    });

    it('returns empty array when no tokens', () => {
      mockAll.mockReturnValueOnce([]);
      expect(listDictShareTokens(db)).toEqual([]);
    });
  });

  // ── deleteDictShareToken ─────────────────────────────────────────

  describe('deleteDictShareToken', () => {
    it('deletes by id', () => {
      deleteDictShareToken(db, 't1');
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM dictionary_share_tokens'));
      expect(mockRun).toHaveBeenCalledWith('t1');
    });
  });
});
