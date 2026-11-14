import { hash } from '@node-rs/argon2';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from 'playwright/test';

async function start(dbPath: string, password: string, username = 'startup_admin') {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const address = socket.address(); if (!address || typeof address === 'string') throw new Error('Port unavailable');
  const port = address.port; await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  let output = '';
  const child: ChildProcess = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: { ...process.env, PUBLIC_STORAGE_MODE: 'server', PUBLIC_APP_URL: `http://127.0.0.1:${port}`, DB_PATH: dbPath, ADMIN_USERNAME: username, ADMIN_PASSWORD: password },
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnError: Error | undefined;
  child.on('error', error => { spawnError = error; });
  child.stdout!.on('data', data => { output += String(data); }); child.stderr!.on('data', data => { output += String(data); });
  const stop = async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    try { process.kill(-child.pid!, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    const timer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} }, 5_000);
    try { await exited; } finally { clearTimeout(timer); }
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    await expect.poll(async () => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Startup process exited');
      try { return (await fetch(`${url}/login`, { signal: AbortSignal.timeout(5_000) })).status; } catch { return 0; }
    }, { timeout: 100_000, intervals: [500] }).toBe(200);
  } catch (error) { await stop(); throw error; }
  return { url, stop, output: () => output };
}

for (const generated of [false, true]) {
  test(`empty database ${generated ? 'generated' : 'configured'} administrator survives server restart without password replacement`, async ({ page }) => {
    const directory = await mkdtemp(join(tmpdir(), 'erdmini-startup-')), dbPath = join(directory, 'startup.db');
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
      server = await start(dbPath, generated ? '' : 'startup-password');
      let password = 'startup-password';
      if (generated) {
        await expect.poll(() => /Password: (\S+)/.test(server!.output())).toBe(true);
        password = server.output().match(/Password: (\S+)/)![1];
        expect(password.length).toBeGreaterThanOrEqual(16);
      } else expect(server.output()).not.toContain('startup-password');
      const identity = () => {
        const reader = new Database(dbPath, { readonly: true });
        try { return reader.prepare('SELECT id, username, role, password_hash FROM users').all(); } finally { reader.close(); }
      };
      const original = identity(); expect(original).toHaveLength(1);
      expect(original[0]).toMatchObject({ username: 'startup_admin', role: 'admin', password_hash: expect.stringMatching(/^\$argon2/) });
      const login = async () => {
        await page.goto(`${server!.url}/login`); await page.locator('#username').fill('startup_admin'); await page.locator('#password').fill(password);
        await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).toHaveURL(`${server!.url}/`);
        expect((await page.request.get(`${server!.url}/api/admin/users`)).status()).toBe(200);
      };
      await login(); await server.stop(); server = undefined;
      server = await start(dbPath, 'replacement-must-not-win');
      await page.context().clearCookies(); await login();
      expect(identity()).toEqual(original);
      expect(server.output()).not.toContain('INITIAL ADMIN CREDENTIALS');
      expect(server.output()).not.toContain('replacement-must-not-win');
    } finally { if (server) await server.stop(); await rm(directory, { recursive: true, force: true }); }
  });
}


test('legacy singleton project ownership migrates to the initial administrator without changing saved content', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-legacy-startup-')), dbPath = join(directory, 'legacy.db');
  let server: Awaited<ReturnType<typeof start>> | undefined;
  const now = new Date().toISOString();
  const index = { version: '1', activeProjectId: 'legacy', projects: [{ id: 'legacy', name: 'Legacy project', createdAt: now, updatedAt: now }] };
  const schema = { version: '1', tables: [{ id: 'users', name: 'legacy_users', position: { x: 120, y: 140 }, columns: [{ id: 'id', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }], foreignKeys: [], uniqueKeys: [], indexes: [] }], domains: [], memos: [], createdAt: now, updatedAt: now };
  try {
    const seed = new Database(dbPath);
    try {
      seed.exec(await readFile('src/lib/server/migrations/V001__initial_schema.sql', 'utf8'));
      seed.prepare('INSERT INTO project_index (id, data) VALUES (?, ?)').run('singleton', JSON.stringify(index));
      seed.prepare('INSERT INTO schemas (project_id, data) VALUES (?, ?)').run('legacy', JSON.stringify(schema));
    } finally { seed.close(); }
    server = await start(dbPath, 'legacy-password');
    await page.goto(`${server.url}/login`); await page.locator('#username').fill('startup_admin'); await page.locator('#password').fill('legacy-password');
    await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).toHaveURL(`${server.url}/`);
    await expect(page.getByTestId('project-menu-toggle')).toContainText('Legacy project');
    await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('legacy_users');
    expect(await page.request.get(`${server.url}/api/storage/index`).then(r => r.json())).toEqual(index);
    expect(await page.request.get(`${server.url}/api/storage/schemas/legacy`).then(r => r.json())).toEqual(schema);
    const reader = new Database(dbPath, { readonly: true });
    try {
      const admin = reader.prepare('SELECT id FROM users WHERE username = ?').get('startup_admin') as { id: string };
      const owner = reader.prepare('SELECT user_id FROM project_index WHERE id = ?').get(`user_${admin.id}`) as { user_id: string };
      expect(owner.user_id).toBe(admin.id);
    } finally { reader.close(); }
    await page.reload(); await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('legacy_users');
    expect(await page.request.get(`${server.url}/api/storage/schemas/legacy`).then(r => r.json())).toEqual(schema);
  } finally { if (server) await server.stop(); await rm(directory, { recursive: true, force: true }); }
});


test('existing users prevent creation of an environment administrator and keep their password hash unchanged', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-existing-startup-')), dbPath = join(directory, 'existing.db');
  let server: Awaited<ReturnType<typeof start>> | undefined;
  const passwordHash = await hash('existing-password');
  try {
    const seed = new Database(dbPath);
    try {
      seed.exec(await readFile('src/lib/server/migrations/V001__initial_schema.sql', 'utf8'));
      seed.prepare("INSERT INTO users (id, username, display_name, role, password_hash) VALUES (?, ?, ?, 'admin', ?)").run('existing', 'existing_owner', 'Existing owner', passwordHash);
    } finally { seed.close(); }
    server = await start(dbPath, 'environment-password');
    const denied = await page.request.post(`${server.url}/api/auth/login`, { data: { username: 'startup_admin', password: 'environment-password' } });
    expect(denied.status()).toBe(401);
    await page.goto(`${server.url}/login`); await page.locator('#username').fill('existing_owner'); await page.locator('#password').fill('existing-password');
    await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).toHaveURL(`${server.url}/`);
    expect((await page.request.get(`${server.url}/api/admin/users`)).status()).toBe(200);
    const reader = new Database(dbPath, { readonly: true });
    try {
      expect(reader.prepare('SELECT id, username, password_hash FROM users').all()).toEqual([{ id: 'existing', username: 'existing_owner', password_hash: passwordHash }]);
    } finally { reader.close(); }
    expect(server.output()).not.toContain('INITIAL ADMIN CREDENTIALS');
    expect(server.output()).not.toContain('environment-password');
  } finally { if (server) await server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('empty administrator username configuration uses the default admin identity', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-default-startup-')), dbPath = join(directory, 'default.db');
  let server: Awaited<ReturnType<typeof start>> | undefined;
  try {
    server = await start(dbPath, 'default-password', '');
    await page.goto(`${server.url}/login`); await page.locator('#username').fill('admin'); await page.locator('#password').fill('default-password');
    await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).toHaveURL(`${server.url}/`);
    const reader = new Database(dbPath, { readonly: true });
    try { expect(reader.prepare('SELECT username, role FROM users').all()).toEqual([{ username: 'admin', role: 'admin' }]); }
    finally { reader.close(); }
    expect(server.output()).not.toContain('default-password');
  } finally { if (server) await server.stop(); await rm(directory, { recursive: true, force: true }); }
});
