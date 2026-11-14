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
	scope: unknown,
): scope is { projectId: string; permission: 'viewer' | 'editor' } {
	if (!scope || typeof scope !== 'object' || !('projectId' in scope) || !('permission' in scope)) return false;
	if (typeof scope.projectId !== 'string' || !scope.projectId.trim() || typeof scope.permission !== 'string') {
		return false;
	}
	if (!USER_API_KEY_SCOPE_PERMISSIONS.has(scope.permission)) {
		return false;
	}
	return hasProjectAccess(db, scope.projectId, user.id, user.role, scope.permission as 'viewer' | 'editor');
}

export function validateUserApiKeyScopes(db: Database.Database, user: AuthUser, scopes: unknown): boolean {
	if (scopes === undefined) return true;
	if (!Array.isArray(scopes)) return false;
	const projects = new Set<string>();
	for (const scope of scopes) {
		if (!canGrantUserApiKeyScope(db, user, scope) || projects.has(scope.projectId)) return false;
		projects.add(scope.projectId);
	}
	return true;
}
