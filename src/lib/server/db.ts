import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { runMigrations } from './migrate.js';

let _db: InstanceType<typeof Database> | null = null;

function initDb(): InstanceType<typeof Database> {
  if (_db) return _db;

  const dbPath = env.DB_PATH || 'data/erdmini.db';

  // Ensure data directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  runMigrations(_db);

  return _db;
}

// Lazy proxy: db is only initialized when first accessed at runtime
const db = new Proxy({} as InstanceType<typeof Database>, {
  get(_target, prop) {
    return (initDb() as any)[prop];
  },
});

export function getDbPath(): string {
  return env.DB_PATH || 'data/erdmini.db';
}

export function closeDb(): void {
  if (_db) {
    try { _db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
  }
}

export function reinitDb(): void {
  _db = null;
  // Next access via proxy will re-initialize
}

export default db;
