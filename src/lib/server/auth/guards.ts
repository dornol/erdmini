import { json } from '@sveltejs/kit';

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
