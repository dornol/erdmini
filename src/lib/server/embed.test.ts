import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRun, mockPrepare, mockGet, mockAll } = vi.hoisted(() => {
	const mockRun = vi.fn();
	const mockGet = vi.fn();
	const mockAll = vi.fn((): unknown[] => []);
	const mockPrepare = vi.fn(() => ({ run: mockRun, get: mockGet, all: mockAll }));
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
	generateEmbedToken,
	createEmbedToken,
	validateEmbedToken,
	verifyEmbedPassword,
	listEmbedTokens,
	deleteEmbedToken,
	deleteProjectEmbedTokens,
} from './embed';
import { generateId } from '$lib/utils/common';
import type Database from 'better-sqlite3';

const db = { prepare: mockPrepare } as unknown as Database.Database;

describe('embed', () => {
	beforeEach(() => {
		mockRun.mockClear();
		mockPrepare.mockClear();
		mockGet.mockClear();
		mockAll.mockClear();
	});

	// ── generateEmbedToken ──────────────────────────────────────────

	describe('generateEmbedToken', () => {
		it('returns 64-char hex string', () => {
			const token = generateEmbedToken();
			expect(token).toHaveLength(64);
			expect(/^[0-9a-f]+$/.test(token)).toBe(true);
		});

		it('generates unique tokens on consecutive calls', () => {
			const tokens = new Set(Array.from({ length: 10 }, () => generateEmbedToken()));
			expect(tokens.size).toBe(10);
		});

		it('always returns lowercase hex', () => {
			for (let i = 0; i < 5; i++) {
				const token = generateEmbedToken();
				expect(token).toBe(token.toLowerCase());
			}
		});
	});

	// ── generateId ──────────────────────────────────────────────────

	describe('generateId', () => {
		it('returns 8-char alphanumeric string', () => {
			const id = generateId();
			expect(id).toHaveLength(8);
			expect(/^[a-z0-9]+$/.test(id)).toBe(true);
		});

		it('generates unique ids', () => {
			const ids = new Set(Array.from({ length: 20 }, () => generateId()));
			// Collision is statistically near-impossible with 36^8 space
			expect(ids.size).toBe(20);
		});
	});

	// ── createEmbedToken ────────────────────────────────────────────

	describe('createEmbedToken', () => {
		it('creates token without password or expiry', async () => {
			const result = await createEmbedToken(db, 'proj1', 'user1');
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining('INSERT INTO embed_tokens'),
			);
			expect(mockRun).toHaveBeenCalledWith(
				expect.any(String), // id
				'proj1',
				expect.any(String), // token
				null, // password_hash
				'user1',
				null, // expires_at
			);
			expect(result.token).toHaveLength(64);
			expect(result.id).toMatch(/^[a-z0-9]+$/);
			expect(result.expiresAt).toBeNull();
		});

		it('creates token with password', async () => {
			const result = await createEmbedToken(db, 'proj1', 'user1', { password: 'secret' });
			expect(mockRun).toHaveBeenCalledWith(
				expect.any(String),
				'proj1',
				expect.any(String),
				'hashed_secret', // hashPassword mock
				'user1',
				null,
			);
			expect(result.token).toHaveLength(64);
			expect(result.expiresAt).toBeNull();
		});

		it('creates token with expiry in days', async () => {
			const before = Date.now();
			const result = await createEmbedToken(db, 'proj1', 'user1', { expiresInDays: 7 });
			const after = Date.now();

			expect(result.expiresAt).not.toBeNull();
			const expiresMs = new Date(result.expiresAt!).getTime();
			const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
			expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
			expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
		});

		it('creates token with both password and expiry', async () => {
			const result = await createEmbedToken(db, 'proj1', 'user1', {
				password: 'pw123',
				expiresInDays: 30,
			});
			expect(mockRun).toHaveBeenCalledWith(
				expect.any(String),
				'proj1',
				expect.any(String),
				'hashed_pw123',
				'user1',
				expect.any(String), // ISO date string
			);
			expect(result.token).toHaveLength(64);
			expect(result.expiresAt).not.toBeNull();
			// Verify it's a valid ISO date
			expect(new Date(result.expiresAt!).toISOString()).toBe(result.expiresAt);
		});

		it('treats empty password as no password', async () => {
			await createEmbedToken(db, 'proj1', 'user1', { password: '' });
			expect(mockRun).toHaveBeenCalledWith(
				expect.any(String),
				'proj1',
				expect.any(String),
				null, // empty string → no password
				'user1',
				null,
			);
		});

		it('expiresInDays = 0 sets expiry at approximately now', async () => {
			const before = Date.now();
			const result = await createEmbedToken(db, 'proj1', 'user1', { expiresInDays: 0 });
			const after = Date.now();

			expect(result.expiresAt).not.toBeNull();
			const expiresMs = new Date(result.expiresAt!).getTime();
			expect(expiresMs).toBeGreaterThanOrEqual(before - 1000);
			expect(expiresMs).toBeLessThanOrEqual(after + 1000);
		});

		it('each call generates a different token and id', async () => {
			const r1 = await createEmbedToken(db, 'proj1', 'user1');
			const r2 = await createEmbedToken(db, 'proj1', 'user1');
			expect(r1.token).not.toBe(r2.token);
			expect(r1.id).not.toBe(r2.id);
		});

		it('passes all 6 columns to INSERT statement', async () => {
			await createEmbedToken(db, 'proj1', 'user1');
			const sql = mockPrepare.mock.calls[0][0] as string;
			// Verify the SQL has 6 placeholders
			expect((sql.match(/\?/g) ?? []).length).toBe(6);
			expect(sql).toContain('id');
			expect(sql).toContain('project_id');
			expect(sql).toContain('token');
			expect(sql).toContain('password_hash');
			expect(sql).toContain('created_by');
			expect(sql).toContain('expires_at');
		});
	});

	// ── validateEmbedToken ──────────────────────────────────────────

	describe('validateEmbedToken', () => {
		it('returns null for non-existent token', () => {
			mockGet.mockReturnValueOnce(undefined);
			const result = validateEmbedToken(db, 'bad_token');
			expect(result).toBeNull();
		});

		it('passes token to SQL WHERE clause', () => {
			mockGet.mockReturnValueOnce(undefined);
			validateEmbedToken(db, 'my_token_123');
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining('WHERE token = ?'),
			);
			expect(mockGet).toHaveBeenCalledWith('my_token_123');
		});

		it('returns null for expired token (past date)', () => {
			mockGet.mockReturnValueOnce({
				id: 't1',
				project_id: 'proj1',
				password_hash: null,
				expires_at: '2020-01-01T00:00:00.000Z',
			});
			expect(validateEmbedToken(db, 'expired_token')).toBeNull();
		});

		it('returns null for token that just expired (1 second ago)', () => {
			const justExpired = new Date(Date.now() - 1000).toISOString();
			mockGet.mockReturnValueOnce({
				id: 't1',
				project_id: 'proj1',
				password_hash: null,
				expires_at: justExpired,
			});
			expect(validateEmbedToken(db, 'just_expired')).toBeNull();
		});

		it('returns valid result for no-password, no-expiry token', () => {
			mockGet.mockReturnValueOnce({
				id: 't1',
				project_id: 'proj1',
				password_hash: null,
				expires_at: null,
			});
			const result = validateEmbedToken(db, 'valid_token');
			expect(result).toEqual({
				id: 't1',
				projectId: 'proj1',
				hasPassword: false,
			});
		});

		it('detects password-protected token', () => {
			mockGet.mockReturnValueOnce({
				id: 't1',
				project_id: 'proj1',
				password_hash: 'hashed_pw',
				expires_at: null,
			});
			const result = validateEmbedToken(db, 'pw_token');
			expect(result).not.toBeNull();
			expect(result!.hasPassword).toBe(true);
			expect(result!.projectId).toBe('proj1');
		});

		it('accepts non-expired token with future expiry', () => {
			const future = new Date(Date.now() + 86400000).toISOString();
			mockGet.mockReturnValueOnce({
				id: 't1',
				project_id: 'proj1',
				password_hash: null,
				expires_at: future,
			});
			const result = validateEmbedToken(db, 'future_token');
			expect(result).not.toBeNull();
			expect(result!.id).toBe('t1');
		});

		it('accepts token expiring far in the future', () => {
			const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
			mockGet.mockReturnValueOnce({
				id: 't1',
				project_id: 'proj1',
				password_hash: null,
				expires_at: farFuture,
			});
			const result = validateEmbedToken(db, 'far_future_token');
			expect(result).not.toBeNull();
		});

		it('returns null for empty string token', () => {
			mockGet.mockReturnValueOnce(undefined);
			expect(validateEmbedToken(db, '')).toBeNull();
			expect(mockGet).toHaveBeenCalledWith('');
		});

		it('returns password-protected token with future expiry correctly', () => {
			const future = new Date(Date.now() + 3600000).toISOString();
			mockGet.mockReturnValueOnce({
				id: 't2',
				project_id: 'proj2',
				password_hash: 'some_hash',
				expires_at: future,
			});
			const result = validateEmbedToken(db, 'combined_token');
			expect(result).toEqual({
				id: 't2',
				projectId: 'proj2',
				hasPassword: true,
			});
		});
	});

	// ── verifyEmbedPassword ─────────────────────────────────────────

	describe('verifyEmbedPassword', () => {
		it('returns false when token has no password_hash', async () => {
			mockGet.mockReturnValueOnce({ password_hash: null });
			expect(await verifyEmbedPassword(db, 't1', 'guess')).toBe(false);
		});

		it('returns false for wrong password', async () => {
			mockGet.mockReturnValueOnce({ password_hash: 'hashed_correct' });
			expect(await verifyEmbedPassword(db, 't1', 'wrong')).toBe(false);
		});

		it('returns true for correct password', async () => {
			mockGet.mockReturnValueOnce({ password_hash: 'hashed_secret' });
			expect(await verifyEmbedPassword(db, 't1', 'secret')).toBe(true);
		});

		it('returns false for non-existent token (undefined row)', async () => {
			mockGet.mockReturnValueOnce(undefined);
			expect(await verifyEmbedPassword(db, 'bad', 'pw')).toBe(false);
		});

		it('returns false for empty string password against a hash', async () => {
			mockGet.mockReturnValueOnce({ password_hash: 'hashed_real' });
			expect(await verifyEmbedPassword(db, 't1', '')).toBe(false);
		});

		it('queries by token id, not by token string', async () => {
			mockGet.mockReturnValueOnce({ password_hash: 'hashed_x' });
			await verifyEmbedPassword(db, 'tok_id_123', 'x');
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining('WHERE id = ?'),
			);
			expect(mockGet).toHaveBeenCalledWith('tok_id_123');
		});
	});

	// ── listEmbedTokens ─────────────────────────────────────────────

	describe('listEmbedTokens', () => {
		it('returns empty array when no tokens exist', () => {
			mockAll.mockReturnValueOnce([]);
			const result = listEmbedTokens(db, 'proj1');
			expect(result).toEqual([]);
		});

		it('passes projectId to SQL query', () => {
			mockAll.mockReturnValueOnce([]);
			listEmbedTokens(db, 'proj_xyz');
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining('WHERE project_id = ?'),
			);
			expect(mockAll).toHaveBeenCalledWith('proj_xyz');
		});

		it('queries with ORDER BY created_at DESC', () => {
			mockAll.mockReturnValueOnce([]);
			listEmbedTokens(db, 'proj1');
			expect(mockPrepare).toHaveBeenCalledWith(
				expect.stringContaining('ORDER BY created_at DESC'),
			);
		});

		it('maps single row correctly', () => {
			mockAll.mockReturnValueOnce([
				{
					id: 't1',
					token: 'abc123',
					password_hash: null,
					created_by: 'user1',
					created_at: '2024-06-01',
					expires_at: null,
				},
			]);
			const result = listEmbedTokens(db, 'proj1');
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: 't1',
				token: 'abc123',
				hasPassword: false,
				createdBy: 'user1',
				createdAt: '2024-06-01',
				expiresAt: null,
			});
		});

		it('maps multiple rows with mixed password/expiry', () => {
			mockAll.mockReturnValueOnce([
				{
					id: 't1',
					token: 'abc123',
					password_hash: 'hashed_pw',
					created_by: 'user1',
					created_at: '2024-01-01',
					expires_at: '2024-12-31',
				},
				{
					id: 't2',
					token: 'def456',
					password_hash: null,
					created_by: 'user2',
					created_at: '2024-02-01',
					expires_at: null,
				},
			]);
			const result = listEmbedTokens(db, 'proj1');
			expect(result).toHaveLength(2);

			// First token: has password + expiry
			expect(result[0]).toEqual({
				id: 't1',
				token: 'abc123',
				hasPassword: true,
				createdBy: 'user1',
				createdAt: '2024-01-01',
				expiresAt: '2024-12-31',
			});

			// Second token: no password, no expiry
			expect(result[1]).toEqual({
				id: 't2',
				token: 'def456',
				hasPassword: false,
				createdBy: 'user2',
				createdAt: '2024-02-01',
				expiresAt: null,
			});
		});

		it('excludes password_hash from output (not present in returned objects)', () => {
			mockAll.mockReturnValueOnce([
				{
					id: 't1',
					token: 'abc',
					password_hash: 'secret_hash_value',
					created_by: 'user1',
					created_at: '2024-01-01',
					expires_at: null,
				},
			]);
			const result = listEmbedTokens(db, 'proj1');
			const keys = Object.keys(result[0]);
			expect(keys).not.toContain('password_hash');
			expect(keys).toContain('hasPassword');
			// hasPassword is boolean, not the actual hash
			expect(typeof result[0].hasPassword).toBe('boolean');
		});
	});

	// ── deleteEmbedToken ────────────────────────────────────────────

	describe('deleteEmbedToken', () => {
		it('deletes single token by id', () => {
			deleteEmbedToken(db, 't1');
			expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM embed_tokens WHERE id = ?');
			expect(mockRun).toHaveBeenCalledWith('t1');
		});

		it('passes exact id to query', () => {
			deleteEmbedToken(db, 'some-long-token-id');
			expect(mockRun).toHaveBeenCalledWith('some-long-token-id');
		});

		it('consecutive deletes are independent', () => {
			deleteEmbedToken(db, 'a');
			deleteEmbedToken(db, 'b');
			expect(mockRun).toHaveBeenCalledTimes(2);
			expect(mockRun).toHaveBeenNthCalledWith(1, 'a');
			expect(mockRun).toHaveBeenNthCalledWith(2, 'b');
		});
	});

	// ── deleteProjectEmbedTokens ────────────────────────────────────

	describe('deleteProjectEmbedTokens', () => {
		it('deletes all tokens for a project', () => {
			deleteProjectEmbedTokens(db, 'proj1');
			expect(mockPrepare).toHaveBeenCalledWith(
				'DELETE FROM embed_tokens WHERE project_id = ?',
			);
			expect(mockRun).toHaveBeenCalledWith('proj1');
		});

		it('passes exact project id to query', () => {
			deleteProjectEmbedTokens(db, 'proj-with-special-chars');
			expect(mockRun).toHaveBeenCalledWith('proj-with-special-chars');
		});

		it('is independent from deleteEmbedToken (different SQL)', () => {
			deleteEmbedToken(db, 't1');
			const singleSql = mockPrepare.mock.calls[0][0];

			mockPrepare.mockClear();
			deleteProjectEmbedTokens(db, 'proj1');
			const projectSql = mockPrepare.mock.calls[0][0];

			expect(singleSql).toContain('WHERE id = ?');
			expect(projectSql).toContain('WHERE project_id = ?');
			expect(singleSql).not.toBe(projectSql);
		});
	});
});
