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

import { logAudit, purgeOldAuditLogs, getAuditStats, getRetentionDays, auditSchemaChanges } from './audit';

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

describe('auditSchemaChanges', () => {
	const user = { id: 'u1', username: 'admin' };
	const projectId = 'proj-1';

	beforeEach(() => {
		mockRun.mockClear();
		mockPrepare.mockClear();
	});

	it('detects table creation', () => {
		auditSchemaChanges(user, projectId,
			{ tables: [] },
			{ tables: [{ id: 't1', name: 'users' }] },
		);
		expect(mockRun).toHaveBeenCalledTimes(1);
		expect(mockRun.mock.calls[0][2]).toBe('create_table');
		expect(JSON.parse(mockRun.mock.calls[0][6])).toEqual({ tableId: 't1', tableName: 'users' });
	});

	it('detects table deletion', () => {
		auditSchemaChanges(user, projectId,
			{ tables: [{ id: 't1', name: 'users' }] },
			{ tables: [] },
		);
		expect(mockRun).toHaveBeenCalledTimes(1);
		expect(mockRun.mock.calls[0][2]).toBe('delete_table');
		expect(JSON.parse(mockRun.mock.calls[0][6])).toEqual({ tableId: 't1', tableName: 'users' });
	});

	it('detects table rename', () => {
		auditSchemaChanges(user, projectId,
			{ tables: [{ id: 't1', name: 'users' }] },
			{ tables: [{ id: 't1', name: 'accounts' }] },
		);
		expect(mockRun).toHaveBeenCalledTimes(1);
		expect(mockRun.mock.calls[0][2]).toBe('rename_table');
		expect(JSON.parse(mockRun.mock.calls[0][6])).toEqual({ tableId: 't1', oldName: 'users', newName: 'accounts' });
	});

	it('detects memo creation', () => {
		auditSchemaChanges(user, projectId,
			{ memos: [] },
			{ memos: [{ id: 'm1' }] },
		);
		expect(mockRun).toHaveBeenCalledTimes(1);
		expect(mockRun.mock.calls[0][2]).toBe('create_memo');
	});

	it('detects memo deletion', () => {
		auditSchemaChanges(user, projectId,
			{ memos: [{ id: 'm1' }] },
			{ memos: [] },
		);
		expect(mockRun).toHaveBeenCalledTimes(1);
		expect(mockRun.mock.calls[0][2]).toBe('delete_memo');
	});

	it('does not log when nothing changed', () => {
		auditSchemaChanges(user, projectId,
			{ tables: [{ id: 't1', name: 'users' }], memos: [{ id: 'm1' }] },
			{ tables: [{ id: 't1', name: 'users' }], memos: [{ id: 'm1' }] },
		);
		expect(mockRun).not.toHaveBeenCalled();
	});

	it('handles multiple changes at once', () => {
		auditSchemaChanges(user, projectId,
			{ tables: [{ id: 't1', name: 'users' }, { id: 't2', name: 'orders' }], memos: [{ id: 'm1' }] },
			{ tables: [{ id: 't1', name: 'accounts' }, { id: 't3', name: 'products' }], memos: [] },
		);
		const actions = mockRun.mock.calls.map((c: unknown[]) => c[2]);
		expect(actions).toContain('delete_table');   // t2 removed
		expect(actions).toContain('create_table');   // t3 added
		expect(actions).toContain('rename_table');   // t1 renamed
		expect(actions).toContain('delete_memo');    // m1 removed
		expect(mockRun).toHaveBeenCalledTimes(4);
	});

	it('handles undefined tables/memos gracefully', () => {
		auditSchemaChanges(user, projectId, {}, {});
		expect(mockRun).not.toHaveBeenCalled();
	});

	it('sets correct user and project in audit entries', () => {
		auditSchemaChanges(user, projectId,
			{ tables: [] },
			{ tables: [{ id: 't1', name: 'users' }] },
		);
		const call = mockRun.mock.calls[0];
		expect(call[0]).toBe('u1');       // userId
		expect(call[1]).toBe('admin');    // username
		expect(call[3]).toBe('schema');   // category
		expect(call[5]).toBe('proj-1');   // resourceId
		expect(call[8]).toBe('web');      // source
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
