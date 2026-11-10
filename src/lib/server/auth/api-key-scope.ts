import type Database from 'better-sqlite3';
import type { AuthUser } from '$lib/types/auth';
import { hasProjectAccess } from './permissions';

export const USER_API_KEY_SCOPE_PERMISSIONS = new Set(['viewer', 'editor']);

export interface RequestedApiKeyScope {
	projectId?: unknown;
	permission?: unknown;
}

export function canGrantUserApiKeyScope(
	db: Database.Database,
	user: AuthUser,
	scope: RequestedApiKeyScope,
): scope is { projectId: string; permission: 'viewer' | 'editor' } {
	if (typeof scope.projectId !== 'string' || typeof scope.permission !== 'string') {
		return false;
	}
	if (!USER_API_KEY_SCOPE_PERMISSIONS.has(scope.permission)) {
		return false;
	}
	return hasProjectAccess(db, scope.projectId, user.id, user.role, scope.permission as 'viewer' | 'editor');
}
