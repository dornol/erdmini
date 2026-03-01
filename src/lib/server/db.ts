import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const dbPath = env.DB_PATH || 'data/erdmini.db';

// Ensure data directory exists
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
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

export default db;
