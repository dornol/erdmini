import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRun, mockPrepare, mockGet, mockEnv } = vi.hoisted(() => {
	const mockRun = vi.fn();
	const mockGet = vi.fn();
	const mockPrepare = vi.fn(() => ({ run: mockRun, get: mockGet }));
	const mockEnv: Record<string, string> = {};
	return { mockRun, mockPrepare, mockGet, mockEnv };
});

vi.mock('$lib/server/db', () => ({
	default: { prepare: mockPrepare },
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv,
}));

import { logAudit, purgeOldAuditLogs, getAuditStats, getRetentionDays } from './audit';

describe('logAudit', () => {
	beforeEach(() => {
		mockRun.mockClear();
		mockPrepare.mockClear();
		mockGet.mockClear();
		delete mockEnv.AUDIT_RETENTION_DAYS;
		delete mockEnv.AUDIT_CLEANUP_HOUR;
	});

	it('inserts audit log with all fields', () => {
		logAudit({
			userId: 'user-1',
			username: 'admin',
			action: 'login',
			category: 'auth',
			resourceType: 'user',
			resourceId: 'user-1',
			detail: { ip: '127.0.0.1' },
			ip: '127.0.0.1',
			source: 'web',
		});

		expect(mockPrepare).toHaveBeenCalledTimes(1);
		expect(mockRun).toHaveBeenCalledWith(
			'user-1',
			'admin',
			'login',
			'auth',
			'user',
			'user-1',
			'{"ip":"127.0.0.1"}',
			'127.0.0.1',
			'web',
		);
	});

	it('defaults source to web', () => {
		logAudit({ action: 'test', category: 'auth' });

		expect(mockRun).toHaveBeenCalledWith(
			null, null, 'test', 'auth', null, null, null, null, 'web',
		);
	});

	it('handles null optional fields', () => {
		logAudit({ userId: null, username: null, action: 'create', category: 'user' });

		expect(mockRun).toHaveBeenCalledWith(
			null, null, 'create', 'user', null, null, null, null, 'web',
		);
	});

	it('serializes detail as JSON', () => {
		logAudit({ action: 'update', category: 'project', detail: { fields: ['name'], count: 1 } });

		const detailArg = mockRun.mock.calls[0][6];
		expect(JSON.parse(detailArg)).toEqual({ fields: ['name'], count: 1 });
	});

	it('does not throw when db fails', () => {
		mockRun.mockImplementationOnce(() => { throw new Error('DB write failed'); });
		expect(() => logAudit({ action: 'login', category: 'auth' })).not.toThrow();
	});

	it('uses mcp source when specified', () => {
		logAudit({ action: 'add_table', category: 'mcp', userId: 'u1', username: 'api-user', resourceType: 'schema', resourceId: 'proj-1', source: 'mcp' });

		expect(mockRun).toHaveBeenCalledWith(
			'u1', 'api-user', 'add_table', 'mcp', 'schema', 'proj-1', null, null, 'mcp',
		);
	});
});

describe('getRetentionDays', () => {
	beforeEach(() => {
		delete mockEnv.AUDIT_RETENTION_DAYS;
	});

	it('returns 720 by default', () => {
		expect(getRetentionDays()).toBe(720);
	});

	it('reads from env var', () => {
		mockEnv.AUDIT_RETENTION_DAYS = '90';
		expect(getRetentionDays()).toBe(90);
	});

	it('falls back to 720 for invalid values', () => {
		mockEnv.AUDIT_RETENTION_DAYS = '-5';
		expect(getRetentionDays()).toBe(720);

		mockEnv.AUDIT_RETENTION_DAYS = 'abc';
		expect(getRetentionDays()).toBe(720);
	});
});

describe('purgeOldAuditLogs', () => {
	beforeEach(() => {
		mockRun.mockClear();
		mockPrepare.mockClear();
		delete mockEnv.AUDIT_RETENTION_DAYS;
	});

	it('deletes old logs and returns count', () => {
		mockRun.mockReturnValueOnce({ changes: 42 });
		const result = purgeOldAuditLogs(30);
		expect(result).toBe(42);
		expect(mockRun).toHaveBeenCalledWith(30);
	});

	it('uses default retention when no arg', () => {
		mockRun.mockReturnValueOnce({ changes: 0 });
		purgeOldAuditLogs();
		expect(mockRun).toHaveBeenCalledWith(720);
	});

	it('returns 0 on error', () => {
		mockRun.mockImplementationOnce(() => { throw new Error('fail'); });
		expect(purgeOldAuditLogs(30)).toBe(0);
	});
});

describe('getAuditStats', () => {
	beforeEach(() => {
		mockGet.mockClear();
		mockPrepare.mockClear();
		delete mockEnv.AUDIT_RETENTION_DAYS;
	});

	it('returns stats from db', () => {
		mockGet.mockReturnValueOnce({ cnt: 100, oldest: '2024-01-15 03:00:00' });
		const stats = getAuditStats();
		expect(stats).toEqual({ totalCount: 100, oldestTimestamp: '2024-01-15 03:00:00', retentionDays: 720 });
	});

	it('returns zeros on error', () => {
		mockGet.mockImplementationOnce(() => { throw new Error('fail'); });
		const stats = getAuditStats();
		expect(stats).toEqual({ totalCount: 0, oldestTimestamp: null, retentionDays: 720 });
	});
});
