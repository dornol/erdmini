import Database from 'better-sqlite3';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect } from 'playwright/test';

/** Execute the actual historical migrations and retain every compatible column. */
export async function historicalBackup(original: Buffer, version: number): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-external-history-'));
  let source: Database.Database | undefined, target: Database.Database | undefined;
  try {
    await writeFile(join(directory, 'source.db'), original);
    source = new Database(join(directory, 'source.db'), { readonly: true });
    target = new Database(join(directory, 'historical.db'));
    const files = (await readdir('src/lib/server/migrations')).filter(name => /^V\d{3}__.*\.sql$/.test(name) && Number(name.slice(1, 4)) <= version).sort();
    expect(files).toHaveLength(version);
    for (const file of files) target.exec(await readFile(join('src/lib/server/migrations', file), 'utf8'));
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    for (const { name } of target.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]) {
      const columns = (target.prepare(`PRAGMA table_info(${quote(name)})`).all() as { name: string }[]).map(row => row.name);
      const rows = source.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`).all() as Record<string, unknown>[];
      target.prepare(`DELETE FROM ${quote(name)}`).run();
      const insert = target.prepare(`INSERT INTO ${quote(name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of rows) insert.run(...columns.map(column => row[column]));
    }
    target.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')), success INTEGER NOT NULL DEFAULT 1)");
    for (const row of source.prepare('SELECT * FROM schema_migrations WHERE version <= ?').all(version) as Record<string, unknown>[]) {
      target.prepare('INSERT INTO schema_migrations (version,description,checksum,applied_at,success) VALUES (?,?,?,?,?)').run(row.version, row.description, row.checksum, row.applied_at, row.success);
    }
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
    expect(target.pragma('foreign_key_check')).toEqual([]);
    return target.serialize();
  } finally { target?.close(); source?.close(); await rm(directory, { recursive: true, force: true }); }
}
