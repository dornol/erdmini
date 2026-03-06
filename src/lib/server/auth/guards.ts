import { json } from '@sveltejs/kit';
import type Database from 'better-sqlite3';
import { hasProjectAccess } from '$lib/server/auth/permissions';

/**
 * Checks if the current user is an admin. Returns a 403 JSON response if not.
 * Usage: `const err = requireAdmin(locals); if (err) return err;`
 */
export function requireAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	return null;
}

/**
 * Extract user info from locals. In local mode (no auth), returns a singleton user.
 */
export function getUserInfo(locals: App.Locals) {
	return {
		id: locals.user?.id ?? 'singleton',
		role: locals.user?.role ?? 'user',
		isLocal: !locals.user,
	};
}

/**
 * Check project access, bypassing in local mode. Returns 403 response if forbidden, null if OK.
 */
export function checkProjectAccess(
	db: Database.Database,
	locals: App.Locals,
	projectId: string,
	level: 'viewer' | 'editor' | 'owner',
) {
	const user = getUserInfo(locals);
	if (!user.isLocal && !hasProjectAccess(db, projectId, user.id, user.role, level)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	return null;
}

/**
 * Check a user-level permission flag. Admin always bypasses.
 * Returns 403 response if forbidden, null if OK.
 */
export function requirePermission(locals: App.Locals, permission: 'canCreateProject' | 'canCreateApiKey' | 'canCreateEmbed') {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (locals.user.role === 'admin') return null;
	if (!locals.user[permission]) {
		return json({ error: 'You do not have permission for this action' }, { status: 403 });
	}
	return null;
}
