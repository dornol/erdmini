import db from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { logger } from './logger';

export interface AuditEntry {
	userId?: string | null;
	username?: string | null;
	action: string;
	category: string;
	resourceType?: string;
	resourceId?: string;
	detail?: Record<string, unknown>;
	ip?: string;
	source?: string; // 'web' | 'mcp' | 'system'
}

const INSERT_SQL = `
	INSERT INTO audit_logs (user_id, username, action, category, resource_type, resource_id, detail, ip, source)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export function logAudit(entry: AuditEntry): void {
	try {
		db.prepare(INSERT_SQL).run(
			entry.userId ?? null,
			entry.username ?? null,
			entry.action,
			entry.category,
			entry.resourceType ?? null,
			entry.resourceId ?? null,
			entry.detail ? JSON.stringify(entry.detail) : null,
			entry.ip ?? null,
			entry.source ?? 'web'
		);
		logger.info('audit', entry.action, {
			category: entry.category,
			...(entry.userId && { userId: entry.userId }),
			...(entry.resourceType && { resourceType: entry.resourceType }),
			...(entry.resourceId && { resourceId: entry.resourceId }),
			...(entry.source && { source: entry.source }),
		});
	} catch (e) {
		// 감사 로그 실패가 본래 작업을 중단시키면 안 됨
		logger.warn('audit', 'logAudit failed', { error: (e as Error).message });
	}
}

// ── Schema Change Audit ──

export interface SchemaBlob {
	tables?: { id: string; name: string }[];
	memos?: { id: string }[];
}

/** Compare old/new schema and log table/memo create, delete, rename events. */
export function auditSchemaChanges(
	user: { id: string; username: string | null },
	projectId: string,
	oldSchema: SchemaBlob,
	newSchema: SchemaBlob,
): void {
	const oldTables = new Map((oldSchema.tables || []).map(t => [t.id, t]));
	const newTables = new Map((newSchema.tables || []).map(t => [t.id, t]));
	const oldMemoIds = new Set((oldSchema.memos || []).map(m => m.id));
	const newMemoIds = new Set((newSchema.memos || []).map(m => m.id));
	const base = { userId: user.id, username: user.username, category: 'schema', resourceId: projectId, source: 'web' as const };

	for (const [id, t] of newTables) {
		if (!oldTables.has(id)) {
			logAudit({ ...base, action: 'create_table', resourceType: 'table', detail: { tableId: id, tableName: t.name } });
		}
	}
	for (const [id, t] of oldTables) {
		if (!newTables.has(id)) {
			logAudit({ ...base, action: 'delete_table', resourceType: 'table', detail: { tableId: id, tableName: t.name } });
		}
	}
	for (const [id, t] of newTables) {
		const old = oldTables.get(id);
		if (old && old.name !== t.name) {
			logAudit({ ...base, action: 'rename_table', resourceType: 'table', detail: { tableId: id, oldName: old.name, newName: t.name } });
		}
	}
	for (const id of newMemoIds) {
		if (!oldMemoIds.has(id)) {
			logAudit({ ...base, action: 'create_memo', resourceType: 'memo', detail: { memoId: id } });
		}
	}
	for (const id of oldMemoIds) {
		if (!newMemoIds.has(id)) {
			logAudit({ ...base, action: 'delete_memo', resourceType: 'memo', detail: { memoId: id } });
		}
	}
}

// ── Retention ──

/** Default retention: 720 days. Override via AUDIT_RETENTION_DAYS env var. */
export function getRetentionDays(): number {
	const val = parseInt(env.AUDIT_RETENTION_DAYS || '720', 10);
	return val > 0 ? val : 720;
}

/** Default cleanup hour: 3 (03:00). Override via AUDIT_CLEANUP_HOUR env var (0-23). */
function getCleanupHour(): number {
	const val = parseInt(env.AUDIT_CLEANUP_HOUR || '3', 10);
	return val >= 0 && val <= 23 ? val : 3;
}

/**
 * Delete audit logs older than the retention period.
 * Returns the number of deleted rows.
 */
export function purgeOldAuditLogs(retentionDays?: number): number {
	const days = retentionDays ?? getRetentionDays();
	try {
		const result = db.prepare(
			`DELETE FROM audit_logs WHERE timestamp < datetime('now', '-' || ? || ' days')`
		).run(days);
		return result.changes;
	} catch {
		return 0;
	}
}

/** Get audit log stats: total count, oldest timestamp, DB-side count by retention cutoff. */
export function getAuditStats(): { totalCount: number; oldestTimestamp: string | null; retentionDays: number } {
	const retentionDays = getRetentionDays();
	try {
		const row = db.prepare(
			'SELECT COUNT(*) as cnt, MIN(timestamp) as oldest FROM audit_logs'
		).get() as { cnt: number; oldest: string | null };
		return { totalCount: row.cnt, oldestTimestamp: row.oldest, retentionDays };
	} catch {
		return { totalCount: 0, oldestTimestamp: null, retentionDays };
	}
}

// ── Scheduler ──

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

function msUntilNextCleanup(): number {
	const hour = getCleanupHour();
	const now = new Date();
	const target = new Date(now);
	target.setHours(hour, 0, 0, 0);
	if (target.getTime() <= now.getTime()) {
		target.setDate(target.getDate() + 1);
	}
	return target.getTime() - now.getTime();
}

function scheduleNext(): void {
	if (schedulerTimer) clearTimeout(schedulerTimer);
	const ms = msUntilNextCleanup();
	schedulerTimer = setTimeout(() => {
		const deleted = purgeOldAuditLogs();
		if (deleted > 0) {
			logAudit({
				action: 'audit_cleanup',
				category: 'system',
				detail: { deletedCount: deleted, retentionDays: getRetentionDays() },
				source: 'system',
			});
		}
		scheduleNext();
	}, ms);
	// Don't block process exit
	if (schedulerTimer && typeof schedulerTimer === 'object' && 'unref' in schedulerTimer) {
		schedulerTimer.unref();
	}
}

/** Start the daily audit log cleanup scheduler. Safe to call multiple times. */
export function startAuditCleanupScheduler(): void {
	if (schedulerTimer) return; // already running
	scheduleNext();
}
