import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let _db: InstanceType<typeof Database> | null = null;

function initDb(): InstanceType<typeof Database> {
  if (_db) return _db;

  const dbPath = env.DB_PATH || 'data/erdmini.db';

  // Ensure data directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS project_index (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schemas (
      project_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS canvas_states (
      project_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);

  // Auth tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oidc_providers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      issuer_url TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      scopes TEXT DEFAULT 'openid email profile',
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_create_users INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oidc_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      email TEXT,
      UNIQUE(provider_id, subject)
    );

    CREATE TABLE IF NOT EXISTS oidc_states (
      state TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // Project permissions table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS project_permissions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, user_id)
    );
  `);

  // API keys table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_key_scopes (
      id TEXT PRIMARY KEY,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'viewer',
      UNIQUE(api_key_id, project_id)
    );
  `);

  // Migrate project_index: add user_id column if missing
  const columns = _db.prepare("PRAGMA table_info(project_index)").all() as { name: string }[];
  if (!columns.some(c => c.name === 'user_id')) {
    _db.exec(`ALTER TABLE project_index ADD COLUMN user_id TEXT DEFAULT 'singleton'`);
  }

  // Migrate: create owner permissions for existing projects that don't have one
  {
    const rows = _db.prepare(
      `SELECT pi.id, pi.user_id, pi.data FROM project_index pi
       WHERE pi.user_id != 'singleton'
         AND NOT EXISTS (
           SELECT 1 FROM project_permissions pp
           WHERE pp.user_id = pi.user_id
             AND pp.permission = 'owner'
             AND EXISTS (
               SELECT 1 FROM json_each(json_extract(pi.data, '$.projects')) je
               WHERE json_extract(je.value, '$.id') = pp.project_id
             )
         )`
    ).all() as { id: string; user_id: string; data: string }[];

    const insertPerm = _db.prepare(
      `INSERT OR IGNORE INTO project_permissions (id, project_id, user_id, permission)
       VALUES (?, ?, ?, 'owner')`
    );

    for (const row of rows) {
      try {
        const index = JSON.parse(row.data);
        if (index.projects && Array.isArray(index.projects)) {
          for (const proj of index.projects) {
            insertPerm.run(`perm_${row.user_id}_${proj.id}`, proj.id, row.user_id);
          }
        }
      } catch { /* skip malformed data */ }
    }
  }

  return _db;
}

// Lazy proxy: db is only initialized when first accessed at runtime
const db = new Proxy({} as InstanceType<typeof Database>, {
  get(_target, prop) {
    return (initDb() as any)[prop];
  },
});

export default db;
