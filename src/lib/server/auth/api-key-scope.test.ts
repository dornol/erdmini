import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthUser } from '$lib/types/auth';

const { mockHasProjectAccess } = vi.hoisted(() => ({
	mockHasProjectAccess: vi.fn(),
}));

vi.mock('./permissions', () => ({
	hasProjectAccess: mockHasProjectAccess,
}));

import { canGrantUserApiKeyScope } from './api-key-scope';

const db = {} as never;
const user: AuthUser = {
	id: 'u1',
	username: 'user',
	displayName: 'User',
	email: null,
	role: 'user',
	status: 'active',
	canCreateProject: true,
	canCreateApiKey: true,
	canCreateEmbed: true,
};

describe('canGrantUserApiKeyScope', () => {
	beforeEach(() => {
		mockHasProjectAccess.mockReset();
	});

	it('allows viewer scope when user has viewer access', () => {
		mockHasProjectAccess.mockReturnValue(true);

		expect(canGrantUserApiKeyScope(db, user, { projectId: 'p1', permission: 'viewer' })).toBe(true);
		expect(mockHasProjectAccess).toHaveBeenCalledWith(db, 'p1', 'u1', 'user', 'viewer');
	});

	it('requires editor access for editor scope', () => {
		mockHasProjectAccess.mockReturnValue(false);

		expect(canGrantUserApiKeyScope(db, user, { projectId: 'p1', permission: 'editor' })).toBe(false);
		expect(mockHasProjectAccess).toHaveBeenCalledWith(db, 'p1', 'u1', 'user', 'editor');
	});

	it('rejects unsupported or malformed scopes before checking project access', () => {
		expect(canGrantUserApiKeyScope(db, user, { projectId: 'p1', permission: 'owner' })).toBe(false);
		expect(canGrantUserApiKeyScope(db, user, { projectId: 123, permission: 'viewer' })).toBe(false);
		expect(canGrantUserApiKeyScope(db, user, { projectId: 'p1', permission: 123 })).toBe(false);
		expect(mockHasProjectAccess).not.toHaveBeenCalled();
	});
});
