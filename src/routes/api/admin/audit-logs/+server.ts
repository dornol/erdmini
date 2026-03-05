import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { purgeOldAuditLogs, getAuditStats, logAudit } from '$lib/server/audit';
import { requireAdmin } from '$lib/server/auth/guards';

export const GET: RequestHandler = ({ locals, url }) => {
	const err = requireAdmin(locals);
	if (err) return err;

	// Stats endpoint
	if (url.searchParams.get('stats') === '1') {
		return json(getAuditStats());
	}

	const category = url.searchParams.get('category');
	const action = url.searchParams.get('action');
	const userId = url.searchParams.get('userId');
	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100') || 100, 1), 500);
	const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0);

	const conditions: string[] = [];
	const params: (string | number)[] = [];

	if (category) {
		conditions.push('a.category = ?');
		params.push(category);
	}
	if (action) {
		conditions.push('a.action LIKE ?');
		params.push(`%${action}%`);
	}
	if (userId) {
		conditions.push('a.user_id = ?');
		params.push(userId);
	}

	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

	const total = (db.prepare(
		`SELECT COUNT(*) as cnt FROM audit_logs a ${where}`
	).get(...params) as { cnt: number }).cnt;

	const logs = db.prepare(
		`SELECT a.id, a.timestamp, a.user_id, a.username, a.action, a.category,
		        a.resource_type, a.resource_id, a.detail, a.ip, a.source
		 FROM audit_logs a
		 ${where}
		 ORDER BY a.timestamp DESC, a.id DESC
		 LIMIT ? OFFSET ?`
	).all(...params, limit, offset);

	return json({ logs, total });
};

/** DELETE /api/admin/audit-logs — manual purge of old audit logs */
export const DELETE: RequestHandler = ({ locals, url }) => {
	const err = requireAdmin(locals);
	if (err) return err;

	const days = parseInt(url.searchParams.get('days') || '0', 10);
	if (!days || days < 1) {
		return json({ error: 'days parameter required (>= 1)' }, { status: 400 });
	}

	const deleted = purgeOldAuditLogs(days);

	logAudit({
		action: 'audit_purge',
		category: 'system',
		userId: locals.user!.id,
		username: locals.user!.username,
		detail: { deletedCount: deleted, retentionDays: days },
		source: 'web',
	});

	return json({ deleted });
};
