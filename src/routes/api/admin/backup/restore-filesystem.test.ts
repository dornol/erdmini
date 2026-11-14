import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const state = vi.hoisted(() => ({ path: '', failure: '' as '' | 'before-copy' | 'partial-copy', connection: undefined as Database.Database | undefined }));
vi.mock('fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, copyFileSync: (...args: Parameters<typeof fs.copyFileSync>) => {
    if (String(args[1]) === state.path && state.failure) {
      if (state.failure === 'partial-copy') fs.writeFileSync(state.path, 'partial invalid database');
      throw new Error('Injected copy failure');
    }
    return fs.copyFileSync(...args);
  } };
});
vi.mock('$lib/server/db', () => ({
  default: { prepare: (sql: string) => {
    state.connection ??= new Database(state.path);
    return state.connection.prepare(sql);
  } },
  getDbPath: () => state.path,
  closeDb: () => { state.connection?.close(); state.connection = undefined; },
  reinitDb: () => { state.connection?.close(); state.connection = undefined; },
}));
vi.mock('$lib/server/auth/guards', () => ({ requireAdmin: () => null }));
vi.mock('$lib/server/audit', () => ({ logAudit: vi.fn() }));
vi.mock('$lib/server/site-settings', () => ({ invalidateSiteSettingsCaches: vi.fn() }));
vi.mock('$lib/server/auth/oidc', () => ({ clearConfigCache: vi.fn() }));
vi.mock('$lib/server/migrate', () => ({ getLatestMigrationVersion: () => 18 }));
import { POST } from './+server';
import { invalidateSiteSettingsCaches } from '$lib/server/site-settings';
import { clearConfigCache } from '$lib/server/auth/oidc';

describe('restore filesystem rollback with real SQLite files', () => {
  let directory: string;
  let backup: Buffer;
  beforeEach(() => {
    vi.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), 'erdmini-restore-copy-test-'));
    state.path = join(directory, 'live.db'); state.failure = '';
    const live = new Database(state.path);
    live.exec("CREATE TABLE retained (value TEXT); INSERT INTO retained VALUES ('live edit'); CREATE TABLE sessions (id TEXT); INSERT INTO sessions VALUES ('existing-session')");
    live.close();
    const candidate = new Database(':memory:');
    candidate.exec('CREATE TABLE users (id TEXT); CREATE TABLE project_index (id TEXT); CREATE TABLE schema_migrations (version INTEGER); INSERT INTO schema_migrations VALUES (18)');
    backup = candidate.serialize(); candidate.close();
    globalThis.__erdmini_collabDatabase = { suspendDatabase: vi.fn(), resumeDatabase: vi.fn() };
  });
  afterEach(() => {
    state.connection?.close(); state.connection = undefined;
    globalThis.__erdmini_collabDatabase = undefined;
    rmSync(directory, { recursive: true, force: true });
  });
  for (const failure of ['before-copy', 'partial-copy'] as const) {
    it(`restores live edits and sessions after ${failure} and resumes collaboration before accepting another restore`, async () => {
      const restore = async () => {
        const data = new FormData();
        data.append('file', new Blob([new Uint8Array(backup)]), 'candidate.db');
        const request = new Request('http://localhost/api/admin/backup', { method: 'POST', body: data });
        return await POST({ request, locals: { user: { id: 'admin', username: 'admin', role: 'admin' } } } as unknown as Parameters<typeof POST>[0]);
      };
      state.failure = failure;
      const result = await restore();
      expect(result.status).toBe(500);
      expect(await result.json()).toEqual({ error: 'Failed to copy backup file' });
      const recovered = new Database(state.path);
      try {
        expect(recovered.pragma('quick_check', { simple: true })).toBe('ok');
        expect(recovered.prepare('SELECT value FROM retained').all()).toEqual([{ value: 'live edit' }]);
        expect(recovered.prepare('SELECT id FROM sessions').all()).toEqual([{ id: 'existing-session' }]);
        recovered.prepare('INSERT INTO retained VALUES (?)').run('edit after rollback');
      } finally { recovered.close(); }
      expect(existsSync(`${state.path}.pre-restore`)).toBe(false);
      expect(globalThis.__erdmini_collabDatabase!.suspendDatabase).toHaveBeenCalledOnce();
      expect(globalThis.__erdmini_collabDatabase!.resumeDatabase).toHaveBeenCalledOnce();
      expect(invalidateSiteSettingsCaches).not.toHaveBeenCalled();
      expect(clearConfigCache).not.toHaveBeenCalled();
      // Remove the failure and retry through the same production handler.
      state.failure = '';
      const retry = await restore();
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ success: true });
      expect(globalThis.__erdmini_collabDatabase!.resumeDatabase).toHaveBeenCalledTimes(2);
      expect(invalidateSiteSettingsCaches).toHaveBeenCalledOnce();
      expect(clearConfigCache).toHaveBeenCalledOnce();
      expect(existsSync(`${state.path}.pre-restore`)).toBe(false);
    });
  }
});
