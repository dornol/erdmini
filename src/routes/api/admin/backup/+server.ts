import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db, { getDbPath, closeDb, reinitDb } from '$lib/server/db';
import { logAudit } from '$lib/server/audit';
import { statSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';

function requireAdmin(locals: App.Locals) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// GET /api/admin/backup — download DB backup or stats
export const GET: RequestHandler = ({ locals, url }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  // Stats endpoint
  if (url.searchParams.get('stats') === '1') {
    const dbPath = getDbPath();
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = statSync(dbPath).size;
      try { dbSizeBytes += statSync(dbPath + '-wal').size; } catch { /* no WAL */ }
    } catch {
      // DB file might not exist yet
    }

    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;

    const seen = new Set<string>();
    const rows = db.prepare('SELECT data FROM project_index').all() as { data: string }[];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        for (const p of parsed.projects ?? []) seen.add(p.id);
      } catch { /* skip */ }
    }

    const migration = db.prepare('SELECT MAX(version) as ver FROM schema_migrations WHERE success = 1').get() as { ver: number | null };

    return json({
      dbSizeBytes,
      userCount,
      projectCount: seen.size,
      migrationVersion: migration?.ver ?? 0,
    });
  }

  // Backup download
  const tempPath = join(tmpdir(), `erdmini-backup-${randomUUID()}.db`);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const dbPath = getDbPath();
    copyFileSync(dbPath, tempPath);

    const data = readFileSync(tempPath);
    logAudit({ action: 'backup', category: 'backup', userId: locals.user!.id, username: locals.user!.username, detail: { sizeBytes: data.length }, source: 'web' });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="erdmini-backup-${now}.db"`,
        'Content-Length': String(data.length),
      },
    });
  } finally {
    try { unlinkSync(tempPath); } catch { /* ignore */ }
  }
};

// POST /api/admin/backup — restore DB from upload
export const POST: RequestHandler = async ({ request, locals }) => {
  const err = requireAdmin(locals);
  if (err) return err;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return json({ error: 'No file uploaded' }, { status: 400 });
  }

  if (!file.name.endsWith('.db')) {
    return json({ error: 'File must be a .db file' }, { status: 400 });
  }

  const tempPath = join(tmpdir(), `erdmini-restore-${randomUUID()}.db`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tempPath, buffer);

    // Validate the uploaded DB
    let testDb: InstanceType<typeof Database> | null = null;
    try {
      testDb = new Database(tempPath, { readonly: true });

      const tables = testDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('schema_migrations', 'users', 'project_index')"
      ).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      if (!tableNames.includes('schema_migrations')) {
        return json({ error: 'Invalid backup: missing schema_migrations table' }, { status: 400 });
      }
      if (!tableNames.includes('users')) {
        return json({ error: 'Invalid backup: missing users table' }, { status: 400 });
      }
    } catch (e) {
      return json({ error: `Invalid database file: ${e instanceof Error ? e.message : 'unknown error'}` }, { status: 400 });
    } finally {
      testDb?.close();
    }

    const dbPath = getDbPath();
    const bakPath = dbPath + '.pre-restore';

    // 1. Close current DB (flushes WAL, releases locks)
    closeDb();

    // 2. Rename current DB as safety backup
    try {
      if (existsSync(dbPath)) renameSync(dbPath, bakPath);
    } catch {
      // If rename fails, try to reinit old DB and bail
      reinitDb();
      return json({ error: 'Failed to prepare restore: could not rename current DB' }, { status: 500 });
    }

    // 3. Remove old WAL/SHM files
    for (const suffix of ['-wal', '-shm']) {
      try { if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }

    // 4. Copy uploaded file to DB path
    try {
      copyFileSync(tempPath, dbPath);
    } catch {
      // Rollback: restore old DB
      try { if (existsSync(bakPath)) renameSync(bakPath, dbPath); } catch { /* ignore */ }
      reinitDb();
      return json({ error: 'Failed to copy backup file' }, { status: 500 });
    }

    // 5. Let lazy proxy re-initialize on next access — verify it works
    reinitDb();
    try {
      // Trigger lazy init by accessing the DB
      db.prepare('SELECT 1').get();
    } catch (e) {
      // Rollback: restore old DB
      closeDb();
      try { if (existsSync(bakPath)) renameSync(bakPath, dbPath); } catch { /* ignore */ }
      reinitDb();
      return json({
        error: `Restored DB failed to open: ${e instanceof Error ? e.message : 'unknown error'}`,
      }, { status: 500 });
    }

    // 6. Success — clean up safety backup
    try { if (existsSync(bakPath)) unlinkSync(bakPath); } catch { /* ignore */ }

    logAudit({ action: 'restore', category: 'backup', userId: locals.user!.id, username: locals.user!.username, detail: { filename: file.name }, source: 'web' });

    return json({ success: true });
  } finally {
    try { unlinkSync(tempPath); } catch { /* ignore */ }
  }
};
