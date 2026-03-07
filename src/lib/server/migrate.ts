import type Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { logger } from './logger';

interface MigrationFile {
	version: number;
	description: string;
	filename: string;
	sql: string;
	checksum: string;
}

interface AppliedMigration {
	version: number;
	description: string;
	checksum: string;
	success: number;
}

const VERSION_PATTERN = /^V(\d{3})__(.+)\.sql$/;

const sqlModules = import.meta.glob('./migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

function sha256(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

function parseMigrations(): MigrationFile[] {
	const migrations: MigrationFile[] = [];

	for (const [path, sql] of Object.entries(sqlModules)) {
		const filename = path.split('/').pop()!;
		const match = filename.match(VERSION_PATTERN);
		if (!match) {
			throw new Error(`Invalid migration filename: ${filename} (expected V###__description.sql)`);
		}

		migrations.push({
			version: parseInt(match[1], 10),
			description: match[2].replace(/_/g, ' '),
			filename,
			sql,
			checksum: sha256(sql)
		});
	}

	migrations.sort((a, b) => a.version - b.version);

	// Validate no duplicate versions
	for (let i = 1; i < migrations.length; i++) {
		if (migrations[i].version === migrations[i - 1].version) {
			throw new Error(`Duplicate migration version: V${String(migrations[i].version).padStart(3, '0')}`);
		}
	}

	return migrations;
}

function detectBaseline(db: InstanceType<typeof Database>): number {
	// Check if this is an existing DB by looking for known tables
	const tables = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table'")
		.all() as { name: string }[];
	const tableNames = new Set(tables.map((t) => t.name));

	if (!tableNames.has('users')) {
		// Fresh DB — no baseline needed
		return 0;
	}

	// V001 tables exist — check V002 (user_id column on project_index)
	let baselineVersion = 1;

	if (tableNames.has('project_index')) {
		const columns = db.prepare('PRAGMA table_info(project_index)').all() as { name: string }[];
		if (columns.some((c) => c.name === 'user_id')) {
			baselineVersion = 2;
		}
	}

	// V003 is idempotent (INSERT OR IGNORE), safe to baseline
	if (baselineVersion >= 2) baselineVersion = 3;

	return baselineVersion;
}

export function runMigrations(db: InstanceType<typeof Database>): void {
	// 1. Create schema_migrations table
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version     INTEGER PRIMARY KEY,
			description TEXT NOT NULL,
			checksum    TEXT NOT NULL,
			applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
			success     INTEGER NOT NULL DEFAULT 1
		)
	`);

	// 2. Parse migration files
	const migrations = parseMigrations();
	if (migrations.length === 0) return;

	// 3. Get already-applied migrations
	const applied = db
		.prepare('SELECT version, description, checksum, success FROM schema_migrations ORDER BY version')
		.all() as AppliedMigration[];
	const appliedMap = new Map(applied.map((a) => [a.version, a]));

	// 4. Check for failed migrations that need manual intervention
	for (const a of applied) {
		if (a.success === 0) {
			throw new Error(
				`Migration V${String(a.version).padStart(3, '0')} previously failed. ` +
					`Manual intervention required: fix the issue, then either remove the row from schema_migrations or mark success=1.`
			);
		}
	}

	// 5. Verify checksums of already-applied migrations
	for (const migration of migrations) {
		const record = appliedMap.get(migration.version);
		if (record) {
			if (record.checksum !== migration.checksum) {
				throw new Error(
					`Checksum mismatch for V${String(migration.version).padStart(3, '0')}__${migration.description.replace(/ /g, '_')}.sql — ` +
						`applied: ${record.checksum.slice(0, 8)}…, current: ${migration.checksum.slice(0, 8)}…. ` +
						`Applied migrations must never be modified.`
				);
			}
		}
	}

	// 6. Detect baseline for existing DBs without schema_migrations history
	const pendingMigrations = migrations.filter((m) => !appliedMap.has(m.version));
	if (pendingMigrations.length === 0) return;

	if (applied.length === 0 && pendingMigrations.length > 0) {
		const baselineVersion = detectBaseline(db);
		if (baselineVersion > 0) {
			logger.info('migrate', `Existing DB detected — baselining at V${String(baselineVersion).padStart(3, '0')}`);
			const insertBaseline = db.prepare(
				'INSERT INTO schema_migrations (version, description, checksum, success) VALUES (?, ?, ?, 1)'
			);
			const baselineTransaction = db.transaction(() => {
				for (const m of migrations) {
					if (m.version <= baselineVersion) {
						insertBaseline.run(m.version, m.description, m.checksum);
						logger.info('migrate', `V${String(m.version).padStart(3, '0')} — baselined`);
					}
				}
			});
			baselineTransaction();

			// Re-filter pending after baseline
			const baselinedVersions = new Set(migrations.filter((m) => m.version <= baselineVersion).map((m) => m.version));
			const remaining = pendingMigrations.filter((m) => !baselinedVersions.has(m.version));
			if (remaining.length === 0) return;

			// Continue with remaining migrations
			executeMigrations(db, remaining);
			return;
		}
	}

	// 7. Execute pending migrations
	executeMigrations(db, pendingMigrations);
}

function executeMigrations(db: InstanceType<typeof Database>, migrations: MigrationFile[]): void {
	for (const migration of migrations) {
		const versionStr = `V${String(migration.version).padStart(3, '0')}`;
		const savepointName = `migration_${migration.version}`;

		logger.info('migrate', `Applying ${versionStr}__${migration.description.replace(/ /g, '_')}…`);

		// Record attempt with success=0
		db.prepare(
			'INSERT INTO schema_migrations (version, description, checksum, success) VALUES (?, ?, ?, 0)'
		).run(migration.version, migration.description, migration.checksum);

		try {
			db.exec(`SAVEPOINT ${savepointName}`);
			db.exec(migration.sql);
			db.exec(`RELEASE SAVEPOINT ${savepointName}`);

			// Mark success
			db.prepare('UPDATE schema_migrations SET success = 1 WHERE version = ?').run(migration.version);
			logger.info('migrate', `${versionStr} — applied`);
		} catch (err) {
			// Rollback the migration SQL, but keep the success=0 record
			try {
				db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
				db.exec(`RELEASE SAVEPOINT ${savepointName}`);
			} catch {
				// Savepoint may already be released on certain errors
			}

			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Migration ${versionStr} failed: ${message}`);
		}
	}
}
