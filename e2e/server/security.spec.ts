import { MCP_TOOL_NAMES } from '../helpers/mcp-catalog';
import { historicalBackup } from '../helpers/historical-db';
import { holdCollaborationOperations } from '../helpers/collab-gate';
import type { Column, ERDSchema } from '../../src/lib/types/erd';
import * as XLSX from 'xlsx';
import { delayDomainRead } from '../helpers/domain-upload';
import { startLdapProvider } from '../helpers/ldap-provider';
import { startOidcProvider } from '../helpers/oidc-provider';
import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from 'playwright/test';

type Account = { id: string; username: string; password: string };
type Resources = {
  admin: APIRequestContext;
  user: () => Promise<Account>;
  session: (account: Account) => Promise<Page>;
  anonymous: (options?: { ignoreHTTPSErrors?: boolean }) => Promise<Page>;
  group: () => Promise<{ id: string; name: string }>;
  dictionary: () => Promise<{ id: string; name: string }>;
  project: () => Promise<{ id: string; name: string; schema: ReturnType<typeof sampleSchema> }>;
};
let adminState: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined;

// Respect the real login limiter when running after the existing auth suite.
// Retry only 429; an unexpected auth response must fail immediately.
async function login(request: APIRequestContext, username: string, password: string, status = 200) {
  let actual = 0;
  await expect.poll(async () => {
    actual = (await request.post('/api/auth/login', { data: { username, password } })).status();
    return actual;
  }, { timeout: 70_000, intervals: [5_000] }).not.toBe(429);
  expect(actual).toBe(status);
}

// LDAP uses its own real per-IP limiter; wait only for HTTP 429.
async function ldapLoginResponse(request: APIRequestContext, data: Record<string, unknown>, requestTimeout = 30_000) {
  let response: Awaited<ReturnType<APIRequestContext['post']>> | undefined;
  await expect.poll(async () => {
    response = await request.post('/api/auth/ldap/login', { data, timeout: requestTimeout });
    return response.status();
  }, { timeout: 70_000, intervals: [5_000] }).not.toBe(429);
  return response!;
}

function sampleSchema() {
  return {
    version: '1', tables: [{ id: 'users', name: 'users', columns: [{ id: 'id', name: 'id', type: 'INT', primaryKey: true, nullable: false, unique: true, autoIncrement: false }], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 100, y: 100 } }],
    domains: [], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const test = base.extend<{ resources: Resources }>({
  resources: async ({ playwright, baseURL, browser }, use) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
    if (!adminState) {
      await login(admin, 'e2e-admin', 'e2e-password');
      adminState = await admin.storageState();
    }
    const users: string[] = [];
    const groups: string[] = [];
    const dictionaries: string[] = [];
    const projects: string[] = [];
    const contexts: BrowserContext[] = [];
    const anonymous = async (options?: { ignoreHTTPSErrors?: boolean }) => {
      const context = await browser.newContext(options);
      contexts.push(context);
      return context.newPage();
    };
    const originalIndexResponse = await admin.get('/api/storage/index');
    const originalIndex = originalIndexResponse.ok() ? await originalIndexResponse.json() : { version: '1', activeProjectId: '', projects: [] };
    try {
      await use({
        admin,
        user: async () => {
          const username = `e2e-security-${randomUUID()}`;
          const password = 'initial-password';
          const response = await admin.post('/api/admin/users', { data: { username, displayName: username, password, role: 'user' } });
          expect(response.status()).toBe(201);
          const { id } = await response.json();
          users.push(id);
          return { id, username, password };
        },
        session: async (account) => {
          const page = await anonymous();
          await login(page.request, account.username, account.password);
          return page;
        },
        anonymous,
        group: async () => {
          const name = `e2e-security-group-${randomUUID()}`;
          const response = await admin.post('/api/admin/groups', { data: { name } });
          expect(response.status()).toBe(201);
          const { id } = await response.json();
          groups.push(id);
          return { id, name };
        },
        dictionary: async () => {
          const name = `E2E naming ${randomUUID()}`;
          const response = await admin.post('/api/dictionaries', { data: { name } });
          expect(response.status()).toBe(201);
          const { id } = await response.json();
          dictionaries.push(id);
          return { id, name };
        },
        project: async () => {
          const id = randomUUID().replaceAll('-', '').slice(0, 8);
          const name = `Security project ${id}`;
          const response = await admin.get('/api/storage/index');
          const index = response.ok() ? await response.json() : originalIndex;
          const now = new Date().toISOString();
          expect((await admin.put('/api/storage/index', { data: { ...index, activeProjectId: id, projects: [...index.projects, { id, name, createdAt: now, updatedAt: now }] } })).ok()).toBeTruthy();
          projects.push(id);
          const schema = sampleSchema();
          expect((await admin.put(`/api/storage/schemas/${id}`, { data: schema })).ok()).toBeTruthy();
          return { id, name, schema };
        },
      });
    } finally {
      for (const context of contexts) await context.close();
      for (const id of projects) expect((await admin.delete(`/api/storage/schemas/${id}`)).ok()).toBeTruthy();
      if (projects.length) expect((await admin.put('/api/storage/index', { data: originalIndex })).ok()).toBeTruthy();
      for (const id of dictionaries) {
        while (true) {
          const data = await admin.get(`/api/dictionary?dictionaryId=${id}&limit=200`).then(r => r.json());
          if (!data.words.length) break;
          for (const word of data.words) expect((await admin.delete(`/api/dictionary/${word.id}`)).ok()).toBeTruthy();
        }
        expect((await admin.delete(`/api/dictionaries/${id}`)).ok()).toBeTruthy();
      }
      for (const id of groups) expect((await admin.delete(`/api/admin/groups/${id}`)).ok()).toBeTruthy();
      for (const id of users) expect((await admin.delete(`/api/admin/users/${id}`)).ok()).toBeTruthy();
      await admin.dispose();
    }
  },
});

test.setTimeout(150_000);

test('password UI validates input, rotates the current session and revokes other sessions', async ({ resources }) => {
  const account = await resources.user();
  const page = await resources.session(account);
  const other = await resources.session(account);
  await page.goto('/');
  const originalCookie = (await page.context().cookies()).find((c) => c.name === 'erdmini_session')!.value;
  await page.getByTestId('user-menu-toggle').click();
  await page.getByRole('menuitem', { name: 'Change Password', exact: true }).click();
  const modal = page.locator('.cp-modal');
  await modal.getByLabel('Current Password', { exact: true }).fill(account.password);
  await modal.getByLabel('New Password', { exact: true }).fill('abc');
  await modal.getByLabel('Confirm New Password', { exact: true }).fill('abc');
  await modal.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(modal.locator('.cp-error')).toHaveText('Password must be at least 4 characters');
  await modal.getByLabel('New Password', { exact: true }).fill('replacement-password');
  await modal.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(modal.locator('.cp-error')).toHaveText('Passwords do not match');
  await modal.getByLabel('Confirm New Password', { exact: true }).fill('replacement-password');
  await modal.getByLabel('Current Password', { exact: true }).fill('incorrect-current');
  await modal.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(modal.locator('.cp-error')).toHaveText('Current password is incorrect');
  expect((await other.request.get('/api/storage/shared')).status()).toBe(200);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal).toBeHidden();
  await page.getByTestId('user-menu-toggle').click();
  await page.getByRole('menuitem', { name: 'Change Password', exact: true }).click();
  await expect(modal.getByLabel('New Password', { exact: true })).toHaveValue('');
  await modal.getByLabel('Current Password', { exact: true }).fill(account.password);
  await modal.getByLabel('New Password', { exact: true }).fill('replacement-password');
  await modal.getByLabel('Confirm New Password', { exact: true }).fill('replacement-password');
  await modal.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(modal.locator('.cp-success')).toHaveText('Password changed successfully');
  expect((await page.context().cookies()).find((c) => c.name === 'erdmini_session')!.value).not.toBe(originalCookie);
  expect((await page.request.get('/api/storage/shared')).status()).toBe(200);
  expect((await other.request.get('/api/storage/shared')).status()).toBe(401);
  await other.goto('/');
  await expect(other).toHaveURL(/\/login$/);
  await login(other.request, account.username, account.password, 401);
  await login(other.request, account.username, 'replacement-password');
  await other.goto('/');
  await expect(other.getByTestId('user-menu-toggle')).toBeVisible();
});

test('administrator password reset revokes all existing user sessions', async ({ resources }) => {
  const account = await resources.user();
  const page = await resources.session(account);
  const other = await resources.session(account);
  expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { password: 'reset-password' } })).ok()).toBeTruthy();
  expect((await page.request.get('/api/storage/shared')).status()).toBe(401);
  expect((await other.request.get('/api/storage/shared')).status()).toBe(401);
  expect((await resources.admin.get('/api/admin/users')).status()).toBe(200);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await login(page.request, account.username, account.password, 401);
  await login(page.request, account.username, 'reset-password');
  expect((await page.request.get('/api/storage/shared')).status()).toBe(200);
});

test('pending accounts cannot log in and reapproval does not revive their old sessions', async ({ resources }) => {
  const account = await resources.user();
  const page = await resources.session(account);
  const other = await resources.session(account);
  expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { status: 'pending' } })).ok()).toBeTruthy();
  // Do not touch the old session until reapproval: revocation must be immediate,
  // rather than relying on a blocked user's next request to remove sessions.
  const anonymous = await resources.anonymous();
  await login(anonymous.request, account.username, account.password, 403);
  expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { status: 'active' } })).ok()).toBeTruthy();
  expect((await page.request.get('/api/storage/shared')).status()).toBe(401);
  expect((await other.request.get('/api/storage/shared')).status()).toBe(401);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await login(page.request, account.username, account.password);
  expect((await page.request.get('/api/storage/shared')).status()).toBe(200);
});

test('group membership controls viewer/editor access and direct shares use the highest effective permission', async ({ resources }) => {
  const account = await resources.user();
  const group = await resources.group();
  const project = await resources.project();
  const page = await resources.session(account);
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const groupUrl = `/api/storage/projects/${project.id}/permissions/groups`;
  const directUrl = `/api/storage/projects/${project.id}/permissions`;
  expect((await page.request.get(schemaUrl)).status()).toBe(403);
  expect((await resources.admin.post(groupUrl, { data: { groupId: group.id, permission: 'viewer' } })).status()).toBe(201);
  expect((await page.request.get(schemaUrl)).status()).toBe(403);
  expect((await resources.admin.post(`/api/admin/groups/${group.id}/members`, { data: { userId: account.id } })).status()).toBe(201);
  expect((await page.request.get(schemaUrl)).status()).toBe(200);
  expect((await page.request.put(schemaUrl, { data: project.schema })).status()).toBe(403);
  await page.goto('/');
  await expect(page.getByTestId('readonly-badge')).toBeVisible();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect(page.locator('.toolbar .btn-primary')).toBeDisabled();
  const localeWrites: string[] = [];
  const recordWrite = (request: import('playwright/test').Request) => {
    if (request.method() === 'PUT' && request.url().includes('/api/storage/')) localeWrites.push(request.url());
  };
  page.on('request', recordWrite);
  await page.locator('.btn-lang').click();
  await page.getByRole('menuitem', { name: '日本語', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('readonly-badge')).toBeVisible();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await page.locator('.btn-lang').click();
  await page.getByRole('menuitem', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  expect(localeWrites).toEqual([]);
  page.off('request', recordWrite);
  expect((await page.request.post(groupUrl, { data: { groupId: group.id, permission: 'owner' } })).status()).toBe(403);
  expect((await resources.admin.post(directUrl, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
  expect((await resources.admin.post(groupUrl, { data: { groupId: group.id, permission: 'editor' } })).ok()).toBeTruthy();
  const shared = await page.request.get('/api/storage/shared');
  expect((await shared.json()).filter((p: { projectId: string }) => p.projectId === project.id)).toEqual([
    expect.objectContaining({ permission: 'editor', projectName: project.name }),
  ]);
  await page.reload();
  await expect(page.getByTestId('readonly-badge')).toBeHidden();
  await expect(page.locator('.toolbar .btn-primary')).toBeEnabled();
  expect((await page.request.put(schemaUrl, { data: project.schema })).status()).toBe(200);
  expect((await page.request.delete(schemaUrl)).status()).toBe(403);
  expect((await resources.admin.delete(`/api/admin/groups/${group.id}/members`, { data: { userId: account.id } })).ok()).toBeTruthy();
  expect((await page.request.get(schemaUrl)).status()).toBe(200);
  expect((await page.request.put(schemaUrl, { data: project.schema })).status()).toBe(403);
  expect((await resources.admin.delete(directUrl, { data: { userId: account.id } })).ok()).toBeTruthy();
  expect((await page.request.get(schemaUrl)).status()).toBe(403);
  expect((await resources.admin.post(`/api/admin/groups/${group.id}/members`, { data: { userId: account.id } })).status()).toBe(201);
  expect((await page.request.put(schemaUrl, { data: project.schema })).status()).toBe(200);
  expect((await resources.admin.delete(groupUrl, { data: { groupId: group.id } })).ok()).toBeTruthy();
  expect((await page.request.get(schemaUrl)).status()).toBe(403);
});

test('overlapping group shares appear once with the highest effective permission', async ({ resources }) => {
  const account = await resources.user();
  const page = await resources.session(account);
  const project = await resources.project();
  for (const permission of ['editor', 'viewer']) {
    const group = await resources.group();
    expect((await resources.admin.post(`/api/admin/groups/${group.id}/members`, { data: { userId: account.id } })).status()).toBe(201);
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId: group.id, permission } })).status()).toBe(201);
  }
  const shared = await page.request.get('/api/storage/shared');
  expect((await shared.json()).filter((p: { projectId: string }) => p.projectId === project.id)).toEqual([
    expect.objectContaining({ permission: 'editor', projectName: project.name }),
  ]);
  await page.goto('/');
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect(page.getByTestId('readonly-badge')).toBeHidden();
  await expect(page.locator('.toolbar .btn-primary')).toBeEnabled();
});

test('MCP API key scopes restrict reads and writes, update immediately and cannot outlive project access', async ({ resources }) => {
  const account = await resources.user();
  const page = await resources.session(account);
  const first = await resources.project();
  const second = await resources.project();
  for (const project of [first, second]) {
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, {
      data: { userId: account.id, permission: 'editor' },
    })).status()).toBe(201);
  }
  const created = await page.request.post('/api/my/api-keys', {
    data: { name: 'Scoped E2E key', scopes: [{ projectId: first.id, permission: 'viewer' }] },
  });
  expect(created.status()).toBe(201);
  const key = await created.json() as { id: string; key: string };
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await page.request.post('/mcp', {
      headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    return body.result as { isError?: boolean; content: Array<{ type: string; text: string }> };
  };
  const visible = await call('list_projects', {});
  expect(JSON.parse(visible.content[0].text).map((p: { id: string }) => p.id)).toEqual([first.id]);
  expect(JSON.parse(visible.content[0].text)[0]).toMatchObject({ id: first.id, name: first.name });
  expect(typeof JSON.parse(visible.content[0].text)[0].updatedAt).toBe('string');
  expect(visible.content[0].text).not.toContain(second.id);
  const read = await call('get_schema', { projectId: first.id });
  expect(read.isError).not.toBe(true);
  expect(JSON.parse(read.content[0].text)).toEqual(first.schema);
  expect((await call('get_schema', { projectId: second.id })).isError).toBe(true);
  expect((await call('add_table', { projectId: first.id, name: 'forbidden_write' })).isError).toBe(true);
  expect((await page.request.get(`/api/storage/schemas/${first.id}`).then((r) => r.json())).tables).toHaveLength(1);

  expect((await page.request.patch(`/api/my/api-keys/${key.id}`, {
    data: { scopes: [{ projectId: first.id, permission: 'editor' }] },
  })).ok()).toBeTruthy();
  expect((await call('add_table', { projectId: first.id, name: 'allowed_write' })).isError).not.toBe(true);
  expect((await page.request.get(`/api/storage/schemas/${first.id}`).then((r) => r.json())).tables.map((t: { name: string }) => t.name)).toEqual(['users', 'allowed_write']);

  expect((await page.request.patch(`/api/my/api-keys/${key.id}`, {
    data: { scopes: [{ projectId: second.id, permission: 'viewer' }] },
  })).ok()).toBeTruthy();
  expect((await call('get_schema', { projectId: first.id })).isError).toBe(true);
  expect((await call('get_schema', { projectId: second.id })).isError).not.toBe(true);
  expect((await call('add_table', { projectId: second.id, name: 'forbidden_write' })).isError).toBe(true);
  expect((await resources.admin.delete(`/api/storage/projects/${second.id}/permissions`, { data: { userId: account.id } })).ok()).toBeTruthy();
  expect((await call('get_schema', { projectId: second.id })).isError).toBe(true);
  const revokedList = await call('list_projects', {});
  expect(JSON.parse(revokedList.content[0].text)).toEqual([]);
  expect((await page.request.delete(`/api/my/api-keys/${key.id}`)).ok()).toBeTruthy();
  expect((await page.request.post('/mcp', {
    headers: { Authorization: `Bearer ${key.key}` },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })).status()).toBe(403);
});

test('locale changes wait for an in-flight save and persist the latest editor changes', async ({ resources }) => {
  const project = await resources.project();
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const initialized = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/storage/index'));
  await page.goto('/');
  await initialized;
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await page.getByTestId('table-card').click();
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(`**/api/storage/schemas/${project.id}`, async (route) => {
    if (route.request().method() === 'PUT' && route.request().postDataJSON().tables[0].name === 'first_pending_save' && !held) {
      held = true;
      await released;
    }
    await route.continue();
  });
  try {
    await page.getByTestId('table-name-input').fill('first_pending_save');
    await page.getByTestId('table-name-input').press('Enter');
    await expect.poll(() => held).toBe(true);
    await page.getByTestId('table-name-input').fill('latest_before_locale');
    await page.locator('.btn-lang').click();
    await page.getByRole('menuitem', { name: '日本語', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    release();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.getByTestId('table-card')).toContainText('latest_before_locale');
    await page.reload();
    await expect(page.getByTestId('table-card')).toContainText('latest_before_locale');
  } finally {
    release();
  }
});

test('failed locale saves preserve edits and the current language until a successful retry', async ({ resources }) => {
  const project = await resources.project();
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const initialized = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/storage/index'));
  await page.goto('/');
  await initialized;
  await page.getByTestId('table-card').click();
  const schemaUrl = `**/api/storage/schemas/${project.id}`;
  await page.route(schemaUrl, async (route) => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated unavailable storage' }) });
    else await route.continue();
  });
  await page.getByTestId('table-name-input').fill('retry_preserves_edit');
  await page.locator('.btn-lang').click();
  await page.getByRole('menuitem', { name: '日本語', exact: true }).click();
  await expect(page.locator('.storage-banner')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('table-card')).toContainText('retry_preserves_edit');
  expect((await resources.admin.get(`/api/storage/schemas/${project.id}`).then((r) => r.json())).tables[0].name).toBe('users');
  await page.unroute(schemaUrl);
  await page.getByRole('menuitem', { name: '日本語', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('table-card')).toContainText('retry_preserves_edit');
  await expect(page.locator('.storage-banner')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('table-card')).toContainText('retry_preserves_edit');
});

test('pan and zoom persist only canvas state without rewriting the shared schema', async ({ resources }) => {
  const project = await resources.project();
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const initialized = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/storage/index'));
  await page.goto('/');
  await initialized;
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const originalSchema = await resources.admin.get(schemaUrl).then((r) => r.json());
  const schemaWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith(schemaUrl)) schemaWrites.push(request.url());
  });
  await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowRight');
  const matrix = await page.locator('.canvas-world').evaluate((node) => {
    const transform = new DOMMatrix(getComputedStyle(node).transform);
    return { x: transform.m41, y: transform.m42, scale: transform.a };
  });
  await expect.poll(async () => {
    const response = await resources.admin.get(`/api/storage/canvas/${project.id}`);
    if (!response.ok()) return Infinity;
    const saved = await response.json();
    return Math.max(Math.abs(saved.x - matrix.x), Math.abs(saved.y - matrix.y), Math.abs(saved.scale - matrix.scale));
  }).toBeLessThan(0.00001);
  expect(schemaWrites).toEqual([]);
  expect(await resources.admin.get(schemaUrl).then((r) => r.json())).toEqual(originalSchema);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.reload();
  await expect(page.locator('.zoom-pct')).toHaveText('110%');
});

test('deleting a project waits for pending saves so delayed writes cannot recreate deleted data', async ({ resources }) => {
  const survivor = await resources.project();
  const deleted = await resources.project();
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const initialized = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/storage/index'));
  await page.goto('/');
  await initialized;
  await expect(page.getByTestId('project-menu-toggle')).toContainText(deleted.name);
  await page.getByTestId('table-card').click();
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  let writeFinished = false;
  let prematureDelete = false;
  const schemaUrl = `/api/storage/schemas/${deleted.id}`;
  page.on('response', (response) => {
    if (response.request().method() === 'PUT' && response.url().endsWith(schemaUrl)) writeFinished = true;
  });
  await page.route(`**${schemaUrl}`, async (route) => {
    if (route.request().method() === 'PUT' && !held) {
      held = true;
      await released;
    }
    if (route.request().method() === 'DELETE' && !writeFinished) prematureDelete = true;
    await route.continue();
  });
  try {
    await page.getByTestId('table-name-input').fill('delayed_save_before_delete');
    await page.getByTestId('table-name-input').press('Enter');
    await expect.poll(() => held).toBe(true);
    await page.getByTestId('project-menu-toggle').click();
    await page.locator('.project-item.active').hover();
    await page.locator('.project-item.active').getByTestId('project-delete').click();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    release();
    await expect(page.getByTestId('project-menu-toggle')).not.toContainText(deleted.name);
    await expect.poll(() => writeFinished).toBe(true);
    expect(prematureDelete).toBe(false);
    await expect.poll(async () => (await resources.admin.get(schemaUrl)).status()).toBe(404);
    await expect.poll(async () => (await resources.admin.get(`/api/storage/canvas/${deleted.id}`)).status()).toBe(404);
    expect((await resources.admin.get(`/api/storage/schemas/${survivor.id}`)).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('project-menu-toggle')).not.toContainText(deleted.name);
    await page.getByTestId('project-menu-toggle').click();
    await expect(page.locator('.project-item-label').filter({ hasText: deleted.name })).toHaveCount(0);
  } finally { release(); }
});

test('invalid personal key scopes are rejected atomically instead of creating or widening unrestricted keys', async ({ resources }) => {
  const account = await resources.user();
  const page = await resources.session(account);
  const first = await resources.project();
  const second = await resources.project();
  expect((await resources.admin.post(`/api/storage/projects/${first.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).ok()).toBeTruthy();
  const allowed = [{ projectId: first.id, permission: 'viewer' }];
  const created = await page.request.post('/api/my/api-keys', { data: { name: 'Restricted baseline', scopes: allowed } });
  expect(created.status()).toBe(201);
  const key = await created.json();
  const baseline = await page.request.get('/api/my/api-keys').then(r => r.json());
  const invalidScopes = [null, {}, [null], [{ projectId: '', permission: 'viewer' }], [{ projectId: 42, permission: 'viewer' }], [{ projectId: first.id, permission: 'owner' }], [{ projectId: first.id, permission: 'editor' }], [{ projectId: second.id, permission: 'viewer' }], [...allowed, { projectId: second.id, permission: 'viewer' }], [...allowed, ...allowed]];
  for (const scopes of invalidScopes) {
    expect((await page.request.post('/api/my/api-keys', { data: { name: 'Must not create', scopes } })).status()).toBe(400);
    expect((await page.request.patch(`/api/my/api-keys/${key.id}`, { data: { scopes } })).status()).toBe(400);
    expect(await page.request.get('/api/my/api-keys').then(r => r.json())).toEqual(baseline);
  }
  const response = await page.request.post('/mcp', {
    headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(JSON.parse(result.result.content[0].text).map((p: { id: string }) => p.id)).toEqual([first.id]);
});

test('ownership handover preserves data, revokes former owner administration and protects the last owner', async ({ resources }) => {
  const former = await resources.user();
  const successor = await resources.user();
  const formerPage = await resources.session(former);
  const successorPage = await resources.session(successor);
  const project = await resources.project();
  const url = `/api/storage/projects/${project.id}/permissions`;
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.post(url, { data: { userId: former.id, permission: 'owner' } })).status()).toBe(201);
  const shares = await resources.admin.get(url).then(r => r.json());
  const adminOwner = shares.permissions.find((p: { userId: string; permission: string }) => p.permission === 'owner' && p.userId !== former.id);
  expect(adminOwner).toBeTruthy();
  expect((await formerPage.request.delete(url, { data: { userId: adminOwner.userId } })).status()).toBe(200);
  expect((await resources.admin.post(url, { data: { userId: former.id, permission: 'editor' } })).status()).toBe(400);
  expect((await resources.admin.delete(url, { data: { userId: former.id } })).status()).toBe(400);
  expect((await successorPage.request.get(schemaUrl)).status()).toBe(403);
  expect((await formerPage.request.post(url, { data: { userId: successor.id, permission: 'owner' } })).status()).toBe(201);
  expect((await successorPage.request.post(url, { data: { userId: former.id, permission: 'editor' } })).status()).toBe(200);
  expect(await formerPage.request.get(`/api/storage/projects/${project.id}/my-permission`).then(r => r.json())).toEqual({ permission: 'editor' });
  expect(await successorPage.request.get(`/api/storage/projects/${project.id}/my-permission`).then(r => r.json())).toEqual({ permission: 'owner' });
  expect((await formerPage.request.post(url, { data: { userId: successor.id, permission: 'viewer' } })).status()).toBe(403);
  expect((await formerPage.request.delete(url, { data: { userId: successor.id } })).status()).toBe(403);
  expect((await formerPage.request.delete(schemaUrl)).status()).toBe(403);
  expect((await formerPage.request.put(schemaUrl, { data: project.schema })).status()).toBe(200);
  expect((await resources.admin.delete(url, { data: { userId: successor.id } })).status()).toBe(400);
  expect(await successorPage.request.get(schemaUrl).then(r => r.json())).toEqual(project.schema);
  expect((await successorPage.request.delete(url, { data: { userId: former.id } })).status()).toBe(200);
  expect((await formerPage.request.get(schemaUrl)).status()).toBe(403);
  expect((await formerPage.request.put(schemaUrl, { data: project.schema })).status()).toBe(403);
  expect((await successorPage.request.delete(schemaUrl)).status()).toBe(200);
  expect((await resources.admin.get(schemaUrl)).status()).toBe(404);
});

test('unknown embed tokens return a public error without exposing schema data', async ({ resources }) => {
  const page = await resources.anonymous();
  const token = '0'.repeat(64);
  const url = `/api/embed/view/${token}`;
  const response = await page.request.get(url);
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: 'Token expired or not found' });
  expect((await page.request.post(url, { data: { password: 'anything' } })).status()).toBe(403);
  await page.goto(`/embed/${token}`);
  await expect(page.locator('.embed-error')).toContainText('This embed link has expired or been deleted.');
  await expect(page.locator('.embed-app')).toHaveCount(0);
  await expect(page.locator('.embed-password')).toHaveCount(0);
});

test('expired plain and password-protected embeds deny API and browser access', async ({ resources }) => {
  const project = await resources.project();
  const page = await resources.anonymous();
  for (const password of [undefined, 'expired-secret']) {
    const created = await resources.admin.post(`/api/embed/${project.id}`, { data: { expiresInDays: 0, password } });
    expect(created.status()).toBe(201);
    const token = await created.json();
    expect(Date.parse(token.expiresAt)).toBeLessThanOrEqual(Date.now());
    const url = `/api/embed/view/${token.token}`;
    await expect.poll(async () => (await page.request.get(url)).status()).toBe(403);
    if (password) expect((await page.request.post(url, { data: { password } })).status()).toBe(403);
    await page.goto(`/embed/${token.token}`);
    await expect(page.locator('.embed-error')).toBeVisible();
    await expect(page.locator('.embed-password')).toHaveCount(0);
    await expect(page.getByTestId('table-card')).toHaveCount(0);
  }
  expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
});

test('public embed is read-only and its token cannot authorize storage or embed administration writes', async ({ resources }) => {
  const project = await resources.project();
  const canvas = { x: 0, y: 0, scale: 1 };
  expect((await resources.admin.put(`/api/storage/canvas/${project.id}`, { data: canvas })).ok()).toBeTruthy();
  const created = await resources.admin.post(`/api/embed/${project.id}`, { data: { expiresInDays: 1 } });
  expect(created.status()).toBe(201);
  const { token, id } = await created.json();
  const page = await resources.anonymous();
  const result = await page.request.get(`/api/embed/view/${token}`).then(r => r.json());
  expect(result.schema).toEqual(project.schema);
  expect(result.canvasState).toEqual(canvas);
  expect(result.projectName).toBe(project.name);
  await page.goto(`/embed/${token}`);
  await expect(page.locator('.embed-app')).toBeVisible();
  await expect(page.locator('.embed-badge')).toContainText(/view only/i);
  const table = page.getByTestId('table-card');
  await table.click();
  await table.dblclick();
  await expect(page.getByTestId('table-editor')).toHaveCount(0);
  await expect(page.getByTestId('column-edit-popup')).toHaveCount(0);
  await expect(page.getByTestId('delete-table')).toHaveCount(0);
  await page.keyboard.press('Delete');
  await page.keyboard.press('ControlOrMeta+d');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table).toHaveCount(1);
  const headers = { Authorization: `Bearer ${token}` };
  for (const path of [`/api/storage/schemas/${project.id}`, `/api/storage/canvas/${project.id}`]) {
    expect((await page.request.put(path, { headers, data: project.schema })).status()).toBe(401);
    expect((await page.request.delete(path, { headers })).status()).toBe(401);
  }
  expect((await page.request.post(`/api/embed/${project.id}`, { headers, data: {} })).status()).toBe(401);
  expect((await page.request.delete(`/api/embed/${project.id}`, { headers, data: { tokenId: id } })).status()).toBe(401);
  expect((await page.request.put(`/api/embed/view/${token}`, { data: project.schema })).status()).toBe(405);
  expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
  expect(await resources.admin.get(`/api/storage/canvas/${project.id}`).then(r => r.json())).toEqual(canvas);
  expect((await page.request.get(`/api/embed/view/${token}`)).status()).toBe(200);
  expect((await resources.admin.delete(`/api/embed/${project.id}`, { data: { tokenId: id } })).status()).toBe(200);
  expect((await page.request.get(`/api/embed/view/${token}`)).status()).toBe(403);
  await page.reload();
  await expect(page.locator('.embed-error')).toBeVisible();
  await expect(page.locator('.embed-app')).toHaveCount(0);
});

test('embed password validation rejects malformed input and successful viewing does not create a login session', async ({ resources }) => {
  const project = await resources.project();
  const created = await resources.admin.post(`/api/embed/${project.id}`, { data: { password: 'view-secret' } });
  expect(created.status()).toBe(201);
  const { token } = await created.json();
  const page = await resources.anonymous();
  const url = `/api/embed/view/${token}`;
  const initial = await page.request.get(url);
  expect(initial.status()).toBe(401);
  expect(await initial.json()).toEqual({ requiresPassword: true });
  expect((await page.request.post(url, { data: Buffer.from('{broken'), headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  expect((await page.request.post(url, { data: {} })).status()).toBe(401);
  expect((await page.request.post(url, { data: Buffer.from('null'), headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  expect((await page.request.post(url, { data: { password: {} } })).status()).toBe(400);
  const success = await page.request.post(url, { data: { password: 'view-secret' } });
  expect(success.status()).toBe(200);
  expect((await success.json()).schema).toEqual(project.schema);
  expect((await page.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(401);
  expect((await page.request.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(401);
  expect((await page.request.get(url)).status()).toBe(401);
  expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
});

test('viewer UI blocks keyboard and pointer mutations of tables, memos, SQL objects and domains without schema writes', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schema = {
    ...project.schema,
    domains: [{ id: 'read_domain', name: 'readonly_domain', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false }],
    memos: [{ id: 'readonly_note', content: 'Original note', position: { x: 420, y: 180 }, width: 180, height: 100 }],
    dbObjectCategories: ['Views'],
    dbObjects: [{ id: 'readonly_view', name: 'users_view', category: 'Views', sql: 'SELECT id FROM users;', comment: 'Original comment', includeInDdl: true }],
  };
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
  const page = await resources.session(account);
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().endsWith(schemaUrl)) writes.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('readonly-badge')).toBeVisible();
  const table = page.getByTestId('table-card');
  await table.click();
  const editor = page.getByTestId('table-editor');
  await expect(editor.locator('.readonly-notice')).toBeVisible();
  // A pointer-events overlay alone must not leave these keyboard-editable.
  await expect(page.getByTestId('table-name-input')).toBeDisabled();
  await expect(editor.locator('#tbl-comment')).toBeDisabled();
  await expect(page.getByTestId('add-column')).toBeDisabled();
  await expect(page.getByTestId('add-foreign-key')).toBeDisabled();
  await expect(page.getByTestId('delete-table')).toHaveCount(0);
  const before = await table.boundingBox();
  await table.locator('.table-header').dragTo(page.locator('.canvas-viewport'), { targetPosition: { x: 600, y: 450 } });
  const after = await table.boundingBox();
  expect(after?.x).toBeCloseTo(before!.x, 1);
  expect(after?.y).toBeCloseTo(before!.y, 1);
  await page.keyboard.press('Delete');
  await page.keyboard.press('ControlOrMeta+d');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table).toHaveCount(1);
  const memo = page.getByTestId('memo-card');
  await memo.locator('.memo-content').dblclick();
  await expect(memo.locator('textarea')).toHaveCount(0);
  await expect(memo.getByTestId('delete-memo')).toHaveCount(0);
  await expect(memo.locator('.resize-handle')).toHaveCount(0);
  await expect(memo.locator('.memo-colors')).toHaveCount(0);
  const memoBefore = await memo.boundingBox();
  await memo.locator('.memo-header').dragTo(page.locator('.canvas-viewport'), { targetPosition: { x: 500, y: 450 } });
  const memoAfter = await memo.boundingBox();
  expect(memoAfter?.x).toBeCloseTo(memoBefore!.x, 1);
  expect(memoAfter?.y).toBeCloseTo(memoBefore!.y, 1);
  await page.getByRole('button', { name: /objects 1/i }).click();
  await expect(page.locator('.cat-add-btn, .cat-action-btn, .object-delete-btn, .add-category-row')).toHaveCount(0);
  await page.locator('.object-item').click();
  const objectEditor = page.locator('.db-object-editor');
  for (const id of ['dbo-name', 'dbo-comment', 'dbo-category']) await expect(objectEditor.locator(`#${id}`)).toBeDisabled();
  await expect(objectEditor.locator('.ddl-toggle input')).toBeDisabled();
  const sql = objectEditor.locator('.cm-content');
  await expect(sql).toHaveAttribute('contenteditable', 'false');
  await sql.click();
  await page.keyboard.type('forbidden SQL');
  await expect(sql).toContainText('SELECT id FROM users;');
  await expect(sql).not.toContainText('forbidden SQL');
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
  const domains = page.locator('.backdrop[role="dialog"]');
  await expect(domains.locator('.add-btn')).toHaveCount(0);
  await expect(domains.locator('tr.display-row button.del')).toHaveCount(0);
  await expect(domains.getByRole('button', { name: 'Upload Excel', exact: true })).toHaveCount(0);
  await domains.locator('tr.display-row').filter({ hasText: 'readonly_domain' }).click();
  await expect(domains.locator('.edit-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('readonly-badge')).toBeVisible();
  expect(writes).toEqual([]);
  expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(schema);
});

test('admin key creation rejects malformed fields and duplicate scopes without leaving partial keys', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const list = async () => (await resources.admin.get('/api/admin/api-keys').then(r => r.json())).filter((key: { user_id: string }) => key.user_id === account.id);
  const baseline = await list();
  const scope = { projectId: project.id, permission: 'viewer' };
  const invalid = [
    { name: '' }, { name: '   ' }, { name: 123 }, { expiresAt: 'invalid-date' },
    { scopes: null }, { scopes: {} }, { scopes: [null] },
    { scopes: [{ projectId: 123, permission: 'viewer' }] },
    { scopes: [{ projectId: '', permission: 'viewer' }] },
    { scopes: [{ projectId: project.id, permission: 'superuser' }] },
    { scopes: [scope, scope] },
  ];
  for (const patch of invalid) {
    const response = await resources.admin.post('/api/admin/api-keys', { data: { name: 'Must not create', userId: account.id, ...patch } });
    expect(response.status()).toBe(400);
    expect(await list()).toEqual(baseline);
  }
  for (const body of ['null', '{broken']) {
    expect((await resources.admin.post('/api/admin/api-keys', { data: Buffer.from(body), headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  }
  expect((await resources.admin.post('/api/admin/api-keys', { data: { name: 'Unknown owner', userId: randomUUID() } })).status()).toBe(404);
  expect(await list()).toEqual(baseline);
});

test('admin key failed edits preserve name, expiry and restrictions while valid updates commit together', async ({ resources }) => {
  const account = await resources.user();
  const first = await resources.project();
  const second = await resources.project();
  const scope = { projectId: first.id, permission: 'viewer' };
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const created = await resources.admin.post('/api/admin/api-keys', { data: { name: 'Original scoped key', userId: account.id, expiresAt, scopes: [scope] } });
  expect(created.status()).toBe(201);
  const key = await created.json();
  const url = `/api/admin/api-keys/${key.id}`;
  const read = async () => (await resources.admin.get('/api/admin/api-keys').then(r => r.json())).find((k: { id: string }) => k.id === key.id);
  const original = await read();
  expect(original.key).toBeUndefined();
  expect(original.key_hash).toBeUndefined();
  for (const patch of [
    { name: 'Must not rename', expiresAt: 'invalid-date' },
    { name: 'Must not rename', expiresAt: null, scopes: [null] },
    { name: 'Must not rename', scopes: [scope, scope] },
    { name: 'Must not rename', scopes: null },
    { name: 'Must not rename', scopes: [{ projectId: second.id, permission: 'superuser' }] },
  ]) {
    expect((await resources.admin.patch(url, { data: patch })).status()).toBe(400);
    expect(await read()).toEqual(original);
  }
  for (const body of ['null', '{broken']) {
    expect((await resources.admin.patch(url, { data: Buffer.from(body), headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
    expect(await read()).toEqual(original);
  }
  expect((await resources.admin.patch(url, { data: { name: '  Updated key  ', expiresAt: null, scopes: [{ projectId: second.id, permission: 'owner' }] } })).status()).toBe(200);
  const updated = await read();
  expect(updated.name).toBe('Updated key');
  expect(updated.expires_at).toBeNull();
  expect(updated.scopes).toHaveLength(1);
  expect(updated.scopes[0]).toMatchObject({ project_id: second.id, permission: 'owner' });
  expect((await resources.admin.patch(url, { data: { scopes: [] } })).status()).toBe(200);
  expect((await read()).scopes).toEqual([]);
  expect((await resources.admin.delete(url)).status()).toBe(200);
  expect((await resources.admin.patch(url, { data: { name: 'missing' } })).status()).toBe(404);
});

test('project naming modes update validation, persist through reload and stay isolated between projects', async ({ resources }) => {
  const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
  const second = await resources.project();
  const first = await resources.project();
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const open = async () => {
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Naming Rules', exact: true }).click();
    return page.locator('.nr-panel');
  };
  const caseRule = () => page.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Table case$/ }) });
  const lint = async (caseCount: number) => {
    await page.locator('.nr-close').click();
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /^Validate/ }).click();
    await expect(page.locator('.lint-item').filter({ hasText: 'Table name violates case convention' })).toHaveCount(caseCount);
    await expect(page.locator('.lint-item').filter({ hasText: 'Table name missing required prefix' })).toHaveCount(1);
    await page.locator('.lint-close').click();
    await open();
  };
  const switchProject = async (name: string) => {
    await page.locator('.nr-close').click();
    await page.getByTestId('project-menu-toggle').click();
    await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: new RegExp(`^${name}$`) }) }).locator('.project-item-name').click();
    await open();
  };
  try {
    expect((await resources.admin.put('/api/admin/naming-rules', { data: {
      tableCase: { enabled: true, value: 'PascalCase', allowOverride: true },
      tablePrefix: { enabled: true, value: 'tbl_', allowOverride: false },
    } })).status()).toBe(200);
    await page.goto('/');
    await expect(page.getByTestId('table-card')).toContainText('users');
    await open();
    await expect(caseRule().locator('.nr-mode')).toHaveValue('inherit');
    await expect(caseRule().locator('.nr-select')).toBeDisabled();
    await expect(caseRule().locator('.nr-rule-source')).toHaveText('Inherited');
    const prefix = page.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Table prefix$/ }) });
    await expect(prefix.locator('.nr-mode, input')).toHaveCount(0);
    await expect(prefix.locator('.nr-rule-source')).toHaveText('Locked by Admin');
    await lint(1);
    await caseRule().locator('.nr-mode').selectOption('override');
    await caseRule().locator('.nr-select').selectOption('snake_case');
    await lint(0);
    await caseRule().locator('.nr-mode').selectOption('off');
    await expect(caseRule().locator('.nr-rule-source')).toHaveText('Project Disabled');
    await lint(0);
    await caseRule().locator('.nr-mode').selectOption('inherit');
    await lint(1);
    await caseRule().locator('.nr-mode').selectOption('override');
    await caseRule().locator('.nr-select').selectOption('snake_case');
    await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${first.id}`).then(r => r.json())).namingRules?.tableCase).toEqual({ value: 'snake_case', enabled: true });
    await page.reload();
    await open();
    await expect(caseRule().locator('.nr-mode')).toHaveValue('override');
    await expect(caseRule().locator('.nr-select')).toHaveValue('snake_case');
    await switchProject(second.name);
    await expect(caseRule().locator('.nr-mode')).toHaveValue('inherit');
    await lint(1);
    await switchProject(first.name);
    await expect(caseRule().locator('.nr-select')).toHaveValue('snake_case');
    await lint(0);
    expect(Object.keys((await resources.admin.get(`/api/storage/schemas/${second.id}`).then(r => r.json())).namingRules ?? {})).toEqual([]);
    expect((await resources.admin.get(`/api/storage/schemas/${first.id}`).then(r => r.json())).tables).toEqual(first.schema.tables);
  } finally {
    expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
  }
});

test('admin-locked naming rules ignore stored overrides and viewers can inspect without editing or saving', async ({ resources }) => {
  const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
  const account = await resources.user();
  const project = await resources.project();
  const schema = { ...project.schema, namingRules: { tableCase: { enabled: false, value: 'snake_case' }, columnCase: { enabled: true, value: 'PascalCase' } } };
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  try {
    expect((await resources.admin.put('/api/admin/naming-rules', { data: { tableCase: { enabled: true, value: 'PascalCase', allowOverride: false }, columnCase: { enabled: false, value: 'PascalCase', allowOverride: true } } })).status()).toBe(200);
    expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
    const page = await resources.session(account);
    const writes: string[] = [];
    page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith(schemaUrl)) writes.push(request.url()); });
    await page.goto('/');
    await expect(page.getByTestId('readonly-badge')).toBeVisible();
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Naming Rules', exact: true }).click();
    const panel = page.locator('.nr-panel');
    const row = panel.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Table case$/ }) });
    await expect(row.locator('.nr-rule-source')).toHaveText('Locked by Admin');
    await expect(row.locator('.nr-value-readonly')).toHaveText('PascalCase');
    await expect(panel.locator('input, select, .nr-reset')).toHaveCount(0);
    await expect(panel.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Column case$/ }) }).locator('.nr-rule-source')).toHaveText('Disabled');
    await panel.locator('.nr-close').click();
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /^Validate/ }).click();
    await expect(page.locator('.lint-item').filter({ hasText: 'Table name violates case convention' })).toHaveCount(1);
    await expect(page.locator('.lint-item').filter({ hasText: 'Column name violates case convention' })).toHaveCount(0);
    expect((await page.request.put('/api/admin/naming-rules', { data: {} })).status()).toBe(403);
    await page.reload();
    await expect(page.getByTestId('readonly-badge')).toBeVisible();
    expect(writes).toEqual([]);
    expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(schema);
  } finally {
    expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
  }
});

test('independent collaborators propagate edits, ordered undo/redo and deletion then rejoin with the saved schema', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  await owner.goto('/');
  await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await expect(collaborator.locator('.peer-count')).toHaveText('2');
  await owner.locator('.collab-btn').click();
  await expect(owner.locator('.peer-item:not(.self)')).toContainText(account.username);
  await owner.locator('.collab-btn').click();
  await collaborator.getByTestId('table-card').click();
  for (const name of ['shared_first_edit', 'shared_second_edit']) {
    const input = collaborator.getByTestId('table-name-input');
    await input.fill(name);
    await input.press('Enter');
    await expect(owner.getByTestId('table-card')).toContainText(name);
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe(name);
  }
  await collaborator.getByRole('button', { name: /^Undo/ }).click();
  await expect(owner.getByTestId('table-card')).toContainText('shared_first_edit');
  await collaborator.getByRole('button', { name: /^Redo/ }).click();
  await expect(owner.getByTestId('table-card')).toContainText('shared_second_edit');
  const ownerTable = owner.getByTestId('table-card');
  await ownerTable.hover();
  await ownerTable.getByTestId('delete-table').click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(collaborator.getByTestId('table-card')).toHaveCount(0);
  await expect(collaborator.getByTestId('canvas-empty-state')).toBeVisible();
  await owner.getByRole('button', { name: /^Undo/ }).click();
  await expect(collaborator.getByTestId('table-card')).toHaveCount(1);
  await expect(collaborator.getByTestId('table-card')).toContainText('shared_second_edit');
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables.map((t: { name: string }) => t.name)).toEqual(['shared_second_edit']);
  await collaborator.reload();
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await expect(collaborator.locator('.peer-count')).toHaveText('2');
  await expect(collaborator.getByTestId('table-card')).toContainText('shared_second_edit');
  await expect(collaborator.getByRole('button', { name: /^Undo/ })).toBeDisabled();
});

test('a disconnected collaborator resynchronizes missed changes on automatic WebSocket reconnect', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  let blockReconnect = false;
  let disconnect: (() => Promise<void>) | undefined;
  await collaborator.routeWebSocket('**/collab', route => {
    if (blockReconnect) { void route.close(); return; }
    const upstream = route.connectToServer();
    disconnect = async () => {
      await route.close({ code: 1012, reason: 'E2E network interruption' });
      await upstream.close();
    };
  });
  await owner.goto('/');
  await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await expect(collaborator.getByTestId('table-card')).toContainText('users');
  expect(disconnect).toBeDefined();
  blockReconnect = true;
  await disconnect!();
  await expect(owner.locator('.peer-count')).toHaveCount(0);
  await owner.getByTestId('table-card').click();
  const name = owner.getByTestId('table-name-input');
  await name.fill('changed_while_disconnected');
  await name.press('Enter');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].name).toBe('changed_while_disconnected');
  await expect(collaborator.getByTestId('table-card')).toContainText('users');
  blockReconnect = false;
  await expect(owner.locator('.peer-count')).toHaveText('2', { timeout: 15_000 });
  await expect(collaborator.getByTestId('table-card')).toContainText('changed_while_disconnected');
  await collaborator.getByTestId('table-card').click();
  await collaborator.getByTestId('table-name-input').fill('edited_after_reconnect');
  await collaborator.getByTestId('table-name-input').press('Enter');
  await expect(owner.getByTestId('table-card')).toContainText('edited_after_reconnect');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].name).toBe('edited_after_reconnect');
});

for (const trigger of ['sync-request', 'broadcast'] as const) {
  test(`revoked collaborators cannot receive schema through ${trigger} on an already-open socket`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const owner = await resources.anonymous();
    await owner.context().addCookies((await resources.admin.storageState()).cookies);
    const collaborator = await resources.session(account);
    const messages: Array<{ type: string; message?: string }> = [];
    let send: ((message: object) => void) | undefined;
    await collaborator.routeWebSocket('**/collab', route => {
      const upstream = route.connectToServer();
      send = message => upstream.send(JSON.stringify(message));
      upstream.onMessage(message => {
        messages.push(JSON.parse(String(message)));
        route.send(message);
      });
    });
    await owner.goto('/');
    await collaborator.goto('/');
    await expect(owner.locator('.peer-count')).toHaveText('2');
    await expect(collaborator.getByTestId('table-card')).toContainText('users');
    expect((await resources.admin.delete(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id } })).status()).toBe(200);
    messages.length = 0;
    if (trigger === 'sync-request') send!({ type: 'request-sync' });
    else {
      await owner.getByTestId('table-card').click();
      await owner.getByTestId('table-name-input').fill('secret_after_revocation');
      await owner.getByTestId('table-name-input').press('Enter');
    }
    await expect.poll(() => messages.some(m => m.type === 'error' && m.message === 'No access to project')).toBe(true);
    expect(messages.filter(m => ['operation', 'sync', 'mcp-sync'].includes(m.type))).toEqual([]);
    await expect(owner.locator('.peer-count')).toHaveCount(0);
    await expect(collaborator.getByTestId('table-card')).toContainText('users');
    expect((await collaborator.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(403);
    expect((await collaborator.request.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(403);
  });
}

test('a live editor downgraded to viewer cannot broadcast writes but continues receiving allowed updates', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const permissions = `/api/storage/projects/${project.id}/permissions`;
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  const messages: Array<{ type: string; message?: string }> = [];
  let send: ((message: object) => void) | undefined;
  await collaborator.routeWebSocket('**/collab', route => {
    const upstream = route.connectToServer();
    send = message => upstream.send(JSON.stringify(message));
    upstream.onMessage(message => { messages.push(JSON.parse(String(message))); route.send(message); });
  });
  await owner.goto('/');
  await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
  send!({ type: 'operation', op: { kind: 'update-table-name', tableId: 'users', name: 'forbidden_socket_write' } });
  await expect.poll(() => messages.some(m => m.type === 'error' && m.message === 'Insufficient permission')).toBe(true);
  await expect(owner.getByTestId('table-card')).toContainText('users');
  expect((await collaborator.request.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(403);
  expect((await collaborator.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
  await owner.getByTestId('table-card').click();
  await owner.getByTestId('table-name-input').fill('still_visible_to_viewer');
  await owner.getByTestId('table-name-input').press('Enter');
  await expect(collaborator.getByTestId('table-card')).toContainText('still_visible_to_viewer');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].name).toBe('still_visible_to_viewer');
});

for (const action of ['logout', 'deactivate'] as const) {
  test(`${action} invalidates an already-open collaboration socket before it can receive more schema data`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
    const owner = await resources.anonymous();
    await owner.context().addCookies((await resources.admin.storageState()).cookies);
    const participant = await resources.session(account);
    const messages: Array<{ type: string; message?: string }> = [];
    let send: ((message: object) => void) | undefined;
    await participant.routeWebSocket('**/collab', route => {
      const upstream = route.connectToServer();
      send = message => upstream.send(JSON.stringify(message));
      upstream.onMessage(message => { messages.push(JSON.parse(String(message))); route.send(message); });
    });
    await owner.goto('/');
    await participant.goto('/');
    await expect(owner.locator('.peer-count')).toHaveText('2');
    if (action === 'logout') expect((await participant.request.post('/api/auth/logout')).status()).toBe(200);
    else expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { status: 'pending' } })).status()).toBe(200);
    messages.length = 0;
    if (action === 'logout') send!({ type: 'request-sync' });
    else {
      await owner.getByTestId('table-card').click();
      await owner.getByTestId('table-name-input').fill('private_after_deactivation');
      await owner.getByTestId('table-name-input').press('Enter');
    }
    await expect.poll(() => messages.some(m => m.type === 'error' && m.message === 'Invalid session')).toBe(true);
    expect(messages.filter(m => ['operation', 'sync', 'mcp-sync'].includes(m.type))).toEqual([]);
    await expect(owner.locator('.peer-count')).toHaveCount(0);
    await expect(participant.getByTestId('table-card')).toContainText('users');
    expect((await participant.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(401);
  });
}

test('global admin demotion applies to an open socket without removing legitimate viewer access', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { role: 'admin' } })).status()).toBe(200);
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const participant = await resources.session(account);
  const messages: Array<{ type: string; message?: string }> = [];
  let send: ((message: object) => void) | undefined;
  await participant.routeWebSocket('**/collab', route => {
    const upstream = route.connectToServer();
    send = message => upstream.send(JSON.stringify(message));
    upstream.onMessage(message => { messages.push(JSON.parse(String(message))); route.send(message); });
  });
  await owner.goto('/');
  await participant.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { role: 'user' } })).status()).toBe(200);
  send!({ type: 'operation', op: { kind: 'update-table-name', tableId: 'users', name: 'forbidden_admin_write' } });
  await expect.poll(() => messages.some(m => m.type === 'error' && m.message === 'Insufficient permission')).toBe(true);
  await expect(owner.getByTestId('table-card')).toContainText('users');
  expect((await participant.request.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(403);
  await owner.getByTestId('table-card').click();
  await owner.getByTestId('table-name-input').fill('visible_after_admin_demotion');
  await owner.getByTestId('table-name-input').press('Enter');
  await expect(participant.getByTestId('table-card')).toContainText('visible_after_admin_demotion');
  await expect(owner.locator('.peer-count')).toHaveText('2');
});


test('cancelled and invalid admin restores preserve the database and authenticated session', async ({ resources }) => {
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const input = page.locator('input[type="file"][accept=".db"]');
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/admin/backup')) posts.push(request.url()); });
  await input.setInputFiles({ name: 'invalid.db', mimeType: 'application/octet-stream', buffer: Buffer.from('not a sqlite database') });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(posts).toEqual([]);
  await expect(input).toHaveValue('');
  await input.setInputFiles({ name: 'invalid.db', mimeType: 'application/octet-stream', buffer: Buffer.from('not a sqlite database') });
  await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.locator('.msg-error')).toContainText('Invalid database file');
  await expect(input).toHaveValue('');
  expect((await resources.admin.post('/api/admin/backup', { multipart: {} })).status()).toBe(400);
  expect((await resources.admin.post('/api/admin/backup', { data: { file: 'not multipart' } })).status()).toBe(400);
  expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'empty.db', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) } } })).status()).toBe(400);
  expect((await resources.admin.post('/api/admin/backup', { multipart: { file: 'text field instead of file' } })).status()).toBe(400);
  expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('not db') } } })).status()).toBe(400);
  expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(project.schema);
  expect((await resources.admin.get('/api/admin/users')).status()).toBe(200);
});

test('admin restore rejects a backup missing project_index before replacing live data', async ({ resources }) => {
  const project = await resources.project();
  const backup = await resources.admin.get('/api/admin/backup');
  expect(backup.status()).toBe(200);
  const original = await backup.body();
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-restore-e2e-'));
  const path = join(directory, 'candidate.db');
  await writeFile(path, original);
  const candidate = new Database(path);
  let damaged: Buffer;
  try { candidate.pragma('journal_mode = DELETE'); candidate.exec('DROP TABLE project_index'); damaged = candidate.serialize(); }
  finally { candidate.close(); await rm(directory, { recursive: true, force: true }); }
  let replaced = false;
  try {
    const response = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'missing-index.db', mimeType: 'application/octet-stream', buffer: damaged! } } });
    replaced = response.status() !== 400;
    expect(response.status()).toBe(400);
    expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
    expect((await resources.admin.get('/api/admin/backup?stats=1')).status()).toBe(200);
  } finally {
    // This isolated test also repairs the DB when reproducing the old unsafe restore.
    if (replaced) expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'original.db', mimeType: 'application/octet-stream', buffer: original } } })).status()).toBe(200);
  }
});

test('a downloaded database backup restores project data while keeping its captured admin session usable', async ({ resources }) => {
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const beforeIndex = await resources.admin.get('/api/storage/index').then(r => r.json());
  const response = await resources.admin.get('/api/admin/backup');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toMatch(/erdmini-backup-.*\.db/);
  const buffer = await response.body();
  const changed = structuredClone(project.schema);
  changed.tables[0].name = 'changed_after_backup';
  expect((await resources.admin.put(schemaUrl, { data: changed })).status()).toBe(200);
  expect((await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('changed_after_backup');
  const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'downloaded.db', mimeType: 'application/octet-stream', buffer } } });
  expect(restored.status()).toBe(200);
  expect(await restored.json()).toEqual({ success: true });
  expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(project.schema);
  expect(await resources.admin.get('/api/storage/index').then(r => r.json())).toEqual(beforeIndex);
  expect((await resources.admin.get('/api/admin/users')).status()).toBe(200);
  const stats = await resources.admin.get('/api/admin/backup?stats=1');
  expect(stats.status()).toBe(200);
  expect((await stats.json()).projectCount).toBeGreaterThan(0);
});

test('database restore reloads cached site settings and naming rules from the backup', async ({ resources }) => {
  const settingsUrl = '/api/admin/site-settings';
  const rulesUrl = '/api/admin/naming-rules';
  const originalSettings = await resources.admin.get(settingsUrl).then(r => r.json());
  const originalRules = await resources.admin.get(rulesUrl).then(r => r.json());
  const savedSettings = { ...originalSettings, site_name: 'Restored site' };
  const savedRules = { tablePrefix: { enabled: true, value: 'saved_', allowOverride: false } };
  try {
    expect((await resources.admin.put(settingsUrl, { data: savedSettings })).status()).toBe(200);
    expect((await resources.admin.put(rulesUrl, { data: savedRules })).status()).toBe(200);
    const backup = await resources.admin.get('/api/admin/backup');
    expect(backup.status()).toBe(200);
    const buffer = await backup.body();
    expect((await resources.admin.put(settingsUrl, { data: { site_name: 'Discarded site' } })).status()).toBe(200);
    expect((await resources.admin.put(rulesUrl, { data: {} })).status()).toBe(200);
    expect((await resources.admin.get(settingsUrl).then(r => r.json())).site_name).toBe('Discarded site');
    expect(await resources.admin.get(rulesUrl).then(r => r.json())).toEqual({});
    const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'settings.db', mimeType: 'application/octet-stream', buffer } } });
    expect(restored.status()).toBe(200);
    expect(await resources.admin.get(settingsUrl).then(r => r.json())).toEqual(savedSettings);
    expect(await resources.admin.get(rulesUrl).then(r => r.json())).toEqual(savedRules);
  } finally {
    expect((await resources.admin.put(settingsUrl, { data: originalSettings })).status()).toBe(200);
    expect((await resources.admin.put(rulesUrl, { data: originalRules })).status()).toBe(200);
  }
});

test('connected collaborators reconnect to the restored database and continue editing its schema', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  await owner.goto('/');
  await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  const backup = await resources.admin.get('/api/admin/backup');
  expect(backup.status()).toBe(200);
  const buffer = await backup.body();
  await collaborator.getByTestId('table-card').click();
  await collaborator.getByTestId('table-name-input').fill('discarded_after_restore');
  await collaborator.getByTestId('table-name-input').press('Enter');
  await expect(owner.getByTestId('table-card')).toContainText('discarded_after_restore');
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('discarded_after_restore');
  const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'collaboration.db', mimeType: 'application/octet-stream', buffer } } });
  expect(restored.status()).toBe(200);
  expect((await resources.admin.get(schemaUrl).then(r => r.json())).tables).toEqual(project.schema.tables);
  await expect(owner.getByTestId('table-card')).toContainText('users', { timeout: 15_000 });
  await expect(collaborator.getByTestId('table-card')).toContainText('users');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await expect(collaborator.locator('.peer-count')).toHaveText('2');
  await collaborator.getByTestId('table-card').click();
  await collaborator.getByTestId('table-name-input').fill('edited_in_restored_database');
  await collaborator.getByTestId('table-name-input').press('Enter');
  await expect(owner.getByTestId('table-card')).toContainText('edited_in_restored_database');
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('edited_in_restored_database');
  await owner.reload();
  await expect(owner.getByTestId('table-card')).toContainText('edited_in_restored_database');
});

for (const incompatibility of ['checksum', 'failed-migration', 'future-version'] as const) {
  test(`restore ${incompatibility === 'future-version' ? 'rejects' : 'rolls back'} a ${incompatibility} backup and preserves existing collaboration`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    const schemaUrl = `/api/storage/schemas/${project.id}`;
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const owner = await resources.anonymous();
    await owner.context().addCookies((await resources.admin.storageState()).cookies);
    const collaborator = await resources.session(account);
    await owner.goto('/');
    await collaborator.goto('/');
    await expect(owner.locator('.peer-count')).toHaveText('2');
    const backup = await resources.admin.get('/api/admin/backup');
    expect(backup.status()).toBe(200);
    const directory = await mkdtemp(join(tmpdir(), 'erdmini-rollback-e2e-'));
    const path = join(directory, 'incompatible.db');
    await writeFile(path, await backup.body());
    const candidate = new Database(path);
    let buffer: Buffer;
    try {
      candidate.pragma('journal_mode = DELETE');
      candidate.prepare("UPDATE schemas SET data = json_set(data, '$.tables[0].name', 'must_never_be_live') WHERE project_id = ?").run(project.id);
      if (incompatibility === 'checksum') candidate.exec("UPDATE schema_migrations SET checksum = 'invalid-checksum' WHERE version = (SELECT MIN(version) FROM schema_migrations)");
      else if (incompatibility === 'failed-migration') candidate.exec('UPDATE schema_migrations SET success = 0 WHERE version = (SELECT MAX(version) FROM schema_migrations)');
      else candidate.exec("INSERT INTO schema_migrations (version, description, checksum, success) SELECT MAX(version) + 1, 'Future application schema', 'future-checksum', 1 FROM schema_migrations");
      buffer = candidate.serialize();
    } finally {
      candidate.close();
      await rm(directory, { recursive: true, force: true });
    }
    // Keep an edit newer than the uploaded backup: rollback must preserve the live DB.
    await collaborator.getByTestId('table-card').click();
    await collaborator.getByTestId('table-name-input').fill('preserved_after_failed_restore');
    await collaborator.getByTestId('table-name-input').press('Enter');
    await expect(owner.getByTestId('table-card')).toContainText('preserved_after_failed_restore');
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('preserved_after_failed_restore');
    const response = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'incompatible.db', mimeType: 'application/octet-stream', buffer: buffer! } } });
    expect(response.status()).toBe(incompatibility === 'future-version' ? 400 : 500);
    expect((await response.json()).error).toMatch(incompatibility === 'checksum' ? /Checksum mismatch/ : incompatibility === 'future-version' ? /newer|unsupported/i : /previously failed/);
    expect((await resources.admin.get('/api/admin/users')).status()).toBe(200);
    expect((await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('preserved_after_failed_restore');
    await expect(owner.locator('.peer-count')).toHaveText('2', { timeout: 15_000 });
    await expect(collaborator.locator('.peer-count')).toHaveText('2');
    await expect(collaborator.getByTestId('table-card')).toContainText('preserved_after_failed_restore');
    await collaborator.getByTestId('table-card').click();
    await collaborator.getByTestId('table-name-input').fill('edited_after_rollback');
    await collaborator.getByTestId('table-name-input').press('Enter');
    await expect(owner.getByTestId('table-card')).toContainText('edited_after_rollback');
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('edited_after_rollback');
    await owner.reload();
    await expect(owner.getByTestId('table-card')).toContainText('edited_after_rollback');
    expect((await resources.admin.get('/api/admin/backup?stats=1')).status()).toBe(200);
  });
}

test('restoring a version 17 backup migrates legacy dictionary words and share tokens without losing project data', async ({ resources }) => {
  const project = await resources.project();
  const stats = await resources.admin.get('/api/admin/backup?stats=1').then(r => r.json());
  expect(stats.migrationVersion).toBeGreaterThanOrEqual(18);
  const backup = await resources.admin.get('/api/admin/backup');
  expect(backup.status()).toBe(200);
  const original = await backup.body();
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-legacy-e2e-'));
  const path = join(directory, 'legacy.db');
  await writeFile(path, original);
  const candidate = new Database(path);
  let buffer: Buffer;
  const shareToken = randomUUID();
  try {
    candidate.pragma('journal_mode = DELETE');
    candidate.exec('DROP TABLE word_dictionary; DROP TABLE dictionary_share_tokens; DROP TABLE dictionaries; DELETE FROM schema_migrations WHERE version >= 18;');
    candidate.exec(await readFile('src/lib/server/migrations/V017__word_dictionary.sql', 'utf8'));
    candidate.prepare('INSERT INTO word_dictionary (id, word, meaning, created_by) VALUES (?, ?, ?, ?)').run('legacy-word', 'legacy_word', 'Preserved legacy meaning', 'system');
    candidate.prepare('INSERT INTO dictionary_share_tokens (id, token, created_by) VALUES (?, ?, ?)').run('legacy-share', shareToken, 'system');
    buffer = candidate.serialize();
  } finally {
    candidate.close();
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const response = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'legacy.db', mimeType: 'application/octet-stream', buffer: buffer! } } });
    expect(response.status()).toBe(200);
    expect((await resources.admin.get('/api/admin/backup?stats=1').then(r => r.json())).migrationVersion).toBe(stats.migrationVersion);
    expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
    const dictionaries = await resources.admin.get('/api/dictionaries').then(r => r.json());
    expect(dictionaries).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'default', is_default: 1 })]));
    const words = await resources.admin.get('/api/dictionary?dictionaryId=default').then(r => r.json());
    expect(words.words).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'legacy-word', word: 'legacy_word', meaning: 'Preserved legacy meaning', dictionary_id: 'default' })]));
    const page = await resources.anonymous();
    await page.goto(`/dictionary/share/${shareToken}`);
    await expect(page.locator('tr').filter({ hasText: 'legacy_word' })).toContainText('Preserved legacy meaning');
    await page.reload();
    await expect(page.locator('tr').filter({ hasText: 'legacy_word' })).toContainText('Preserved legacy meaning');
  } finally {
    expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'original.db', mimeType: 'application/octet-stream', buffer: original } } })).status()).toBe(200);
  }
});

test('audit search paginates without duplicates, expands details and resets pagination for new filters', async ({ resources }) => {
  const group = await resources.group();
  for (let index = 0; index < 105; index++) {
    expect((await resources.admin.put(`/api/admin/groups/${group.id}`, { data: { description: `audit-pagination-${String(index).padStart(3, '0')}` } })).status()).toBe(200);
  }
  const endpoint = '/api/admin/audit-logs?category=group&action=update';
  const all = await resources.admin.get(`${endpoint}&limit=500`).then(r => r.json());
  expect(all.total).toBeGreaterThanOrEqual(105);
  const first = await resources.admin.get(`${endpoint}&limit=7&offset=0`).then(r => r.json());
  const second = await resources.admin.get(`${endpoint}&limit=7&offset=7`).then(r => r.json());
  expect(first.total).toBe(all.total);
  expect(second.total).toBe(all.total);
  expect([...first.logs, ...second.logs].map((log: { id: number }) => log.id)).toEqual(all.logs.slice(0, 14).map((log: { id: number }) => log.id));
  const beyond = await resources.admin.get(`${endpoint}&limit=7&offset=${all.total}`).then(r => r.json());
  expect(beyond).toEqual({ logs: [], total: all.total });
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  await page.getByRole('button', { name: /Audit/ }).click();
  const filters = page.locator('.audit-filters');
  await filters.locator('select').selectOption('group');
  const action = filters.locator('input');
  await action.fill('update');
  await action.press('Enter');
  const rows = page.locator('.clickable-row');
  const summary = (logs: { detail: string }[]) => logs.map(log => log.detail.length > 60 ? log.detail.slice(0, 60) + '...' : log.detail);
  await expect(rows).toHaveCount(100);
  await expect(rows.locator('.detail-summary')).toHaveText(summary(all.logs.slice(0, 100)));
  await rows.first().click();
  await expect(rows.first().locator('.detail-expanded')).toHaveText(JSON.stringify(JSON.parse(all.logs[0].detail), null, 2));
  await rows.first().click();
  await page.getByRole('button', { name: /Load [Mm]ore/ }).click();
  await expect(rows).toHaveCount(Math.min(200, all.total));
  await expect(rows.locator('.detail-summary')).toHaveText(summary(all.logs.slice(0, 200)));
  await action.fill(`no-such-action-${randomUUID()}`);
  await filters.getByRole('button', { name: /Search/ }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Load [Mm]ore/ })).toHaveCount(0);
  await expect(page.locator('.empty-msg')).toBeVisible();
  await action.fill('update');
  await action.press('Enter');
  await expect(rows).toHaveCount(100);
  await expect(rows.locator('.detail-summary')).toHaveText(summary(all.logs.slice(0, 100)));
});

test('a slow previous audit search cannot overwrite the currently selected category', async ({ resources }) => {
  await resources.group();
  await resources.user();
  const expected = await resources.admin.get('/api/admin/audit-logs?category=user&limit=100').then(r => r.json());
  expect(expected.logs.length).toBeGreaterThan(0);
  const expectedBadges = Array(expected.logs.length).fill('user');
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  await page.getByRole('button', { name: /Audit/ }).click();
  let release: (() => void) | undefined;
  let intercepted: (() => void) | undefined;
  const arrived = new Promise<void>(resolve => { intercepted = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/admin/audit-logs?*', async route => {
    if (new URL(route.request().url()).searchParams.get('category') !== 'group') return route.continue();
    const response = await route.fetch();
    intercepted!();
    await held;
    await route.fulfill({ response });
  });
  const category = page.locator('.audit-filters select');
  try {
    await category.selectOption('group');
    await arrived;
    await category.selectOption('user');
    const badges = page.locator('.clickable-row .cat-badge');
    await expect(badges).toHaveText(expectedBadges);
    release!();
    await page.waitForLoadState('networkidle');
    await expect(category).toHaveValue('user');
    await expect(badges).toHaveText(expectedBadges);
  } finally {
    release!();
  }
});

test('duplicate and invalid admin user creation preserves existing accounts and the failed form', async ({ resources }) => {
  const account = await resources.user();
  const before = await resources.admin.get('/api/admin/users').then(r => r.json());
  for (const data of [
    { username: '', displayName: 'Missing username', password: 'valid-password' },
    { username: `invalid-${randomUUID()}`, displayName: '', password: 'valid-password' },
    { username: `invalid-${randomUUID()}`, displayName: 'Short password', password: '123' },
    { username: `invalid-${randomUUID()}`, displayName: 'Invalid role', password: 'valid-password', role: 'owner' },
  ]) expect((await resources.admin.post('/api/admin/users', { data })).status()).toBe(400);
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  const form = page.locator('.form-section').filter({ hasText: 'Create User' });
  await form.getByPlaceholder('Username', { exact: true }).fill(account.username);
  await form.getByPlaceholder('Display Name', { exact: true }).fill('Must not replace account');
  await form.getByPlaceholder('Email', { exact: true }).fill('duplicate@example.test');
  await form.locator('input[type=password]').fill('different-password');
  const response = page.waitForResponse(r => r.url().endsWith('/api/admin/users') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(form.locator('.msg-error')).toContainText('Username already exists');
  await expect(form.getByPlaceholder('Username', { exact: true })).toHaveValue(account.username);
  await expect(form.getByPlaceholder('Display Name', { exact: true })).toHaveValue('Must not replace account');
  await expect(page.locator('tbody tr').filter({ hasText: account.username })).toHaveCount(1);
  expect(await resources.admin.get('/api/admin/users').then(r => r.json())).toEqual(before);
  const userPage = await resources.session(account);
  expect((await userPage.request.get('/api/my/api-keys')).status()).toBe(200);
});

test('table and column affix warnings clear after edits while case validation ignores configured affixes', async ({ resources }) => {
  const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const openLint = async () => {
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /^Validate/ }).click();
  };
  try {
    const rule = (value: string) => ({ enabled: true, value, allowOverride: false });
    expect((await resources.admin.put('/api/admin/naming-rules', { data: {
      tableCase: rule('snake_case'), columnCase: rule('snake_case'),
      tablePrefix: rule('T_'), tableSuffix: rule('_T'), columnPrefix: rule('C_'), columnSuffix: rule('_C'),
    } })).status()).toBe(200);
    await page.goto('/');
    await openLint();
    const items = page.locator('.lint-item');
    for (const label of ['Table name missing required prefix', 'Table name missing required suffix', 'Column name missing required prefix', 'Column name missing required suffix']) {
      await expect(items.filter({ hasText: label })).toHaveCount(1);
    }
    await expect(items).toHaveCount(4);
    await page.locator('.lint-close').click();
    await page.getByTestId('table-card').click();
    await page.getByTestId('table-name-input').fill('T_users_T');
    await page.getByTestId('table-name-input').press('Enter');
    await openLint();
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: 'Table name' })).toHaveCount(0);
    await page.locator('.lint-close').click();
    await page.getByTestId('column-row').click();
    await page.getByTestId('column-edit-popup').getByTestId('column-name-input').fill('C_user_id_C');
    await page.getByTestId('column-edit-popup').getByRole('button', { name: 'Close', exact: true }).click();
    await openLint();
    await expect(page.locator('.lint-empty')).toBeVisible();
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].columns[0].name).toBe('C_user_id_C');
    await page.reload();
    await openLint();
    await expect(page.locator('.lint-empty')).toBeVisible();
    expect((await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('T_users_T');
  } finally {
    expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
  }
});

test('dictionary validation loads words past the first page and follows dictionary and target overrides after reload', async ({ resources }) => {
  const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
  const accepted = await resources.dictionary();
  const rejected = await resources.dictionary();
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const words = [...Array.from({ length: 200 }, (_, i) => ({ word: `a${String(i).padStart(3, '0')}`, meaning: 'Filler' })), { word: 'zebra', meaning: 'Known on second page' }];
  expect((await resources.admin.post(`/api/dictionary/import?dictionaryId=${accepted.id}`, { data: words })).status()).toBe(200);
  expect((await resources.admin.post('/api/dictionary', { data: { dictionaryId: rejected.id, word: 'other', meaning: 'Unrelated word' } })).status()).toBe(201);
  const schema = { ...project.schema, dictionaryId: accepted.id };
  schema.tables[0].name = 'T_zebra_T';
  schema.tables[0].columns[0].name = 'C_zebra_C';
  expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  const open = async (name: string) => {
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).click();
  };
  const dictionary = () => page.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Word Dictionary$/ }) }).locator('select');
  const target = () => page.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Dictionary word check$/ }) });
  const unknown = () => page.locator('.lint-item').filter({ hasText: 'Name contains unknown words' });
  try {
    const rule = (value: string) => ({ enabled: true, value, allowOverride: false });
    expect((await resources.admin.put('/api/admin/naming-rules', { data: {
      tablePrefix: rule('T_'), tableSuffix: rule('_T'), columnPrefix: rule('C_'), columnSuffix: rule('_C'),
      dictionaryCheck: { ...rule('both'), allowOverride: true },
    } })).status()).toBe(200);
    const secondPage = page.waitForResponse(r => { const url = new URL(r.url()); return url.pathname === '/api/dictionary' && url.searchParams.get('dictionaryId') === accepted.id && url.searchParams.get('page') === '2'; });
    await page.goto('/');
    expect((await secondPage).status()).toBe(200);
    await open('Validate');
    await expect(page.locator('.lint-empty')).toBeVisible();
    await page.locator('.lint-close').click();
    await open('Naming Rules');
    await dictionary().selectOption(rejected.id);
    await page.locator('.nr-close').click();
    await open('Validate');
    await expect(unknown()).toHaveCount(2);
    await expect(unknown().locator('.lint-detail')).toHaveText(['T_zebra_T: zebra', 'T_zebra_T.C_zebra_C: zebra']);
    await expect(page.locator('.lint-info')).toHaveCount(2);
    await page.locator('.lint-close').click();
    await open('Naming Rules');
    await target().locator('.nr-mode').selectOption('override');
    await target().locator('.nr-select').selectOption('table');
    await page.locator('.nr-close').click();
    await open('Validate');
    await expect(unknown()).toHaveCount(1);
    await expect(unknown().locator('.lint-detail')).toHaveText('T_zebra_T: zebra');
    await page.locator('.lint-close').click();
    await open('Naming Rules');
    await target().locator('.nr-select').selectOption('column');
    await page.locator('.nr-close').click();
    await open('Validate');
    await expect(unknown()).toHaveCount(1);
    await expect(unknown()).toContainText('T_zebra_T.C_zebra_C: zebra');
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).namingRules?.dictionaryCheck).toEqual({ value: 'column', enabled: true });
    await page.reload();
    await open('Validate');
    await expect(unknown()).toHaveCount(1);
    await page.locator('.lint-close').click();
    await open('Naming Rules');
    await expect(dictionary()).toHaveValue(rejected.id);
    await expect(target().locator('.nr-select')).toHaveValue('column');
    await dictionary().selectOption(accepted.id);
    await page.locator('.nr-close').click();
    await open('Validate');
    await expect(page.locator('.lint-empty')).toBeVisible();
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).dictionaryId).toBe(accepted.id);
  } finally {
    expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
  }
});

for (const delayedPage of [1, 2]) {
  test(`a delayed dictionary page ${delayedPage} cannot replace words from a newer dictionary selection`, async ({ resources }) => {
    const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
    const accepted = await resources.dictionary();
    const rejected = await resources.dictionary();
    const project = await resources.project();
    expect((await resources.admin.post(`/api/dictionary/import?dictionaryId=${accepted.id}`, { data: [{ word: 'users', meaning: 'Users' }, { word: 'id', meaning: 'Identifier' }] })).status()).toBe(200);
    const words = Array.from({ length: delayedPage === 2 ? 201 : 1 }, (_, i) => ({ word: `other${i}`, meaning: 'Other' }));
    expect((await resources.admin.post(`/api/dictionary/import?dictionaryId=${rejected.id}`, { data: words })).status()).toBe(200);
    expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: { ...project.schema, dictionaryId: accepted.id } })).status()).toBe(200);
    const page = await resources.anonymous();
    await page.context().addCookies((await resources.admin.storageState()).cookies);
    let release!: () => void;
    let arrived!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const intercepted = new Promise<void>(resolve => { arrived = resolve; });
    const open = async (name: string) => {
      await page.locator('.btn-tools').click();
      await page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).click();
    };
    try {
      expect((await resources.admin.put('/api/admin/naming-rules', { data: { dictionaryCheck: { enabled: true, value: 'both', allowOverride: false } } })).status()).toBe(200);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await open('Naming Rules');
      const select = page.locator('.nr-rule').filter({ has: page.locator('.nr-rule-name', { hasText: /^Word Dictionary$/ }) }).locator('select');
      await page.route('**/api/dictionary?*', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('dictionaryId') !== rejected.id || Number(url.searchParams.get('page') ?? '1') !== delayedPage) return route.continue();
        const response = await route.fetch();
        arrived();
        await held;
        await route.fulfill({ response });
      });
      await select.selectOption(rejected.id);
      await intercepted;
      const latest = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dictionary' && new URL(r.url()).searchParams.get('dictionaryId') === accepted.id);
      await select.selectOption(accepted.id);
      expect((await latest).status()).toBe(200);
      await page.locator('.nr-close').click();
      await open('Validate');
      await expect(page.locator('.lint-empty')).toBeVisible();
      const staleResponse = page.waitForResponse(r => {
        const url = new URL(r.url());
        return url.pathname === '/api/dictionary' && url.searchParams.get('dictionaryId') === rejected.id && Number(url.searchParams.get('page') ?? '1') === delayedPage;
      });
      release();
      await staleResponse;
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.lint-empty')).toBeVisible();
      await expect(page.locator('.lint-item')).toHaveCount(0);
      await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).dictionaryId).toBe(accepted.id);
    } finally {
      release();
      expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
    }
  });
}

for (const { failedPage, failure } of [1, 2].flatMap(failedPage => ['http', 'network', 'json'].map(failure => ({ failedPage, failure })))) {
  test(`dictionary page ${failedPage} ${failure} failure reports incomplete validation and retry loads the complete dictionary`, async ({ resources }) => {
    const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
    const dictionary = await resources.dictionary();
    const project = await resources.project();
    const words = [...Array.from({ length: 200 }, (_, i) => ({ word: `a${i}`, meaning: 'Filler' })), { word: 'users', meaning: 'Users' }, { word: 'id', meaning: 'ID' }];
    expect((await resources.admin.post(`/api/dictionary/import?dictionaryId=${dictionary.id}`, { data: words })).status()).toBe(200);
    expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: { ...project.schema, dictionaryId: dictionary.id } })).status()).toBe(200);
    const page = await resources.anonymous();
    await page.context().addCookies((await resources.admin.storageState()).cookies);
    let fail = true;
    await page.route('**/api/dictionary?*', route => {
      const url = new URL(route.request().url());
      if (fail && url.searchParams.get('dictionaryId') === dictionary.id && Number(url.searchParams.get('page') ?? '1') === failedPage) {
        if (failure === 'network') return route.abort('failed');
        if (failure === 'json') return route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid' });
        return route.fulfill({ status: 503, json: { error: 'Temporary outage' } });
      }
      return route.continue();
    });
    try {
      expect((await resources.admin.put('/api/admin/naming-rules', { data: { dictionaryCheck: { enabled: true, value: 'both', allowOverride: false } } })).status()).toBe(200);
      await page.goto('/');
      await page.locator('.btn-tools').click();
      await page.getByRole('menuitem', { name: /^Validate/ }).click();
      await expect(page.locator('.lint-dictionary-error')).toContainText('Could not load dictionary words');
      await expect(page.locator('.lint-empty')).toHaveCount(0);
      await expect(page.locator('.lint-item').filter({ hasText: 'Name contains unknown words' })).toHaveCount(0);
      fail = false;
      await page.locator('.lint-dictionary-error').getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.locator('.lint-dictionary-error')).toHaveCount(0);
      await expect(page.locator('.lint-empty')).toBeVisible();
      await page.reload();
      await page.locator('.btn-tools').click();
      await page.getByRole('menuitem', { name: /^Validate/ }).click();
      await expect(page.locator('.lint-empty')).toBeVisible();
    } finally {
      expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
    }
  });
}

for (const staleResult of ['success', 'failure'] as const) {
  test(`project switching ignores a previous project's delayed dictionary ${staleResult} and retains independent selections`, async ({ resources }) => {
    const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
    const firstDictionary = await resources.dictionary();
    const secondDictionary = await resources.dictionary();
    const first = await resources.project();
    const second = await resources.project();
    expect((await resources.admin.post(`/api/dictionary/import?dictionaryId=${firstDictionary.id}`, { data: [{ word: 'users', meaning: 'Users' }, { word: 'id', meaning: 'ID' }] })).status()).toBe(200);
    expect((await resources.admin.post('/api/dictionary', { data: { dictionaryId: secondDictionary.id, word: 'other', meaning: 'Other' } })).status()).toBe(201);
    const secondSchema = structuredClone(second.schema);
    secondSchema.tables[0].name = 'other';
    secondSchema.tables[0].columns[0].name = 'other';
    expect((await resources.admin.put(`/api/storage/schemas/${first.id}`, { data: { ...first.schema, dictionaryId: firstDictionary.id } })).status()).toBe(200);
    expect((await resources.admin.put(`/api/storage/schemas/${second.id}`, { data: { ...secondSchema, dictionaryId: secondDictionary.id } })).status()).toBe(200);
    const page = await resources.anonymous();
    await page.context().addCookies((await resources.admin.storageState()).cookies);
    let release!: () => void;
    let arrived!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const intercepted = new Promise<void>(resolve => { arrived = resolve; });
    let delay = true;
    const switchProject = async (name: string) => {
      await page.getByTestId('project-menu-toggle').click();
      await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: name }) }).locator('.project-item-name').click();
      await expect(page.getByTestId('project-menu-toggle')).toContainText(name);
    };
    const openLint = async () => {
      await page.locator('.btn-tools').click();
      await page.getByRole('menuitem', { name: /^Validate/ }).click();
    };
    try {
      expect((await resources.admin.put('/api/admin/naming-rules', { data: { dictionaryCheck: { enabled: true, value: 'both', allowOverride: false } } })).status()).toBe(200);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await openLint();
      await expect(page.locator('.lint-empty')).toBeVisible();
      await page.locator('.lint-close').click();
      await page.route('**/api/dictionary?*', async route => {
        if (!delay || new URL(route.request().url()).searchParams.get('dictionaryId') !== firstDictionary.id) return route.continue();
        const response = await route.fetch();
        arrived();
        await held;
        if (staleResult === 'failure') return route.fulfill({ status: 503, json: { error: 'Previous project outage' } });
        return route.fulfill({ response });
      });
      await switchProject(first.name);
      await intercepted;
      await switchProject(second.name);
      await openLint();
      await expect(page.locator('.lint-empty')).toBeVisible();
      const stale = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dictionary' && new URL(r.url()).searchParams.get('dictionaryId') === firstDictionary.id);
      delay = false;
      release();
      await stale;
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.lint-empty')).toBeVisible();
      await expect(page.locator('.lint-dictionary-error, .lint-item')).toHaveCount(0);
      await expect(page.getByTestId('table-card')).toContainText('other');
      await page.locator('.lint-close').click();
      await switchProject(first.name);
      await openLint();
      await expect(page.locator('.lint-empty')).toBeVisible();
      await expect(page.getByTestId('table-card')).toContainText('users');
      await page.reload();
      await openLint();
      await expect(page.locator('.lint-empty')).toBeVisible();
      for (const [project, dictionaryId, name] of [[first, firstDictionary.id, 'users'], [second, secondDictionary.id, 'other']] as const) {
        const schema = await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json());
        expect(schema.dictionaryId).toBe(dictionaryId);
        expect(schema.tables[0].name).toBe(name);
      }
    } finally {
      release();
      expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
    }
  });
}

test('MCP bulk domain assignment supports names, patterns and explicit references, rejects invalid requests and enforces key scope', async ({ resources }) => {
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const schema = { ...project.schema, domains: [{ id: 'identifier', name: 'Identifier', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }] };
  schema.tables.push({ ...structuredClone(schema.tables[0]), id: 'orders', name: 'orders', position: { x: 550, y: 100 } });
  expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
  const created = await resources.admin.post('/api/admin/api-keys', { data: { name: 'Bulk domain E2E', scopes: [{ projectId: project.id, permission: 'editor' }] } });
  expect(created.status()).toBe(201);
  const key = await created.json();
  const call = async (args: Record<string, unknown>) => {
    const response = await resources.admin.post('/mcp', {
      headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bulk_assign_domain', arguments: { projectId: project.id, ...args } } },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    return body.result;
  };
  const get = () => resources.admin.get(schemaUrl).then(r => r.json());
  try {
    for (const args of [{ domainId: 'missing', columnName: 'id' }, { domainId: 'identifier', columnNamePattern: '[' }, { domainId: 'identifier' }, { domainId: 'identifier', columnName: 'not_found' }]) {
      const before = await get();
      expect((await call(args)).isError).toBe(true);
      expect(await get()).toEqual(before);
    }
    expect((await call({ domainId: 'identifier', columnName: 'id' })).content[0].text).toContain('assigned on 2 column(s)');
    expect((await get()).tables.map((table: { columns: { domainId?: string }[] }) => table.columns[0].domainId)).toEqual(['identifier', 'identifier']);
    expect((await call({ domainId: '', columnNamePattern: '^id$' })).content[0].text).toContain('unlinked on 2 column(s)');
    expect((await get()).tables.map((table: { columns: { domainId?: string }[] }) => table.columns[0].domainId)).toEqual([undefined, undefined]);
    expect((await call({ domainId: 'identifier', columnName: 'id', columns: [{ tableId: 'users', columnId: 'id' }, { tableId: 'missing', columnId: 'missing' }] })).content[0].text).toContain('assigned on 1 column(s)');
    const assigned = await get();
    expect(assigned.tables.map((table: { columns: { domainId?: string }[] }) => table.columns[0].domainId)).toEqual(['identifier', undefined]);
    expect((await resources.admin.patch(`/api/admin/api-keys/${key.id}`, { data: { scopes: [{ projectId: project.id, permission: 'viewer' }] } })).status()).toBe(200);
    expect((await call({ domainId: '', columnName: 'id' })).isError).toBe(true);
    expect(await get()).toEqual(assigned);
    const page = await resources.anonymous();
    await page.context().addCookies((await resources.admin.storageState()).cookies);
    await page.goto('/');
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await page.reload();
    expect((await get()).tables).toEqual(assigned.tables);
  } finally {
    expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200);
  }
});

test('MCP bulk domain limits count unique references, keep empty selections empty and cap pattern matches at 1000', async ({ resources }) => {
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  const schema = { ...project.schema, domains: [{ id: 'identifier', name: 'Identifier', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false }] };
  schema.tables[0].columns = Array.from({ length: 1001 }, (_, index) => ({ ...project.schema.tables[0].columns[0], id: `id_${index}`, name: `id_${index}`, primaryKey: false, unique: false }));
  expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
  const created = await resources.admin.post('/api/admin/api-keys', { data: { name: 'Bulk limits E2E', scopes: [{ projectId: project.id, permission: 'editor' }] } });
  expect(created.status()).toBe(201);
  const key = await created.json();
  const call = async (args: Record<string, unknown>) => {
    const response = await resources.admin.post('/mcp', {
      headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bulk_assign_domain', arguments: { projectId: project.id, domainId: 'identifier', ...args } } },
    });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const get = () => resources.admin.get(schemaUrl).then(r => r.json());
  try {
    const duplicate = { tableId: 'users', columnId: 'id_0' };
    const assigned = await call({ columns: [duplicate, duplicate, { tableId: 'missing', columnId: 'id_0' }] });
    expect(assigned.result.isError).not.toBe(true);
    expect(assigned.result.content[0].text).toContain('assigned on 1 column(s)');
    expect((await get()).tables[0].columns.filter((column: { domainId?: string }) => column.domainId)).toHaveLength(1);
    const beforeEmpty = await get();
    const empty = await call({ domainId: '', columns: [], columnName: 'id_0', columnNamePattern: '^id_' });
    expect(empty.result.isError).toBe(true);
    expect(await get()).toEqual(beforeEmpty);
    const tooMany = await call({ columns: schema.tables[0].columns.map(column => ({ tableId: 'users', columnId: column.id })) });
    expect(Boolean(tooMany.error) || tooMany.result?.isError === true).toBe(true);
    expect(await get()).toEqual(beforeEmpty);
    const capped = await call({ columnNamePattern: '^id_' });
    expect(capped.result.content[0].text).toContain('assigned on 1000 column(s)');
    const persisted = await get();
    expect(persisted.tables[0].columns.slice(0, 1000).every((column: { domainId?: string }) => column.domainId === 'identifier')).toBe(true);
    expect(persisted.tables[0].columns[1000].domainId).toBeUndefined();
    const unlinked = await call({ domainId: '', columns: persisted.tables[0].columns.slice(0, 1000).map((column: { id: string }) => ({ tableId: 'users', columnId: column.id })) });
    expect(unlinked.result.content[0].text).toContain('unlinked on 1000 column(s)');
    expect((await get()).tables[0].columns).toEqual(schema.tables[0].columns);
  } finally {
    expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200);
  }
});

test('OIDC browser login exchanges an S256 code for a verified identity, reuses the user and rejects callback replay', async ({ resources, baseURL }) => {
  const oidc = await startOidcProvider();
  let providerId: string | undefined;
  try {
    const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'Local OIDC login', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous({ ignoreHTTPSErrors: true });
    const loginOidc = async () => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'Local OIDC login', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
    };
    await loginOidc();
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    const cookie = (await page.context().cookies()).find(c => c.name === 'erdmini_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    const users = await resources.admin.get('/api/admin/users').then(r => r.json());
    const user = users.find((u: { email: string }) => u.email === oidc.identity.email);
    expect(user).toMatchObject({ display_name: oidc.identity.name, role: 'user', status: 'active', has_local_auth: false });
    expect(user.oidc_providers).toEqual(['Local OIDC login']);
    expect(oidc.authorizations[0].searchParams.get('code_challenge_method')).toBe('S256');
    expect(oidc.exchanges).toHaveLength(1);
    expect(oidc.exchanges[0].verifier).not.toBe(oidc.exchanges[0].challenge);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    await page.goto(oidc.lastCallback);
    await expect(page).toHaveURL(/\/login\?error=auth_failed/);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
    await loginOidc();
    const again = await resources.admin.get('/api/admin/users').then(r => r.json());
    expect(again.filter((u: { email: string }) => u.email === oidc.identity.email).map((u: { id: string }) => u.id)).toEqual([user.id]);
    expect(oidc.exchanges).toHaveLength(2);
    expect(oidc.authorizations[1].searchParams.get('state')).not.toBe(oidc.authorizations[0].searchParams.get('state'));
    await page.reload();
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
  } finally {
    const users = await resources.admin.get('/api/admin/users').then(r => r.json());
    for (const user of users.filter((u: { email: string }) => u.email === oidc.identity.email)) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
    await oidc.close();
  }
});

for (const boundary of ['jwks-unavailable', 'jwks-empty', 'authorization-denied', 'invalid-grant', 'unavailable', 'missing-id-token', 'invalid-signature', 'expired-token', 'wrong-issuer', 'wrong-audience', 'not-yet-valid-token', 'pending', 'disabled-provider'] as const) {
  test(`OIDC ${boundary} cannot create an authenticated session and a fresh authorized login can recover`, async ({ resources, baseURL }) => {
    const oidc = await startOidcProvider();
    let providerId: string | undefined;
    const getUsers = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
    try {
      const response = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC boundary', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: boundary !== 'pending' } });
      expect(response.status()).toBe(201);
      providerId = (await response.json()).id;
      const page = await resources.anonymous({ ignoreHTTPSErrors: true });
      const start = async () => {
        await page.goto('/login');
        await page.getByRole('link', { name: 'OIDC boundary', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Continue with test identity' })).toBeVisible();
      };
      if (boundary === 'jwks-unavailable') oidc.jwksFailure = 'unavailable';
      if (boundary === 'jwks-empty') oidc.jwksFailure = 'empty';
      if (boundary === 'authorization-denied') oidc.authorizationDenied = true;
      if (boundary === 'invalid-grant' || boundary === 'unavailable' || boundary === 'missing-id-token') oidc.tokenFailure = boundary;
      if (boundary === 'invalid-signature') oidc.invalidSignature = true;
      if (boundary === 'expired-token') oidc.claims.exp = Math.floor(Date.now() / 1000) - 3600;
      if (boundary === 'wrong-issuer') oidc.claims.iss = `${oidc.issuer}/untrusted`;
      if (boundary === 'wrong-audience') oidc.claims.aud = 'another-client';
      if (boundary === 'not-yet-valid-token') oidc.claims.nbf = Math.floor(Date.now() / 1000) + 3600;
      await start();
      if (boundary === 'disabled-provider') expect((await resources.admin.put(`/api/admin/oidc-providers/${providerId}`, { data: { enabled: false } })).status()).toBe(200);
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(new RegExp(`/login\\?error=${boundary === 'pending' ? 'pending_approval' : 'auth_failed'}$`));
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect((await page.context().cookies()).filter(c => c.name === 'erdmini_session')).toHaveLength(0);
      const users = await getUsers();
      expect((await page.context().cookies()).filter(c => c.name === 'erdmini_oidc_state')).toHaveLength(0);
      const exchangesAfterFailure = oidc.exchanges.length;
      await page.goto(oidc.lastCallback);
      await expect(page).toHaveURL(/auth_failed$/);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect(oidc.exchanges).toHaveLength(exchangesAfterFailure);
      expect(await getUsers()).toEqual(users);
      if (boundary === 'pending') {
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({ status: 'pending', has_local_auth: false });
        await start();
        await page.getByRole('button', { name: 'Continue with test identity' }).click();
        await expect(page).toHaveURL(/pending_approval$/);
        expect((await getUsers()).map((user: { id: string }) => user.id)).toEqual([users[0].id]);
        expect((await resources.admin.put(`/api/admin/users/${users[0].id}`, { data: { status: 'active' } })).status()).toBe(200);
      } else expect(users).toHaveLength(0);
      oidc.jwksFailure = undefined;
      oidc.authorizationDenied = false;
      oidc.tokenFailure = undefined;
      oidc.invalidSignature = false;
      for (const claim of Object.keys(oidc.claims)) delete oidc.claims[claim];
      if (boundary === 'disabled-provider') {
        expect((await resources.admin.put(`/api/admin/oidc-providers/${providerId}`, { data: { enabled: true } })).status()).toBe(200);
        await page.goto(oidc.lastCallback);
        await expect(page).toHaveURL(/auth_failed$/);
        expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      }
      await start();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
      expect(await getUsers()).toHaveLength(1);
      if (boundary === 'pending') expect((await getUsers())[0].id).toBe(users[0].id);
    } finally {
      for (const user of await getUsers()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
      await oidc.close();
    }
  });
}

test('OIDC group and admin claims synchronize on relogin, revoke old-session privileges and preserve manual memberships', async ({ resources, baseURL }) => {
  const oidc = await startOidcProvider();
  const manual = await resources.group();
  const externalProject = await resources.project();
  const manualProject = await resources.project();
  const externalName = `OIDC-team-${randomUUID()}`;
  const excludedName = `OIDC-excluded-${randomUUID()}`;
  const adminName = `OIDC-admin-${randomUUID()}`;
  let providerId: string | undefined;
  let userId: string | undefined;
  const getUser = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).find((user: { email: string }) => user.email === oidc.identity.email);
  const loginOidc = async (page: Page) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'OIDC group sync', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with test identity' }).click();
    await expect(page).toHaveURL(`${baseURL}/`);
  };
  try {
    const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC group sync', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true, syncGroups: true, allowedGroups: externalName.toLowerCase(), adminGroups: adminName.toLowerCase() } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    oidc.identity.groups = [externalName, excludedName];
    const page = await resources.anonymous({ ignoreHTTPSErrors: true });
    await loginOidc(page);
    const initial = await getUser();
    userId = initial.id;
    expect(initial).toMatchObject({ role: 'user', groups: [externalName] });
    const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
    const external = groups.find((group: { name: string }) => group.name === externalName);
    expect(external).toMatchObject({ source: 'oidc', source_provider_id: providerId, member_count: 1 });
    expect(groups.some((group: { name: string }) => group.name === excludedName)).toBe(false);
    expect((await resources.admin.post(`/api/admin/groups/${manual.id}/members`, { data: { userId } })).status()).toBe(201);
    for (const [project, groupId] of [[externalProject, external.id], [manualProject, manual.id]] as const) {
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId, permission: 'viewer' } })).status()).toBe(201);
      expect((await page.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
    }
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    oidc.identity.groups = [externalName, adminName.toUpperCase()];
    await loginOidc(page);
    expect((await getUser()).role).toBe('admin');
    expect((await page.request.get('/api/admin/users')).status()).toBe(200);
    const otherSession = await resources.anonymous({ ignoreHTTPSErrors: true });
    await loginOidc(otherSession);
    expect((await otherSession.request.get('/api/admin/users')).status()).toBe(200);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    oidc.identity.groups = [];
    await loginOidc(page);
    const demoted = await getUser();
    expect(demoted).toMatchObject({ id: userId, role: 'user', groups: [manual.name] });
    for (const session of [page, otherSession]) {
      expect((await session.request.get('/api/admin/users')).status()).toBe(403);
      expect((await session.request.get(`/api/storage/schemas/${externalProject.id}`)).status()).toBe(403);
      expect((await session.request.get(`/api/storage/schemas/${manualProject.id}`)).status()).toBe(200);
    }
    expect(await resources.admin.get(`/api/admin/groups/${external.id}/members`).then(r => r.json())).toEqual([]);
    await page.reload();
    expect((await page.request.get(`/api/storage/schemas/${manualProject.id}`)).status()).toBe(200);
  } finally {
    const users = await resources.admin.get('/api/admin/users').then(r => r.json());
    for (const user of users.filter((user: { email: string }) => user.email === oidc.identity.email)) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) {
      const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
      for (const group of groups.filter((group: { source_provider_id: string }) => group.source_provider_id === providerId)) expect((await resources.admin.delete(`/api/admin/groups/${group.id}`)).status()).toBe(200);
      expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
    }
    await oidc.close();
  }
});

test('OIDC custom scalar group claim takes precedence over default groups and empty claims remove synchronized membership', async ({ resources, baseURL }) => {
  const oidc = await startOidcProvider();
  const team = `OIDC-custom-${randomUUID()}`;
  const ignored = `OIDC-ignored-${randomUUID()}`;
  oidc.identity.groups = [ignored];
  oidc.claims.roles = team;
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC custom claim', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true, syncGroups: true, groupClaim: 'roles', allowedGroups: team } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous({ ignoreHTTPSErrors: true });
    const loginOidc = async () => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'OIDC custom claim', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
    };
    await loginOidc();
    const first = await users();
    expect(first).toHaveLength(1);
    expect(first[0].groups).toEqual([team]);
    const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
    expect(groups.some((group: { name: string }) => group.name === ignored)).toBe(false);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    oidc.claims.roles = [];
    await loginOidc();
    const second = await users();
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: first[0].id, role: 'user', groups: [] });
    const group = groups.find((group: { name: string }) => group.name === team);
    expect(await resources.admin.get(`/api/admin/groups/${group.id}/members`).then(r => r.json())).toEqual([]);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) {
      const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
      for (const group of groups.filter((group: { source_provider_id: string }) => group.source_provider_id === providerId)) expect((await resources.admin.delete(`/api/admin/groups/${group.id}`)).status()).toBe(200);
      expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
    }
    await oidc.close();
  }
});

test('LDAP browser login rejects incorrect credentials, binds over TLS and reuses its directory identity on relogin', async ({ resources, baseURL }) => {
  const ldap = await startLdapProvider();
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'Local LDAP login', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous();
    const select = async () => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Local LDAP login', exact: true }).click();
      await expect(page.locator('.ldap-mode-label')).toHaveText('Local LDAP login');
      await page.getByLabel('Username', { exact: true }).fill(ldap.identity.username);
    };
    await select();
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    const rejected = page.waitForResponse(r => r.url().endsWith('/api/auth/ldap/login'), { timeout: 10_000 });
    await page.locator('button[type=submit]').click();
    expect((await rejected).status()).toBe(401);
    await expect(page.locator('.error')).toContainText('Invalid credentials');
    expect(await users()).toHaveLength(0);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
    await page.getByLabel('Password', { exact: true }).fill(ldap.identity.password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(`${baseURL}/`);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    expect((await page.context().cookies()).find(cookie => cookie.name === 'erdmini_session')).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
    const initial = await users();
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ display_name: ldap.identity.name, has_local_auth: false, role: 'user', status: 'active', ldap_providers: ['Local LDAP login'] });
    expect(ldap.binds).toEqual(expect.arrayContaining([{ dn: ldap.serviceDn, accepted: true }, { dn: ldap.userDn, accepted: false }, { dn: ldap.userDn, accepted: true }]));
    expect(ldap.searches).toContainEqual({ base: ldap.userBase, filter: `(uid=${ldap.identity.username})` });
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    await select();
    await page.getByLabel('Password', { exact: true }).fill(ldap.identity.password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(`${baseURL}/`);
    expect((await users()).map((user: { id: string }) => user.id)).toEqual([initial[0].id]);
    await page.reload();
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    expect(ldap.errors).toEqual([]);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
    await ldap.close();
  }
});

test('LDAP removed directory groups revoke synchronized membership and mapped administrator privileges on relogin', async ({ resources }) => {
  const ldap = await startLdapProvider();
  const project = await resources.project();
  const team = `ldap-team-${randomUUID()}`;
  const adminDn = `cn=ldap-admin-${randomUUID()},${ldap.groupBase}`;
  ldap.identity.groups = [`cn=${team},${ldap.groupBase}`, adminDn];
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP group sync', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, groupSearchBase: ldap.groupBase, adminGroupDn: adminDn, syncGroups: true, enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous();
    const loginLdap = async () => {
      const response = await page.request.post('/api/auth/ldap/login', { data: { providerId, username: ldap.identity.username, password: ldap.identity.password } });
      expect(response.status()).toBe(200);
      return response.json();
    };
    const initial = await loginLdap();
    expect(initial.user.role).toBe('admin');
    expect((await page.request.get('/api/admin/users')).status()).toBe(200);
    const initialUser = (await users())[0];
    expect(initialUser.groups).toEqual(expect.arrayContaining([team, adminDn.split(',')[0].slice(3)]));
    const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
    const teamGroup = groups.find((group: { name: string }) => group.name === team);
    expect(teamGroup).toMatchObject({ source: 'ldap', source_provider_id: providerId, member_count: 1 });
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId: teamGroup.id, permission: 'viewer' } })).status()).toBe(201);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    ldap.identity.groups = [];
    const subsequent = await loginLdap();
    expect(subsequent.user).toMatchObject({ id: initialUser.id, role: 'user' });
    expect((await users())[0]).toMatchObject({ id: initialUser.id, groups: [], role: 'user' });
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(403);
    expect(await resources.admin.get(`/api/admin/groups/${teamGroup.id}/members`).then(r => r.json())).toEqual([]);
    expect(ldap.errors).toEqual([]);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) {
      const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
      for (const group of groups.filter((group: { source_provider_id: string }) => group.source_provider_id === providerId)) expect((await resources.admin.delete(`/api/admin/groups/${group.id}`)).status()).toBe(200);
      expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
    }
    await ldap.close();
  }
});

test('LDAP allowed group DN is matched as a whole and group-search failure or lost membership denies login', async ({ resources }) => {
  const ldap = await startLdapProvider();
  const allowedDn = `cn=allowed,${ldap.groupBase}`;
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP allowed group', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, groupSearchBase: ldap.groupBase, allowedGroupDns: allowedDn, enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous();
    const loginLdap = () => page.request.post('/api/auth/ldap/login', { data: { providerId, username: ldap.identity.username, password: ldap.identity.password } });
    ldap.identity.groups = [`cn=other,${ldap.groupBase}`];
    expect((await loginLdap()).status()).toBe(401);
    expect(await users()).toHaveLength(0);
    ldap.identity.groups = [allowedDn];
    ldap.failGroupSearch = true;
    expect((await loginLdap()).status()).toBe(401);
    expect(await users()).toHaveLength(0);
    ldap.failGroupSearch = false;
    const adminPage = await resources.anonymous();
    adminPage.setDefaultTimeout(10_000);
    await adminPage.context().addCookies((await resources.admin.storageState()).cookies);
    await adminPage.goto('/admin');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.getByRole('button', { name: /^LDAP/ }).click();
    const card = adminPage.locator('.provider-card').filter({ hasText: 'LDAP allowed group' });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    const permitted = `${allowedDn}\ncn=second,${ldap.groupBase}`;
    const form = adminPage.locator('.provider-card-editing');
    await form.getByLabel('Allowed Group DNs', { exact: true }).fill(permitted);
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(card.locator('textarea')).toHaveCount(0);
    await adminPage.reload();
    await adminPage.waitForLoadState('networkidle');
    await adminPage.getByRole('button', { name: /^LDAP/ }).click();
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(form.getByLabel('Allowed Group DNs', { exact: true })).toHaveValue(permitted);
    const accepted = await loginLdap();
    expect(accepted.status()).toBe(200);
    const userId = (await accepted.json()).user.id;
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    ldap.identity.groups = [];
    expect((await loginLdap()).status()).toBe(401);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
    expect((await users()).map((user: { id: string }) => user.id)).toEqual([userId]);
    expect(ldap.errors).toEqual([]);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
    await ldap.close();
  }
});

test('clearing optional LDAP group settings in the admin form persists removal while keeping the stored bind password', async ({ resources }) => {
  const ldap = await startLdapProvider();
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP clear settings', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, groupSearchBase: ldap.groupBase, groupSearchFilter: '(member={{userDn}})', adminGroupDn: `cn=admins,${ldap.groupBase}`, allowedGroupDns: `cn=allowed,${ldap.groupBase}`, enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous();
    page.setDefaultTimeout(10_000);
    await page.context().addCookies((await resources.admin.storageState()).cookies);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^LDAP/ }).click();
    const card = page.locator('.provider-card').filter({ hasText: 'LDAP clear settings' });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    const form = page.locator('.provider-card-editing');
    const labels = ['Group Search Base', 'Group Search Filter', 'Admin Group DN', 'Allowed Group DNs'];
    for (const label of labels) await form.getByLabel(label, { exact: true }).fill('');
    const bindPassword = form.getByLabel(/Bind Password/);
    await expect(bindPassword).toHaveValue('');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.provider-card-editing')).toHaveCount(0);
    const provider = (await resources.admin.get('/api/admin/ldap-providers').then(r => r.json())).find((provider: { id: string }) => provider.id === providerId);
    expect(provider).toMatchObject({ group_search_base: '', group_search_filter: '', admin_group_dn: '', allowed_group_dns: '' });
    expect(provider).not.toHaveProperty('bind_password');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /^LDAP/ }).click();
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    for (const label of labels) await expect(form.getByLabel(label, { exact: true })).toHaveValue('');
    const userPage = await resources.anonymous();
    const response = await userPage.request.post('/api/auth/ldap/login', { data: { providerId, username: ldap.identity.username, password: ldap.identity.password } });
    expect(response.status()).toBe(200);
    expect((await response.json()).user.role).toBe('user');
    expect((await userPage.request.get('/api/my/api-keys')).status()).toBe(200);
    expect(ldap.searches.every(search => search.base === ldap.userBase)).toBe(true);
    expect(ldap.binds).toContainEqual({ dn: ldap.serviceDn, accepted: true });
    expect(ldap.errors).toEqual([]);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
    await ldap.close();
  }
});

test('LDAP registration, provider activation and account approval policies deny sessions without creating duplicate users', async ({ resources }) => {
  const ldap = await startLdapProvider();
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP policy boundaries', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, enabled: true, autoCreateUsers: false } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous();
    const loginLdap = (username = ldap.identity.username) => ldapLoginResponse(page.request, { providerId, username, password: ldap.identity.password });
    const blocked = await loginLdap();
    expect(blocked.status()).toBe(403);
    expect(await blocked.json()).toEqual({ error: 'auto_registration_disabled' });
    expect(await users()).toHaveLength(0);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
    expect((await resources.admin.put(`/api/admin/ldap-providers/${providerId}`, { data: { autoCreateUsers: true } })).status()).toBe(200);
    const first = await loginLdap();
    expect(first.status()).toBe(200);
    const userId = (await first.json()).user.id;
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    expect((await resources.admin.put(`/api/admin/ldap-providers/${providerId}`, { data: { autoCreateUsers: false } })).status()).toBe(200);
    const existing = await loginLdap();
    expect(existing.status()).toBe(200);
    expect((await existing.json()).user.id).toBe(userId);
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    expect((await resources.admin.put(`/api/admin/ldap-providers/${providerId}`, { data: { enabled: false } })).status()).toBe(200);
    const bindCount = ldap.binds.length;
    expect((await loginLdap()).status()).toBe(404);
    expect(ldap.binds).toHaveLength(bindCount);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'LDAP policy boundaries', exact: true })).toHaveCount(0);
    expect((await resources.admin.put(`/api/admin/ldap-providers/${providerId}`, { data: { enabled: true } })).status()).toBe(200);
    expect((await loginLdap('not-a-directory-user')).status()).toBe(401);
    expect((await resources.admin.put(`/api/admin/users/${userId}`, { data: { status: 'pending' } })).status()).toBe(200);
    const pending = await loginLdap();
    expect(pending.status()).toBe(403);
    expect(await pending.json()).toEqual({ error: 'pending_approval' });
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
    expect((await resources.admin.put(`/api/admin/users/${userId}`, { data: { status: 'active' } })).status()).toBe(200);
    expect((await loginLdap()).status()).toBe(200);
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    expect((await users()).map((user: { id: string }) => user.id)).toEqual([userId]);
    expect(ldap.errors).toEqual([]);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
    await ldap.close();
  }
});

for (const rejectStartTls of [false, true]) {
  test(`LDAP StartTLS ${rejectStartTls ? 'rejection denies login without plaintext bind' : 'encrypts service and user binds before creating a session'}`, async ({ resources }) => {
    const ldap = await startLdapProvider({ startTls: true, rejectStartTls });
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
    try {
      const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP StartTLS', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, startTls: true, enabled: true, autoCreateUsers: true } });
      expect(created.status()).toBe(201);
      providerId = (await created.json()).id;
      const page = await resources.anonymous();
      const response = await ldapLoginResponse(page.request, { providerId, username: ldap.identity.username, password: ldap.identity.password });
      expect(response.status()).toBe(rejectStartTls ? 401 : 200);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(rejectStartTls ? 401 : 200);
      if (rejectStartTls) {
        expect(ldap.startTlsRequests).toBe(1);
        expect(ldap.binds).toHaveLength(0);
        expect(ldap.encryptedBinds).toBe(0);
        expect(await users()).toHaveLength(0);
      } else {
        expect(ldap.startTlsRequests).toBe(2);
        expect(ldap.encryptedBinds).toBe(2);
        expect(ldap.binds).toEqual([{ dn: ldap.serviceDn, accepted: true }, { dn: ldap.userDn, accepted: true }]);
        expect(await users()).toHaveLength(1);
      }
      expect(ldap.errors).toEqual([]);
    } finally {
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
      await ldap.close();
    }
  });
}

test('OIDC admin edits preserve an empty secret field and rotated secrets take effect on the next login', async ({ resources, baseURL }) => {
  const oidc = await startOidcProvider();
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC secret edit', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: oidc.credentials.clientSecret, enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const userPage = await resources.anonymous({ ignoreHTTPSErrors: true });
    const loginOidc = async (name: string) => {
      await userPage.goto('/login');
      await userPage.getByRole('link', { name, exact: true }).click();
      await userPage.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(userPage).toHaveURL(`${baseURL}/`);
      expect((await userPage.request.get('/api/my/api-keys')).status()).toBe(200);
    };
    await loginOidc('OIDC secret edit');
    const userId = (await users())[0].id;
    expect((await userPage.request.post('/api/auth/logout')).status()).toBe(200);
    const adminPage = await resources.anonymous();
    adminPage.setDefaultTimeout(10_000);
    await adminPage.context().addCookies((await resources.admin.storageState()).cookies);
    await adminPage.goto('/admin');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.getByRole('button', { name: /^OIDC/ }).click();
    await adminPage.locator('.provider-card').filter({ hasText: 'OIDC secret edit' }).getByRole('button', { name: 'Edit', exact: true }).click();
    const form = adminPage.locator('.provider-card .form-grid');
    await expect(form.locator('input[type=password]')).toHaveValue('');
    await form.locator('input[type=password]').fill('');
    await form.getByPlaceholder('Display Name', { exact: true }).fill('OIDC renamed');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toHaveCount(0);
    await loginOidc('OIDC renamed');
    expect((await userPage.request.post('/api/auth/logout')).status()).toBe(200);
    expect((await resources.admin.put(`/api/admin/oidc-providers/${providerId}`, { data: { clientSecret: '' } })).status()).toBe(200);
    await loginOidc('OIDC renamed');
    expect((await userPage.request.post('/api/auth/logout')).status()).toBe(200);
    await adminPage.locator('.provider-card').filter({ hasText: 'OIDC renamed' }).getByRole('button', { name: 'Edit', exact: true }).click();
    oidc.credentials.clientSecret = 'rotated-e2e-secret';
    await form.locator('input[type=password]').fill(oidc.credentials.clientSecret);
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toHaveCount(0);
    await loginOidc('OIDC renamed');
    expect((await users()).map((user: { id: string }) => user.id)).toEqual([userId]);
    expect(oidc.exchanges).toHaveLength(4);
    const provider = (await resources.admin.get('/api/admin/oidc-providers').then(r => r.json())).find((provider: { id: string }) => provider.id === providerId);
    expect(provider).not.toHaveProperty('client_secret');
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
    await oidc.close();
  }
});

test('database restore invalidates a warm OIDC configuration so restored credentials can authenticate again', async ({ resources, baseURL }) => {
  const oidc = await startOidcProvider();
  let providerId: string | undefined;
  const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
  try {
    const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC restore cache', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: oidc.credentials.clientSecret, enabled: true, autoCreateUsers: true } });
    expect(created.status()).toBe(201);
    providerId = (await created.json()).id;
    const page = await resources.anonymous({ ignoreHTTPSErrors: true });
    const loginOidc = async () => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'OIDC restore cache', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    };
    await loginOidc();
    const userId = (await users())[0].id;
    const backup = await resources.admin.get('/api/admin/backup');
    expect(backup.status()).toBe(200);
    const buffer = await backup.body();
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    oidc.credentials.clientSecret = 'post-backup-secret';
    expect((await resources.admin.put(`/api/admin/oidc-providers/${providerId}`, { data: { clientSecret: oidc.credentials.clientSecret } })).status()).toBe(200);
    await loginOidc();
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'oidc-cache.db', mimeType: 'application/octet-stream', buffer } } });
    expect(restored.status()).toBe(200);
    oidc.credentials.clientSecret = 'e2e-secret';
    await loginOidc();
    expect((await users()).map((user: { id: string }) => user.id)).toEqual([userId]);
    expect(oidc.exchanges).toHaveLength(3);
    expect((await resources.admin.get('/api/admin/backup?stats=1')).status()).toBe(200);
    await page.reload();
    expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
  } finally {
    for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
    if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
    await oidc.close();
  }
});

for (const binding of ['missing', 'mismatch'] as const) {
  test(`OIDC callback cannot log a different browser with ${binding} state into the initiating identity`, async ({ resources, baseURL }) => {
    const oidc = await startOidcProvider();
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
    try {
      const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC browser binding', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: oidc.credentials.clientSecret, enabled: true, autoCreateUsers: true } });
      expect(created.status()).toBe(201);
      providerId = (await created.json()).id;
      const initiator = await resources.anonymous({ ignoreHTTPSErrors: true });
      const other = await resources.anonymous({ ignoreHTTPSErrors: true });
      oidc.deferCallback = true;
      await initiator.goto('/login');
      await initiator.getByRole('link', { name: 'OIDC browser binding', exact: true }).click();
      await initiator.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(initiator.getByText('Authorization ready', { exact: true })).toBeVisible();
      const callback = oidc.lastCallback;
      expect(callback).toContain('/api/auth/oidc/callback?');
      const flowCookie = (await initiator.context().cookies()).find(cookie => cookie.name === 'erdmini_oidc_state');
      expect(flowCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', value: new URL(callback).searchParams.get('state') });
      let ownCallback = '';
      if (binding === 'mismatch') {
        await other.goto('/login');
        await other.getByRole('link', { name: 'OIDC browser binding', exact: true }).click();
        await other.getByRole('button', { name: 'Continue with test identity' }).click();
        await expect(other.getByText('Authorization ready', { exact: true })).toBeVisible();
        ownCallback = oidc.lastCallback;
        expect(new URL(ownCallback).searchParams.get('state')).not.toBe(new URL(callback).searchParams.get('state'));
      }
      await other.goto(callback);
      await expect(other).toHaveURL(/\/login\?error=auth_failed$/);
      expect((await other.request.get('/api/my/api-keys')).status()).toBe(401);
      expect(await users()).toHaveLength(0);
      expect(oidc.exchanges).toHaveLength(0);
      if (ownCallback) expect((await other.context().cookies()).find(cookie => cookie.name === 'erdmini_oidc_state')?.value).toBe(new URL(ownCallback).searchParams.get('state'));
      await initiator.goto(callback);
      await expect(initiator).toHaveURL(`${baseURL}/`);
      expect((await initiator.request.get('/api/my/api-keys')).status()).toBe(200);
      expect(await users()).toHaveLength(1);
      expect(oidc.exchanges).toHaveLength(1);
      expect((await initiator.context().cookies()).filter(cookie => cookie.name === 'erdmini_oidc_state')).toHaveLength(0);
      if (ownCallback) {
        await other.goto(ownCallback);
        await expect(other).toHaveURL(`${baseURL}/`);
        expect((await other.request.get('/api/my/api-keys')).status()).toBe(200);
        expect(await users()).toHaveLength(1);
        expect(oidc.exchanges).toHaveLength(2);
        expect((await other.context().cookies()).filter(cookie => cookie.name === 'erdmini_oidc_state')).toHaveLength(0);
      }
    } finally {
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
      await oidc.close();
    }
  });
}


for (const failure of ['service-bind', 'user-search', 'disconnect'] as const) {
  test(`LDAP ${failure} failure creates no identity or session and recovers after directory repair`, async ({ resources }) => {
    const ldap = await startLdapProvider();
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
    try {
      const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP directory failure', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, enabled: true, autoCreateUsers: true } });
      expect(created.status()).toBe(201);
      providerId = (await created.json()).id;
      const page = await resources.anonymous();
      const credentials = { providerId, username: ldap.identity.username, password: ldap.identity.password };
      ldap.failure = failure;
      const rejected = await ldapLoginResponse(page.request, credentials);
      expect(rejected.status()).toBe(401);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect((await page.context().cookies()).filter(cookie => cookie.name === 'erdmini_session')).toHaveLength(0);
      expect(await users()).toEqual([]);
      expect(ldap.binds.filter(bind => bind.dn === ldap.userDn)).toEqual([]);
      if (failure === 'service-bind') {
        expect(ldap.binds).toEqual([{ dn: ldap.serviceDn, accepted: false }]);
        expect(ldap.searches).toEqual([]);
      } else expect(ldap.searches).toContainEqual({ base: ldap.userBase, filter: `(uid=${ldap.identity.username})` });
      ldap.failure = undefined;
      const accepted = await ldapLoginResponse(page.request, credentials);
      expect(accepted.status()).toBe(200);
      expect(await users()).toHaveLength(1);
      expect((await users())[0]).toMatchObject({ status: 'active', has_local_auth: false, role: 'user' });
      await page.goto('/');
      await page.reload();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
      expect(ldap.binds).toContainEqual({ dn: ldap.userDn, accepted: true });
      expect(ldap.errors).toEqual([]);
    } finally {
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
      await ldap.close();
    }
  });
}

for (const refresh of ['focus', 'periodic'] as const) {
test(`an open editor refreshes downgraded and restored project permissions through ${refresh}`, async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const permissions = `/api/storage/projects/${project.id}/permissions`;
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const page = await resources.session(account);
  await page.goto('/');
  await page.getByTestId('table-card').click();
  const name = page.getByTestId('table-name-input');
  await expect(name).toBeEnabled();
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
  if (refresh === 'focus') await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(name).toBeDisabled({ timeout: 15_000 });
  await expect(page.getByTestId('add-column')).toBeDisabled();
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(name).toBeEnabled();
  await name.fill('permission_restored');
  await name.press('Enter');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].name).toBe('permission_restored');
  await page.reload();
  await expect(page.getByTestId('table-card')).toContainText('permission_restored');
});

}

for (const failure of ['http', 'network', 'no-access'] as const) {
  test(`permission refresh ${failure} cannot grant local-mode editing and a valid retry recovers`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const page = await resources.session(account);
    await page.goto('/');
    await page.getByTestId('table-card').click();
    const name = page.getByTestId('table-name-input');
    await expect(name).toBeEnabled();
    const endpoint = `**/api/storage/projects/${project.id}/my-permission`;
    await page.route(endpoint, route => failure === 'network' ? route.abort('failed') : route.fulfill({ status: failure === 'http' ? 503 : 200, json: { permission: null } }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(name).toBeDisabled();
    await expect(page.getByTestId('add-column')).toBeDisabled();
    expect((await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables).toEqual(project.schema.tables);
    await page.unroute(endpoint);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(name).toBeEnabled();
    await name.fill('recovered_permission_lookup');
    await name.press('Enter');
    await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].name).toBe('recovered_permission_lookup');
  });
}

test('a delayed older permission response cannot restore editing after a newer downgrade', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const permissions = `/api/storage/projects/${project.id}/permissions`;
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const page = await resources.session(account);
  await page.goto('/');
  await page.getByTestId('table-card').click();
  const name = page.getByTestId('table-name-input');
  await expect(name).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let completed!: () => void;
  const finished = new Promise<void>(resolve => { completed = resolve; });
  let requests = 0;
  await page.route(`**/api/storage/projects/${project.id}/my-permission`, async route => {
    if (++requests !== 1) return route.continue();
    await gate;
    try { await route.fulfill({ json: { permission: 'editor' } }); } finally { completed(); }
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => requests).toBe(1);
    expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(name).toBeDisabled();
    release();
    await finished;
    await expect(name).toBeDisabled();
    await expect(page.getByTestId('add-column')).toBeDisabled();
    expect((await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables).toEqual(project.schema.tables);
  } finally { release(); }
});


test('a pending domain upload cannot apply after editor downgrade and the same file can be retried after permission recovery', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const permissions = `/api/storage/projects/${project.id}/permissions`;
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const page = await resources.session(account);
  await page.goto('/');
  await page.getByTestId('table-card').click();
  await expect(page.getByTestId('table-name-input')).toBeEnabled();
  await delayDomainRead(page);
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
  const dialog = page.locator('.backdrop[role="dialog"]');
  const input = dialog.locator('input[type="file"]');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Name: 'permission_checked_domain', Type: 'INT' }]), 'Domains');
  const upload = { name: 'delayed-domains.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
  await input.setInputFiles(upload);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { domainReadStarted?: boolean }).domainReadStarted)).toBe(true);
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('table-name-input')).toBeDisabled();
  await page.evaluate(() => (window as typeof window & { releaseDomainRead?: () => void }).releaseDomainRead!());
  await expect(input).toHaveValue('');
  await expect(dialog.locator('tr.display-row')).toHaveCount(0);
  const unchanged = await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json());
  expect(unchanged.domains).toEqual(project.schema.domains);
  expect(unchanged.tables).toEqual(project.schema.tables);
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('table-name-input')).toBeEnabled();
  await input.setInputFiles(upload);
  await expect(dialog.locator('tr.display-row').filter({ hasText: 'permission_checked_domain' })).toHaveCount(1);
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).domains.map((domain: { name: string }) => domain.name)).toEqual(['permission_checked_domain']);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
  await expect(page.locator('tr.display-row').filter({ hasText: 'permission_checked_domain' })).toHaveCount(1);
});

test('invalid and duplicate group writes are atomic and preserve membership and shared project access', async ({ resources }) => {
  const group = await resources.group();
  const other = await resources.group();
  const account = await resources.user();
  const project = await resources.project();
  const endpoint = `/api/admin/groups/${group.id}`;
  expect((await resources.admin.put(endpoint, { data: { description: 'Original group description' } })).status()).toBe(200);
  expect((await resources.admin.post(`${endpoint}/members`, { data: { userId: account.id } })).status()).toBe(201);
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId: group.id, permission: 'viewer' } })).status()).toBe(201);
  const member = await resources.session(account);
  const before = await resources.admin.get('/api/admin/groups').then(r => r.json());
  const members = await resources.admin.get(`${endpoint}/members`).then(r => r.json());
  for (const data of [null, [], 'invalid', { name: 123 }, { name: true }, { name: {} }, { name: ['array'] }, { name: '   ' }, { name: 'valid-name', description: 123 }, { name: 'valid-name', description: {} }]) {
    expect((await resources.admin.post('/api/admin/groups', { data })).status(), `create ${JSON.stringify(data)}`).toBe(400);
    expect((await resources.admin.put(endpoint, { data })).status(), `update ${JSON.stringify(data)}`).toBe(400);
  }
  for (const url of ['/api/admin/groups', endpoint]) {
    const response = url === endpoint ? await resources.admin.put(url, { data: '{', headers: { 'Content-Type': 'application/json' } }) : await resources.admin.post(url, { data: '{', headers: { 'Content-Type': 'application/json' } });
    expect(response.status()).toBe(400);
  }
  expect((await resources.admin.post('/api/admin/groups', { data: { name: ` ${group.name} `, description: 'Must not replace original' } })).status()).toBe(409);
  expect((await resources.admin.put(endpoint, { data: { name: ` ${other.name} `, description: 'Must not partially update' } })).status()).toBe(409);
  expect(await resources.admin.get('/api/admin/groups').then(r => r.json())).toEqual(before);
  expect(await resources.admin.get(`${endpoint}/members`).then(r => r.json())).toEqual(members);
  expect((await member.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
  expect((await resources.admin.put(endpoint, { data: { name: ` ${group.name}-renamed `, description: null } })).status()).toBe(200);
  expect((await resources.admin.get('/api/admin/groups').then(r => r.json())).find((row: { id: string }) => row.id === group.id)).toMatchObject({ id: group.id, name: `${group.name}-renamed`, description: null, member_count: 1 });
  expect(await resources.admin.get(`${endpoint}/members`).then(r => r.json())).toEqual(members);
  await member.goto('/');
  await member.reload();
  await expect(member.getByTestId('table-card')).toHaveCount(1);
  expect((await member.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
});

test('group duplicate create and rename errors preserve form values and recover through a corrected browser edit', async ({ resources }) => {
  const group = await resources.group();
  const other = await resources.group();
  const before = await resources.admin.get('/api/admin/groups').then(r => r.json());
  const page = await resources.anonymous();
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Groups/ }).click();
  const section = page.locator('.admin-page .section').filter({ hasText: 'Create Group' });
  await section.getByPlaceholder('Name', { exact: true }).fill(group.name);
  await section.getByPlaceholder('Description', { exact: true }).fill('Keep this failed draft');
  const createResponse = page.waitForResponse(r => r.url().endsWith('/api/admin/groups') && r.request().method() === 'POST');
  await section.getByRole('button', { name: 'Create Group', exact: true }).click();
  expect((await createResponse).status()).toBe(409);
  await expect(section.locator('.msg-error')).toHaveText('Group name already exists');
  await expect(section.getByPlaceholder('Name', { exact: true })).toHaveValue(group.name);
  await expect(section.getByPlaceholder('Description', { exact: true })).toHaveValue('Keep this failed draft');
  await section.locator('tbody tr').filter({ hasText: group.name }).getByRole('button', { name: 'Edit', exact: true }).click();
  const editing = section.locator('tbody tr').filter({ has: page.locator('input.inline-input') });
  await editing.locator('input.inline-input').nth(0).fill(other.name);
  await editing.locator('input.inline-input').nth(1).fill('Keep this failed edit');
  const updateResponse = page.waitForResponse(r => r.url().endsWith(`/api/admin/groups/${group.id}`) && r.request().method() === 'PUT');
  await editing.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await updateResponse).status()).toBe(409);
  await expect(editing.locator('input.inline-input').nth(0)).toHaveValue(other.name);
  await expect(editing.locator('input.inline-input').nth(1)).toHaveValue('Keep this failed edit');
  expect(await resources.admin.get('/api/admin/groups').then(r => r.json())).toEqual(before);
  await editing.locator('input.inline-input').nth(0).fill(`${group.name}-corrected`);
  await editing.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(section.locator('tbody tr').filter({ hasText: `${group.name}-corrected` })).toContainText('Keep this failed edit');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Groups/ }).click();
  await expect(page.locator('tbody tr').filter({ hasText: `${group.name}-corrected` })).toContainText('Keep this failed edit');
});

for (const origin of ['manual', 'other-provider'] as const) {
  test(`OIDC group claims cannot acquire a ${origin} group's project permission through a name collision`, async ({ resources, baseURL }) => {
    const oidc = await startOidcProvider();
    const originOidc = await startOidcProvider();
    const project = await resources.project();
    const collision = `collision-${randomUUID()}`;
    const ownName = `own-${randomUUID()}`;
    const providerIds: string[] = [];
    const emails = [oidc.identity.email, originOidc.identity.email];
    let manualId: string | undefined;
    const page = await resources.anonymous({ ignoreHTTPSErrors: true });
    const createProvider = async (displayName: string, peer = oidc) => {
      const response = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName, issuerUrl: peer.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true, syncGroups: true } });
      expect(response.status()).toBe(201);
      const { id } = await response.json(); providerIds.push(id); return id;
    };
    const login = async (displayName: string) => {
      await page.goto('/login');
      await page.getByRole('link', { name: displayName, exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
    };
    try {
      if (origin === 'manual') {
        const response = await resources.admin.post('/api/admin/groups', { data: { name: collision } });
        expect(response.status()).toBe(201); manualId = (await response.json()).id;
      } else {
        await createProvider('Collision origin', originOidc);
        originOidc.identity.groups = [collision];
        await login('Collision origin');
        expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
      }
      const foreign = (await resources.admin.get('/api/admin/groups').then(r => r.json())).find((group: { name: string }) => group.name === collision);
      const foreignMembers = await resources.admin.get(`/api/admin/groups/${foreign.id}/members`).then(r => r.json());
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId: foreign.id, permission: 'editor' } })).status()).toBe(201);
      const providerId = await createProvider('Collision target');
      oidc.identity.groups = [collision, ownName];
      await login('Collision target');
      const user = (await resources.admin.get('/api/admin/users').then(r => r.json())).find((user: { email: string }) => user.email === oidc.identity.email);
      expect(user.groups).toEqual([ownName]);
      expect((await page.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(403);
      expect(await resources.admin.get(`/api/admin/groups/${foreign.id}/members`).then(r => r.json())).toEqual(foreignMembers);
      const own = (await resources.admin.get('/api/admin/groups').then(r => r.json())).find((group: { name: string }) => group.name === ownName);
      expect(own).toMatchObject({ source: 'oidc', source_provider_id: providerId, member_count: 1 });
      expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
      oidc.identity.groups = [];
      await login('Collision target');
      expect((await resources.admin.get('/api/admin/users').then(r => r.json())).find((row: { id: string }) => row.id === user.id).groups).toEqual([]);
      expect(await resources.admin.get(`/api/admin/groups/${foreign.id}/members`).then(r => r.json())).toEqual(foreignMembers);
      await page.reload();
      expect((await page.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(403);
    } finally {
      const users = await resources.admin.get('/api/admin/users').then(r => r.json());
      for (const user of users.filter((user: { email: string }) => emails.includes(user.email))) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      const groups = await resources.admin.get('/api/admin/groups').then(r => r.json());
      for (const group of groups.filter((group: { source_provider_id: string }) => providerIds.includes(group.source_provider_id))) expect((await resources.admin.delete(`/api/admin/groups/${group.id}`)).status()).toBe(200);
      for (const id of providerIds) expect((await resources.admin.delete(`/api/admin/oidc-providers/${id}`)).status()).toBe(200);
      if (manualId) expect((await resources.admin.delete(`/api/admin/groups/${manualId}`)).status()).toBe(200);
      await oidc.close();
      await originOidc.close();
    }
  });
}


for (const certificate of ['untrusted', 'hostname-mismatch'] as const) {
for (const startTls of [false, true]) {
  test(`LDAP ${startTls ? 'StartTLS' : 'LDAPS'} rejects ${certificate} certificates before sending credentials and recovers after replacement`, async ({ resources }) => {
    const ldap = await startLdapProvider({ startTls, untrustedCertificate: certificate === 'untrusted', hostnameMismatch: certificate === 'hostname-mismatch' });
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
    try {
      const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP untrusted TLS', serverUrl: ldap.serverUrl, startTls, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, enabled: true, autoCreateUsers: true } });
      expect(created.status()).toBe(201); providerId = (await created.json()).id;
      const page = await resources.anonymous();
      const credentials = { providerId, username: ldap.identity.username, password: ldap.identity.password };
      expect((await ldapLoginResponse(page.request, credentials)).status()).toBe(401);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect((await page.context().cookies()).filter(cookie => cookie.name === 'erdmini_session')).toHaveLength(0);
      expect(await users()).toEqual([]);
      expect(ldap.binds).toEqual([]);
      expect(ldap.searches).toEqual([]);
      expect(ldap.encryptedBinds).toBe(0);
      expect(ldap.startTlsRequests).toBe(startTls ? 1 : 0);
      ldap.restoreTrustedCertificate();
      expect((await ldapLoginResponse(page.request, credentials)).status()).toBe(200);
      expect(await users()).toHaveLength(1);
      expect(ldap.binds).toEqual([{ dn: ldap.serviceDn, accepted: true }, { dn: ldap.userDn, accepted: true }]);
      await page.goto('/');
      await page.reload();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
      expect(ldap.errors).toEqual([]);
    } finally {
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
      await ldap.close();
    }
  });
}


}

for (const failure of ['service-bind-timeout', 'user-bind-timeout', 'user-search-timeout', 'group-search-timeout'] as const) {
  test(`LDAP ${failure} is bounded without creating a session and recovers when the directory responds again`, async ({ resources }) => {
    const ldap = await startLdapProvider();
    ldap.identity.groups = [`cn=allowed,${ldap.groupBase}`];
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
    try {
      const created = await resources.admin.post('/api/admin/ldap-providers', { data: { displayName: 'LDAP timeout', serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, ...(failure === 'group-search-timeout' ? { groupSearchBase: ldap.groupBase, allowedGroupDns: ldap.identity.groups[0] } : {}), enabled: true, autoCreateUsers: true } });
      expect(created.status()).toBe(201); providerId = (await created.json()).id;
      const page = await resources.anonymous();
      const credentials = { providerId, username: ldap.identity.username, password: ldap.identity.password };
      ldap.failure = failure;
      expect((await ldapLoginResponse(page.request, credentials, 15_000)).status()).toBe(401);
      expect(await users()).toEqual([]);
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect((await page.context().cookies()).filter(cookie => cookie.name === 'erdmini_session')).toHaveLength(0);
      expect(ldap.binds.filter(bind => bind.dn === ldap.userDn)).toHaveLength(failure === 'user-bind-timeout' || failure === 'group-search-timeout' ? 1 : 0);
      ldap.failure = undefined;
      expect((await ldapLoginResponse(page.request, credentials, 15_000)).status()).toBe(200);
      expect(await users()).toHaveLength(1);
      await page.goto('/');
      await page.reload();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
      expect(ldap.errors).toEqual([]);
    } finally {
      await ldap.close();
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
    }
  });
}

test('the admin LDAP connection check times out without hanging and succeeds after directory repair', async ({ resources }) => {
  const ldap = await startLdapProvider();
  try {
    const data = { serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase };
    ldap.failure = 'service-bind-timeout';
    const failed = await resources.admin.post('/api/admin/ldap-providers/test', { data, timeout: 15_000 });
    expect(failed.status()).toBe(200);
    expect(await failed.json()).toMatchObject({ success: false, error: expect.stringMatching(/timed out/i) });
    expect(ldap.binds).toEqual([{ dn: ldap.serviceDn, accepted: true }]);
    expect(ldap.searches).toEqual([]);
    ldap.failure = undefined;
    const recovered = await resources.admin.post('/api/admin/ldap-providers/test', { data, timeout: 15_000 });
    expect(recovered.status()).toBe(200);
    expect(await recovered.json()).toEqual({ success: true });
    expect(ldap.binds.every(bind => bind.dn === ldap.serviceDn)).toBe(true);
    expect(ldap.searches).toContainEqual({ base: ldap.userBase, filter: '(objectClass=*)' });
    expect(ldap.errors).toEqual([]);
  } finally { await ldap.close(); }
});


for (const failure of ['unavailable', 'malformed-json', 'wrong-issuer', 'missing-authorization-endpoint', 'missing-token-endpoint', 'missing-jwks-uri'] as const) {
  test(`OIDC discovery ${failure} returns to login without identity or state and retries after provider recovery`, async ({ resources, baseURL }) => {
    const oidc = await startOidcProvider();
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
    try {
      const response = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC discovery failure', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true } });
      expect(response.status()).toBe(201); providerId = (await response.json()).id;
      oidc.discoveryFailure = failure;
      const page = await resources.anonymous({ ignoreHTTPSErrors: true });
      await page.goto('/login');
      await page.getByRole('link', { name: 'OIDC discovery failure', exact: true }).click();
      await expect(page).toHaveURL(/\/login\?error=auth_failed$/);
      await expect(page.locator('.error-banner')).toBeVisible();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect((await page.context().cookies()).filter(cookie => ['erdmini_session', 'erdmini_oidc_state'].includes(cookie.name))).toHaveLength(0);
      expect(await users()).toEqual([]);
      expect(oidc.authorizations).toEqual([]);
      expect(oidc.exchanges).toEqual([]);
      expect(oidc.discoveryRequests).toBe(1);
      oidc.discoveryFailure = undefined;
      await page.getByRole('link', { name: 'OIDC discovery failure', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
      expect(oidc.discoveryRequests).toBe(2);
      expect(oidc.exchanges).toHaveLength(1);
      expect(await users()).toHaveLength(1);
      await page.reload();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    } finally {
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
      await oidc.close();
    }
  });
}

for (const boundary of ['expired-state', 'missing-code'] as const) {
  test(`OIDC ${boundary} rejects callback and replay without token exchange and permits fresh login`, async ({ resources, baseURL }) => {
    const oidc = await startOidcProvider();
    let providerId: string | undefined;
    const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === oidc.identity.email);
    try {
      const created = await resources.admin.post('/api/admin/oidc-providers', { data: { displayName: 'OIDC callback state boundary', issuerUrl: oidc.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true } });
      expect(created.status()).toBe(201); providerId = (await created.json()).id;
      oidc.deferCallback = true;
      const page = await resources.anonymous({ ignoreHTTPSErrors: true });
      await page.goto('/login');
      await page.getByRole('link', { name: 'OIDC callback state boundary', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page.getByText('Authorization ready', { exact: true })).toBeVisible();
      const callback = new URL(oidc.lastCallback);
      expect((await page.context().cookies()).find(cookie => cookie.name === 'erdmini_oidc_state')?.value).toBe(callback.searchParams.get('state'));
      if (boundary === 'missing-code') callback.searchParams.delete('code');
      else {
        const backup = await resources.admin.get('/api/admin/backup');
        expect(backup.status()).toBe(200);
        const directory = await mkdtemp(join(tmpdir(), 'erdmini-expired-state-'));
        const path = join(directory, 'expired-state.db');
        let buffer: Buffer;
        try {
          await writeFile(path, await backup.body());
          const candidate = new Database(path);
          try {
            candidate.pragma('journal_mode = DELETE');
            const changed = candidate.prepare('UPDATE oidc_states SET expires_at = ? WHERE state = ?').run('2000-01-01T00:00:00.000Z', callback.searchParams.get('state'));
            expect(changed.changes).toBe(1);
            buffer = candidate.serialize();
          } finally { candidate.close(); }
          const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'expired-state.db', mimeType: 'application/octet-stream', buffer: buffer! } } });
          expect(restored.status()).toBe(200);
        } finally { await rm(directory, { recursive: true, force: true }); }
      }
      await page.goto(callback.href);
      await expect(page).toHaveURL(/\/login\?error=auth_failed$/);
      await expect(page.locator('.error-banner')).toBeVisible();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
      expect((await page.context().cookies()).filter(cookie => ['erdmini_session', 'erdmini_oidc_state'].includes(cookie.name))).toHaveLength(0);
      expect(await users()).toEqual([]);
      expect(oidc.exchanges).toEqual([]);
      await page.goto(oidc.lastCallback);
      await expect(page).toHaveURL(/auth_failed$/);
      expect(oidc.exchanges).toEqual([]);
      expect(await users()).toEqual([]);
      oidc.deferCallback = false;
      await page.getByRole('link', { name: 'OIDC callback state boundary', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with test identity' }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
      expect(oidc.exchanges).toHaveLength(1);
      expect(await users()).toHaveLength(1);
      expect(oidc.authorizations[1].searchParams.get('state')).not.toBe(callback.searchParams.get('state'));
      await page.reload();
      expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
    } finally {
      for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
      if (providerId) expect((await resources.admin.delete(`/api/admin/oidc-providers/${providerId}`)).status()).toBe(200);
      await oidc.close();
    }
  });
}

for (const fallback of ['surviving-project', 'no-projects'] as const) {
  test(`revoked open project becomes readonly and reload prunes it with ${fallback} fallback`, async ({ resources }) => {
    const account = await resources.user();
    const revoked = await resources.project();
    const survivor = fallback === 'surviving-project' ? await resources.project() : undefined;
    for (const project of [revoked, ...(survivor ? [survivor] : [])]) {
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    }
    const page = await resources.session(account);
    const timestamp = new Date().toISOString();
    const projects = [revoked, ...(survivor ? [survivor] : [])].map(project => ({ id: project.id, name: project.name, createdAt: timestamp, updatedAt: timestamp }));
    expect((await page.request.put('/api/storage/index', { data: { version: '1', activeProjectId: revoked.id, projects } })).status()).toBe(200);
    await page.goto('/');
    await expect(page.getByTestId('project-menu-toggle')).toContainText(revoked.name);
    await page.getByTestId('table-card').click();
    await expect(page.getByTestId('table-name-input')).toBeEnabled();
    expect((await resources.admin.delete(`/api/storage/projects/${revoked.id}/permissions`, { data: { userId: account.id } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('table-name-input')).toBeDisabled();
    await expect(page.getByTestId('add-column')).toBeDisabled();
    expect((await page.request.get(`/api/storage/schemas/${revoked.id}`)).status()).toBe(403);
    expect((await page.request.put(`/api/storage/schemas/${revoked.id}`, { data: revoked.schema })).status()).toBe(403);
    await page.reload();
    if (survivor) {
      await expect(page.getByTestId('project-menu-toggle')).toContainText(survivor.name);
      await page.getByTestId('table-card').click();
      await expect(page.getByTestId('table-name-input')).toBeEnabled();
      await page.getByTestId('table-name-input').fill('survivor_after_revocation');
      await page.getByTestId('table-name-input').press('Enter');
      await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${survivor.id}`).then(r => r.json())).tables[0].name).toBe('survivor_after_revocation');
    } else {
      await expect(page.getByTestId('table-card')).toHaveCount(0);
      await expect(page.getByTestId('create-project')).toBeVisible();
    }
    const index = await page.request.get('/api/storage/index').then(r => r.json());
    expect(index.projects.map((project: { id: string }) => project.id)).toEqual(survivor ? [survivor.id] : []);
    expect(index.activeProjectId).toBe(survivor?.id ?? '');
    await page.reload();
    if (survivor) await expect(page.getByTestId('table-card')).toContainText('survivor_after_revocation');
    else await expect(page.getByTestId('table-card')).toHaveCount(0);
    expect((await resources.admin.get(`/api/storage/schemas/${revoked.id}`).then(r => r.json())).tables).toEqual(revoked.schema.tables);
    expect((await page.request.get(`/api/storage/schemas/${revoked.id}`)).status()).toBe(403);
  });
}


for (const conflict of ['independent-fields', 'delete-vs-rename'] as const) {
  for (const order of ['owner-first', 'collaborator-first'] as const) {
    test(`concurrent ${conflict} edits converge and persist with ${order} delivery`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const collaborator = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner);
      const collaboratorGate = await holdCollaborationOperations(collaborator);
      await owner.goto('/');
      await collaborator.goto('/');
      await expect(owner.locator('.peer-count')).toHaveText('2');
      await expect(collaborator.locator('.peer-count')).toHaveText('2');
      await owner.getByTestId('table-card').click();
      await collaborator.getByTestId('table-card').click();
      if (conflict === 'independent-fields') {
        await Promise.all([
          owner.getByTestId('table-name-input').fill('concurrent_name').then(() => owner.getByTestId('table-name-input').press('Enter')),
          collaborator.locator('#tbl-comment').fill('Concurrent collaborator comment'),
        ]);
        await expect.poll(() => ownerGate.operations.some(message => message.op.kind === 'update-table-name')).toBe(true);
        await expect.poll(() => collaboratorGate.operations.some(message => message.op.kind === 'update-table-comment')).toBe(true);
      } else {
        await owner.getByTestId('table-card').getByTestId('delete-table').click();
        await owner.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await collaborator.getByTestId('table-name-input').fill('rename_racing_with_delete');
        await collaborator.getByTestId('table-name-input').press('Enter');
        await expect.poll(() => ownerGate.operations.some(message => message.op.kind === 'delete-table')).toBe(true);
        await expect.poll(() => collaboratorGate.operations.some(message => message.op.kind === 'update-table-name')).toBe(true);
      }
      if (order === 'owner-first') {
        ownerGate.release();
        await expect.poll(() => collaboratorGate.receivedOperations.some(message => message.op.kind === (conflict === 'independent-fields' ? 'update-table-name' : 'delete-table'))).toBe(true);
        collaboratorGate.release();
      } else {
        collaboratorGate.release();
        await expect.poll(() => ownerGate.receivedOperations.some(message => message.op.kind === (conflict === 'independent-fields' ? 'update-table-comment' : 'update-table-name'))).toBe(true);
        ownerGate.release();
      }
      for (const page of [owner, collaborator]) {
        if (conflict === 'independent-fields') {
          await expect(page.getByTestId('table-name-input')).toHaveValue('concurrent_name');
          await expect(page.locator('#tbl-comment')).toHaveValue('Concurrent collaborator comment');
        } else await expect(page.getByTestId('table-card')).toHaveCount(0);
      }
      const schemaUrl = `/api/storage/schemas/${project.id}`;
      await expect.poll(async () => {
        const schema = await resources.admin.get(schemaUrl).then(r => r.json());
        return schema.tables.map((table: { name: string; comment?: string }) => ({ name: table.name, comment: table.comment }));
      }).toEqual(conflict === 'independent-fields' ? [{ name: 'concurrent_name', comment: 'Concurrent collaborator comment' }] : []);
      for (const page of [owner, collaborator]) {
        await page.reload();
        await expect(page.getByTestId('table-card')).toHaveCount(conflict === 'independent-fields' ? 1 : 0);
        if (conflict === 'independent-fields') {
          await page.getByTestId('table-card').click();
          await expect(page.getByTestId('table-name-input')).toHaveValue('concurrent_name');
          await expect(page.locator('#tbl-comment')).toHaveValue('Concurrent collaborator comment');
        }
      }
    });
  }
}

for (const field of ['table-name', 'column-name', 'rapid-table-name'] as const) {
for (const order of ['owner-first', 'collaborator-first'] as const) {
  test(`concurrent same-field ${field} converge to the last server operation with ${order} delivery`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const owner = await resources.anonymous();
    await owner.context().addCookies((await resources.admin.storageState()).cookies);
    const collaborator = await resources.session(account);
    const ownerGate = await holdCollaborationOperations(owner);
    const collaboratorGate = await holdCollaborationOperations(collaborator);
    await owner.goto('/'); await collaborator.goto('/');
    await expect(owner.locator('.peer-count')).toHaveText('2');
    await owner.getByTestId('table-card').click();
    await collaborator.getByTestId('table-card').click();
    if (field === 'column-name') {
      await owner.getByTestId('column-row').first().click();
      await collaborator.getByTestId('column-row').first().click();
    }
    const input = (page: Page) => page.getByTestId(field === 'column-name' ? 'column-name-input' : 'table-name-input');
    const edit = async (page: Page, value: string) => {
      await input(page).fill(value);
      if (field !== 'column-name') await input(page).press('Enter');
    };
    if (field === 'rapid-table-name') await edit(owner, 'owner_intermediate_name');
    await edit(owner, 'owner_concurrent_name');
    await edit(collaborator, 'collaborator_concurrent_name');
    await expect.poll(() => ownerGate.operations.length).toBe(field === 'rapid-table-name' ? 2 : 1);
    await expect.poll(() => collaboratorGate.operations.length).toBe(1);
    if (order === 'owner-first') {
      ownerGate.release();
      await expect.poll(() => collaboratorGate.receivedOperations.length).toBe(field === 'rapid-table-name' ? 2 : 1);
      collaboratorGate.release();
    } else {
      collaboratorGate.release();
      await expect.poll(() => ownerGate.receivedOperations.length).toBe(1);
      ownerGate.release();
    }
    const expected = order === 'owner-first' ? 'collaborator_concurrent_name' : 'owner_concurrent_name';
    for (const page of [owner, collaborator]) await expect(input(page)).toHaveValue(expected);
    await expect.poll(async () => {
      const schema = await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json());
      return field === 'column-name' ? schema.tables[0].columns[0].name : schema.tables[0].name;
    }).toBe(expected);
    for (const page of [owner, collaborator]) {
      await page.reload();
      await expect(page.getByTestId('table-card')).toContainText(expected);
      if (field === 'column-name') {
        await page.getByTestId('table-card').click();
        await page.getByTestId('column-row').first().click();
        await expect(input(page)).toHaveValue(expected);
      }
    }
  });
}

}


for (const mode of ['single', 'group'] as const) {
  for (const order of ['owner-first', 'collaborator-first'] as const) {
    test(`concurrent ${mode} table movement converges with attached memos in ${order} order`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      const schema = { ...project.schema, memos: [{ id: 'attached-note', content: 'Concurrent movement note', width: 180, height: 120, position: { x: 100, y: 340 }, attachedTableId: 'users' }] };
      if (mode === 'group') schema.tables.push({ ...schema.tables[0], id: 'audit', name: 'audit', columns: [{ ...schema.tables[0].columns[0], id: 'audit-id' }], position: { x: 480, y: 100 } });
      expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const collaborator = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner);
      const collaboratorGate = await holdCollaborationOperations(collaborator);
      const table = (page: Page) => page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^users$/ }) });
      const position = (page: Page) => table(page).evaluate(node => ({ x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) }));
      await owner.goto('/'); await collaborator.goto('/');
      await expect(owner.locator('.peer-count')).toHaveText('2');
      for (const page of [owner, collaborator]) {
        await expect(table(page).locator('.memo-chip')).toBeVisible();
        if (mode === 'group') {
          await table(page).click();
          await page.getByTestId('table-card').filter({ hasText: 'audit' }).click({ modifiers: ['ControlOrMeta'] });
        }
      }
      const drag = async (page: Page, dx: number, dy: number) => {
        const handle = table(page).locator('.table-header');
        const box = await handle.boundingBox();
        if (!box) throw new Error('Missing table drag handle');
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
      };
      await drag(owner, 100, 80);
      await drag(collaborator, 200, 140);
      const ownerPosition = await position(owner), collaboratorPosition = await position(collaborator);
      expect(ownerPosition).not.toEqual(collaboratorPosition);
      const lastPosition = (gate: typeof ownerGate) => {
        const op = gate.operations.at(-1)?.op;
        if (op?.kind === 'move-table') return { x: op.x, y: op.y };
        if (op?.kind === 'move-tables') return op.moves.find(move => move.tableId === 'users') && { x: op.moves.find(move => move.tableId === 'users')!.x, y: op.moves.find(move => move.tableId === 'users')!.y };
        return undefined;
      };
      await expect.poll(() => lastPosition(ownerGate)).toEqual(ownerPosition);
      await expect.poll(() => lastPosition(collaboratorGate)).toEqual(collaboratorPosition);
      if (order === 'owner-first') {
        ownerGate.release();
        await expect.poll(() => collaboratorGate.receivedOperations.length).toBe(ownerGate.operations.length);
        collaboratorGate.release();
      } else {
        collaboratorGate.release();
        await expect.poll(() => ownerGate.receivedOperations.length).toBe(collaboratorGate.operations.length);
        ownerGate.release();
      }
      const expected = order === 'owner-first' ? collaboratorPosition : ownerPosition;
      const expectedMemo = { x: expected.x, y: 340 + expected.y - 100 };
      for (const page of [owner, collaborator]) {
        await expect.poll(() => position(page)).toEqual(expected);
        await page.getByTestId('export-menu-toggle').click();
        const pending = page.waitForEvent('download');
        await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
        const exported = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
        expect(exported.memos[0]).toMatchObject({ attachedTableId: 'users', position: expectedMemo });
        if (mode === 'group') expect(exported.tables.find((table: { id: string }) => table.id === 'audit').position).toEqual({ x: 480 + expected.x - 100, y: expected.y });
      }
      await expect.poll(async () => {
        const saved = await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json());
        return { table: saved.tables.find((table: { id: string }) => table.id === 'users').position, memo: saved.memos[0].position };
      }).toEqual({ table: expected, memo: expectedMemo });
      for (const page of [owner, collaborator]) {
        await page.reload();
        await expect.poll(() => position(page)).toEqual(expected);
        await expect(table(page).locator('.memo-chip')).toBeVisible();
      }
    });
  }
}

for (const mode of ['single', 'group'] as const) {
  for (const order of ['owner-first', 'collaborator-first'] as const) {
    test(`concurrent ${mode} memo movement converges and persists in ${order} order`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      const memos = [{ id: 'first-note', content: 'Concurrent first note', width: 180, height: 120, position: { x: 100, y: 340 } }];
      if (mode === 'group') memos.push({ id: 'second-note', content: 'Concurrent second note', width: 180, height: 120, position: { x: 480, y: 340 } });
      expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: { ...project.schema, memos } })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const collaborator = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner);
      const collaboratorGate = await holdCollaborationOperations(collaborator);
      const position = (page: Page) => page.getByTestId('memo-card').first().evaluate(node => ({ x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) }));
      await owner.goto('/'); await collaborator.goto('/');
      await expect(owner.locator('.peer-count')).toHaveText('2');
      for (const page of [owner, collaborator]) {
        await expect(page.getByTestId('memo-card')).toHaveCount(memos.length);
        if (mode === 'group') {
          await page.getByTestId('memo-card').first().locator('.memo-header').click();
          await page.getByTestId('memo-card').nth(1).locator('.memo-header').click({ modifiers: ['ControlOrMeta'] });
          await expect(page.locator('.memo-card.selected')).toHaveCount(2);
        }
      }
      const drag = async (page: Page, dx: number, dy: number) => {
        const box = await page.getByTestId('memo-card').first().locator('.memo-header').boundingBox();
        if (!box) throw new Error('Missing memo drag handle');
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
      };
      await drag(owner, 100, 60); await drag(collaborator, 200, 100);
      const ownerPosition = await position(owner), collaboratorPosition = await position(collaborator);
      expect(ownerPosition).not.toEqual(collaboratorPosition);
      const lastPosition = (gate: typeof ownerGate) => {
        const op = gate.operations.at(-1)?.op;
        if (op?.kind === 'move-memo') return { x: op.x, y: op.y };
        if (op?.kind === 'move-memos') {
          const move = op.moves.find(move => move.memoId === 'first-note');
          return move && { x: move.x, y: move.y };
        }
        return undefined;
      };
      await expect.poll(() => lastPosition(ownerGate)).toEqual(ownerPosition);
      await expect.poll(() => lastPosition(collaboratorGate)).toEqual(collaboratorPosition);
      if (order === 'owner-first') {
        ownerGate.release();
        await expect.poll(() => collaboratorGate.receivedOperations.length).toBe(ownerGate.operations.length);
        collaboratorGate.release();
      } else {
        collaboratorGate.release();
        await expect.poll(() => ownerGate.receivedOperations.length).toBe(collaboratorGate.operations.length);
        ownerGate.release();
      }
      const expected = order === 'owner-first' ? collaboratorPosition : ownerPosition;
      const expectedPositions = mode === 'group' ? [expected, { x: expected.x + 380, y: expected.y }] : [expected];
      const allPositions = (page: Page) => page.getByTestId('memo-card').evaluateAll(nodes => nodes.map(node => ({ x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) })));
      for (const page of [owner, collaborator]) await expect.poll(() => allPositions(page)).toEqual(expectedPositions);
      await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).memos.map((memo: { position: object }) => memo.position)).toEqual(expectedPositions);
      for (const page of [owner, collaborator]) {
        await page.reload();
        await expect.poll(() => allPositions(page)).toEqual(expectedPositions);
      }
      expect((await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables).toEqual(project.schema.tables);
    });
  }
}

for (const order of ['owner-first', 'collaborator-first'] as const) {
  test(`concurrent column reorder converges to the accepted full order with ${order} delivery without losing constraints`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    const schema = { ...project.schema, tables: [{ ...project.schema.tables[0],
      columns: ['id', 'tenant', 'email', 'code'].map((name, index) => ({ ...project.schema.tables[0].columns[0], id: name, name, primaryKey: index === 0, unique: index === 0 })),
      uniqueKeys: [{ id: 'pair', name: 'pair', columnIds: ['id', 'tenant'] }],
      indexes: [{ id: 'idx', name: 'idx', columnIds: ['email', 'code'], unique: false }],
      foreignKeys: [{ id: 'self', columnIds: ['email'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }],
    }] };
    expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: schema })).status()).toBe(200);
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const owner = await resources.anonymous();
    await owner.context().addCookies((await resources.admin.storageState()).cookies);
    const collaborator = await resources.session(account);
    const ownerGate = await holdCollaborationOperations(owner);
    const collaboratorGate = await holdCollaborationOperations(collaborator);
    await owner.setViewportSize({ width: 1440, height: 1000 });
    await collaborator.setViewportSize({ width: 1440, height: 1000 });
    await owner.goto('/'); await collaborator.goto('/');
    await expect(owner.locator('.peer-count')).toHaveText('2');
    for (const page of [owner, collaborator]) await page.getByTestId('table-card').click();
    const drag = async (page: Page, from: number, to: number) => {
      const rows = page.getByTestId('column-row');
      const handle = rows.nth(from).locator('.drag-handle');
      await handle.hover();
      const source = await handle.boundingBox(), target = await rows.nth(to).boundingBox();
      if (!source || !target) throw new Error('Missing reorder endpoints');
      await page.mouse.down();
      await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2, { steps: 5 });
      await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 10 });
      await page.mouse.up();
    };
    await drag(owner, 3, 0); await drag(collaborator, 1, 3);
    const ownerOrder = ['code', 'id', 'tenant', 'email'];
    const collaboratorOrder = ['id', 'email', 'code', 'tenant'];
    await expect(owner.getByTestId('column-row').locator('.col-name')).toHaveText(ownerOrder);
    await expect(collaborator.getByTestId('column-row').locator('.col-name')).toHaveText(collaboratorOrder);
    await expect.poll(() => ownerGate.operations.length).toBe(1);
    await expect.poll(() => collaboratorGate.operations.length).toBe(1);
    if (order === 'owner-first') {
      ownerGate.release();
      await expect.poll(() => collaboratorGate.receivedOperations.length).toBe(1);
      collaboratorGate.release();
    } else {
      collaboratorGate.release();
      await expect.poll(() => ownerGate.receivedOperations.length).toBe(1);
      ownerGate.release();
    }
    const expected = order === 'owner-first' ? collaboratorOrder : ownerOrder;
    for (const page of [owner, collaborator]) await expect(page.getByTestId('column-row').locator('.col-name')).toHaveText(expected);
    await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].columns.map((column: { id: string }) => column.id)).toEqual(expected);
    for (const page of [owner, collaborator]) {
      await page.reload(); await page.getByTestId('table-card').click();
      await expect(page.getByTestId('column-row').locator('.col-name')).toHaveText(expected);
    }
    const saved = (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0];
    expect(saved.uniqueKeys).toEqual(schema.tables[0].uniqueKeys);
    expect(saved.indexes).toEqual(schema.tables[0].indexes);
    expect(saved.foreignKeys).toEqual(schema.tables[0].foreignKeys);
    expect([...saved.columns].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...schema.tables[0].columns].sort((a, b) => a.id.localeCompare(b.id)));
  });
}

for (const target of ['namespace', 'category'] as const) {
  for (const order of ['owner-first', 'collaborator-first'] as const) {
    test(`concurrent ${target} reorder converges without changing membership with ${order} delivery`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      const schema = { ...project.schema, schemas: ['alpha', 'beta', 'gamma'], tables: [{ ...project.schema.tables[0], schema: 'alpha' }], dbObjectCategories: ['Views', 'Functions', 'Empty'], dbObjects: [
        { id: 'view1', name: 'accounts_view', category: 'Views', sql: 'SELECT 1;', schema: 'alpha' },
        { id: 'view2', name: 'orders_view', category: 'Views', sql: 'SELECT 2;', schema: 'beta' },
        { id: 'function1', name: 'count_accounts', category: 'Functions', sql: 'SELECT 3;', schema: 'gamma' },
      ] };
      expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const collaborator = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner);
      const collaboratorGate = await holdCollaborationOperations(collaborator);
      await owner.goto('/'); await collaborator.goto('/');
      await expect(owner.locator('.peer-count')).toHaveText('2');
      for (const page of [owner, collaborator]) {
        await page.getByTestId('table-card').click();
        await expect(page.getByTestId('table-name-input')).toBeEnabled();
        if (target === 'category') await page.getByRole('button', { name: /objects 3/i }).click();
      }
      const names = target === 'namespace' ? schema.schemas : schema.dbObjectCategories;
      const item = (page: Page, name: string) => target === 'namespace'
        ? page.locator('.schema-tab-wrapper').filter({ has: page.getByRole('button', { name, exact: true }) })
        : page.locator('.category-group').filter({ has: page.locator('.category-name', { hasText: new RegExp(`^${name}$`) }) }).locator('.category-header');
      const labels = (page: Page) => page.locator(target === 'namespace' ? '.schema-tab-wrapper .schema-tab' : '.category-name');
      await item(owner, names[2]).dragTo(item(owner, names[0]));
      await item(collaborator, names[1]).dragTo(item(collaborator, names[2]));
      const ownerOrder = [names[2], names[0], names[1]], collaboratorOrder = [names[0], names[2], names[1]];
      await expect(labels(owner)).toHaveText(ownerOrder);
      await expect(labels(collaborator)).toHaveText(collaboratorOrder);
      await expect.poll(() => ownerGate.operations.length).toBe(1);
      await expect.poll(() => collaboratorGate.operations.length).toBe(1);
      if (order === 'owner-first') {
        ownerGate.release();
        await expect.poll(() => collaboratorGate.receivedOperations.length).toBe(1);
        collaboratorGate.release();
      } else {
        collaboratorGate.release();
        await expect.poll(() => ownerGate.receivedOperations.length).toBe(1);
        ownerGate.release();
      }
      const expected = order === 'owner-first' ? collaboratorOrder : ownerOrder;
      for (const page of [owner, collaborator]) await expect(labels(page)).toHaveText(expected);
      const field = target === 'namespace' ? 'schemas' : 'dbObjectCategories';
      await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json()))[field]).toEqual(expected);
      for (const page of [owner, collaborator]) {
        await page.reload();
        if (target === 'category') await page.getByRole('button', { name: /objects 3/i }).click();
        await expect(labels(page)).toHaveText(expected);
      }
      const saved = await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json());
      expect(saved.tables).toEqual(schema.tables);
      expect(saved.dbObjects).toEqual(schema.dbObjects);
    });
  }
}

test('collaborators create, edit, move and delete DB objects and categories with undo, redo and persisted reload', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  await owner.goto('/'); await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  for (const page of [owner, collaborator]) {
    await page.getByTestId('table-card').click();
    await expect(page.getByTestId('table-name-input')).toBeEnabled();
    await page.getByRole('button', { name: /objects 0/i }).click();
  }
  const category = (page: Page, name: string) => page.locator('.category-group').filter({ has: page.locator('.category-name', { hasText: new RegExp(`^${name}$`) }) });
  const addCategory = async (page: Page, name: string) => {
    await page.getByRole('button', { name: /add category/i }).click();
    await page.locator('.category-input').fill(name);
    await page.locator('.category-input').press('Enter');
  };
  await addCategory(owner, 'Views');
  await expect(category(collaborator, 'Views')).toBeVisible();
  await category(owner, 'Views').locator('.cat-add-btn').click();
  const ownerEditor = owner.locator('.db-object-editor');
  await ownerEditor.locator('#dbo-name').fill('active_accounts');
  await ownerEditor.locator('#dbo-comment').fill('Created by owner');
  await ownerEditor.locator('.ddl-toggle input').check();
  await ownerEditor.locator('.cm-content').fill('CREATE VIEW active_accounts AS SELECT id FROM users;');
  await expect(category(collaborator, 'Views').locator('.object-name')).toHaveText(['active_accounts']);
  await category(collaborator, 'Views').locator('.object-item').click();
  const peerEditor = collaborator.locator('.db-object-editor');
  await expect(peerEditor.locator('#dbo-comment')).toHaveValue('Created by owner');
  await expect(peerEditor.locator('.cm-content')).toContainText('CREATE VIEW active_accounts AS SELECT id FROM users;');
  await expect(peerEditor.locator('.ddl-toggle input')).toBeChecked();
  await addCategory(owner, 'Reports');
  await expect(category(collaborator, 'Reports')).toBeVisible();
  await peerEditor.locator('#dbo-category').selectOption('Reports');
  await peerEditor.locator('#dbo-comment').fill('Updated by collaborator');
  await peerEditor.locator('.cm-content').fill('CREATE VIEW active_accounts AS SELECT id FROM users WHERE id > 0;');
  await expect(category(owner, 'Reports').locator('.object-name')).toHaveText(['active_accounts']);
  await expect(ownerEditor.locator('#dbo-comment')).toHaveValue('Updated by collaborator');
  await expect(ownerEditor.locator('.cm-content')).toContainText('WHERE id > 0');
  await category(owner, 'Reports').hover();
  await category(owner, 'Reports').locator('.cat-action-btn:not(.cat-action-delete)').click();
  await owner.locator('.category-rename-input').fill('Reporting');
  await owner.locator('.category-rename-input').press('Enter');
  await expect(category(collaborator, 'Reporting').locator('.object-name')).toHaveText(['active_accounts']);
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).dbObjects?.[0]).toMatchObject({ name: 'active_accounts', category: 'Reporting', comment: 'Updated by collaborator', includeInDdl: true, sql: 'CREATE VIEW active_accounts AS SELECT id FROM users WHERE id > 0;' });
  const persisted = await resources.admin.get(schemaUrl).then(r => r.json());
  for (const page of [owner, collaborator]) {
    await page.reload();
    await page.getByRole('button', { name: /objects 1/i }).click();
    await expect(category(page, 'Reporting').locator('.object-name')).toHaveText(['active_accounts']);
  }
  const row = category(owner, 'Reporting').locator('.object-row');
  await row.hover(); await row.locator('.object-delete-btn').click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(category(collaborator, 'Reporting').locator('.object-name')).toHaveCount(1);
  await row.hover(); await row.locator('.object-delete-btn').click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(collaborator.locator('.object-name')).toHaveCount(0);
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).dbObjects).toEqual([]);
  await owner.getByRole('button', { name: /^Undo/ }).click();
  await expect(category(collaborator, 'Reporting').locator('.object-name')).toHaveText(['active_accounts']);
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).dbObjects).toEqual(persisted.dbObjects);
  await owner.getByRole('button', { name: /^Redo/ }).click();
  await expect(collaborator.locator('.object-name')).toHaveCount(0);
  await category(owner, 'Reporting').hover();
  await category(owner, 'Reporting').locator('.cat-action-delete').click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(category(collaborator, 'Reporting')).toHaveCount(0);
  await owner.getByRole('button', { name: /^Undo/ }).click();
  await expect(category(collaborator, 'Reporting')).toBeVisible();
  await owner.getByRole('button', { name: /^Redo/ }).click();
  await expect(category(collaborator, 'Reporting')).toHaveCount(0);
  for (const page of [owner, collaborator]) {
    await page.reload();
    await page.getByRole('button', { name: /objects 0/i }).click();
    await expect(page.locator('.category-name')).toHaveText(['Views']);
    await expect(page.locator('.object-name')).toHaveCount(0);
  }
  expect((await resources.admin.get(schemaUrl).then(r => r.json())).tables).toEqual(project.schema.tables);
});

test('collaborators propagate target DBMS changes and clearing without losing schema data', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  await owner.goto('/'); await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await expect(owner.locator('.dbms-select')).toBeEnabled();
  await expect(collaborator.locator('.dbms-select')).toBeEnabled();
  await owner.locator('.dbms-select').selectOption('postgresql');
  await expect(collaborator.locator('.dbms-select')).toHaveValue('postgresql');
  await collaborator.locator('.dbms-select').selectOption('mysql');
  await expect(owner.locator('.dbms-select')).toHaveValue('mysql');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).dialect).toBe('mysql');
  await collaborator.locator('.dbms-select').selectOption('');
  await expect(owner.locator('.dbms-select')).toHaveValue('');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).dialect ?? null).toBeNull();
  await owner.locator('.dbms-select').selectOption('postgresql');
  await expect(collaborator.locator('.dbms-select')).toHaveValue('postgresql');
  await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).dialect).toBe('postgresql');
  for (const page of [owner, collaborator]) {
    await page.reload();
    await expect(page.locator('.dbms-select')).toHaveValue('postgresql');
  }
  const saved = await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json());
  expect(saved.tables).toEqual(project.schema.tables);
  expect(saved.memos).toEqual([]);
  expect(saved.domains).toEqual([]);
});

test('multi-row domain import propagates every update and addition with linked columns, undo, redo and reload', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schema = { ...project.schema, domains: [{ id: 'identifier-domain', name: 'identifier', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }], tables: [{ ...project.schema.tables[0], columns: [{ ...project.schema.tables[0].columns[0], domainId: 'identifier-domain' }] }] };
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const collaborator = await resources.session(account);
  await owner.goto('/'); await collaborator.goto('/');
  await expect(owner.locator('.peer-count')).toHaveText('2');
  const domains = (page: Page) => page.locator('.backdrop[role="dialog"]');
  const openDomains = async (page: Page) => {
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
  };
  for (const page of [owner, collaborator]) await openDomains(page);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Name: 'identifier', Type: 'VARCHAR', Length: 64, PrimaryKey: 'Y', Unique: 'Y' },
    { Name: 'status_code', Type: 'INT', Default: 0 },
    { Name: 'audit_label', Type: 'VARCHAR', Length: 40 },
  ]), 'Domains');
  await domains(owner).locator('input[type=file]').setInputFiles({ name: 'multi-domain.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
  await expect(domains(owner)).toContainText(/2 added.*1 updated/i);
  for (const page of [owner, collaborator]) await expect(domains(page).locator('tr.display-row')).toHaveCount(3);
  const names = ['audit_label', 'identifier', 'status_code'];
  let expectedDomains: unknown;
  for (const page of [owner, collaborator]) {
    await domains(page).getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByTestId('export-menu-toggle').click();
    const pending = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
    const exported = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
    expect(exported.domains.map((domain: { name: string }) => domain.name).sort()).toEqual(names);
    expect(exported.tables[0].columns[0]).toMatchObject({ id: 'id', domainId: 'identifier-domain', type: 'VARCHAR', length: 64, primaryKey: true, unique: true });
    if (page === owner) expectedDomains = exported.domains;
    else expect(exported.domains).toEqual(expectedDomains);
  }
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).domains).toEqual(expectedDomains);
  await owner.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).domains).toEqual(schema.domains);
  await openDomains(collaborator);
  await expect(domains(collaborator).locator('tr.display-row')).toHaveCount(1);
  await domains(collaborator).getByRole('button', { name: 'Close', exact: true }).click();
  await owner.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).domains).toEqual(expectedDomains);
  for (const page of [owner, collaborator]) {
    await page.reload(); await openDomains(page);
    await expect(domains(page).locator('tr.display-row')).toHaveCount(3);
  }
  expect((await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].columns[0]).toMatchObject({ type: 'VARCHAR', length: 64, domainId: 'identifier-domain' });
});


for (const startTls of [false, true]) {
  for (const action of ['login', 'admin-check'] as const) {
    test(`LDAP ${startTls ? 'StartTLS' : 'LDAPS'} stalled TLS handshake bounds ${action} before credentials and recovers on the same listener`, async ({ resources }) => {
      const ldap = await startLdapProvider({ startTls, stallTlsHandshake: true });
      let providerId: string | undefined;
      const users = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((user: { email: string }) => user.email === ldap.identity.email);
      try {
        const data = { displayName: 'LDAP handshake timeout', serverUrl: ldap.serverUrl, startTls, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, enabled: true, autoCreateUsers: true };
        const created = await resources.admin.post('/api/admin/ldap-providers', { data });
        expect(created.status()).toBe(201); providerId = (await created.json()).id;
        const page = await resources.anonymous();
        const credentials = { providerId, username: ldap.identity.username, password: ldap.identity.password };
        if (action === 'login') expect((await ldapLoginResponse(page.request, credentials, 15_000)).status()).toBe(401);
        else {
          const failed = await resources.admin.post('/api/admin/ldap-providers/test', { data, timeout: 15_000 });
          expect(failed.status()).toBe(200);
          expect(await failed.json()).toMatchObject({ success: false, error: expect.stringMatching(/connection timeout|TLS handshake timed out/i) });
        }
        expect(ldap.acceptedConnections).toBe(1);
        expect(ldap.startTlsRequests).toBe(startTls ? 1 : 0);
        expect(ldap.encryptedBinds).toBe(0);
        expect(ldap.binds).toEqual([]);
        expect(ldap.searches).toEqual([]);
        expect(await users()).toEqual([]);
        expect((await page.request.get('/api/my/api-keys')).status()).toBe(401);
        expect((await page.context().cookies()).filter(cookie => cookie.name === 'erdmini_session')).toHaveLength(0);
        ldap.resumeTlsHandshake();
        if (action === 'admin-check') {
          const repaired = await resources.admin.post('/api/admin/ldap-providers/test', { data, timeout: 15_000 });
          expect(repaired.status()).toBe(200); expect(await repaired.json()).toEqual({ success: true });
        }
        expect((await ldapLoginResponse(page.request, credentials, 15_000)).status()).toBe(200);
        expect(await users()).toHaveLength(1);
        expect(ldap.binds).toEqual(expect.arrayContaining([{ dn: ldap.serviceDn, accepted: true }, { dn: ldap.userDn, accepted: true }]));
        await page.goto('/'); await page.reload();
        expect((await page.request.get('/api/my/api-keys')).status()).toBe(200);
        expect(ldap.errors).toEqual([]);
      } finally {
        await ldap.close();
        for (const user of await users()) expect((await resources.admin.delete(`/api/admin/users/${user.id}`)).status()).toBe(200);
        if (providerId) expect((await resources.admin.delete(`/api/admin/ldap-providers/${providerId}`)).status()).toBe(200);
      }
    });
  }
}

for (const change of ['add', 'delete'] as const) {
  for (const order of ['reorder-first', 'change-first'] as const) {
    test(`column reorder versus concurrent ${change} preserves current columns and constraints in ${order} order`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      const schema = { ...project.schema, tables: [{ ...project.schema.tables[0],
        columns: ['id', 'tenant', 'email', 'code'].map((name, index) => ({ ...project.schema.tables[0].columns[0], id: name, name, primaryKey: index === 0, unique: index === 0 })),
        uniqueKeys: [{ id: 'pair', name: 'pair', columnIds: ['id', 'tenant'] }],
        indexes: [{ id: 'idx', name: 'idx', columnIds: ['email', 'code'], unique: false }],
        foreignKeys: [{ id: 'self', columnIds: ['email'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }],
      }] };
      const schemaUrl = `/api/storage/schemas/${project.id}`;
      expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const collaborator = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner), peerGate = await holdCollaborationOperations(collaborator);
      for (const page of [owner, collaborator]) {
        page.setDefaultTimeout(10_000);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/');
        await page.getByTestId('table-card').click();
        await expect(page.getByTestId('table-name-input')).toBeEnabled();
      }
      await expect(owner.locator('.peer-count')).toHaveText('2');
      const rows = owner.getByTestId('column-row');
      const handle = rows.nth(3).locator('.drag-handle');
      await handle.hover();
      const source = await handle.boundingBox(), target = await rows.first().boundingBox();
      if (!source || !target) throw new Error('Missing reorder endpoints');
      await owner.mouse.down();
      await owner.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2, { steps: 5 });
      await owner.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 10 });
      await owner.mouse.up();
      await expect(rows.locator('.col-name')).toHaveText(['code', 'id', 'tenant', 'email']);
      let addedColumn: Column | undefined;
      if (change === 'add') {
        await collaborator.getByTestId('add-column').click();
        const popup = collaborator.getByTestId('column-edit-popup');
        await popup.getByTestId('column-name-input').fill('added_concurrently');
        await popup.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(collaborator.getByTestId('column-row').locator('.col-name')).toHaveText(['id', 'tenant', 'email', 'code', 'added_concurrently']);
        await expect.poll(() => peerGate.operations.length).toBe(2);
        const addition = peerGate.operations.find(message => message.op.kind === 'add-column')?.op;
        if (addition?.kind !== 'add-column') throw new Error('Missing column creation operation');
        addedColumn = { ...addition.column, name: 'added_concurrently' };
      } else {
        const email = collaborator.getByTestId('column-row').filter({ has: collaborator.locator('.col-name', { hasText: /^email$/ }) });
        await email.hover();
        await email.locator('.col-del-btn').click();
        await collaborator.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(collaborator.getByTestId('column-row').locator('.col-name')).toHaveText(['id', 'tenant', 'code']);
        await expect.poll(() => peerGate.operations.length).toBe(1);
      }
      await expect.poll(() => ownerGate.operations.length).toBe(1);
      if (order === 'reorder-first') {
        ownerGate.release(); await expect.poll(() => peerGate.receivedOperations.length).toBe(1); peerGate.release();
      } else {
        peerGate.release(); await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerGate.operations.length); ownerGate.release();
      }
      const expected = change === 'add' ? ['code', 'id', 'tenant', 'email', 'added_concurrently'] : ['code', 'id', 'tenant'];
      for (const page of [owner, collaborator]) await expect(page.getByTestId('column-row').locator('.col-name')).toHaveText(expected);
      await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].columns.map((column: { name: string }) => column.name)).toEqual(expected);
      for (const page of [owner, collaborator]) {
        await page.reload(); await page.getByTestId('table-card').click();
        await expect(page.getByTestId('column-row').locator('.col-name')).toHaveText(expected);
      }
      const saved = (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0];
      expect(saved.uniqueKeys).toEqual(schema.tables[0].uniqueKeys);
      expect(saved.indexes).toEqual(change === 'add' ? schema.tables[0].indexes : []);
      expect(saved.foreignKeys).toEqual(change === 'add' ? schema.tables[0].foreignKeys : []);
      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
      const expectedColumns = [...schema.tables[0].columns];
      if (change === 'add') {
        if (!addedColumn) throw new Error('Missing expected added column');
        expectedColumns.push(addedColumn);
      } else {
        expectedColumns.splice(expectedColumns.findIndex(column => column.id === 'email'), 1);
      }
      expect([...saved.columns].sort(byName)).toEqual(expectedColumns.sort(byName));
    });
  }
}

function constraintCollaborationSchema(original: ReturnType<typeof sampleSchema>, withAlternate = false): ERDSchema {
  const schema: ERDSchema = { ...original, tables: (withAlternate ? ['parent', 'child', 'alternate'] : ['parent', 'child']).map((name, index) => ({
    id: name, name, position: { x: index < 2 ? 80 + index * 420 : 80, y: index < 2 ? 150 : 500 },
    columns: ['id', 'tenant', 'code', 'keep'].map(column => ({ ...original.tables[0].columns[0], type: 'INT' as const, id: `${name}_${column}`, name: column, primaryKey: column === 'id', unique: column === 'id' })),
    foreignKeys: [],
    uniqueKeys: [{ id: `${name}_keep_uk`, name: 'keep_pair', columnIds: [`${name}_tenant`, `${name}_keep`] }],
    indexes: [{ id: `${name}_keep_index`, name: 'keep_lookup', columnIds: [`${name}_keep`], unique: false }],
  })) };
  schema.tables[1].foreignKeys = [{ id: 'keep_fk', columnIds: ['child_keep'], referencedTableId: 'parent', referencedColumnIds: ['parent_keep'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION', label: 'Keep relation' }];
  return schema;
}

test('live collaborator FK, UK and index creation and FK self-retarget preserve valid composite references in both directions', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schema = constraintCollaborationSchema(project.schema);
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const peer = await resources.session(account);
  const ownerGate = await holdCollaborationOperations(owner), peerGate = await holdCollaborationOperations(peer);
  ownerGate.release(); peerGate.release();
  for (const page of [owner, peer]) {
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^child$/ }) }).click();
    await expect(page.getByTestId('table-name-input')).toHaveValue('child');
  }
  await expect(owner.locator('.peer-count')).toHaveText('2');
  const choose = async (page: Page, trigger: ReturnType<Page['locator']>, name: string) => {
    await trigger.click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${name}$`) }).click();
  };
  await peer.getByTestId('add-foreign-key').click();
  const fkModal = peer.getByTestId('fk-modal');
  await choose(peer, fkModal.locator('.form-row .ss-trigger').first(), 'parent');
  await choose(peer, fkModal.locator('.pair-row').first().locator('.ss-trigger').first(), 'code');
  await choose(peer, fkModal.locator('.pair-row').first().locator('.ss-trigger').last(), 'id');
  await fkModal.locator('.btn-add-pair').click();
  await choose(peer, fkModal.locator('.pair-row').nth(1).locator('.ss-trigger').first(), 'tenant');
  await choose(peer, fkModal.locator('.pair-row').nth(1).locator('.ss-trigger').last(), 'tenant');
  await choose(peer, fkModal.locator('.form-row-2col .ss-trigger').first(), 'CASCADE');
  await choose(peer, fkModal.locator('.form-row-2col .ss-trigger').last(), 'RESTRICT');
  await fkModal.locator('#fkm-label').fill('Live composite relation');
  await fkModal.getByTestId('fk-submit').click();
  await expect(owner.locator('.fk-section .fk-row')).toHaveCount(2);
  await owner.locator('.fk-section .fk-row').last().locator('button[title="Edit"]').click();
  await expect(owner.getByTestId('fk-modal').locator('#fkm-label')).toHaveValue('Live composite relation');
  await owner.getByTestId('fk-modal').getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const [page, kind] of [[owner, 'unique'], [peer, 'index']] as const) {
    await page.getByTestId('table-editor').getByRole('button', { name: kind === 'unique' ? /add unique/i : /add index/i }).click();
    const modal = page.locator('.modal[role="dialog"]');
    await modal.locator('#constraint-name').fill(kind === 'unique' ? 'live_pair' : 'live_lookup');
    await choose(page, modal.locator('.ss-trigger').first(), 'code');
    await modal.locator('.btn-add-col').click();
    await choose(page, modal.locator('.ss-trigger').nth(1), 'tenant');
    await modal.locator('.btn-submit').click();
    await expect((page === owner ? peer : owner).locator(kind === 'unique' ? '.uk-section .fk-row' : '.idx-section .fk-row')).toHaveCount(2);
  }
  await expect.poll(() => ownerGate.operations.map(message => message.op.kind)).toEqual(['add-uk']);
  await expect.poll(() => peerGate.operations.map(message => message.op.kind)).toEqual(['add-fk', 'update-fk', 'add-index']);
  const fkOp = peerGate.operations.find(message => message.op.kind === 'update-fk')?.op;
  const ukOp = ownerGate.operations[0].op;
  const indexOp = peerGate.operations.find(message => message.op.kind === 'add-index')?.op;
  if (fkOp?.kind !== 'update-fk' || ukOp.kind !== 'add-uk' || indexOp?.kind !== 'add-index') throw new Error('Missing live constraint operations');
  expect(fkOp.fk).toMatchObject({ columnIds: ['child_code', 'child_tenant'], referencedTableId: 'parent', referencedColumnIds: ['parent_id', 'parent_tenant'], onDelete: 'CASCADE', onUpdate: 'RESTRICT', label: 'Live composite relation' });
  expect(ukOp.uk).toMatchObject({ name: 'live_pair', columnIds: ['child_code', 'child_tenant'] });
  expect(indexOp.index).toMatchObject({ name: 'live_lookup', columnIds: ['child_code', 'child_tenant'], unique: false });
  await owner.locator('.fk-section .fk-row').last().locator('button[title="Edit"]').click();
  const retarget = owner.getByTestId('fk-modal');
  await choose(owner, retarget.locator('.form-row .ss-trigger').first(), 'child');
  await choose(owner, retarget.locator('.pair-row').first().locator('.ss-trigger').last(), 'id');
  await choose(owner, retarget.locator('.pair-row').nth(1).locator('.ss-trigger').last(), 'keep');
  await choose(owner, retarget.locator('.form-row-2col .ss-trigger').first(), 'NO ACTION');
  await choose(owner, retarget.locator('.form-row-2col .ss-trigger').last(), 'CASCADE');
  await retarget.locator('#fkm-label').fill('Live self relation');
  await retarget.getByTestId('fk-submit').click();
  await expect.poll(() => ownerGate.operations.map(message => message.op.kind)).toEqual(['add-uk', 'update-fk', 'update-fk']);
  const finalFkOp = ownerGate.operations.at(-1)?.op;
  if (finalFkOp?.kind !== 'update-fk') throw new Error('Missing live FK retarget');
  expect(finalFkOp.fk).toEqual({ ...fkOp.fk, referencedTableId: 'child', referencedColumnIds: ['child_id', 'child_keep'], onDelete: 'NO ACTION', onUpdate: 'CASCADE', label: 'Live self relation' });
  await peer.locator('.fk-section .fk-row').last().locator('button[title="Edit"]').click();
  await expect(peer.getByTestId('fk-modal').locator('#fkm-label')).toHaveValue('Live self relation');
  await peer.getByTestId('fk-modal').getByRole('button', { name: 'Cancel', exact: true }).click();
  const expected = schema.tables.map(table => table.id === 'child' ? { ...table, foreignKeys: [...table.foreignKeys, finalFkOp.fk], uniqueKeys: [...table.uniqueKeys, ukOp.uk], indexes: [...table.indexes, indexOp.index] } : table);
  const verify = async (page: Page) => {
    await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^child$/ }) }).click();
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(2);
    await expect(page.locator('.uk-section .fk-row')).toHaveCount(2);
    await expect(page.locator('.idx-section .fk-row')).toHaveCount(2);
    await page.getByTestId('export-menu-toggle').click();
    const pending = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
    const download = await pending;
    expect(JSON.parse(await readFile((await download.path())!, 'utf8')).tables).toEqual(expected);
  };
  for (const page of [owner, peer]) await verify(page);
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables).toEqual(expected);
  for (const page of [owner, peer]) { await page.reload(); await verify(page); }
});

for (const action of ['creation', 'retarget'] as const) {
  for (const conflict of ['fk-source-column', 'fk-target-column', 'fk-source-table', 'fk-target-table', 'fk-record', 'uk-column', 'index-column'] as const) {
    if ((action === 'retarget' && !conflict.startsWith('fk-')) || (action === 'creation' && conflict === 'fk-record')) continue;
    for (const order of ['delete-first', 'constraint-first'] as const) {
      test(`concurrent ${conflict} deletion versus constraint ${action} converges without dangling references in ${order} order`, async ({ resources }) => {
        const account = await resources.user();
        const project = await resources.project();
        const schema = constraintCollaborationSchema(project.schema, action === 'retarget');
        if (action === 'retarget') schema.tables[1].foreignKeys.push({ id: 'stable_fk', columnIds: ['child_tenant'], referencedTableId: 'parent', referencedColumnIds: ['parent_tenant'], onDelete: 'NO ACTION', onUpdate: 'CASCADE', label: 'Stable relation' });
        const schemaUrl = `/api/storage/schemas/${project.id}`;
        expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
        expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
        const owner = await resources.anonymous();
        await owner.context().addCookies((await resources.admin.storageState()).cookies);
        const peer = await resources.session(account);
        const ownerGate = await holdCollaborationOperations(owner), peerGate = await holdCollaborationOperations(peer);
        const select = async (page: Page, name: string) => {
          await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: new RegExp(`^${name}$`) }) }).click();
          await expect(page.getByTestId('table-name-input')).toHaveValue(name);
        };
        for (const page of [owner, peer]) {
          page.setDefaultTimeout(10_000);
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.goto('/');
          await expect(page.getByTestId('table-card')).toHaveCount(schema.tables.length);
        }
        await expect(owner.locator('.peer-count')).toHaveText('2');
        const deletedTable = conflict.includes('target') ? (action === 'retarget' ? 'alternate' : 'parent') : 'child';
        const deletesRecord = conflict === 'fk-record';
        const deletesTable = conflict.endsWith('-table');
        const deletedColumn = conflict === 'fk-target-column' ? 'id' : 'code';
        await select(owner, deletedTable);
        if (deletesRecord) {
          await owner.locator('.fk-section .fk-row').first().locator('button.del').click();
          await expect(owner.locator('.fk-section .fk-row')).toHaveCount(1);
        } else if (deletesTable) {
          const card = owner.getByTestId('table-card').filter({ has: owner.locator('.table-name', { hasText: new RegExp(`^${deletedTable}$`) }) });
          await card.hover();
          await card.getByTestId('delete-table').click();
          await owner.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
        } else {
          const row = owner.getByTestId('column-row').filter({ has: owner.locator('.col-name', { hasText: new RegExp(`^${deletedColumn}$`) }) });
          await row.hover();
          await row.locator('.col-del-btn').click();
          await expect(row).toHaveCount(0);
        }
        await select(peer, 'child');
        const choose = async (trigger: ReturnType<Page['locator']>, name: string) => {
          await trigger.click();
          await peer.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${name}$`) }).click();
        };
        const kind = conflict.startsWith('fk-') ? (action === 'retarget' ? 'update-fk' : 'add-fk') : conflict === 'uk-column' ? 'add-uk' : 'add-index';
        const section = kind === 'add-fk' || kind === 'update-fk' ? '.fk-section' : kind === 'add-uk' ? '.uk-section' : '.idx-section';
        if (kind === 'add-fk' || kind === 'update-fk') {
          if (action === 'retarget') await peer.locator('.fk-section .fk-row').first().locator('button[title="Edit"]').click();
          else await peer.getByTestId('add-foreign-key').click();
          const modal = peer.getByTestId('fk-modal');
          await choose(modal.locator('.form-row .ss-trigger').first(), action === 'retarget' ? 'alternate' : 'parent');
          await choose(modal.locator('.pair-row').first().locator('.ss-trigger').first(), 'code');
          await choose(modal.locator('.pair-row').first().locator('.ss-trigger').last(), 'id');
          await modal.locator('.btn-add-pair').click();
          await choose(modal.locator('.pair-row').nth(1).locator('.ss-trigger').first(), 'tenant');
          await choose(modal.locator('.pair-row').nth(1).locator('.ss-trigger').last(), 'tenant');
          if (action === 'retarget') await modal.locator('#fkm-label').fill('Retargeted relation');
          await modal.getByTestId('fk-submit').click();
        } else {
          await peer.getByTestId('table-editor').getByRole('button', { name: kind === 'add-uk' ? /add unique/i : /add index/i }).click();
          const modal = peer.locator('.modal[role="dialog"]');
          await modal.locator('#constraint-name').fill('concurrent_candidate');
          await choose(modal.locator('.ss-trigger').first(), 'code');
          await modal.locator('.btn-add-col').click();
          await choose(modal.locator('.ss-trigger').nth(1), 'tenant');
          await modal.locator('.btn-submit').click();
        }
        await expect(peer.locator(`${section} .fk-row`)).toHaveCount(2);
        await expect.poll(() => ownerGate.operations.map(message => message.op.kind)).toEqual([deletesRecord ? 'delete-fk' : deletesTable ? 'delete-table' : 'delete-column']);
        await expect.poll(() => peerGate.operations.map(message => message.op.kind)).toEqual(action === 'retarget' ? ['update-fk', 'update-fk'] : [kind]);
        if (action === 'retarget') {
          const last = peerGate.operations.at(-1)?.op;
          if (last?.kind !== 'update-fk') throw new Error('Missing retarget operation');
          expect(last.fk).toMatchObject({ id: 'keep_fk', columnIds: ['child_code', 'child_tenant'], referencedTableId: 'alternate', referencedColumnIds: ['alternate_id', 'alternate_tenant'], label: 'Retargeted relation' });
        }
        if (order === 'delete-first') {
          ownerGate.release(); await expect.poll(() => peerGate.receivedOperations.length).toBe(1); peerGate.release();
          await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerGate.operations.length);
        } else {
          peerGate.release(); await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerGate.operations.length); ownerGate.release();
          await expect.poll(() => peerGate.receivedOperations.length).toBe(1);
        }
        const expectedTables = schema.tables.filter(table => !deletesTable || table.id !== deletedTable).map(table => ({
          ...table,
          columns: table.columns.filter(column => deletesRecord || deletesTable || table.id !== deletedTable || column.id !== `${deletedTable}_${deletedColumn}`),
          foreignKeys: table.foreignKeys.filter(fk => (action !== 'retarget' || fk.id !== 'keep_fk') && (!deletesTable || fk.referencedTableId !== deletedTable)),
        }));
        const verify = async (page: Page) => {
          await expect(page.getByTestId('table-card')).toHaveCount(expectedTables.length);
          for (const table of expectedTables) {
            await select(page, table.name);
            await expect(page.getByTestId('column-row').locator('.col-name')).toHaveText(table.columns.map(column => column.name));
            await expect(page.locator('.fk-section .fk-row')).toHaveCount(table.foreignKeys.length);
            await expect(page.locator('.uk-section .fk-row')).toHaveCount(table.uniqueKeys.length);
            await expect(page.locator('.idx-section .fk-row')).toHaveCount(table.indexes.length);
          }
          await page.getByTestId('export-menu-toggle').click();
          const pending = page.waitForEvent('download');
          await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
          const download = await pending;
          const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
          expect(exported.tables).toEqual(expectedTables);
          expect(exported.domains).toEqual(schema.domains);
          expect(exported.memos).toEqual(schema.memos);
        };
        for (const page of [owner, peer]) await verify(page);
        await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables).toEqual(expectedTables);
        for (const page of [owner, peer]) { await page.reload(); await verify(page); }
      });
    }
  }
}

for (const action of ['attach', 'detach', 'reattach', 'create-attach'] as const) {
  for (const deletion of ['single', 'group', 'none'] as const) {
    for (const order of ['delete-first', 'memo-first'] as const) {
      if (deletion === 'none' && order === 'memo-first') continue;
      test(deletion === 'none' ? `live memo ${action} preserves content, position and linkage across browsers` : `concurrent memo ${action} versus ${deletion} table deletion preserves content, position and linkage in ${order} order`, async ({ resources }) => {
        const account = await resources.user();
        const project = await resources.project();
        const schema = constraintCollaborationSchema(project.schema, true);
        const active = { id: 'concurrent_note', content: 'Concurrent memo', color: 'blue', width: 180, height: 100, position: { x: 360, y: 420 }, ...(action === 'detach' ? { attachedTableId: 'parent' } : action === 'reattach' ? { attachedTableId: 'child' } : {}) };
        const targetNote = { id: 'target_note', content: 'Existing target note', color: 'yellow', width: 160, height: 100, position: { x: 80, y: 360 }, attachedTableId: 'parent' };
        const stableNote = { id: 'stable_note', content: 'Stable memo', color: 'green', width: 160, height: 100, position: { x: 500, y: 360 }, attachedTableId: 'child' };
        schema.memos = action === 'create-attach' ? [targetNote, stableNote] : [active, targetNote, stableNote];
        const schemaUrl = `/api/storage/schemas/${project.id}`;
        expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
        expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
        const owner = await resources.anonymous();
        await owner.context().addCookies((await resources.admin.storageState()).cookies);
        const peer = await resources.session(account);
        const ownerGate = await holdCollaborationOperations(owner), peerGate = await holdCollaborationOperations(peer);
        const table = (page: Page, name: string) => page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: new RegExp(`^${name}$`) }) });
        const exportClient = async (page: Page): Promise<ERDSchema> => {
          await page.getByTestId('export-menu-toggle').click();
          const pending = page.waitForEvent('download');
          await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
          const download = await pending;
          return JSON.parse(await readFile((await download.path())!, 'utf8'));
        };
        for (const page of [owner, peer]) {
          page.setDefaultTimeout(10_000);
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.goto('/');
          await expect(page.getByTestId('table-card')).toHaveCount(3);
        }
        await expect(owner.locator('.peer-count')).toHaveText('2');
        if (deletion === 'group') {
          await table(owner, 'parent').click();
          await table(owner, 'alternate').click({ modifiers: ['ControlOrMeta'] });
          await expect(owner.locator('[data-testid="table-card"].selected')).toHaveCount(2);
          await owner.keyboard.press('Delete');
        } else if (deletion === 'single') {
          await table(owner, 'parent').hover();
          await table(owner, 'parent').getByTestId('delete-table').click();
        }
        if (deletion !== 'none') await owner.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect.poll(() => ownerGate.operations.map(message => message.op.kind)).toEqual(deletion === 'none' ? [] : [deletion === 'group' ? 'delete-tables' : 'delete-table']);
        if (action === 'create-attach') {
          await peer.locator('button.btn-memo').click();
          const editing = peer.getByTestId('memo-card').locator('.memo-textarea');
          await editing.fill('Concurrent memo');
          await editing.blur();
          const created = peer.getByTestId('memo-card').filter({ hasText: 'Concurrent memo' });
          await created.locator('.memo-header').click();
          await created.getByRole('button', { name: 'blue', exact: true }).click();
        } else if (action === 'detach' || action === 'reattach') {
          await table(peer, action === 'detach' ? 'parent' : 'child').locator('.memo-chip').filter({ hasText: 'Concurrent memo' }).click();
          await expect(peer.getByTestId('memo-card').filter({ hasText: 'Concurrent memo' })).toBeVisible();
        }
        if (action !== 'detach') {
          const header = peer.getByTestId('memo-card').filter({ hasText: 'Concurrent memo' }).locator('.memo-header');
          await header.hover();
          const from = await header.boundingBox(), to = await table(peer, 'parent').boundingBox();
          if (!from || !to) throw new Error('Missing memo attachment drag endpoints');
          await peer.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
          await peer.mouse.down();
          await peer.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
          await peer.mouse.up();
          await expect(table(peer, 'parent').locator('.memo-chip').filter({ hasText: 'Concurrent memo' })).toBeVisible();
          await expect(peer.getByTestId('memo-card').filter({ hasText: 'Concurrent memo' })).toHaveCount(0);
        }
        const local = await exportClient(peer);
        const localMemo = local.memos.find(memo => memo.content === 'Concurrent memo');
        if (!localMemo) throw new Error('Missing collaborator memo');
        expect(localMemo).toMatchObject({ content: 'Concurrent memo', color: 'blue', width: action === 'create-attach' ? 200 : 180, height: action === 'create-attach' ? 150 : 100 });
        expect(localMemo.attachedTableId).toBe(action === 'detach' ? undefined : 'parent');
        expect(local.memos.find(memo => memo.id === 'stable_note')).toEqual(stableNote);
        expect(local.memos.find(memo => memo.id === 'target_note')).toEqual(targetNote);
        if (action === 'detach') {
          expect(localMemo.position).toEqual({ x: schema.tables[0].position.x, y: schema.tables[0].position.y - localMemo.height - 12 });
          await expect.poll(() => peerGate.operations.some(message => message.op.kind === 'detach-memo')).toBe(true);
        } else {
          await expect.poll(() => {
            const last = peerGate.operations.filter(message => message.op.kind === 'move-memo').at(-1)?.op;
            return last?.kind === 'move-memo' ? { x: last.x, y: last.y } : undefined;
          }).toEqual(localMemo.position);
          await expect.poll(() => peerGate.operations.some(message => message.op.kind === 'attach-memo' && message.op.tableId === 'parent')).toBe(true);
        }
        if (action === 'create-attach') expect(peerGate.operations.some(message => message.op.kind === 'add-memo')).toBe(true);
        if (action === 'reattach') expect(peerGate.operations.some(message => message.op.kind === 'detach-memo')).toBe(true);
        const peerCount = peerGate.operations.length;
        if (deletion === 'none') {
          ownerGate.release(); peerGate.release();
          await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerCount);
        } else if (order === 'delete-first') {
          ownerGate.release(); await expect.poll(() => peerGate.receivedOperations.length).toBe(1); peerGate.release();
          await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerCount);
        } else {
          peerGate.release(); await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerCount); ownerGate.release();
          await expect.poll(() => peerGate.receivedOperations.length).toBe(1);
        }
        const deleted = new Set(deletion === 'none' ? [] : deletion === 'group' ? ['parent', 'alternate'] : ['parent']);
        const expectedTables = schema.tables.filter(item => !deleted.has(item.id)).map(item => ({ ...item, foreignKeys: item.foreignKeys.filter(fk => !deleted.has(fk.referencedTableId)) }));
        const expectedMemos = local.memos.map(memo => {
          const { attachedTableId, ...rest } = memo;
          return attachedTableId && deleted.has(attachedTableId) ? rest : memo;
        });
        const verify = async (page: Page) => {
          await expect(page.getByTestId('table-card')).toHaveCount(expectedTables.length);
          const free = page.getByTestId('memo-card').filter({ hasText: 'Concurrent memo' });
          if (deletion === 'none' && action !== 'detach') {
            await expect(free).toHaveCount(0);
            await expect(table(page, 'parent').locator('.memo-chip').filter({ hasText: 'Concurrent memo' })).toBeVisible();
          } else {
            await expect(free).toBeVisible();
            await expect(free.locator('.memo-text')).toHaveText('Concurrent memo');
          }
          await expect(table(page, 'child').locator('.memo-chip').filter({ hasText: 'Stable memo' })).toBeVisible();
          await expect(table(page, 'child').locator('.memo-chip').filter({ hasText: 'Concurrent memo' })).toHaveCount(0);
          const exported = await exportClient(page);
          expect(exported.tables).toEqual(expectedTables);
          expect(exported.memos).toEqual(expectedMemos);
          expect(exported.domains).toEqual(schema.domains);
        };
        for (const page of [owner, peer]) await verify(page);
        await expect.poll(async () => {
          const stored = await resources.admin.get(schemaUrl).then(r => r.json());
          return { tables: stored.tables, memos: stored.memos };
        }).toEqual({ tables: expectedTables, memos: expectedMemos });
        for (const page of [owner, peer]) { await page.reload(); await verify(page); }
      });
    }
  }
}

for (const mode of ['single', 'group'] as const) {
  for (const order of ['mover-first', 'detacher-first'] as const) {
    test(`concurrent ${mode} memo movement versus detachment converges to the accepted position in ${order} order`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      const schema: ERDSchema = { ...project.schema,
        tables: [{ ...project.schema.tables[0], columns: project.schema.tables[0].columns.map(column => ({ ...column, type: 'INT' as const })), position: { x: 100, y: 312 } }],
        memos: [
          { id: 'moving-note', content: 'Moving note', color: 'blue', width: 180, height: 120, position: { x: 400, y: 550 }, attachedTableId: 'users' },
          { id: 'other-note', content: 'Other note', color: 'pink', width: 180, height: 120, position: { x: 600, y: 500 } },
          { id: 'stable-note', content: 'Stable link', color: 'green', width: 160, height: 100, position: { x: 100, y: 500 }, attachedTableId: 'users' },
        ],
      };
      const schemaUrl = `/api/storage/schemas/${project.id}`;
      expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const peer = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner), peerGate = await holdCollaborationOperations(peer);
      const memo = (page: Page, content: string) => page.getByTestId('memo-card').filter({ hasText: content });
      const position = (page: Page, content: string) => memo(page, content).evaluate(node => ({ x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) }));
      for (const page of [owner, peer]) {
        page.setDefaultTimeout(10_000);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/');
        await expect(page.getByTestId('table-card').locator('.memo-chip').filter({ hasText: 'Moving note' })).toBeVisible();
      }
      await expect(owner.locator('.peer-count')).toHaveText('2');
      for (const page of [owner, peer]) {
        await page.getByTestId('table-card').locator('.memo-chip').filter({ hasText: 'Moving note' }).click();
        await expect(memo(page, 'Moving note')).toBeVisible();
      }
      const detachedPosition = { x: 100, y: 180 };
      expect(await position(peer, 'Moving note')).toEqual(detachedPosition);
      await memo(owner, 'Moving note').locator('.memo-header').click();
      if (mode === 'group') {
        await memo(owner, 'Other note').locator('.memo-header').click({ modifiers: ['ControlOrMeta'] });
        await expect(owner.locator('.memo-card.selected')).toHaveCount(2);
      }
      const box = await memo(owner, 'Moving note').locator('.memo-header').boundingBox();
      if (!box) throw new Error('Missing memo movement handle');
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await owner.mouse.move(x, y); await owner.mouse.down();
      await owner.mouse.move(x + 300, y + 160, { steps: 8 }); await owner.mouse.up();
      const movedPosition = await position(owner, 'Moving note');
      const otherPosition = await position(owner, 'Other note');
      expect(movedPosition).not.toEqual(detachedPosition);
      await expect.poll(() => {
        const op = ownerGate.operations.filter(message => message.op.kind === 'move-memo' || message.op.kind === 'move-memos').at(-1)?.op;
        if (op?.kind === 'move-memo') return { x: op.x, y: op.y };
        if (op?.kind === 'move-memos') { const move = op.moves.find(item => item.memoId === 'moving-note'); return move && { x: move.x, y: move.y }; }
        return undefined;
      }).toEqual(movedPosition);
      expect(ownerGate.operations[0].op).toMatchObject({ kind: 'detach-memo', memoId: 'moving-note', position: detachedPosition });
      await expect.poll(() => peerGate.operations.map(message => message.op)).toEqual([{ kind: 'detach-memo', memoId: 'moving-note', position: detachedPosition }]);
      const ownerCount = ownerGate.operations.length;
      if (order === 'mover-first') {
        ownerGate.release(); await expect.poll(() => peerGate.receivedOperations.length).toBe(ownerCount); peerGate.release();
        await expect.poll(() => ownerGate.receivedOperations.length).toBe(1);
      } else {
        peerGate.release(); await expect.poll(() => ownerGate.receivedOperations.length).toBe(1); ownerGate.release();
        await expect.poll(() => peerGate.receivedOperations.length).toBe(ownerCount);
      }
      const expectedPosition = order === 'mover-first' ? detachedPosition : movedPosition;
      const expectedMemos = schema.memos.map(item => {
        if (item.id === 'moving-note') { const { attachedTableId, ...rest } = item; return { ...rest, position: expectedPosition }; }
        return item.id === 'other-note' ? { ...item, position: otherPosition } : item;
      });
      const verify = async (page: Page) => {
        await expect.poll(() => position(page, 'Moving note')).toEqual(expectedPosition);
        await expect.poll(() => position(page, 'Other note')).toEqual(otherPosition);
        await expect(page.getByTestId('table-card').locator('.memo-chip')).toHaveCount(1);
        await expect(page.getByTestId('table-card').locator('.memo-chip')).toContainText('Stable link');
        await page.getByTestId('export-menu-toggle').click();
        const pending = page.waitForEvent('download');
        await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
        const download = await pending;
        const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
        expect(exported.memos).toEqual(expectedMemos);
        expect(exported.tables).toEqual(schema.tables);
        expect(exported.domains).toEqual(schema.domains);
      };
      for (const page of [owner, peer]) await verify(page);
      await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).memos).toEqual(expectedMemos);
      for (const page of [owner, peer]) { await page.reload(); await verify(page); }
    });
  }
}

for (const conflict of ['attach-attach', 'attach-detach'] as const) {
  for (const order of ['owner-first', 'peer-first'] as const) {
    test(`concurrent memo ${conflict} converges to the accepted attachment and position in ${order} order`, async ({ resources }) => {
      const account = await resources.user();
      const project = await resources.project();
      const schema = constraintCollaborationSchema(project.schema, true);
      schema.memos = [
        { id: 'racing-note', content: 'Racing note', color: 'blue', width: 180, height: 100, position: { x: 360, y: 420 }, ...(conflict === 'attach-detach' ? { attachedTableId: 'parent' } : {}) },
        { id: 'stable-note', content: 'Stable link', color: 'green', width: 160, height: 100, position: { x: 80, y: 750 }, attachedTableId: 'alternate' },
      ];
      const schemaUrl = `/api/storage/schemas/${project.id}`;
      expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const peer = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner), peerGate = await holdCollaborationOperations(peer);
      const table = (page: Page, name: string) => page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: new RegExp(`^${name}$`) }) });
      const free = (page: Page) => page.getByTestId('memo-card').filter({ hasText: 'Racing note' });
      const exportClient = async (page: Page): Promise<ERDSchema> => {
        await page.getByTestId('export-menu-toggle').click();
        const pending = page.waitForEvent('download');
        await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
        const download = await pending;
        return JSON.parse(await readFile((await download.path())!, 'utf8'));
      };
      for (const page of [owner, peer]) {
        page.setDefaultTimeout(10_000);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/');
        await expect(page.getByTestId('table-card')).toHaveCount(3);
        if (conflict === 'attach-detach') await expect(table(page, 'parent').locator('.memo-chip').filter({ hasText: 'Racing note' })).toBeVisible();
        else await expect(free(page)).toBeVisible();
      }
      await expect(owner.locator('.peer-count')).toHaveText('2');
      if (conflict === 'attach-detach') {
        for (const page of [owner, peer]) await table(page, 'parent').locator('.memo-chip').filter({ hasText: 'Racing note' }).click();
      }
      const attach = async (page: Page, name: string) => {
        const header = free(page).locator('.memo-header');
        await header.hover();
        const from = await header.boundingBox(), target = await table(page, name).boundingBox();
        if (!from || !target) throw new Error('Missing racing attachment endpoints');
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 }); await page.mouse.up();
        await expect(table(page, name).locator('.memo-chip').filter({ hasText: 'Racing note' })).toBeVisible();
      };
      await attach(owner, 'child');
      if (conflict === 'attach-attach') await attach(peer, 'parent');
      const ownerState = (await exportClient(owner)).memos.find(memo => memo.id === 'racing-note')!;
      const peerState = (await exportClient(peer)).memos.find(memo => memo.id === 'racing-note')!;
      expect(ownerState.attachedTableId).toBe('child');
      expect(peerState.attachedTableId).toBe(conflict === 'attach-attach' ? 'parent' : undefined);
      for (const [gate, state] of [[ownerGate, ownerState], [peerGate, peerState]] as const) {
        if (!state.attachedTableId) continue;
        await expect.poll(() => {
          const op = gate.operations.filter(message => message.op.kind === 'move-memo').at(-1)?.op;
          return op?.kind === 'move-memo' ? { x: op.x, y: op.y } : undefined;
        }).toEqual(state.position);
        expect(gate.operations.some(message => message.op.kind === 'attach-memo' && message.op.tableId === state.attachedTableId)).toBe(true);
      }
      const ownerCount = ownerGate.operations.length, peerCount = peerGate.operations.length;
      if (order === 'owner-first') {
        ownerGate.release(); await expect.poll(() => peerGate.receivedOperations.length).toBe(ownerCount); peerGate.release();
        await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerCount);
      } else {
        peerGate.release(); await expect.poll(() => ownerGate.receivedOperations.length).toBe(peerCount); ownerGate.release();
        await expect.poll(() => peerGate.receivedOperations.length).toBe(ownerCount);
      }
      const expectedMemo = order === 'owner-first' ? peerState : ownerState;
      const expectedMemos = schema.memos.map(memo => memo.id === 'racing-note' ? expectedMemo : memo);
      const verify = async (page: Page) => {
        if (expectedMemo.attachedTableId) {
          await expect(free(page)).toHaveCount(0);
          await expect(table(page, expectedMemo.attachedTableId).locator('.memo-chip').filter({ hasText: 'Racing note' })).toBeVisible();
        } else {
          await expect(free(page)).toBeVisible();
          await expect(free(page).locator('.memo-text')).toHaveText('Racing note');
        }
        await expect(table(page, 'alternate').locator('.memo-chip')).toContainText('Stable link');
        const exported = await exportClient(page);
        expect(exported.tables).toEqual(schema.tables);
        expect(exported.memos).toEqual(expectedMemos);
        expect(exported.domains).toEqual(schema.domains);
      };
      for (const page of [owner, peer]) await verify(page);
      await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).memos).toEqual(expectedMemos);
      for (const page of [owner, peer]) { await page.reload(); await verify(page); }
    });
  }
}

test('admin pending-user filter updates after approval and restores the complete list when no pending users remain', async ({ resources }) => {
  const first = await resources.user();
  const second = await resources.user();
  const active = await resources.user();
  for (const account of [first, second]) {
    expect((await resources.admin.put(`/api/admin/users/${account.id}`, { data: { status: 'pending' } })).status()).toBe(200);
  }
  const page = await resources.anonymous();
  page.setDefaultTimeout(10_000);
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  const row = (account: Account) => page.locator('tbody tr').filter({ hasText: account.username });
  await expect(row(active)).toBeVisible();
  const filter = page.getByRole('checkbox', { name: /pending/i });
  await expect(filter).toBeVisible();
  await filter.check();
  await expect(row(first)).toBeVisible();
  await expect(row(second)).toBeVisible();
  await expect(row(active)).toHaveCount(0);
  await row(first).getByRole('button', { name: /Approve/i }).click();
  await expect(row(first)).toHaveCount(0);
  await expect(row(second)).toBeVisible();
  expect((await resources.admin.get(`/api/admin/users/${first.id}`).then(r => r.json())).status).toBe('active');
  await filter.uncheck();
  await expect(row(first)).toBeVisible();
  await expect(row(active)).toBeVisible();
  await filter.check();
  await row(second).getByRole('button', { name: /Approve/i }).click();
  await expect(filter).toHaveCount(0);
  for (const account of [first, second, active]) await expect(row(account)).toBeVisible();
  await page.reload();
  for (const account of [first, second, active]) {
    await expect(row(account)).toBeVisible();
    expect((await resources.admin.get(`/api/admin/users/${account.id}`).then(r => r.json())).status).toBe('active');
  }
});

for (const version of [2, 4, 8, 12, 16]) {
  test(`restoring a genuine version ${version} schema migrates accounts, sessions and projects to the current version`, async ({ resources }) => {
    const project = await resources.project();
    const current = await resources.admin.get('/api/admin/backup?stats=1').then(r => r.json());
    const response = await resources.admin.get('/api/admin/backup');
    expect(response.status()).toBe(200);
    const original = await response.body();
    const directory = await mkdtemp(join(tmpdir(), 'erdmini-historical-e2e-'));
    let buffer: Buffer;
    try {
      const originalPath = join(directory, 'current.db');
      await writeFile(originalPath, original);
      const source = new Database(originalPath, { readonly: true });
      const candidate = new Database(join(directory, 'historical.db'));
      try {
        const files = (await readdir('src/lib/server/migrations')).filter(name => /^V\d{3}__.*\.sql$/.test(name) && Number(name.slice(1, 4)) <= version).sort();
        expect(files).toHaveLength(version);
        for (const file of files) candidate.exec(await readFile(join('src/lib/server/migrations', file), 'utf8'));
        candidate.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')), success INTEGER NOT NULL DEFAULT 1)");
        const migrations = source.prepare('SELECT * FROM schema_migrations WHERE version <= ? ORDER BY version').all(version) as Record<string, unknown>[];
        for (const row of migrations) candidate.prepare('INSERT INTO schema_migrations (version, description, checksum, applied_at, success) VALUES (?, ?, ?, ?, ?)').run(row.version, row.description, row.checksum, row.applied_at, row.success);
        for (const table of ['users', 'sessions', 'project_index', 'schemas', 'canvas_states', 'project_permissions']) {
          const columns = (candidate.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(column => column.name);
          const rows = source.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all() as Record<string, unknown>[];
          candidate.prepare(`DELETE FROM ${table}`).run();
          const insert = candidate.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
          for (const row of rows) insert.run(...columns.map(column => row[column]));
        }
        if (version === 2) candidate.prepare('DELETE FROM project_permissions WHERE project_id = ?').run(project.id);
        expect(candidate.pragma('quick_check', { simple: true })).toBe('ok');
        buffer = candidate.serialize();
      } finally {
        candidate.close();
        source.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    try {
      const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: `version-${version}.db`, mimeType: 'application/octet-stream', buffer: buffer! } } });
      expect(restored.status(), await restored.text()).toBe(200);
      expect((await resources.admin.get('/api/admin/backup?stats=1').then(r => r.json())).migrationVersion).toBe(current.migrationVersion);
      expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
      const permissions = await resources.admin.get(`/api/storage/projects/${project.id}/permissions`).then(r => r.json());
      expect(permissions.permissions).toEqual(expect.arrayContaining([expect.objectContaining({ permission: 'owner' })]));
      const page = await resources.anonymous();
      page.setDefaultTimeout(10_000);
      await page.context().addCookies((await resources.admin.storageState()).cookies);
      await page.goto('/');
      await expect(page.getByTestId('table-card')).toContainText('users');
      await page.getByTestId('table-card').click();
      await page.getByTestId('table-name-input').fill(`migrated_version_${version}`);
      await page.getByTestId('table-name-input').press('Enter');
      await expect.poll(async () => (await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables[0].name).toBe(`migrated_version_${version}`);
      await page.reload();
      await expect(page.getByTestId('table-card')).toContainText(`migrated_version_${version}`);
      await page.close();
    } finally {
      expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'current.db', mimeType: 'application/octet-stream', buffer: original } } })).status()).toBe(200);
    }
  });
}

test('restore filesystem preparation failure preserves live data, sessions and subsequent collaborator edits', async ({ resources }, testInfo) => {
  const databasePath = testInfo.config.webServer?.env?.DB_PATH;
  expect(databasePath).toMatch(/^data\/playwright-e2e-\d+\.db$/);
  const safetyPath = `${databasePath}.pre-restore`;
  const account = await resources.user();
  const project = await resources.project();
  const schemaUrl = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const backup = await resources.admin.get('/api/admin/backup');
  expect(backup.status()).toBe(200);
  const buffer = await backup.body();
  const owner = await resources.anonymous();
  await owner.context().addCookies((await resources.admin.storageState()).cookies);
  const peer = await resources.session(account);
  for (const page of [owner, peer]) {
    page.setDefaultTimeout(10_000);
    await page.goto('/');
    await expect(page.getByTestId('table-card')).toContainText('users');
  }
  await expect(owner.locator('.peer-count')).toHaveText('2');
  await owner.getByTestId('table-card').click();
  await owner.getByTestId('table-name-input').fill('live_before_filesystem_failure');
  await owner.getByTestId('table-name-input').press('Enter');
  await expect(peer.getByTestId('table-card')).toContainText('live_before_filesystem_failure');
  await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('live_before_filesystem_failure');
  const live = await resources.admin.get(schemaUrl).then(r => r.json());
  // A directory at the safety-file destination makes the real rename fail without
  // changing permissions or touching any database outside this run's isolated path.
  await mkdir(safetyPath);
  try {
    const restored = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'backup.db', mimeType: 'application/octet-stream', buffer } } });
    expect(restored.status()).toBe(500);
    expect((await restored.json()).error).toContain('could not rename current DB');
    expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(live);
    expect((await peer.request.get(schemaUrl)).status()).toBe(200);
    await expect(owner.locator('.peer-count')).toHaveText('2', { timeout: 15_000 });
    await expect(peer.getByTestId('table-card')).toContainText('live_before_filesystem_failure');
    await peer.getByTestId('table-card').click();
    await peer.getByTestId('table-name-input').fill('edited_after_filesystem_failure');
    await peer.getByTestId('table-name-input').press('Enter');
    await expect(owner.getByTestId('table-card')).toContainText('edited_after_filesystem_failure');
    await expect.poll(async () => (await resources.admin.get(schemaUrl).then(r => r.json())).tables[0].name).toBe('edited_after_filesystem_failure');
    await peer.reload();
    await expect(peer.getByTestId('table-card')).toContainText('edited_after_filesystem_failure');
    await owner.reload();
    await expect(owner.getByTestId('table-card')).toContainText('edited_after_filesystem_failure');
  } finally {
    await rm(safetyPath, { recursive: true });
  }
});

test('admin API-key owner search filters by username, display name and email and clearing selection assigns the corrected owner', async ({ resources }) => {
  const first = await resources.user();
  const second = await resources.user();
  const suffix = randomUUID().slice(0, 8);
  const firstName = `Owner First ${suffix}`;
  const secondName = `Owner Second ${suffix}`;
  const email = `owner-${suffix}@example.test`;
  expect((await resources.admin.put(`/api/admin/users/${first.id}`, { data: { displayName: firstName, email } })).status()).toBe(200);
  expect((await resources.admin.put(`/api/admin/users/${second.id}`, { data: { displayName: secondName } })).status()).toBe(200);
  const page = await resources.anonymous();
  page.setDefaultTimeout(10_000);
  await page.context().addCookies((await resources.admin.storageState()).cookies);
  await page.goto('/admin');
  await page.getByRole('button', { name: /^API Keys/ }).click();
  const picker = page.locator('.user-picker');
  const search = picker.locator('input');
  for (const query of [first.username.toUpperCase(), firstName.toUpperCase(), email.toUpperCase()]) {
    await search.fill(query);
    await search.focus();
    await expect(picker.locator('.user-dropdown-item')).toHaveCount(1);
    await expect(picker.locator('.user-dropdown-item')).toContainText(first.username);
  }
  await search.fill(`missing-${suffix}`);
  await expect(picker.locator('.user-dropdown-item')).toHaveCount(0);
  await expect(picker.locator('.user-dropdown-empty')).toBeVisible();
  await search.fill(first.username);
  await picker.locator('.user-dropdown-item').click();
  await expect(picker.locator('.user-picked-label')).toContainText(firstName);
  await picker.locator('.user-picked-clear').click();
  await expect(search).toHaveValue('');
  await search.fill(second.username);
  await search.focus();
  await picker.locator('.user-dropdown-item').click();
  await expect(picker.locator('.user-picked-label')).toContainText(secondName);
  const name = `owner-search-${suffix}`;
  await page.getByPlaceholder('Key name (e.g. MCP Server)', { exact: true }).fill(name);
  let keyId: string | undefined;
  try {
    const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/api-keys' && r.request().method() === 'POST');
    await page.locator('.form-section').filter({ has: page.locator('.user-picker') }).getByRole('button', { name: 'Create Key', exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    keyId = (await response.json()).id;
    expect(keyId).toBeTruthy();
    const keys = await resources.admin.get('/api/admin/api-keys').then(r => r.json());
    expect(keys.find((key: { id: string }) => key.id === keyId)).toMatchObject({ name, user_id: second.id });
    await page.reload();
    await page.getByRole('button', { name: /^API Keys/ }).click();
    const row = page.locator('tbody tr').filter({ hasText: name });
    await expect(row).toContainText(secondName);
    await expect(row).not.toContainText(firstName);
  } finally {
    if (keyId) expect((await resources.admin.delete(`/api/admin/api-keys/${keyId}`)).status()).toBe(200);
  }
});

for (const conflict of ['unlink-update', 'parent-delete-reparent'] as const) {
  for (const order of ['owner-first', 'peer-first'] as const) {
    test(`concurrent domain ${conflict} preserves explicit links and inherited fields in ${order} order`, async ({ resources }) => {
      const project = await resources.project();
      const account = await resources.user();
      const flags = { type: 'VARCHAR' as const, nullable: false, primaryKey: false, unique: false, autoIncrement: false };
      const schema: ERDSchema = { ...project.schema, domains: [
        { ...flags, id: 'root', name: 'base_label', length: 80 },
        { ...flags, id: 'child', name: 'child_label', parentId: 'root' },
        { ...flags, id: 'alternate', name: 'alternate_label', length: 120 },
      ], tables: [{ ...project.schema.tables[0], columns: [
        { ...flags, id: 'linked', name: 'linked_label', length: 80, domainId: 'child' },
        { ...flags, id: 'stable', name: 'stable_note', length: 25, comment: 'Keep local metadata' },
      ] }] };
      const schemaUrl = `/api/storage/schemas/${project.id}`;
      expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const owner = await resources.anonymous();
      await owner.context().addCookies((await resources.admin.storageState()).cookies);
      const peer = await resources.session(account);
      const ownerGate = await holdCollaborationOperations(owner);
      const peerGate = await holdCollaborationOperations(peer);
      for (const page of [owner, peer]) {
        page.setDefaultTimeout(10_000);
        await page.goto('/');
        await expect(page.getByTestId('table-card')).toContainText('linked_label');
      }
      await expect(owner.locator('.peer-count')).toHaveText('2');
      const open = async (page: Page) => {
        await page.locator('.btn-tools').click();
        await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
        return page.locator('.backdrop[role="dialog"]');
      };
      if (conflict === 'unlink-update') {
        await owner.getByTestId('table-card').click();
        await owner.getByTestId('column-row').filter({ has: owner.locator('.col-name', { hasText: /^linked_label$/ }) }).click();
        const popup = owner.getByTestId('column-edit-popup');
        await expect(popup.locator('.domain-badge-name')).toHaveText('child_label');
        await popup.locator('.domain-unlink').click();
        await expect(popup.locator('.domain-badge')).toHaveCount(0);
        await popup.getByRole('button', { name: 'Close', exact: true }).click();
      } else {
        const dialog = await open(owner);
        await dialog.locator('tr.display-row').filter({ hasText: 'base_label' }).getByRole('button', { name: 'Delete domain', exact: true }).click();
        await expect(dialog.locator('tr.display-row').filter({ hasText: 'base_label' })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      }
      const dialog = await open(peer);
      await dialog.locator('tr.display-row').filter({ hasText: conflict === 'unlink-update' ? 'base_label' : 'child_label' }).click();
      const form = dialog.locator('.edit-card');
      if (conflict === 'unlink-update') await form.getByLabel('Length', { exact: true }).fill('160');
      else await form.getByRole('combobox', { name: 'Parent Domain', exact: true }).selectOption('alternate');
      await form.locator('.edit-btn-save').click();
      await peer.getByRole('alertdialog').getByRole('button', { name: 'Propagate changes?', exact: true }).click();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect.poll(() => ownerGate.operations.length).toBeGreaterThan(0);
      await expect.poll(() => peerGate.operations.length).toBeGreaterThan(0);
      const first = order === 'owner-first' ? ownerGate : peerGate;
      const second = order === 'owner-first' ? peerGate : ownerGate;
      const firstCount = first.operations.length;
      const secondCount = second.operations.length;
      first.release();
      await expect.poll(() => second.receivedOperations.length).toBe(firstCount);
      second.release();
      await expect.poll(() => first.receivedOperations.length).toBe(secondCount);
      const expectedLength = conflict === 'parent-delete-reparent' ? 120 : order === 'owner-first' ? 80 : 160;
      const verify = (saved: ERDSchema) => {
        expect(saved.tables).toHaveLength(1);
        expect(saved.tables[0].columns[0]).toMatchObject({ id: 'linked', name: 'linked_label', type: 'VARCHAR', length: expectedLength });
        expect(saved.tables[0].columns[0].domainId).toBe(conflict === 'unlink-update' ? undefined : 'child');
        expect(saved.tables[0].columns[1]).toEqual(schema.tables[0].columns[1]);
        expect(saved.domains.find(d => d.id === 'alternate')).toEqual(schema.domains[2]);
        if (conflict === 'parent-delete-reparent') {
          expect(saved.domains.some(d => d.id === 'root' || d.parentId === 'root')).toBe(false);
          expect(saved.domains.find(d => d.id === 'child')?.parentId).toBe('alternate');
        } else expect(saved.domains.find(d => d.id === 'root')?.length).toBe(160);
      };
      const exportModel = async (page: Page) => {
        await page.getByTestId('export-menu-toggle').click();
        const downloaded = page.waitForEvent('download');
        await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
        return JSON.parse(await readFile((await (await downloaded).path())!, 'utf8')) as ERDSchema;
      };
      const ownerModel = await exportModel(owner);
      const peerModel = await exportModel(peer);
      verify(ownerModel);
      verify(peerModel);
      expect(peerModel.domains).toEqual(ownerModel.domains);
      expect(peerModel.tables).toEqual(ownerModel.tables);
      await expect.poll(async () => {
        const saved = await resources.admin.get(schemaUrl).then(r => r.json());
        return { domains: saved.domains, tables: saved.tables };
      }).toEqual({ domains: ownerModel.domains, tables: ownerModel.tables });
      for (const page of [owner, peer]) {
        await page.reload();
        await expect(page.getByTestId('table-card')).toContainText('linked_label');
        verify(await exportModel(page));
      }
    });
  }
}

// Each invalid request is independent so an early validation failure cannot hide
// the remaining boundaries. Public list snapshots also detect partial writes.
for (const kind of ['ldap', 'oidc'] as const) {
  const invalidCases: { label: string; patch?: Record<string, unknown>; body?: unknown; raw?: boolean }[] = [
    { label: 'malformed JSON', body: '{', raw: true },
    { label: 'null body', body: null },
    { label: 'array body', body: [] },
    { label: 'blank display name', patch: { displayName: '   ' } },
    { label: 'numeric display name', patch: { displayName: 123 } },
    { label: 'object optional field', patch: kind === 'ldap' ? { groupSearchFilter: {} } : { scopes: {} } },
    { label: 'nonboolean enabled flag', patch: { enabled: 'false' } },
    { label: 'blank required connection field', patch: kind === 'ldap' ? { bindDn: '   ' } : { clientId: '   ' } },
  ];
  for (const method of ['create', 'update'] as const) {
    for (const invalid of invalidCases) {
      test(`admin ${kind} provider ${method} rejects ${invalid.label} without changing stored configuration`, async ({ resources }) => {
        const endpoint = `/api/admin/${kind}-providers`;
        const baseline = await resources.admin.get(endpoint).then(r => r.json());
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const secret = `private-provider-secret-${suffix}`;
        const valid = kind === 'ldap'
          ? { displayName: `Validation ${suffix}`, serverUrl: `ldaps://validation-${suffix}.invalid:636`, bindDn: 'cn=service,dc=example,dc=test', bindPassword: secret, userSearchBase: 'dc=example,dc=test', enabled: true }
          : { displayName: `Validation ${suffix}`, issuerUrl: `https://validation-${suffix}.invalid`, clientId: 'validation-client', clientSecret: secret, enabled: true };
        let id: string | undefined;
        try {
          const created = await resources.admin.post(endpoint, { data: valid });
          expect(created.status()).toBe(201);
          id = (await created.json()).id;
          const before = await resources.admin.get(endpoint).then(r => r.json());
          expect(JSON.stringify(before)).not.toContain(secret);
          const data = invalid.patch ? { ...valid, ...invalid.patch,
            ...(method === 'create' ? (kind === 'ldap' ? { serverUrl: `${valid.serverUrl}/new` } : { issuerUrl: `${valid.issuerUrl}/new` }) : {}) } : invalid.body;
          const options = { data, ...(invalid.raw ? { headers: { 'Content-Type': 'application/json' } } : {}) };
          const response = method === 'create'
            ? await resources.admin.post(endpoint, options)
            : await resources.admin.put(`${endpoint}/${id}`, options);
          expect.soft(response.status()).toBe(400);
          expect.soft(await response.text()).not.toContain(secret);
          expect.soft(await resources.admin.get(endpoint).then(r => r.json())).toEqual(before);
          // A rejected request must not prevent the next valid edit.
          expect((await resources.admin.put(`${endpoint}/${id}`, { data: { displayName: `Recovered ${suffix}` } })).status()).toBe(200);
          const recovered = await resources.admin.get(endpoint).then(r => r.json());
          expect(recovered.find((row: { id: string }) => row.id === id)).toMatchObject({ display_name: `Recovered ${suffix}` });
          expect(JSON.stringify(recovered)).not.toContain(secret);
        } finally {
          // Also clean any record erroneously created by the invalid request.
          const after = await resources.admin.get(endpoint).then(r => r.json());
          for (const row of after.filter((row: { id: string }) => !baseline.some((old: { id: string }) => old.id === row.id))) {
            expect((await resources.admin.delete(`${endpoint}/${row.id}`)).status()).toBe(200);
          }
        }
      });
    }
  }
  for (const method of ['create', 'update'] as const) {
    test(`admin ${kind} provider ${method} rejects a duplicate connection URL atomically and accepts a corrected retry`, async ({ resources }) => {
      const endpoint = `/api/admin/${kind}-providers`;
      const ids: string[] = [];
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const make = (index: number) => kind === 'ldap'
        ? { displayName: `Duplicate ${suffix}-${index}`, serverUrl: `ldaps://duplicate-${suffix}-${index}.invalid:636`, bindDn: 'cn=service,dc=test', bindPassword: 'duplicate-private-secret', userSearchBase: 'dc=test' }
        : { displayName: `Duplicate ${suffix}-${index}`, issuerUrl: `https://duplicate-${suffix}-${index}.invalid`, clientId: 'duplicate-client', clientSecret: 'duplicate-private-secret' };
      try {
        for (const index of [0, 1]) {
          const created = await resources.admin.post(endpoint, { data: make(index) });
          expect(created.status()).toBe(201); ids.push((await created.json()).id);
        }
        const before = await resources.admin.get(endpoint).then(r => r.json());
        const conflict = { ...make(0), displayName: 'Must not partially replace display name' };
        const response = method === 'create' ? await resources.admin.post(endpoint, { data: conflict }) : await resources.admin.put(`${endpoint}/${ids[1]}`, { data: conflict });
        expect.soft(response.status()).toBe(409);
        expect.soft(await resources.admin.get(endpoint).then(r => r.json())).toEqual(before);
        const corrected = { ...make(2), displayName: `Corrected ${suffix}` };
        const retry = method === 'create' ? await resources.admin.post(endpoint, { data: corrected }) : await resources.admin.put(`${endpoint}/${ids[1]}`, { data: corrected });
        expect(retry.status()).toBe(method === 'create' ? 201 : 200);
        if (method === 'create') ids.push((await retry.json()).id);
        const rows = await resources.admin.get(endpoint).then(r => r.json());
        expect(rows.find((row: { id: string }) => row.id === ids[0])).toEqual(before.find((row: { id: string }) => row.id === ids[0]));
        expect(rows.find((row: { id: string }) => row.id === ids.at(-1))).toMatchObject({ display_name: `Corrected ${suffix}` });
        expect(JSON.stringify(rows)).not.toContain('duplicate-private-secret');
      } finally {
        for (const id of ids) expect((await resources.admin.delete(`${endpoint}/${id}`)).status()).toBe(200);
      }
    });
  }
}

for (const version of [11, 12, 16]) {
  test(`populated version ${version} restore preserves provider credentials, identities, group access and scoped API keys`, async ({ resources }) => {
    const account = await resources.user();
    const group = await resources.group();
    const project = await resources.project();
    const denied = await resources.project();
    expect((await resources.admin.post(`/api/admin/groups/${group.id}/members`, { data: { userId: account.id } })).status()).toBe(201);
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId: group.id, permission: 'viewer' } })).status()).toBe(201);
    const keyResponse = await resources.admin.post('/api/admin/api-keys', { data: { userId: account.id, name: 'Historical scoped key', scopes: [{ projectId: project.id, permission: 'viewer' }] } });
    expect(keyResponse.status()).toBe(201);
    const key = await keyResponse.json();
    const providers: { kind: string; id: string }[] = [];
    const suffix = randomUUID();
    const secret = `historical-secret-${suffix}`;
    const directory = await mkdtemp(join(tmpdir(), 'erdmini-populated-history-'));
    let original: Buffer | undefined;
    try {
      for (const kind of ['ldap', 'oidc']) {
        const response = await resources.admin.post(`/api/admin/${kind}-providers`, { data: kind === 'ldap'
          ? { displayName: `Historical LDAP ${suffix}`, serverUrl: `ldaps://${suffix}.invalid`, bindDn: 'cn=service,dc=test', bindPassword: secret, userSearchBase: 'dc=test', enabled: false }
          : { displayName: `Historical OIDC ${suffix}`, issuerUrl: `https://${suffix}.invalid`, clientId: 'historical-client', clientSecret: secret, enabled: false } });
        expect(response.status()).toBe(201); providers.push({ kind, id: (await response.json()).id });
      }
      const member = await resources.session(account);
      expect((await member.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
      original = await resources.admin.get('/api/admin/backup').then(r => r.body());
      await writeFile(join(directory, 'current.db'), original);
      const source = new Database(join(directory, 'current.db'), { readonly: true });
      const candidate = new Database(join(directory, 'historical.db'));
      let historical: Buffer;
      try {
        const migrations = (await readdir('src/lib/server/migrations')).filter(name => /^V\d{3}__.*\.sql$/.test(name) && Number(name.slice(1, 4)) <= version).sort();
        expect(migrations).toHaveLength(version);
        for (const file of migrations) candidate.exec(await readFile(join('src/lib/server/migrations', file), 'utf8'));
        candidate.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')), success INTEGER NOT NULL DEFAULT 1)");
        // Copy every compatible historical column, including hashes, credentials,
        // memberships, identities, scopes and explicit group project permissions.
        const tables = candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'").all() as { name: string }[];
        for (const { name } of tables) {
          const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
          const columns = (candidate.prepare(`PRAGMA table_info(${quote(name)})`).all() as { name: string }[]).map(c => c.name);
          const rows = source.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`).all() as Record<string, unknown>[];
          candidate.prepare(`DELETE FROM ${quote(name)}`).run();
          const insert = candidate.prepare(`INSERT INTO ${quote(name)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
          for (const row of rows) insert.run(...columns.map(column => row[column]));
        }
        for (const row of source.prepare('SELECT * FROM schema_migrations WHERE version <= ?').all(version) as Record<string, unknown>[]) {
          candidate.prepare('INSERT INTO schema_migrations (version,description,checksum,applied_at,success) VALUES (?,?,?,?,?)').run(row.version, row.description, row.checksum, row.applied_at, row.success);
        }
        candidate.prepare('INSERT INTO oidc_identities (id,user_id,provider_id,subject,email) VALUES (?,?,?,?,?)').run('historical-oidc', account.id, providers.find(p => p.kind === 'oidc')!.id, 'preserved-subject', 'history@example.test');
        candidate.prepare('INSERT INTO ldap_identities (id,user_id,provider_id,ldap_dn) VALUES (?,?,?,?)').run('historical-ldap', account.id, providers.find(p => p.kind === 'ldap')!.id, 'uid=historical,dc=test');
        expect(candidate.pragma('foreign_key_check')).toEqual([]);
        historical = candidate.serialize();
      } finally { candidate.close(); source.close(); }
      const restore = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: `populated-v${version}.db`, mimeType: 'application/octet-stream', buffer: historical! } } });
      expect(restore.status(), await restore.text()).toBe(200);
      // The pre-restore session and a fresh password login both remain usable.
      expect((await member.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
      const fresh = await resources.session(account);
      expect((await fresh.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
      expect((await fresh.request.get(`/api/storage/schemas/${denied.id}`)).status()).toBe(403);
      const call = async (name: string, args: Record<string, unknown>) => {
        const response = await fresh.request.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } });
        expect(response.status()).toBe(200); return (await response.json()).result;
      };
      const read = await call('get_schema', { projectId: project.id });
      expect(read.isError).not.toBe(true);
      expect(JSON.parse(read.content[0].text).tables).toEqual(project.schema.tables);
      expect((await call('get_schema', { projectId: denied.id })).isError).toBe(true);
      expect((await call('add_table', { projectId: project.id, name: 'forbidden_historical_write' })).isError).toBe(true);
      for (const provider of providers) {
        const rows = await resources.admin.get(`/api/admin/${provider.kind}-providers`).then(r => r.json());
        expect(rows.find((row: { id: string }) => row.id === provider.id)).toMatchObject({ enabled: 0 });
        expect(JSON.stringify(rows)).not.toContain(secret);
      }
      await writeFile(join(directory, 'restored.db'), await resources.admin.get('/api/admin/backup').then(r => r.body()));
      const restored = new Database(join(directory, 'restored.db'), { readonly: true });
      try {
        expect(restored.prepare('SELECT client_secret FROM oidc_providers WHERE id=?').get(providers.find(p => p.kind === 'oidc')!.id)).toEqual({ client_secret: secret });
        expect(restored.prepare('SELECT bind_password FROM ldap_providers WHERE id=?').get(providers.find(p => p.kind === 'ldap')!.id)).toEqual({ bind_password: secret });
        expect(restored.prepare('SELECT user_id,subject,email FROM oidc_identities WHERE id=?').get('historical-oidc')).toEqual({ user_id: account.id, subject: 'preserved-subject', email: 'history@example.test' });
        expect(restored.prepare('SELECT user_id,ldap_dn FROM ldap_identities WHERE id=?').get('historical-ldap')).toEqual({ user_id: account.id, ldap_dn: 'uid=historical,dc=test' });
        expect(restored.prepare('SELECT source FROM groups WHERE id=?').get(group.id)).toEqual({ source: 'manual' });
        expect(restored.pragma('foreign_key_check')).toEqual([]);
      } finally { restored.close(); }
      await fresh.goto('/');
      await expect(fresh.getByTestId('table-card')).toContainText('users');
      await fresh.reload();
      await expect(fresh.getByTestId('table-card')).toContainText('users');
      await fresh.close(); await member.close();
    } finally {
      if (original) expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'original.db', mimeType: 'application/octet-stream', buffer: original } } })).status()).toBe(200);
      for (const provider of providers) expect((await resources.admin.delete(`/api/admin/${provider.kind}-providers/${provider.id}`)).status()).toBe(200);
      expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200);
      await rm(directory, { recursive: true, force: true });
    }
  });
}

for (const kind of ['ldap', 'oidc'] as const) {
  for (const scenario of ['duplicate-create', 'failed-edit', 'network-create', 'network-edit', 'non-json-create', 'non-json-edit'] as const) {
    test(`admin ${kind} browser ${scenario} retains the failed draft and recovers on corrected retry and reload`, async ({ resources }) => {
      const creating = scenario.endsWith('create');
      const network = scenario.startsWith('network-');
      const endpoint = `/api/admin/${kind}-providers`;
      const ids: string[] = [];
      const suffix = randomUUID();
      const name = `Browser ${kind} ${suffix}`;
      const url = `${kind === 'ldap' ? 'ldaps' : 'https'}://${suffix}.invalid`;
      const secret = `browser-private-${suffix}`;
      const created = await resources.admin.post(endpoint, { data: kind === 'ldap'
        ? { displayName: name, serverUrl: url, bindDn: 'cn=service,dc=test', bindPassword: secret, userSearchBase: 'dc=test' }
        : { displayName: name, issuerUrl: url, clientId: 'browser-client', clientSecret: secret } });
      expect(created.status()).toBe(201); ids.push((await created.json()).id);
      try {
        const before = await resources.admin.get(endpoint).then(r => r.json());
        const page = await resources.anonymous();
        page.setDefaultTimeout(10_000);
        await page.context().addCookies((await resources.admin.storageState()).cookies);
        await page.goto('/admin'); await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: kind === 'ldap' ? /^LDAP/ : /^OIDC/ }).click();
        const section = page.locator('.admin-page .section');
        const cardIndex = (await section.locator('.provider-card').allTextContents()).findIndex(text => text.includes(name));
        expect(cardIndex).toBeGreaterThanOrEqual(0);
        const form = creating ? section.locator('.form-section') : section.locator('.provider-card').nth(cardIndex);
        if (!creating) await form.getByRole('button', { name: 'Edit', exact: true }).click();
        const display = kind === 'ldap' ? form.getByLabel('Display Name', { exact: true }) : form.getByPlaceholder(creating ? 'Display Name (e.g. Google)' : 'Display Name', { exact: true });
        const connection = kind === 'ldap' ? form.getByPlaceholder('ldap://host:389') : form.getByPlaceholder('Issuer URL', { exact: true });
        const draft = `Keep draft ${suffix}`;
        await display.fill(draft); await connection.fill(url);
        if (creating) {
          if (kind === 'ldap') {
            await form.getByPlaceholder('cn=admin,dc=example,dc=com').fill('cn=service,dc=test');
            await form.locator('input[type=password]').fill(secret);
            await form.getByPlaceholder('ou=users,dc=example,dc=com').fill('dc=test');
          } else {
            await form.getByPlaceholder('Client ID', { exact: true }).fill('browser-client');
            await form.getByPlaceholder('Client Secret', { exact: true }).fill(secret);
          }
        }
        if (scenario !== 'duplicate-create') {
          const path = creating ? endpoint : `${endpoint}/${ids[0]}`;
          await page.route(`**${path}`, route => network ? route.abort('failed') : scenario.startsWith('non-json-')
            ? route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Upstream unavailable</h1>' })
            : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary provider save failure' }) }), { times: 1 });
        }
        const button = form.getByRole('button', { name: creating ? 'Add Provider' : 'Save', exact: true });
        const matches = (request: { url(): string; method(): string }) => request.url().endsWith(creating ? endpoint : `${endpoint}/${ids[0]}`) && request.method() === (creating ? 'POST' : 'PUT');
        const failed = network ? page.waitForEvent('requestfailed', { predicate: matches }) : page.waitForResponse(r => matches(r.request()));
        await button.click();
        const failure = await failed;
        if (!network) expect((failure as import('playwright/test').Response).status()).toBe(scenario === 'duplicate-create' ? 409 : 503);
        await expect(display).toHaveValue(draft);
        await expect(connection).toHaveValue(url);
        await expect(section.locator('.msg-error')).toBeVisible();
        expect(await resources.admin.get(endpoint).then(r => r.json())).toEqual(before);
        if (creating) await expect(form.locator('input[type=password]')).toHaveValue(secret);
        const corrected = `Corrected browser ${suffix}`;
        await display.fill(corrected);
        if (creating) await connection.fill(url.replace('.invalid', '-corrected.invalid'));
        const retry = page.waitForResponse(r => r.url().endsWith(creating ? endpoint : `${endpoint}/${ids[0]}`) && r.request().method() === (creating ? 'POST' : 'PUT'));
        await button.click();
        const response = await retry; expect(response.status()).toBe(creating ? 201 : 200);
        if (creating) ids.push((await response.json()).id);
        await expect(section.locator('.provider-card').filter({ hasText: corrected })).toBeVisible();
        await page.reload(); await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: kind === 'ldap' ? /^LDAP/ : /^OIDC/ }).click();
        await expect(page.locator('.provider-card').filter({ hasText: corrected })).toBeVisible();
        const rows = await resources.admin.get(endpoint).then(r => r.json());
        expect(rows.find((row: { id: string }) => row.id === ids.at(-1))).toMatchObject({ display_name: corrected });
        expect(JSON.stringify(rows)).not.toContain(secret);
      } finally {
        for (const id of ids) expect((await resources.admin.delete(`${endpoint}/${id}`)).status()).toBe(200);
      }
    });
  }
}

for (const constraint of ['foreign-key', 'unique', 'index'] as const) {
  test(`an already open ${constraint} draft cannot change live or stored schema after permission downgrade and recovers after regrant`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    const schema = structuredClone(project.schema) as ERDSchema;
    schema.tables[0].columns.push({ ...schema.tables[0].columns[0], id: 'note', name: 'note', primaryKey: false, unique: false });
    expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: schema })).status()).toBe(200);
    const endpoint = `/api/storage/projects/${project.id}/permissions`;
    expect((await resources.admin.post(endpoint, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const page = await resources.session(account);
    page.setDefaultTimeout(10_000);
    await page.goto('/'); await page.getByTestId('table-card').click();
    const openDraft = async () => {
      const editor = page.getByTestId('table-editor');
      if (constraint === 'foreign-key') await page.getByTestId('add-foreign-key').click();
      else await editor.getByRole('button', { name: constraint === 'unique' ? /add unique/i : /add index/i }).click();
      const modal = page.locator('.modal[role=dialog]');
      if (constraint === 'foreign-key') {
        await modal.locator('.ss-trigger').nth(0).click();
        await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^users$/ }).click();
        await modal.locator('.pair-row .ss-trigger').nth(0).click();
        await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^note$/ }).click();
        await modal.locator('.pair-row .ss-trigger').nth(1).click();
        await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
      } else {
        await modal.locator('#constraint-name').fill('permission_checked_constraint');
        await modal.locator('.ss-trigger').first().click();
        await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^note$/ }).click();
        if (constraint === 'unique') {
          await modal.locator('.btn-add-col').click(); await modal.locator('.ss-trigger').nth(1).click();
          await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
        }
      }
      await expect(modal.locator('.btn-submit')).toBeEnabled();
      return modal;
    };
    const modal = await openDraft();
    expect((await resources.admin.post(endpoint, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('table-name-input')).toBeDisabled();
    // Closing, disabling or rejecting submission are all valid protection paths.
    if (await modal.isVisible()) {
      if (await modal.locator('.btn-submit').isEnabled()) await modal.locator('.btn-submit').click();
      if (await modal.isVisible()) await modal.getByRole('button', { name: /cancel/i }).click();
    }
    const download = page.waitForEvent('download');
    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
    const local = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    expect.soft(local.tables).toEqual(schema.tables);
    expect((await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).tables).toEqual(schema.tables);
    expect((await page.request.put(`/api/storage/schemas/${project.id}`, { data: schema })).status()).toBe(403);
    // Reload discards any rejected local draft before checking permission recovery.
    await page.reload(); await page.getByTestId('table-card').click();
    await expect(page.getByTestId('table-name-input')).toBeDisabled();
    expect((await resources.admin.post(endpoint, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('table-name-input')).toBeEnabled();
    await (await openDraft()).locator('.btn-submit').click();
    const count = (model: ERDSchema) => constraint === 'foreign-key' ? model.tables[0].foreignKeys.length : constraint === 'unique' ? model.tables[0].uniqueKeys?.length ?? 0 : model.tables[0].indexes?.length ?? 0;
    await expect.poll(async () => count(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json()))).toBe(1);
    await page.reload(); await page.getByTestId('table-card').click();
    expect(count(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json()))).toBe(1);
  });
}

for (const surface of ['column-popup', 'domain-draft'] as const) {
  test(`an open ${surface} ignores edits after downgrade and permits a fresh edit after permission recovery`, async ({ resources }) => {
    const account = await resources.user();
    const project = await resources.project();
    const schema = structuredClone(project.schema) as ERDSchema;
    schema.domains = [{ id: 'permission-domain', name: 'permission_domain', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false }];
    const schemaUrl = `/api/storage/schemas/${project.id}`;
    expect((await resources.admin.put(schemaUrl, { data: schema })).status()).toBe(200);
    const endpoint = `/api/storage/projects/${project.id}/permissions`;
    expect((await resources.admin.post(endpoint, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const page = await resources.session(account);
    page.setDefaultTimeout(10_000);
    await page.goto('/'); await page.getByTestId('table-card').click();
    const open = async () => {
      if (surface === 'column-popup') {
        await page.getByTestId('column-row').click();
        return page.getByTestId('column-edit-popup');
      }
      await page.locator('.btn-tools').click();
      await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
      const dialog = page.locator('.backdrop[role=dialog]');
      await dialog.locator('tr.display-row').filter({ hasText: 'permission_domain' }).click();
      return dialog;
    };
    const panel = await open();
    if (surface === 'domain-draft') await panel.getByLabel('Owner', { exact: true }).fill('rejected draft owner');
    expect((await resources.admin.post(endpoint, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('table-name-input')).toBeDisabled();
    if (await panel.isVisible()) {
      if (surface === 'column-popup') {
        const field = panel.getByTestId('column-name-input');
        if (await field.isVisible() && await field.isEditable()) await field.fill('rejected_column_edit');
      } else {
        const save = panel.locator('.edit-btn-save');
        if (await save.isVisible() && await save.isEnabled()) await save.click();
      }
      if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.getByTestId('export-menu-toggle').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
    const local = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    expect.soft(local.tables).toEqual(schema.tables); expect.soft(local.domains).toEqual(schema.domains);
    const persisted = await resources.admin.get(schemaUrl).then(r => r.json());
    expect(persisted.tables).toEqual(schema.tables); expect(persisted.domains).toEqual(schema.domains);
    expect((await resources.admin.post(endpoint, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByTestId('table-name-input')).toBeEnabled();
    const recovered = await open();
    if (surface === 'column-popup') await recovered.getByTestId('column-name-input').fill('permission_recovered_column');
    else { await recovered.getByLabel('Owner', { exact: true }).fill('permission recovered owner'); await recovered.locator('.edit-btn-save').click(); }
    await recovered.getByRole('button', { name: 'Close', exact: true }).click();
    const value = (model: ERDSchema) => surface === 'column-popup' ? model.tables[0].columns[0].name : model.domains[0].owner;
    const expected = surface === 'column-popup' ? 'permission_recovered_column' : 'permission recovered owner';
    await expect.poll(async () => value(await resources.admin.get(schemaUrl).then(r => r.json()))).toBe(expected);
    await page.reload();
    expect(value(await resources.admin.get(schemaUrl).then(r => r.json()))).toBe(expected);
  });
}

test('an open DB-object editor disables metadata and SQL after downgrade and restores editing after regrant', async ({ resources }) => {
  const account = await resources.user();
  const project = await resources.project();
  const schema = structuredClone(project.schema) as ERDSchema;
  schema.dbObjectCategories = ['Views'];
  schema.dbObjects = [{ id: 'permission-view', name: 'permission_view', category: 'Views', sql: 'SELECT id FROM users;', comment: 'Retain object metadata', includeInDdl: true }];
  const url = `/api/storage/schemas/${project.id}`;
  expect((await resources.admin.put(url, { data: schema })).status()).toBe(200);
  const permissions = `/api/storage/projects/${project.id}/permissions`;
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
  const page = await resources.session(account);
    page.setDefaultTimeout(10_000);
  await page.goto('/'); await page.getByTestId('table-card').click();
  await page.getByRole('button', { name: /objects 1/i }).click();
  await page.locator('.object-item').filter({ hasText: 'permission_view' }).click();
  const editor = page.locator('.db-object-editor');
  await expect(editor.locator('#dbo-name')).toBeEnabled();
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(editor.locator('#dbo-name')).toBeDisabled();
  await expect(editor.locator('#dbo-comment')).toBeDisabled();
  await expect(editor.locator('#dbo-category')).toBeDisabled();
  await expect(editor.locator('.ddl-toggle input')).toBeDisabled();
  const sqlBefore = await editor.locator('.cm-content').innerText();
  await editor.locator('.cm-content').click();
  await page.keyboard.type('FORBIDDEN SQL EDIT');
  expect.soft(await editor.locator('.cm-content').innerText()).toBe(sqlBefore);
  expect((await resources.admin.get(url).then(r => r.json())).dbObjects).toEqual(schema.dbObjects);
  expect((await page.request.put(url, { data: schema })).status()).toBe(403);
  await page.reload();
  await page.getByRole('button', { name: /objects 1/i }).click();
  await page.locator('.object-item').filter({ hasText: 'permission_view' }).click();
  await expect(editor.locator('#dbo-comment')).toBeDisabled();
  expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(editor.locator('#dbo-comment')).toBeEnabled();
  await expect(editor.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
  await editor.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('SELECT id FROM users WHERE id > 0;');
  await expect.poll(async () => (await resources.admin.get(url).then(r => r.json())).dbObjects[0].sql).toBe('SELECT id FROM users WHERE id > 0;');
  await editor.locator('#dbo-comment').fill('Recovered object edit');
  await expect.poll(async () => (await resources.admin.get(url).then(r => r.json())).dbObjects[0].comment).toBe('Recovered object edit');
  await page.reload();
  await page.getByRole('button', { name: /objects 1/i }).click();
  await page.locator('.object-item').filter({ hasText: 'permission_view' }).click();
  await expect(editor.locator('#dbo-comment')).toHaveValue('Recovered object edit');
  const saved = await resources.admin.get(url).then(r => r.json());
  expect(saved.tables).toEqual(schema.tables);
  expect(saved.dbObjects[0]).toEqual({ ...schema.dbObjects[0], comment: 'Recovered object edit', sql: 'SELECT id FROM users WHERE id > 0;' });
});

for (const version of [11, 12, 16]) {
  for (const kind of ['ldap', 'oidc'] as const) {
    test(`version ${version} restore permits fresh ${kind} login with the same identity, group access and no duplicate user`, async ({ resources, baseURL }) => {
      const ldap = kind === 'ldap' ? await startLdapProvider() : undefined;
      const oidc = kind === 'oidc' ? await startOidcProvider() : undefined;
      const endpoint = `/api/admin/${kind}-providers`;
      const group = await resources.group();
      const project = await resources.project(); const denied = await resources.project();
      let providerId: string | undefined, userId: string | undefined, original: Buffer | undefined;
      const label = `Restored ${kind} V${version}`;
      try {
        const response = await resources.admin.post(endpoint, { data: ldap
          ? { displayName: label, serverUrl: ldap.serverUrl, bindDn: ldap.serviceDn, bindPassword: 'service-password', userSearchBase: ldap.userBase, enabled: true, autoCreateUsers: true }
          : { displayName: label, issuerUrl: oidc!.issuer, clientId: 'e2e-client', clientSecret: 'e2e-secret', enabled: true, autoCreateUsers: true } });
        expect(response.status()).toBe(201); providerId = (await response.json()).id;
        const authenticate = async () => {
          const page = await resources.anonymous({ ignoreHTTPSErrors: true }); page.setDefaultTimeout(10_000);
          await page.goto('/login'); await page.waitForLoadState('networkidle');
          if (ldap) {
            await page.getByRole('button', { name: label, exact: true }).click();
            await expect(page.locator('.ldap-mode-label')).toHaveText(label);
            await page.getByLabel('Username', { exact: true }).fill(ldap.identity.username); await page.getByLabel('Password', { exact: true }).fill(ldap.identity.password);
            let status = 0;
            await expect.poll(async () => {
              const completed = page.waitForResponse(r => r.url().endsWith('/api/auth/ldap/login'));
              await page.locator('button[type=submit]').click(); status = (await completed).status(); return status;
            }, { timeout: 70_000, intervals: [5_000] }).not.toBe(429);
            expect(status).toBe(200);
          } else {
            await page.getByRole('link', { name: label, exact: true }).click();
            await page.getByRole('button', { name: 'Continue with test identity' }).click();
          }
          await expect(page).toHaveURL(`${baseURL}/`); return page;
        };
        const initial = await authenticate();
        const email = ldap?.identity.email ?? oidc!.identity.email;
        const find = async () => (await resources.admin.get('/api/admin/users').then(r => r.json())).filter((u: { email: string }) => u.email === email);
        const users = await find(); expect(users).toHaveLength(1); userId = users[0].id;
        expect((await resources.admin.post(`/api/admin/groups/${group.id}/members`, { data: { userId } })).status()).toBe(201);
        expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions/groups`, { data: { groupId: group.id, permission: 'viewer' } })).status()).toBe(201);
        // New identities cannot register after restore: login must reuse the old row.
        expect((await resources.admin.put(`${endpoint}/${providerId}`, { data: { autoCreateUsers: false } })).status()).toBe(200);
        original = await resources.admin.get('/api/admin/backup').then(r => r.body());
        const historical = await historicalBackup(original, version);
        await initial.close();
        const restore = await resources.admin.post('/api/admin/backup', { multipart: { file: { name: `external-v${version}.db`, mimeType: 'application/octet-stream', buffer: historical } } });
        expect(restore.status(), await restore.text()).toBe(200);
        const fresh = await authenticate();
        expect((await find()).map((user: { id: string }) => user.id)).toEqual([userId]);
        const members = await resources.admin.get(`/api/admin/groups/${group.id}/members`).then(r => r.json());
        expect(JSON.stringify(members)).toContain(userId!);
        expect((await fresh.request.get(`/api/storage/schemas/${project.id}`)).status()).toBe(200);
        expect((await fresh.request.get(`/api/storage/schemas/${denied.id}`)).status()).toBe(403);
        expect((await fresh.request.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(403);
        await fresh.reload(); await expect(fresh.getByTestId('table-card')).toContainText('users');
        await fresh.getByTestId('table-card').click(); await expect(fresh.getByTestId('table-name-input')).toBeDisabled();
        if (oidc) expect(oidc.exchanges).toHaveLength(2);
        if (ldap) expect(ldap.binds.filter(bind => bind.dn === ldap.userDn && bind.accepted)).toHaveLength(2);
        await fresh.close();
      } finally {
        if (original) expect((await resources.admin.post('/api/admin/backup', { multipart: { file: { name: 'original.db', mimeType: 'application/octet-stream', buffer: original } } })).status()).toBe(200);
        if (providerId) expect((await resources.admin.delete(`${endpoint}/${providerId}`)).status()).toBe(200);
        if (userId) expect((await resources.admin.delete(`/api/admin/users/${userId}`)).status()).toBe(200);
        await ldap?.close(); await oidc?.close();
      }
    });
  }
}

for (const surface of ['memo', 'bulk', 'namespace', 'category'] as const) {
  for (const access of ['viewer', 'revoked'] as const) {
    test(`open ${surface} work cannot mutate live or stored data after ${access} access and recovers after regrant`, async ({ resources }) => {
      const account = await resources.user(); const project = await resources.project();
      const schema = structuredClone(project.schema) as ERDSchema;
      schema.schemas = ['core', 'other']; schema.tables[0].schema = 'core';
      schema.tables.push({ ...structuredClone(schema.tables[0]), id: 'second', name: 'second', position: { x: 500, y: 100 } });
      schema.memos = [{ id: 'protected-memo', content: 'Keep memo', width: 200, height: 120, schema: 'core', position: { x: 100, y: 400 } }];
      schema.dbObjectCategories = ['Views']; schema.dbObjects = [{ id: 'view', name: 'retained_view', category: 'Views', schema: 'core', sql: 'SELECT id FROM users;' }];
      const url = `/api/storage/schemas/${project.id}`, permissions = `/api/storage/projects/${project.id}/permissions`;
      expect((await resources.admin.put(url, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const page = await resources.session(account); page.setDefaultTimeout(10_000); await page.goto('/');
      await page.getByTestId('table-card').first().click();
      const open = async () => {
        if (surface === 'memo') {
          await page.getByTestId('memo-card').locator('.memo-content').dblclick();
          await page.locator('.memo-textarea').fill('Rejected memo draft');
        } else if (surface === 'bulk') {
          await page.locator('.table-item').first().click(); await page.locator('.table-item').nth(1).click({ modifiers: ['ControlOrMeta'] });
          await page.locator('.bulk-edit-btn').click();
          const modal = page.locator('.modal[role=dialog]');
          await modal.locator('.field-toggle').filter({ hasText: /group/i }).locator('input[type=checkbox]').check();
          await modal.locator('input.text-input').fill('Rejected group draft');
        } else if (surface === 'namespace') {
          await page.locator('.schema-tab-bar').getByRole('button', { name: 'core', exact: true }).dblclick();
          await page.locator('.schema-tab-input').fill('Rejected namespace draft');
        } else {
          await page.getByRole('button', { name: /objects 1/i }).click();
          await page.locator('.category-group').hover(); await page.locator('.cat-action-btn:not(.cat-action-delete)').click();
          await page.locator('.category-rename-input').fill('Rejected category draft');
        }
      };
      const commit = async () => {
        if (surface === 'memo') { if (await page.locator('.memo-textarea').isVisible()) await page.locator('.memo-textarea').press('Tab'); }
        else if (surface === 'bulk') {
          const apply = page.locator('.modal[role=dialog]').getByRole('button', { name: /apply/i });
          if (await apply.isVisible() && await apply.isEnabled()) await apply.click();
          const cancel = page.locator('.modal[role=dialog]').getByRole('button', { name: /cancel/i }); if (await cancel.isVisible()) await cancel.click();
        } else {
          const input = page.locator(surface === 'namespace' ? '.schema-tab-input' : '.category-rename-input');
          if (await input.isVisible()) await input.press('Enter');
        }
      };
      await open();
      if (access === 'viewer') expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
      else expect((await resources.admin.delete(permissions, { data: { userId: account.id } })).status()).toBe(200);
      const refreshed = page.waitForResponse(r => r.url().endsWith(`/projects/${project.id}/my-permission`));
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await refreshed;
      await expect(page.getByRole('combobox', { name: 'Target DBMS' })).toBeDisabled();
      if (surface === 'bulk') await expect(page.locator('.modal[role=dialog] .btn-submit')).toBeDisabled();
      await commit();
      // Explicit blur checks delayed commits as well as Enter handlers.
      await page.getByTestId('export-menu-toggle').click(); const downloaded = page.waitForEvent('download');
      await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
      const local = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8')) as ERDSchema;
      for (const field of ['tables', 'memos', 'schemas', 'dbObjects', 'dbObjectCategories'] as const) expect.soft(local[field], `local ${field}`).toEqual(schema[field]);
      const saved = await resources.admin.get(url).then(r => r.json());
      for (const field of ['tables', 'memos', 'schemas', 'dbObjects', 'dbObjectCategories'] as const) expect(saved[field]).toEqual(schema[field]);
      expect((await page.request.put(url, { data: schema })).status()).toBe(403);
      expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(access === 'viewer' ? 200 : 201);
      // Discard rejected drafts, then prove the recovered permission survives reload.
      await page.reload(); await page.getByTestId('table-card').first().click(); await expect(page.getByTestId('table-name-input')).toBeEnabled();
      await open(); await commit();
      const result = (model: ERDSchema) => surface === 'memo' ? model.memos[0].content : surface === 'bulk' ? model.tables[0].group : surface === 'namespace' ? model.schemas?.[0] : model.dbObjectCategories?.[0];
      const expected = `Rejected ${surface === 'bulk' ? 'group' : surface} draft`;
      await expect.poll(async () => result(await resources.admin.get(url).then(r => r.json()))).toBe(expected);
      await page.reload(); expect(result(await resources.admin.get(url).then(r => r.json()))).toBe(expected);
      if (surface === 'memo') await expect(page.getByTestId('memo-card')).toContainText(expected);
      else if (surface === 'namespace') await expect(page.locator('.schema-tab-bar').getByRole('button', { name: expected, exact: true })).toBeVisible();
      else if (surface === 'category') { await page.getByRole('button', { name: /objects 1/i }).click(); await expect(page.locator('.category-name')).toHaveText(expected); }
      else expect((await resources.admin.get(url).then(r => r.json())).tables.map((table: { group: string }) => table.group)).toEqual([expected, expected]);
    });
  }
}

for (const field of ['length', 'scale', 'defaultValue'] as const) {
  for (const conflict of ['same-field', 'independent-field'] as const) {
    for (const order of ['clear-first', 'edit-first'] as const) {
      test(`collaborative ${field} clearing versus ${conflict} edit converges in ${order} order without losing metadata`, async ({ resources }) => {
        const account = await resources.user(), project = await resources.project();
        const schema = structuredClone(project.schema) as ERDSchema;
        Object.assign(schema.tables[0].columns[0], { type: 'DECIMAL', length: 12, scale: 2, defaultValue: '1', comment: 'Keep column metadata' });
        const url = `/api/storage/schemas/${project.id}`;
        expect((await resources.admin.put(url, { data: schema })).status()).toBe(200);
        expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
        const owner = await resources.anonymous(); await owner.context().addCookies((await resources.admin.storageState()).cookies);
        const peer = await resources.session(account);
        for (const page of [owner, peer]) page.setDefaultTimeout(10_000);
        const left = await holdCollaborationOperations(owner), right = await holdCollaborationOperations(peer);
        try {
          await owner.goto('/'); await peer.goto('/'); await expect(owner.locator('.peer-count')).toHaveText('2');
          for (const page of [owner, peer]) { await page.getByTestId('table-card').click(); await page.getByTestId('column-row').click(); }
          const selector = field === 'length' ? '#ce-length' : field === 'scale' ? '#ce-scale' : '#ce-default';
          await owner.getByTestId('column-edit-popup').locator(selector).fill('');
          const edited = field === 'length' ? '18' : field === 'scale' ? '4' : '42';
          if (conflict === 'same-field') await peer.getByTestId('column-edit-popup').locator(selector).fill(edited);
          else await peer.getByTestId('column-name-input').fill('concurrent_column_name');
          await expect.poll(() => left.operations.length).toBe(1); await expect.poll(() => right.operations.length).toBe(1);
          const clearing = left.operations[0].op;
          expect(clearing.kind).toBe('update-column');
          if (clearing.kind === 'update-column') expect(clearing.unsetFields).toContain(field);
          const first = order === 'clear-first' ? left : right, second = order === 'clear-first' ? right : left;
          first.release(); await expect.poll(() => second.receivedOperations.length).toBe(1); second.release();
          await expect.poll(() => first.receivedOperations.length).toBe(1);
          const expected = { ...schema.tables[0].columns[0],
            [field]: conflict === 'same-field' && order === 'clear-first' ? field === 'defaultValue' ? edited : Number(edited) : undefined,
            ...(conflict === 'independent-field' ? { name: 'concurrent_column_name' } : {}) };
          const exportModel = async (page: Page): Promise<ERDSchema> => {
            if (await page.getByTestId('column-edit-popup').isVisible()) await page.getByTestId('column-edit-popup').getByRole('button', { name: 'Close', exact: true }).click();
            await page.getByTestId('export-menu-toggle').click(); const download = page.waitForEvent('download');
            await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
            return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
          };
          // JSON omits undefined optional fields; compare both peers and storage to
          // exactly that canonical representation, never treating null as cleared.
          const canonical = JSON.parse(JSON.stringify(expected));
          const inspect = (model: ERDSchema) => model.tables[0].columns[0];
          const a = await exportModel(owner), b = await exportModel(peer);
          expect(inspect(a)).toEqual(canonical); expect(inspect(b)).toEqual(canonical);
          expect(a.tables).toEqual(b.tables); expect(a.domains).toEqual(b.domains);
          await expect.poll(async () => inspect(await resources.admin.get(url).then(r => r.json()))).toEqual(canonical);
          for (const page of [owner, peer]) {
            await page.reload(); await page.getByTestId('table-card').click();
            expect(inspect(await exportModel(page))).toEqual(canonical);
          }
        } finally { left.release(); right.release(); }
      });
    }
  }
}

for (const target of ['fk-line', 'table', 'memo', 'column-editor', 'column-popup', 'namespace', 'category', 'object', 'domain', 'domain-propagation', 'bulk-delete', 'keyboard-table', 'keyboard-memo', 'keyboard-memos', 'keyboard-mixed'] as const) {
  for (const access of ['viewer', 'revoked'] as const) {
    test(`pending ${target} confirmation rechecks ${access} permission before mutation and allows cancel or retry after regrant`, async ({ resources }) => {
      const account = await resources.user(), project = await resources.project();
      const schema = structuredClone(project.schema) as ERDSchema;
      schema.schemas = ['core', 'other'];
      Object.assign(schema.tables[0], { schema: 'core', comment: 'Keep table metadata' });
      Object.assign(schema.tables[0].columns[0], { type: 'VARCHAR', length: 20, domainId: 'identifier', comment: 'Keep column metadata' });
      schema.domains = [{ id: 'identifier', name: 'id_domain', type: 'VARCHAR', length: 20, nullable: false, primaryKey: true, unique: true, autoIncrement: false }];
      schema.tables.push({ id: 'audit', name: 'audit', schema: 'other', position: { x: 500, y: 100 }, columns: [{ ...schema.tables[0].columns[0], id: 'audit_id', domainId: undefined }], foreignKeys: [{ id: 'audit_fk', columnIds: ['audit_id'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }], uniqueKeys: [], indexes: [] });
      schema.memos = ['memo1', 'memo2'].map((id, index) => ({ id, content: `Retain ${id}`, schema: 'core', width: 180, height: 100, position: { x: 100 + index * 300, y: 400 } }));
      schema.dbObjectCategories = ['Views', 'Functions'];
      schema.dbObjects = [{ id: 'view', name: 'retained_view', category: 'Views', schema: 'core', sql: 'SELECT id FROM users;' }, { id: 'function', name: 'retained_function', category: 'Functions', schema: 'other', sql: 'SELECT 1;' }];
      const url = `/api/storage/schemas/${project.id}`, permissions = `/api/storage/projects/${project.id}/permissions`;
      expect((await resources.admin.put(url, { data: schema })).status()).toBe(200);
      expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
      const page = await resources.session(account); page.setDefaultTimeout(10_000); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
      const table = () => page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^users$/ }) });
      const open = async () => {
        if (target === 'fk-line') {
          const line = page.getByRole('button', { name: 'FK line', exact: true }); await line.focus(); await line.press('Enter');
          await page.locator('.fk-popover').getByRole('button', { name: /Delete/ }).click();
        } else if (target === 'table') { await table().hover(); await table().getByTestId('delete-table').click(); }
        else if (target === 'memo') { await page.getByTestId('memo-card').first().hover(); await page.getByTestId('memo-card').first().getByTestId('delete-memo').click(); }
        else if (target === 'column-editor' || target === 'column-popup') {
          await table().click();
          if (target === 'column-editor') { await page.getByTestId('table-editor').locator('.col-row').hover(); await page.getByTestId('table-editor').locator('.col-del-btn').click(); }
          else { await page.getByTestId('column-row').first().click(); await page.getByTestId('column-edit-popup').locator('.delete-col-btn').click(); }
        } else if (target === 'namespace') {
          const wrapper = page.locator('.schema-tab-wrapper').filter({ has: page.getByRole('button', { name: 'core', exact: true }) });
          await wrapper.hover(); await wrapper.locator('.schema-tab-delete').click();
        } else if (target === 'category' || target === 'object') {
          await page.getByRole('button', { name: /objects 2/i }).click();
          const category = page.locator('.category-group').filter({ has: page.locator('.category-name', { hasText: /^Views$/ }) });
          if (target === 'category') await category.hover(); else await category.locator('.object-row').hover();
          await category.locator(target === 'category' ? '.cat-action-delete' : '.object-delete-btn').click();
        } else if (target === 'domain' || target === 'domain-propagation') {
          await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
          const row = page.locator('tr.display-row').filter({ hasText: 'id_domain' });
          if (target === 'domain') await row.locator('button.del').click();
          else { await row.click(); await page.locator('.edit-card').getByLabel('Length', { exact: true }).fill('30'); await page.locator('.edit-btn-save').click(); }
        } else if (target === 'bulk-delete') {
          await page.locator('.table-item').first().click(); await page.locator('.table-item').nth(1).click({ modifiers: ['ControlOrMeta'] }); await page.locator('.bulk-delete-btn').click();
        } else {
          await page.keyboard.press('Escape');
          if (target === 'keyboard-table' || target === 'keyboard-mixed') await table().locator('.table-header').click();
          if (target !== 'keyboard-table') {
            await page.getByTestId('memo-card').first().locator('.memo-header').click(target === 'keyboard-mixed' ? { modifiers: ['ControlOrMeta'] } : {});
            if (target === 'keyboard-memos') await page.getByTestId('memo-card').nth(1).locator('.memo-header').click({ modifiers: ['ControlOrMeta'] });
          }
          await expect(page.locator('[data-testid=memo-card].selected')).toHaveCount(target === 'keyboard-table' ? 0 : target === 'keyboard-memos' ? 2 : 1);
          await expect(page.locator('[data-testid=table-card].selected')).toHaveCount(target === 'keyboard-table' || target === 'keyboard-mixed' ? 1 : 0);
          await page.keyboard.press('Delete');
        }
        await expect(page.getByRole('alertdialog')).toBeVisible();
      };
      const closePanels = async () => {
        if (await page.getByTestId('column-edit-popup').isVisible()) await page.getByTestId('column-edit-popup').getByRole('button', { name: 'Close', exact: true }).click();
        if (await page.locator('.edit-btn-cancel').isVisible()) await page.locator('.edit-btn-cancel').click();
        const domains = page.locator('.backdrop[role=dialog]');
        if (await domains.isVisible()) await domains.getByRole('button', { name: 'Close', exact: true }).click();
      };
      const exportModel = async () => {
        await closePanels(); await page.getByTestId('export-menu-toggle').click(); const downloaded = page.waitForEvent('download');
        await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
        return JSON.parse(await readFile((await (await downloaded).path())!, 'utf8')) as ERDSchema;
      };
      const fields = ['tables', 'memos', 'schemas', 'domains', 'dbObjects', 'dbObjectCategories'] as const;
      const canonical = JSON.parse(JSON.stringify(schema));
      await open();
      if (access === 'viewer') expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(200);
      else expect((await resources.admin.delete(permissions, { data: { userId: account.id } })).status()).toBe(200);
      const refreshed = page.waitForResponse(r => r.url().endsWith(`/projects/${project.id}/my-permission`));
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await refreshed;
      await expect(page.getByRole('combobox', { name: 'Target DBMS' })).toBeDisabled();
      const confirm = () => page.getByRole('alertdialog').getByRole('button', { name: target === 'domain-propagation' ? 'Propagate changes?' : 'Delete', exact: true });
      await confirm().click(); await expect(page.getByRole('alertdialog')).toHaveCount(0);
      const local = await exportModel();
      for (const field of fields) expect.soft(local[field], `local ${field}`).toEqual(canonical[field]);
      const persisted = await resources.admin.get(url).then(r => r.json());
      for (const field of fields) expect(persisted[field], `stored ${field}`).toEqual(canonical[field]);
      expect((await page.request.put(url, { data: schema })).status()).toBe(403);
      expect((await resources.admin.post(permissions, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(access === 'viewer' ? 200 : 201);
      await page.reload(); await open();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await closePanels();
      const cancelled = await exportModel();
      for (const field of fields) expect(cancelled[field], `cancelled ${field}`).toEqual(canonical[field]);
      await open(); await confirm().click();
      if (target === 'keyboard-mixed') { await expect(page.getByRole('alertdialog')).toBeVisible(); await confirm().click(); }
      await expect(page.getByRole('alertdialog')).toHaveCount(0); await closePanels();
      const check = (model: ERDSchema) => {
        if (target === 'table' || target === 'keyboard-table' || target === 'keyboard-mixed') { expect(model.tables.map(t => t.id)).toEqual(['audit']); expect(model.tables[0].foreignKeys).toEqual([]); }
        if (target === 'fk-line') { expect(model.tables[1].foreignKeys).toEqual([]); expect(model.tables[0]).toEqual(canonical.tables[0]); }
        if (target === 'bulk-delete') expect(model.tables).toEqual([]);
        if (target === 'memo' || target === 'keyboard-memo' || target === 'keyboard-mixed') expect(model.memos.map(m => m.id)).toEqual(['memo2']);
        if (target === 'keyboard-memos') expect(model.memos).toEqual([]);
        if (target.startsWith('column-')) { expect(model.tables[0].columns).toEqual([]); expect(model.tables[1].foreignKeys).toEqual([]); }
        if (target === 'namespace') { expect(model.schemas).toEqual(['other']); expect(model.tables[0].schema).toBeUndefined(); expect(model.memos[0].schema).toBeUndefined(); expect(model.dbObjects?.[0].schema).toBeUndefined(); }
        if (target === 'category' || target === 'object') expect(model.dbObjects?.map(o => o.id)).toEqual(['function']);
        if (target === 'category') expect(model.dbObjectCategories).toEqual(['Functions']);
        if (target === 'domain') { expect(model.domains).toEqual([]); expect(model.tables[0].columns[0].domainId).toBeUndefined(); expect(model.tables[0].columns[0].length).toBe(20); }
        if (target === 'domain-propagation') { expect(model.domains[0].length).toBe(30); expect(model.tables[0].columns[0].length).toBe(30); expect(model.tables[1].columns[0].length).toBe(20); }
      };
      const expected = structuredClone(canonical) as ERDSchema;
      if (['table', 'keyboard-table', 'keyboard-mixed'].includes(target)) { expected.tables = [expected.tables[1]]; expected.tables[0].foreignKeys = []; }
      if (target === 'fk-line') expected.tables[1].foreignKeys = [];
      if (target === 'bulk-delete') expected.tables = [];
      if (['memo', 'keyboard-memo', 'keyboard-mixed'].includes(target)) expected.memos = [expected.memos[1]];
      if (target === 'keyboard-memos') expected.memos = [];
      if (target.startsWith('column-')) { expected.tables[0].columns = []; expected.tables[1].foreignKeys = []; }
      if (target === 'namespace') {
        expected.schemas = ['other'];
        for (const item of [...expected.tables, ...expected.memos, ...(expected.dbObjects ?? [])]) if (item.schema === 'core') delete item.schema;
      }
      if (target === 'category' || target === 'object') expected.dbObjects = [expected.dbObjects![1]];
      if (target === 'category') expected.dbObjectCategories = ['Functions'];
      if (target === 'domain') { expected.domains = []; delete expected.tables[0].columns[0].domainId; }
      if (target === 'domain-propagation') { expected.domains[0].length = 30; expected.tables[0].columns[0].length = 30; }
      const accepted = await exportModel(); check(accepted);
      for (const field of fields) expect(accepted[field], `accepted ${field}`).toEqual(expected[field]);
      await expect.poll(async () => { const saved = await resources.admin.get(url).then(r => r.json()); return Object.fromEntries(fields.map(field => [field, saved[field]])); }).toEqual(Object.fromEntries(fields.map(field => [field, accepted[field]])));
      await page.reload(); const reloaded = await exportModel(); check(reloaded);
      for (const field of fields) expect(reloaded[field]).toEqual(accepted[field]);
    });
  }
}


test('MCP discovery returns the complete public tool contract without exposing secrets or mutating project data', async ({ resources }) => {
  const project = await resources.project();
  const created = await resources.admin.post('/api/admin/api-keys', { data: { name: 'Catalog contract key', scopes: [{ projectId: project.id, permission: 'viewer' }] } });
  expect(created.status()).toBe(201);
  const key = await created.json();
  try {
    const response = await resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id: 37, method: 'tools/list', params: {} } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.jsonrpc).toBe('2.0'); expect(body.id).toBe(37); expect(body.error).toBeUndefined();
    expect(body.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES]);
    expect(new Set(body.result.tools.map((tool: { name: string }) => tool.name)).size).toBe(MCP_TOOL_NAMES.length);
    for (const tool of body.result.tools) {
      expect(tool.description.trim().length, tool.name).toBeGreaterThan(0);
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(tool.inputSchema.properties, tool.name).toBeDefined();
      for (const required of tool.inputSchema.required ?? []) expect(tool.inputSchema.properties, tool.name).toHaveProperty(required);
    }
    expect(JSON.stringify(body)).not.toContain(key.key); expect(JSON.stringify(body)).not.toContain(project.name);
    expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(project.schema);
  } finally { expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200); }
});

for (const tool of ['get_schema_summary', 'list_tables', 'list_schemas', 'get_table', 'list_groups'] as const) {
  test(`MCP ${tool} returns its read contract, validates selectors and denies out-of-scope data without writes`, async ({ resources }) => {
    const account = await resources.user(), project = await resources.project(), denied = await resources.project();
    const schema = structuredClone(project.schema) as ERDSchema;
    Object.assign(schema.tables[0], { group: 'core', schema: 'core', color: 'blue', comment: 'Retain table details' });
    const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    schema.tables.push({ id: 'orders', name: 'orders', schema: 'analytics', group: 'core', position: { x: 450, y: 100 }, columns: [{ ...flags, id: 'order_id', name: 'id', type: 'INT', primaryKey: true }, { ...flags, id: 'account_id', name: 'account_id', type: 'INT' }], foreignKeys: [{ id: 'orders_account', columnIds: ['account_id'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }], uniqueKeys: [], indexes: [{ id: 'account_index', name: 'account_index', columnIds: ['account_id'], unique: false }] });
    schema.tables.push({ id: 'audit', name: 'audit', position: { x: 750, y: 100 }, columns: [{ ...flags, id: 'audit_id', name: 'id', type: 'INT' }], foreignKeys: [], uniqueKeys: [], indexes: [] });
    schema.schemas = ['core', 'analytics', 'empty']; schema.domains = [{ ...flags, id: 'identifier', name: 'identifier_domain', type: 'INT' }];
    schema.memos = [{ id: 'core_memo', content: 'Core documentation', schema: 'core', position: { x: 100, y: 400 }, width: 180, height: 100 }, { id: 'global_memo', content: 'Unassigned documentation', position: { x: 400, y: 400 }, width: 180, height: 100 }];
    const url = `/api/storage/schemas/${project.id}`;
    expect((await resources.admin.put(url, { data: schema })).status()).toBe(200);
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
    const created = await resources.admin.post('/api/admin/api-keys', { data: { userId: account.id, name: `Read contract ${tool}`, scopes: [{ projectId: project.id, permission: 'viewer' }] } });
    expect(created.status()).toBe(201); const key = await created.json(); let requestId = 0;
    try {
      const call = async (args: Record<string, unknown>) => {
        const id = ++requestId;
        const response = await resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool, arguments: args } } });
        expect(response.status()).toBe(200); const body = await response.json(); expect(body.id).toBe(id); return body;
      };
      const read = async (extra: Record<string, unknown> = {}) => {
        const body = await call({ projectId: project.id, ...extra });
        expect(body.error).toBeUndefined(); expect(body.result.isError).not.toBe(true);
        expect(body.result.content[0].type).toBe('text'); return JSON.parse(body.result.content[0].text);
      };
      if (tool === 'get_schema_summary') expect(await read()).toEqual({ tableCount: 3, columnCount: 4, fkCount: 1, indexCount: 1, groups: ['core'], domains: [{ id: 'identifier', name: 'identifier_domain', type: 'INT' }] });
      if (tool === 'list_tables') {
        const rows = await read(); expect(rows.map((row: { id: string }) => row.id)).toEqual(['users', 'orders', 'audit']);
        expect(rows[0]).toEqual({ id: 'users', name: 'users', schema: 'core', comment: 'Retain table details', group: 'core', color: 'blue', columnCount: 1, fkCount: 0, pkColumns: ['id'] });
        expect(rows[1]).toMatchObject({ columnCount: 2, fkCount: 1, pkColumns: ['id'] }); expect(rows[2]).toMatchObject({ schema: null, group: null, color: null, comment: null });
        expect((await read({ group: 'core' })).map((row: { id: string }) => row.id)).toEqual(['users', 'orders']);
        expect((await read({ schema: 'analytics', group: 'core' })).map((row: { id: string }) => row.id)).toEqual(['orders']);
        expect(await read({ schema: 'empty' })).toEqual([]); expect(await read({ group: 'unknown' })).toEqual([]);
      }
      if (tool === 'list_schemas') expect(await read()).toEqual([{ name: 'core', tableCount: 1, memoCount: 1, tableNames: ['users'] }, { name: 'analytics', tableCount: 1, memoCount: 0, tableNames: ['orders'] }, { name: 'empty', tableCount: 0, memoCount: 0, tableNames: [] }]);
      if (tool === 'get_table') {
        expect(await read({ tableId: 'users' })).toEqual(schema.tables[0]); expect(await read({ tableName: 'UsErS' })).toEqual(schema.tables[0]);
        expect(await read({ tableId: 'orders' })).toEqual(schema.tables[1]);
        for (const extra of [{}, { tableId: 'missing' }, { tableName: 'missing' }, { tableId: 'missing', tableName: 'users' }]) expect((await call({ projectId: project.id, ...extra })).result.isError).toBe(true);
      }
      if (tool === 'list_groups') expect(await read()).toEqual([{ group: '(ungrouped)', tableCount: 1, tableNames: ['audit'] }, { group: 'core', tableCount: 2, tableNames: ['users', 'orders'] }]);
      for (const args of [{}, { projectId: 123 }, { projectId: 'x'.repeat(257) }]) {
        const invalid = await call(args); expect(Boolean(invalid.error) || invalid.result?.isError === true).toBe(true);
      }
      const forbidden = await call({ projectId: denied.id, ...(tool === 'get_table' ? { tableId: 'users' } : {}) });
      expect(forbidden.result.isError).toBe(true); expect(JSON.stringify(forbidden)).not.toContain(denied.name);
      expect(await resources.admin.get(url).then(r => r.json())).toEqual(schema);
      expect(await resources.admin.get(`/api/storage/schemas/${denied.id}`).then(r => r.json())).toEqual(denied.schema);
      const page = await resources.session(account); await page.goto('/'); await expect(page.getByTestId('table-card')).toHaveCount(3);
      await page.getByTestId('table-card').first().click(); await expect(page.getByTestId('table-name-input')).toBeDisabled();
      await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(3);
      expect(await resources.admin.get(url).then(r => r.json())).toEqual(schema);
    } finally { expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200); }
  });
}

function mcpMutationFixture(): ERDSchema {
  const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  const column = (id: string, type: Column['type'] = 'INT'): Column => ({ ...flags, id, name: id, type });
  return { version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemas: ['core', 'analytics'], groupColors: { core: 'blue', stable: 'green' },
    domains: [{ ...flags, id: 'label', name: 'label_domain', type: 'VARCHAR', length: 40 }],
    tables: [
      { id: 'users', name: 'users', schema: 'core', group: 'core', color: 'blue', comment: 'Keep source metadata', position: { x: 100, y: 100 }, columns: [{ ...column('id'), primaryKey: true, unique: true }, column('tenant'), { ...column('note', 'VARCHAR'), length: 40, domainId: 'label', defaultValue: "'retained'", check: 'length(note) > 0', comment: 'Keep column metadata' }], foreignKeys: [], uniqueKeys: [{ id: 'uk_keep', name: 'keep_key', columnIds: ['tenant', 'id'] }, { id: 'uk_note', name: 'note_key', columnIds: ['note', 'tenant'] }], indexes: [{ id: 'idx_keep', name: 'keep_index', columnIds: ['tenant'], unique: false }, { id: 'idx_note', name: 'note_index', columnIds: ['note'], unique: true }] },
      { id: 'orders', name: 'orders', schema: 'analytics', group: 'core', comment: 'Keep orders metadata', position: { x: 450, y: 100 }, columns: [column('a'), column('t'), column('n', 'VARCHAR')], foreignKeys: [{ id: 'fk_main', columnIds: ['a', 't'], referencedTableId: 'users', referencedColumnIds: ['id', 'tenant'], onDelete: 'CASCADE', onUpdate: 'RESTRICT', label: 'existing relation' }], uniqueKeys: [], indexes: [] },
      { id: 'audit', name: 'audit', group: 'stable', position: { x: 800, y: 100 }, columns: [column('audit_id')], foreignKeys: [{ id: 'audit_fk', columnIds: ['audit_id'], referencedTableId: 'orders', referencedColumnIds: ['a'], onDelete: 'NO ACTION', onUpdate: 'RESTRICT' }], uniqueKeys: [], indexes: [], comment: 'Do not modify audit data' },
    ],
    memos: [{ id: 'attached', content: 'Keep attached memo', schema: 'core', color: 'blue', attachedTableId: 'users', position: { x: 90, y: 350 }, width: 180, height: 100 }, { id: 'floating', content: 'x'.repeat(104), schema: 'analytics', position: { x: 350, y: 400 }, width: 200, height: 150 }],
    dbObjectCategories: ['Views'], dbObjects: [{ id: 'view', name: 'retained_view', category: 'Views', sql: 'SELECT id FROM users;' }],
  };
}

type McpMutationCase = { tool: string; variant?: string; args: Record<string, unknown>; invalid: Record<string, unknown>[] };
const mcpMutationCases: McpMutationCase[] = [
  { tool: 'get_schema', args: {}, invalid: [{ projectId: 123 }, { projectId: 'x'.repeat(257) }] },
  { tool: 'import_ddl', variant: 'merge-existing', args: { sql: 'CREATE TABLE USERS (id INT, tenant INT, PRIMARY KEY (id, tenant)); CREATE TABLE imported_child (id INT PRIMARY KEY, parent_id INT, tenant_id INT, FOREIGN KEY (parent_id, tenant_id) REFERENCES USERS(id, tenant));' }, invalid: [{ sql: 'CREATE TABLE USERS (new_col INT PRIMARY KEY); CREATE TABLE invalid_child (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES USERS(new_col));' }] },
  { tool: 'import_prisma', variant: 'merge-existing', args: { source: 'model USERS {\n id Int\n tenant Int\n children imported_child[]\n @@id([id, tenant])\n}\nmodel imported_child {\n id Int @id\n parent_id Int\n tenant_id Int\n parent USERS @relation(fields: [parent_id, tenant_id], references: [id, tenant])\n}' }, invalid: [{ source: 'model USERS {\n new_col Int @id\n children invalid_child[]\n}\nmodel invalid_child {\n id Int @id\n parent_id Int\n parent USERS @relation(fields: [parent_id], references: [new_col])\n}' }] },
  { tool: 'import_dbml', variant: 'merge-existing', args: { source: 'Table USERS {\n id int\n tenant int\n Indexes {\n (id, tenant) [pk]\n }\n}\nTable imported_child {\n id int [pk]\n parent_id int\n tenant_id int\n}\nRef: imported_child.(parent_id, tenant_id) > USERS.(id, tenant)' }, invalid: [{ source: 'Table USERS {\n new_col int [pk]\n}\nTable invalid_child {\n id int [pk]\n parent_id int\n}\nRef: invalid_child.parent_id > USERS.new_col' }] },

  { tool: 'rename_schema', variant: 'assigned-object', args: { oldName: 'core', newName: 'billing' }, invalid: [{ oldName: 'missing', newName: 'billing' }] },
  { tool: 'delete_schema', variant: 'assigned-object', args: { name: 'core' }, invalid: [{ name: 'missing' }] },
  { tool: 'update_db_object', variant: 'move-category', args: { objectId: 'view', category: 'Reporting' }, invalid: [{ objectId: 'view', category: '   ' }] },

  { tool: 'set_project_dictionary', args: { dictionaryId: '$dictionary' }, invalid: [{ dictionaryId: 'missing' }, { dictionaryId: 123 }] },
  { tool: 'set_project_naming_rules', args: { overrides: { tableCase: 'PascalCase', columnPrefix: { enabled: false } } }, invalid: [{ overrides: { tableCase: 'invalid' } }, { overrides: { tableCase: 'PascalCase', columnCase: 'snake_case' } }, { overrides: { unknown: 'bad' } }] },
  { tool: 'get_naming_rules', args: {}, invalid: [{ projectId: 123 }] },

  { tool: 'list_domains', args: {}, invalid: [{ projectId: 123 }] },
  { tool: 'get_domain', args: { domainId: 'label' }, invalid: [{}, { domainId: 'missing' }, { domainName: 'missing' }] },
  { tool: 'add_domain', args: { name: 'amount_domain', type: 'DECIMAL', length: 12, scale: 0, parentId: 'label', alias: '금액', owner: 'Finance', tags: ['money'], description: '문서\n설명', defaultValue: '0', check: 'amount >= 0' }, invalid: [{ name: 'bad', type: 'DECIMAL', scale: 0.5 }, { name: 'bad', type: 'INT', parentId: 'missing' }, { name: '  ', type: 'INT' }] },
  { tool: 'update_domain', args: { domainId: 'label', length: 80, comment: 'Propagated label' }, invalid: [{ domainId: 'missing' }, { domainId: 'label', length: 1.5 }, { domainId: 'label', parentId: 'missing' }, { domainId: 'label', parentId: 'child' }, { domainId: 'label', parentId: 'label' }] },
  { tool: 'delete_domain', args: { domainId: 'label' }, invalid: [{ domainId: 'missing' }] },
  { tool: 'suggest_domains', args: {}, invalid: [{ projectId: 123 }] },
  { tool: 'domain_coverage', args: {}, invalid: [{ projectId: 123 }] },
  ...['markdown', 'html'].map(format => ({ tool: 'export_domain_dictionary', variant: format, args: { format }, invalid: [{ format: 'invalid' }] })),

  ...['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2'].map(dialect => ({ tool: 'import_ddl', variant: dialect, args: { dialect, sql: 'CREATE TABLE imported_parent (id INT PRIMARY KEY); CREATE TABLE imported_child (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES imported_parent(id));' }, invalid: [{ sql: '', replace: true }, { sql: 'SELECT 1;', replace: true }, { sql: 'CREATE TABLE broken (', dialect }, { sql: 'x', dialect: 'invalid' }] })),
  { tool: 'import_prisma', args: { source: 'model ImportedParent {\n id Int @id\n children ImportedChild[]\n}\nmodel ImportedChild {\n id Int @id\n parent_id Int\n parent ImportedParent @relation(fields: [parent_id], references: [id])\n}' }, invalid: [{ source: '', replace: true }, { source: 'invalid source', replace: true }, { source: 123 }] },
  { tool: 'import_dbml', args: { source: 'Table imported_parent {\n id int [pk]\n}\nTable imported_child {\n id int [pk]\n parent_id int\n}\nRef: imported_child.parent_id > imported_parent.id' }, invalid: [{ source: '', replace: true }, { source: 'invalid source', replace: true }, { source: 123 }] },

  { tool: 'bulk_add_tables', args: { tables: [{ name: 'ledger', withPk: false, schema: 'core', color: 'pink', comment: '일괄 생성', columns: [{ name: 'amount', type: 'DECIMAL', length: 12, scale: 0, primaryKey: true, nullable: true, defaultValue: '0', check: 'amount >= 0' }] }, { name: 'defaults' }] }, invalid: [{ tables: [] }, { tables: Array.from({ length: 101 }, () => ({ name: 'over' })) }, { tables: [{ name: 'valid' }, { name: 'bad', columns: [{ name: 'bad', length: 1.5 }] }] }, { tables: [{ name: 'valid' }, { name: 'bad', columns: [{ name: 'bad', domainId: 'missing' }] }] }] },
  { tool: 'bulk_add_columns', args: { tableId: 'users', columns: [{ name: 'amount', type: 'DECIMAL', length: 12, scale: 0, primaryKey: true, nullable: true, defaultValue: '0' }, { name: 'state', type: 'ENUM', enumValues: ['신규', 'done'], comment: 'Retain ENUM' }] }, invalid: [{ tableId: 'missing', columns: [{}] }, { tableId: 'users', columns: [] }, { tableId: 'users', columns: [{ name: 'valid' }, { name: 'bad', scale: 0.5 }] }, { tableId: 'users', columns: [{ name: 'valid' }, { name: 'bad', domainId: 'missing' }] }] },
  { tool: 'bulk_update_tables', args: { updates: [{ tableId: 'users', comment: '', color: '', group: '', schema: '' }, { tableId: 'orders', name: 'renamed_orders' }, { tableId: 'missing', name: 'ignored' }] }, invalid: [{ updates: [] }, { updates: [{ tableId: 'missing' }] }, { updates: [{ tableId: 'users', comment: 'valid' }, { tableId: 'orders', color: 'invalid' }] }] },
  { tool: 'bulk_update_columns', args: { updates: [{ tableId: 'users', columnId: 'note', domainId: '', primaryKey: true, nullable: true }, { tableId: 'orders', columnId: 'n', type: 'DECIMAL', length: 12, scale: 0, defaultValue: '0' }, { tableId: 'missing', columnId: 'missing' }] }, invalid: [{ updates: [] }, { updates: [{ tableId: 'missing', columnId: 'missing' }] }, { updates: [{ tableId: 'users', columnId: 'note', comment: 'valid' }, { tableId: 'orders', columnId: 'n', length: 1.5 }] }, { updates: [{ tableId: 'users', columnId: 'note', comment: 'valid' }, { tableId: 'orders', columnId: 'n', domainId: 'missing' }] }] },

  { tool: 'list_snapshots', args: {}, invalid: [{ projectId: 123 }] },
  { tool: 'create_snapshot', args: { name: '현재 버전', description: 'Retain full metadata' }, invalid: [{ name: 123 }, { name: 'x'.repeat(257) }] },
  { tool: 'restore_snapshot', args: { snapshotId: '$base' }, invalid: [{ snapshotId: 'missing' }, { snapshotId: '$foreign' }] },
  { tool: 'delete_snapshot', args: { snapshotId: '$base' }, invalid: [{ snapshotId: 'missing' }, { snapshotId: '$foreign' }] },
  { tool: 'compare_snapshots', args: { snapshotId: '$base', snapshotId2: 'current' }, invalid: [{ snapshotId: 'missing', snapshotId2: 'current' }, { snapshotId: '$foreign', snapshotId2: 'current' }] },
  ...['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2'].map(dialect => ({ tool: 'export_migration_sql', variant: dialect, args: { snapshotId: '$base', snapshotId2: 'current', dialect }, invalid: [{ snapshotId: 'missing', snapshotId2: 'current' }, { snapshotId: '$foreign', snapshotId2: 'current' }, { snapshotId: '$base', snapshotId2: 'current', dialect: 'invalid' }] })),

  ...['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2'].map(dialect => ({ tool: 'export_ddl', variant: dialect, args: { dialect }, invalid: [{ dialect: 'invalid' }, { dialect, includeForeignKeys: 'true' }] })),
  ...['mermaid', 'plantuml'].map(format => ({ tool: 'export_diagram', variant: format, args: { format }, invalid: [{ format: 'invalid' }] })),
  { tool: 'export_prisma', args: {}, invalid: [{ includeComments: 'true' }] },
  { tool: 'export_dbml', args: {}, invalid: [{ includeIndexes: 'true' }] },

  ...['grid', 'hierarchical', 'radial', 'radial-tree'].map(type => ({ tool: 'auto_layout', variant: type, args: { type, groupByGroup: true }, invalid: [{ type: 'invalid' }, { type, groupByGroup: 'true' }] })),
  { tool: 'get_table_by_name', args: { name: 'UsE', exact: false }, invalid: [{ name: 'missing' }, { name: 'use', exact: true }, { name: 'users', exact: 'true' }] },
  { tool: 'search_columns', args: { name: 'NO', type: 'VARCHAR', domainId: 'label' }, invalid: [{ type: 'invalid' }, { hasNoDomain: 'true' }] },
  { tool: 'find_orphan_tables', args: {}, invalid: [{ projectId: 123 }] },
  { tool: 'lint_schema', args: {}, invalid: [{ projectId: 123 }] },

  { tool: 'list_db_objects', args: {}, invalid: [{ category: 12 }] },
  { tool: 'list_db_object_categories', args: {}, invalid: [{ projectId: 12 }] },
  { tool: 'get_db_object', args: { objectId: 'view' }, invalid: [{ objectId: 'missing' }, { objectId: 12 }] },
  { tool: 'add_db_object', args: { category: 'Functions', name: '한국어_function', sql: 'SELECT 0;\n-- retained SQL', comment: '설명', schema: 'core', includeInDdl: true }, invalid: [{ category: '' }, { category: '   ' }, { category: 'Views', sql: 'x'.repeat(100001) }] },
  { tool: 'update_db_object', args: { objectId: 'view', name: 'renamed_view', sql: '', comment: '', schema: '', includeInDdl: false }, invalid: [{ objectId: 'missing' }, { objectId: 'view', includeInDdl: 'false' }, { objectId: 'view', category: '   ' }] },
  { tool: 'delete_db_object', args: { objectId: 'view' }, invalid: [{ objectId: 'missing' }] },
  { tool: 'add_db_object_category', args: { category: 'Functions' }, invalid: [{ category: 'Views' }, { category: '' }, { category: '   ' }] },
  { tool: 'rename_db_object_category', args: { oldName: 'Views', newName: 'Functions' }, invalid: [{ oldName: 'missing', newName: 'Functions' }, { oldName: 'Views', newName: 'Views' }, { oldName: 'Views', newName: '   ' }] },
  { tool: 'delete_db_object_category', args: { category: 'Views' }, invalid: [{ category: 'missing' }] },

  { tool: 'add_schema', args: { name: 'billing' }, invalid: [{ name: 'core' }, { name: '' }, { name: '   ' }, { name: 'x'.repeat(257) }] },
  { tool: 'rename_schema', args: { oldName: 'core', newName: 'billing' }, invalid: [{ oldName: 'missing', newName: 'billing' }, { oldName: 'core', newName: 'analytics' }, { oldName: 'core', newName: '   ' }] },
  { tool: 'delete_schema', args: { name: 'core' }, invalid: [{ name: 'missing' }] },
  { tool: 'bulk_update_table_schema', args: { tableIds: ['users', 'orders', 'users', 'missing'], schema: 'analytics' }, invalid: [{ tableIds: [], schema: 'core' }, { tableIds: ['missing'], schema: 'core' }, { tableIds: ['users'], schema: 42 }] },

  { tool: 'add_table', args: { name: 'created_table', withPk: false, schema: 'analytics', group: 'new_group', color: 'pink', comment: 'Created metadata' }, invalid: [{ color: 'invalid' }, { name: 17 }] },
  { tool: 'update_table', args: { tableId: 'users', name: 'renamed_users', comment: '', color: '', group: '', schema: '' }, invalid: [{ tableId: 'missing' }, { tableId: 'users', color: 'invalid' }] },
  { tool: 'delete_table', args: { tableId: 'users' }, invalid: [{ tableId: 'missing' }] },
  { tool: 'delete_tables', variant: 'partial', args: { tableIds: ['users', 'orders', 'missing'] }, invalid: [{ tableIds: [] }, { tableIds: ['missing'] }, { tableIds: Array(501).fill('users') }] },
  { tool: 'delete_tables', variant: 'duplicate', args: { tableIds: ['users', 'users'] }, invalid: [{ tableIds: ['missing'] }] },
  { tool: 'duplicate_table', args: { tableId: 'users' }, invalid: [{ tableId: 'missing' }] },
  { tool: 'rename_group', args: { oldName: 'core', newName: 'business' }, invalid: [{ oldName: 'missing', newName: 'business' }, { oldName: 'core', newName: '   ' }] },
  { tool: 'update_group_color', args: { group: 'core', color: 'pink' }, invalid: [{ group: 'core', color: 'invalid' }] },
  { tool: 'add_column', args: { tableId: 'users', name: 'amount', type: 'DECIMAL', length: 12, scale: 0, primaryKey: true, nullable: true, defaultValue: '0', comment: 'Native metadata' }, invalid: [{ tableId: 'missing' }, { tableId: 'users', type: 'invalid' }, { tableId: 'users', length: 1.5 }, { tableId: 'users', scale: -1 }, { tableId: 'users', domainId: 'missing' }] },
  { tool: 'update_column', args: { tableId: 'users', columnId: 'note', domainId: '', primaryKey: true, nullable: true }, invalid: [{ tableId: 'missing', columnId: 'note' }, { tableId: 'users', columnId: 'missing' }, { tableId: 'users', columnId: 'note', scale: 0.5 }, { tableId: 'users', columnId: 'note', domainId: 'missing' }] },
  { tool: 'delete_column', args: { tableId: 'users', columnId: 'tenant' }, invalid: [{ tableId: 'users', columnId: 'missing' }] },
  { tool: 'move_column', args: { tableId: 'users', columnId: 'note', toIndex: 0 }, invalid: [{ tableId: 'users', columnId: 'missing', toIndex: 0 }, { tableId: 'users', columnId: 'note', toIndex: 3 }, { tableId: 'users', columnId: 'note', toIndex: -1 }, { tableId: 'users', columnId: 'note', toIndex: 0.5 }] },
  { tool: 'add_unique_key', args: { tableId: 'users', columnIds: ['note', 'id'], name: 'new_key' }, invalid: [{ tableId: 'users', columnIds: [] }, { tableId: 'users', columnIds: ['missing'] }, { tableId: 'users', columnIds: ['id', 'id'] }] },
  { tool: 'delete_unique_key', args: { tableId: 'users', uniqueKeyId: 'uk_note' }, invalid: [{ tableId: 'missing', uniqueKeyId: 'uk_note' }, { tableId: 'users', uniqueKeyId: 'missing' }] },
  { tool: 'add_index', args: { tableId: 'users', columnIds: ['note', 'id'], unique: true, name: 'new_index' }, invalid: [{ tableId: 'users', columnIds: [] }, { tableId: 'users', columnIds: ['missing'] }, { tableId: 'users', columnIds: ['id', 'id'] }] },
  { tool: 'delete_index', args: { tableId: 'users', indexId: 'idx_note' }, invalid: [{ tableId: 'missing', indexId: 'idx_note' }, { tableId: 'users', indexId: 'missing' }] },
  { tool: 'add_foreign_key', args: { tableId: 'orders', columnIds: ['a', 't'], referencedTableId: 'users', referencedColumnIds: ['id', 'tenant'], onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, invalid: [{ tableId: 'orders', columnIds: [], referencedTableId: 'users', referencedColumnIds: [] }, { tableId: 'orders', columnIds: ['a'], referencedTableId: 'users', referencedColumnIds: ['id', 'tenant'] }, { tableId: 'orders', columnIds: ['a', 'a'], referencedTableId: 'users', referencedColumnIds: ['id', 'tenant'] }, { tableId: 'orders', columnIds: ['missing'], referencedTableId: 'users', referencedColumnIds: ['id'] }, { tableId: 'orders', columnIds: ['a'], referencedTableId: 'missing', referencedColumnIds: ['id'] }] },
  { tool: 'update_foreign_key', args: { tableId: 'orders', fkId: 'fk_main', referencedTableId: 'orders', referencedColumnIds: ['a', 't'], onDelete: 'NO ACTION', onUpdate: 'CASCADE', label: 'self relation' }, invalid: [{ tableId: 'orders', fkId: 'missing' }, { tableId: 'orders', fkId: 'fk_main', referencedColumnIds: ['missing', 'tenant'] }, { tableId: 'orders', fkId: 'fk_main', columnIds: [] }, { tableId: 'orders', fkId: 'fk_main', columnIds: ['a', 'a'] }, { tableId: 'orders', fkId: 'fk_main', referencedColumnIds: ['id'] }] },
  { tool: 'delete_foreign_key', args: { tableId: 'orders', fkId: 'fk_main' }, invalid: [{ tableId: 'orders', fkId: 'missing' }] },
  { tool: 'list_memos', args: {}, invalid: [{ schema: 123 }] },
  { tool: 'add_memo', args: { content: 'New memo', color: 'pink', schema: 'core', x: -1000, y: 0, width: 0, height: 0 }, invalid: [{ color: 'invalid' }, { width: -1 }] },
  { tool: 'update_memo', args: { memoId: 'attached', content: 'Updated 메모', color: '', x: 0, width: 240, locked: true }, invalid: [{ memoId: 'missing' }, { memoId: 'attached', height: -1 }] },
  { tool: 'delete_memo', args: { memoId: 'attached' }, invalid: [{ memoId: 'missing' }] },
  { tool: 'attach_memo', args: { memoId: 'floating', tableId: 'orders' }, invalid: [{ memoId: 'missing', tableId: 'orders' }, { memoId: 'floating', tableId: 'missing' }] },
  { tool: 'detach_memo', args: { memoId: 'attached' }, invalid: [{ memoId: 'missing' }] },
];

for (const scenario of mcpMutationCases) {
  test(`MCP business ${scenario.tool}${scenario.variant ? ` ${scenario.variant}` : ''} enforces scope, rejects invalid mutations and persists live browser state`, async ({ resources }) => {
    const account = await resources.user(), project = await resources.project(), denied = await resources.project();
    const dictionary = scenario.tool === 'set_project_dictionary' ? await resources.dictionary() : undefined;
    const namingScenario = ['get_naming_rules', 'set_project_naming_rules'].includes(scenario.tool);
    const originalRules = namingScenario ? await resources.admin.get('/api/admin/naming-rules').then(r => r.json()) : undefined;
    const siteRules = { tableCase: { enabled: true, value: 'snake_case', allowOverride: true }, columnCase: { enabled: true, value: 'snake_case', allowOverride: false }, columnPrefix: { enabled: true, value: 'col_', allowOverride: true } };
    const seed = mcpMutationFixture(), url = `/api/storage/schemas/${project.id}`;
    if (scenario.tool === 'find_orphan_tables') seed.tables[2].foreignKeys = [];
    if (['get_domain', 'update_domain', 'delete_domain'].includes(scenario.tool)) {
      seed.domains.push({ id: 'child', name: 'child_label', parentId: 'label', type: 'VARCHAR', nullable: false, primaryKey: false, unique: false, autoIncrement: false });
      seed.tables[1].columns[2].domainId = 'child'; seed.tables[1].columns[2].length = 40;
    }
    if (scenario.tool === 'suggest_domains') seed.tables[1].columns[0].name = 'id';
    if (scenario.variant === 'assigned-object') seed.dbObjects![0].schema = 'core';

    expect((await resources.admin.put(url, { data: seed })).status()).toBe(200);
    const snapshotsUrl = `${url}/snapshots`, baseSnapshotId = randomUUID(), foreignSnapshotId = randomUUID();
    const snapshotBase = structuredClone(seed); snapshotBase.tables[0].columns[2].length = 20;
    const snapshotScenario = ['list_snapshots', 'create_snapshot', 'restore_snapshot', 'delete_snapshot', 'compare_snapshots', 'export_migration_sql'].includes(scenario.tool);
    if (snapshotScenario) {
      for (const [target, id, model] of [[project.id, baseSnapshotId, snapshotBase], [denied.id, foreignSnapshotId, denied.schema]] as const) {
        expect((await resources.admin.post(`/api/storage/schemas/${target}/snapshots`, { data: { id, name: 'Base snapshot', description: 'Keep snapshot description', snap: JSON.stringify(model), createdAt: 1700000000000 } })).status()).toBe(200);
      }
    }

    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission: 'editor' } })).status()).toBe(201);
    const created = await resources.admin.post('/api/admin/api-keys', { data: { userId: account.id, name: `Business ${scenario.tool}`, scopes: [{ projectId: project.id, permission: 'editor' }] } });
    expect(created.status()).toBe(201); const key = await created.json(); let sequence = 0;
    const get = async (): Promise<ERDSchema> => resources.admin.get(url).then(r => r.json());
    const projection = (model: ERDSchema) => Object.fromEntries(['tables', 'memos', 'domains', 'schemas', 'dbObjects', 'dbObjectCategories', 'groupColors', 'dictionaryId', 'namingRules'].map(field => [field, field === 'namingRules' ? model.namingRules ?? {} : model[field as keyof ERDSchema]]));
    try {
      if (namingScenario) expect((await resources.admin.put('/api/admin/naming-rules', { data: siteRules })).status()).toBe(200);
      const page = await resources.session(account); page.setDefaultTimeout(10_000); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
      await expect(page.getByTestId('table-card')).toHaveCount(3); await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeVisible();
      const raw = async (args: Record<string, unknown>) => {
        args = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === '$dictionary' ? dictionary!.id : v === '$base' ? baseSnapshotId : v === '$foreign' ? foreignSnapshotId : v]));
        const id = ++sequence;
        const response = await resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id, method: 'tools/call', params: { name: scenario.tool, arguments: args } } });
        expect(response.status()).toBe(200); const body = await response.json(); expect(body.id).toBe(id); return body;
      };
      const reject = async (args: Record<string, unknown>) => {
        const before = await get(), secret = await resources.admin.get(`/api/storage/schemas/${denied.id}`).then(r => r.json());
        const snapshotBefore = snapshotScenario ? await resources.admin.get(snapshotsUrl).then(r => r.json()) : undefined;
        const body = await raw(args); expect(Boolean(body.error) || body.result?.isError === true, JSON.stringify(body)).toBe(true);
        expect(await get()).toEqual(before); expect(await resources.admin.get(`/api/storage/schemas/${denied.id}`).then(r => r.json())).toEqual(secret);
        if (snapshotScenario) expect(await resources.admin.get(snapshotsUrl).then(r => r.json())).toEqual(snapshotBefore);
      };
      const call = async (args: Record<string, unknown> = scenario.args) => {
        const body = await raw({ projectId: project.id, ...args }); expect(body.error).toBeUndefined(); expect(body.result.isError, JSON.stringify(body)).not.toBe(true);
        const text = body.result.content[0].text as string;
        return { text, value: /^[\[{]/.test(text) ? JSON.parse(text) : undefined };
      };
      const browser = async () => {
        const saved = await get();
        await expect(page.getByTestId('table-card')).toHaveCount(saved.tables.length);
        await expect(page.locator('[data-testid=table-card] .table-name')).toHaveText(saved.tables.map(t => t.name));
        await expect(page.locator('[data-testid=table-card] .column-row .col-name')).toHaveText(saved.tables.flatMap(t => t.columns.map(c => c.name)));
        await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(saved.tables.reduce((sum, t) => sum + t.foreignKeys.reduce((pairs, fk) => pairs + fk.columnIds.length, 0), 0));
        await expect.poll(async () => {
          await page.getByTestId('export-menu-toggle').click(); const download = page.waitForEvent('download');
          await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
          return projection(JSON.parse(await readFile((await (await download).path())!, 'utf8')));
        }).toEqual(projection(saved));
      };
      if (!scenario.tool.startsWith('export_') && !['list_memos', 'list_db_objects', 'list_db_object_categories', 'get_db_object', 'get_table_by_name', 'search_columns', 'find_orphan_tables', 'lint_schema', 'list_snapshots', 'compare_snapshots', 'list_domains', 'get_domain', 'suggest_domains', 'domain_coverage', 'get_naming_rules', 'get_schema'].includes(scenario.tool)) {
        expect((await resources.admin.patch(`/api/admin/api-keys/${key.id}`, { data: { scopes: [{ projectId: project.id, permission: 'viewer' }] } })).status()).toBe(200);
        await reject({ projectId: project.id, ...scenario.args });
        expect((await resources.admin.patch(`/api/admin/api-keys/${key.id}`, { data: { scopes: [{ projectId: project.id, permission: 'editor' }] } })).status()).toBe(200);
      } else {
        expect((await resources.admin.patch(`/api/admin/api-keys/${key.id}`, { data: { scopes: [{ projectId: project.id, permission: 'viewer' }] } })).status()).toBe(200);
      }
      await reject({ projectId: denied.id, ...scenario.args });
      if (scenario.tool !== 'get_naming_rules') await reject({ ...scenario.args });
      for (const invalid of scenario.invalid) await reject({ projectId: project.id, ...invalid });
      const before = await get(), result = await call(), after = await get();
      const users = after.tables.find(t => t.id === 'users'), orders = after.tables.find(t => t.id === 'orders');
      if (['list_db_objects', 'list_db_object_categories', 'get_db_object', 'get_table_by_name', 'search_columns', 'find_orphan_tables', 'lint_schema', 'list_snapshots', 'compare_snapshots', 'list_domains', 'get_domain', 'suggest_domains', 'domain_coverage', 'get_naming_rules', 'get_schema'].includes(scenario.tool)) expect(after).toEqual(before);
      if (['export_ddl', 'export_dbml', 'export_prisma', 'export_diagram'].includes(scenario.tool)) {
        expect(after).toEqual(before);
        for (const name of ['users', 'orders', 'audit']) expect(result.text.toLowerCase()).toContain(name);
        if (scenario.tool === 'export_ddl') {
          expect(result.text).toMatch(/CREATE TABLE/i); expect(result.text).toMatch(/FOREIGN KEY/i); expect(result.text).toContain('keep_index'); expect(result.text).toContain('note_key');
          const minimal = await call({ dialect: scenario.args.dialect, includeComments: false, includeForeignKeys: false, includeIndexes: false, includeDomains: false, upperCaseKeywords: false });
          expect(minimal.text).toMatch(/create table/); expect(minimal.text).not.toMatch(/FOREIGN KEY/i); expect(minimal.text).not.toContain('keep_index'); expect(minimal.text).not.toContain('Keep source metadata'); expect(minimal.text).not.toContain('label_domain');
        }
        if (scenario.tool === 'export_prisma') {
          expect(result.text).toContain('model Users'); expect(result.text).toContain('@relation('); expect(result.text).toContain('@@index('); expect(result.text).toContain('Keep source metadata');
          const minimal = await call({ includeComments: false, includeForeignKeys: false, includeIndexes: false });
          expect(minimal.text).not.toContain('@relation('); expect(minimal.text).not.toContain('@@index('); expect(minimal.text).not.toContain('Keep source metadata'); expect(minimal.text).toContain('model Users');
        }
        if (scenario.tool === 'export_dbml') {
          expect(result.text).toContain('Table core.users'); expect(result.text).toContain('Ref:'); expect(result.text).toContain('Indexes {'); expect(result.text).toContain('Keep source metadata');
          const minimal = await call({ includeComments: false, includeForeignKeys: false, includeIndexes: false });
          expect(minimal.text).not.toContain('Ref:'); expect(minimal.text).not.toContain('Indexes {'); expect(minimal.text).not.toContain('Keep source metadata'); expect(minimal.text).toContain('Table core.users');
        }
        if (scenario.tool === 'export_diagram') {
          if (scenario.args.format === 'mermaid') { expect(result.text).toMatch(/^erDiagram/); expect(result.text).toContain('||--|{'); }
          else { expect(result.text).toMatch(/^@startuml/); expect(result.text).toContain('@enduml'); expect(result.text).toContain('entity "users"'); expect(result.text).toContain('||--|{'); }
        }
        expect(await get()).toEqual(before);
      }
      if (scenario.tool === 'get_schema') expect(result.value).toEqual(before);
      if (scenario.tool === 'set_project_dictionary') {
        expect(after.dictionaryId).toBe(dictionary!.id); await browser();
        for (const clear of [null, undefined]) { await call(clear === undefined ? {} : { dictionaryId: clear }); expect((await get()).dictionaryId).toBeUndefined(); await browser(); }
      }
      if (scenario.tool === 'set_project_naming_rules') {
        expect(after.namingRules).toEqual({ tableCase: { value: 'PascalCase' }, columnPrefix: { enabled: false } });
        expect(result.value.ruleStatus.tableCase).toMatchObject({ status: 'project_override', value: 'PascalCase' }); expect(result.value.ruleStatus.columnPrefix.status).toBe('project_disabled');
        await browser(); const cleared = await call({ overrides: { tableCase: null, columnPrefix: null } }); expect(cleared.value.projectOverrides).toEqual({}); expect((await get()).namingRules).toBeUndefined();
      }
      if (scenario.tool === 'get_naming_rules') {
        expect(result.value.siteRules).toMatchObject(siteRules); expect(result.value.projectOverrides).toEqual({}); expect(result.value.projectDictionaryId).toBeNull();
        expect(result.value.ruleStatus.tableCase).toMatchObject({ status: 'inherited', value: 'snake_case' }); expect(result.value.ruleStatus.columnCase.status).toBe('admin_locked');
        const global = await raw({}); expect(global.result.isError).not.toBe(true); expect(JSON.parse(global.result.content[0].text)).toEqual({ siteRules: result.value.siteRules });
      }
      if (scenario.tool === 'list_domains') expect(result.value).toEqual([{ ...before.domains[0], usageCount: 1 }]);
      if (scenario.tool === 'get_domain') {
        expect(result.value).toMatchObject({ ...before.domains[0], linkedColumns: [{ tableName: 'users', columnName: 'note', columnId: 'note' }], effectiveValues: before.domains[0], children: [{ id: 'child', name: 'child_label' }] });
        expect((await call({ domainName: 'LABEL_DOMAIN' })).value).toEqual(result.value);
        expect((await call({ domainId: 'child' })).value.effectiveValues).toMatchObject({ id: 'child', length: 40 });
      }
      if (scenario.tool === 'add_domain') { expect(after.domains.slice(0, 1)).toEqual(before.domains); expect(after.domains[1]).toMatchObject({ id: result.value.domainId, ...scenario.args, nullable: false, primaryKey: false, unique: false, autoIncrement: false }); expect(after.tables).toEqual(before.tables); }
      if (scenario.tool === 'update_domain') {
        expect(after.domains[0]).toEqual({ ...before.domains[0], length: 80, comment: 'Propagated label' }); expect(after.domains[1]).toEqual(before.domains[1]);
        expect(users!.columns[2]).toMatchObject({ id: 'note', name: 'note', domainId: 'label', type: 'VARCHAR', length: 80, comment: 'Keep column metadata' });
        expect(orders!.columns[2]).toMatchObject({ id: 'n', domainId: 'child', type: 'VARCHAR', length: 80 });
        expect(orders!.columns[2].comment).toBeUndefined(); expect(users!.columns.slice(0, 2)).toEqual(before.tables[0].columns.slice(0, 2)); expect(after.tables[2]).toEqual(before.tables[2]);
      }
      if (scenario.tool === 'delete_domain') {
        expect(after.domains).toEqual([{ ...before.domains[1], parentId: undefined }]);
        const expected = structuredClone(before.tables); delete expected[0].columns[2].domainId; expect(after.tables).toEqual(expected);
      }
      if (scenario.tool === 'suggest_domains') expect(result.value).toEqual([{ suggestedName: 'id', type: 'INT', columns: [{ tableName: 'users', columnName: 'id' }, { tableName: 'orders', columnName: 'id' }] }]);
      if (scenario.tool === 'domain_coverage') expect(result.value).toEqual({ totalColumns: 7, linkedColumns: 1, coveragePercent: 14, groupBreakdown: [{ group: 'core', totalColumns: 6, linkedColumns: 1, percent: 17 }, { group: 'stable', totalColumns: 1, linkedColumns: 0, percent: 0 }] });
      if (scenario.tool === 'export_domain_dictionary') { expect(result.text).toContain('label_domain'); expect(result.text).toContain('VARCHAR'); expect(result.text).toContain('users'); expect(result.text).toContain('note'); if (scenario.args.format === 'html') expect(result.text).toMatch(/<html|<!DOCTYPE/i); else expect(result.text).toContain('#'); expect(after).toEqual(before); }
      if (scenario.variant === 'merge-existing') {
        expect(result.text).toMatch(/Imported 2/); expect(after.tables.slice(0, 3)).toEqual(before.tables); expect(after.tables).toHaveLength(4);
        const child = after.tables[3]; expect(child.name).toBe('imported_child'); expect(child.foreignKeys).toHaveLength(1);
        expect(child.foreignKeys[0]).toMatchObject({ referencedTableId: 'users', referencedColumnIds: ['id', 'tenant'], columnIds: [child.columns.find(c => c.name === 'parent_id')!.id, child.columns.find(c => c.name === 'tenant_id')!.id] });
        expect(after.memos).toEqual(before.memos); expect(after.domains).toEqual(before.domains); expect(after.dbObjects).toEqual(before.dbObjects);
        await browser(); await call(); expect((await get()).tables).toEqual(after.tables);
      }
      if (scenario.tool.startsWith('import_') && scenario.variant !== 'merge-existing') {
        expect(result.text).toMatch(/Imported 2/); expect(after.tables.slice(0, 3)).toEqual(before.tables);
        const imported = after.tables.slice(3); expect(imported).toHaveLength(2);
        const assertImported = (tables: ERDSchema['tables']) => {
          const parent = tables.find(t => /imported_?parent/i.test(t.name))!, child = tables.find(t => /imported_?child/i.test(t.name))!;
          expect(parent.columns.find(c => c.name === 'id')).toMatchObject({ primaryKey: true, nullable: false });
          expect(child.foreignKeys).toHaveLength(1); const fk = child.foreignKeys[0];
          expect(fk.referencedTableId).toBe(parent.id); expect(fk.referencedColumnIds).toEqual([parent.columns.find(c => c.name === 'id')!.id]);
          expect(fk.columnIds).toEqual([child.columns.find(c => c.name === 'parent_id')!.id]);
        };
        assertImported(imported); expect(after.domains).toEqual(before.domains); expect(after.memos).toEqual(before.memos); expect(after.dbObjects).toEqual(before.dbObjects);
        await browser(); await call(); expect((await get()).tables).toEqual(after.tables);
        await call({ ...scenario.args, replace: true }); const replaced = await get(); expect(replaced.tables).toHaveLength(2); assertImported(replaced.tables);
        expect(replaced.domains).toEqual(before.domains); expect(replaced.dbObjects).toEqual(before.dbObjects); expect(replaced.dbObjectCategories).toEqual(before.dbObjectCategories);
        const detached = structuredClone(before.memos); delete detached[0].attachedTableId; expect(replaced.memos).toEqual(detached);
      }
      if (scenario.tool === 'bulk_add_tables') {
        expect(result.value.created.map((t: { name: string }) => t.name)).toEqual(['ledger', 'defaults']); expect(after.tables.slice(0, 3)).toEqual(before.tables);
        expect(after.tables[3]).toMatchObject({ id: result.value.created[0].tableId, name: 'ledger', schema: 'core', color: 'pink', comment: '일괄 생성' });
        expect(after.tables[3].columns).toHaveLength(1); expect(after.tables[3].columns[0]).toMatchObject({ name: 'amount', type: 'DECIMAL', length: 12, scale: 0, primaryKey: true, nullable: false, defaultValue: '0', check: 'amount >= 0' });
        expect(after.tables[4].columns).toHaveLength(1); expect(after.tables[4].columns[0]).toMatchObject({ name: 'id', primaryKey: true, autoIncrement: true, nullable: false });
      }
      if (scenario.tool === 'bulk_add_columns') {
        expect(result.value.created.map((c: { name: string }) => c.name)).toEqual(['amount', 'state']);
        expect(users!.columns.slice(0, 3)).toEqual(before.tables[0].columns); expect(users!.columns[3]).toMatchObject({ id: result.value.created[0].columnId, type: 'DECIMAL', length: 12, scale: 0, primaryKey: true, nullable: false, defaultValue: '0' });
        expect(users!.columns[4]).toMatchObject({ id: result.value.created[1].columnId, type: 'ENUM', enumValues: ['신규', 'done'], comment: 'Retain ENUM' }); expect(after.tables.slice(1)).toEqual(before.tables.slice(1));
      }
      if (scenario.tool === 'bulk_update_tables') {
        expect(result.text).toBe('Updated 2 table(s) (not found: missing)'); const cleared = { ...before.tables[0] }; for (const key of ['comment', 'color', 'group', 'schema'] as const) delete cleared[key];
        expect(after.tables).toEqual([cleared, { ...before.tables[1], name: 'renamed_orders' }, before.tables[2]]);
      }
      if (scenario.tool === 'bulk_update_columns') {
        expect(result.text).toBe('Updated 2 column(s) (not found: missing/missing)');
        const expected = structuredClone(before.tables); Object.assign(expected[0].columns[2], { primaryKey: true, nullable: false }); delete expected[0].columns[2].domainId;
        Object.assign(expected[1].columns[2], { type: 'DECIMAL', length: 12, scale: 0, defaultValue: '0' }); expect(after.tables).toEqual(expected);
      }
      if (scenario.tool.startsWith('bulk_')) { expect(after.memos).toEqual(before.memos); expect(after.domains).toEqual(before.domains); expect(after.dbObjects).toEqual(before.dbObjects); }
      if (snapshotScenario) {
        const storedSnapshots = await resources.admin.get(snapshotsUrl).then(r => r.json());
        if (scenario.tool === 'list_snapshots') expect(result.value).toEqual([{ id: baseSnapshotId, name: 'Base snapshot', description: 'Keep snapshot description', createdAt: 1700000000000 }]);
        if (scenario.tool === 'create_snapshot') {
          expect(result.value).toMatchObject({ name: '현재 버전' }); expect(typeof result.value.createdAt).toBe('number');
          expect(storedSnapshots).toHaveLength(2); const created = storedSnapshots.find((snap: { id: string }) => snap.id === result.value.id);
          expect(created).toMatchObject({ name: '현재 버전', description: 'Retain full metadata' }); expect(JSON.parse(created.snap)).toEqual(before);
          for (let i = 0; i < 48; i++) expect((await resources.admin.post(snapshotsUrl, { data: { id: randomUUID(), name: `Capacity ${i}`, snap: JSON.stringify(before), createdAt: 1700000000001 + i } })).status()).toBe(200);
          await reject({ projectId: project.id, ...scenario.args });
          expect((await resources.admin.get(snapshotsUrl).then(r => r.json())).length).toBe(50);
          expect((await resources.admin.delete(`${snapshotsUrl}/${result.value.id}`)).status()).toBe(200);
          const retry = await call(); expect(retry.value.id).not.toBe(result.value.id);
          expect((await resources.admin.get(snapshotsUrl).then(r => r.json())).length).toBe(50);

        }
        if (scenario.tool === 'restore_snapshot') expect(projection(after)).toEqual(projection(snapshotBase));
        else expect(after).toEqual(before);
        if (scenario.tool === 'delete_snapshot') expect(storedSnapshots).toEqual([]);
        if (scenario.tool === 'compare_snapshots') {
          expect(result.value.summary).toEqual({ added: 0, removed: 0, modified: 1 });
          expect(result.value.modifiedTables).toHaveLength(1); expect(result.value.modifiedTables[0]).toMatchObject({ tableId: 'users', modifiedColumns: [{ columnName: 'note', changes: ['length: 20 → 40'] }] });
          expect((await call({ snapshotId: 'current', snapshotId2: 'current' })).value.summary).toEqual({ added: 0, removed: 0, modified: 0 });
        }
        if (scenario.tool === 'export_migration_sql') {
          expect(result.text).toContain('users'); expect(result.text).toContain('note'); if (scenario.args.dialect === 'sqlite') { expect(result.text).toContain('TEXT'); expect(result.text).toContain('INSERT INTO'); expect(result.text).toContain('COMMIT;'); } else expect(result.text).toMatch(/40/); expect(result.text).toMatch(/ALTER|CREATE/i);
          expect((await call({ snapshotId: 'current', snapshotId2: 'current' })).text).toBe('No differences found — no migration SQL needed');
        }
        const foreign = await resources.admin.get(`/api/storage/schemas/${denied.id}/snapshots/${foreignSnapshotId}`).then(r => r.json()); expect(JSON.parse(foreign.snap)).toEqual(denied.schema);
      }
      if (scenario.tool === 'auto_layout') {
        expect(result.text).toBe(`Layout applied: ${scenario.args.type} (3 tables)`);
        expect(after.tables.map(({ position, ...t }) => t)).toEqual(before.tables.map(({ position, ...t }) => t));
        expect(after.memos).toEqual(before.memos); expect(after.domains).toEqual(before.domains); expect(after.dbObjects).toEqual(before.dbObjects);
        for (const table of after.tables) { expect(Number.isFinite(table.position.x)).toBe(true); expect(Number.isFinite(table.position.y)).toBe(true); }
        expect(new Set(after.tables.map(t => `${t.position.x},${t.position.y}`)).size).toBe(3);
        expect(after.tables.map(t => t.position)).not.toEqual(before.tables.map(t => t.position));
        await browser(); await call({ type: scenario.args.type, groupByGroup: false });
        expect((await get()).tables.map(({ position, ...t }) => t)).toEqual(before.tables.map(({ position, ...t }) => t));
      }
      if (scenario.tool === 'get_table_by_name') {
        const table = before.tables[0]; const expected = { id: table.id, name: table.name, columns: table.columns.map(({ id, name, type, primaryKey }) => ({ id, name, type, primaryKey })), foreignKeyCount: 0, uniqueKeyCount: 2, indexCount: 2, group: 'core', schema: 'core', comment: 'Keep source metadata' };
        expect(result.value).toEqual([expected]); expect((await call({ name: 'USERS', exact: true })).value).toEqual([expected]);
        expect((await call({ name: '' })).value.map((t: { id: string }) => t.id)).toEqual(['users', 'orders', 'audit']);
      }
      if (scenario.tool === 'search_columns') {
        expect(result.value).toEqual({ count: 1, columns: [{ tableName: 'users', tableId: 'users', columnId: 'note', columnName: 'note', type: 'VARCHAR', domainId: 'label' }] });
        const all = (await call({})).value; expect(all.count).toBe(7); expect(all.columns.map((c: { columnId: string }) => c.columnId)).toEqual(before.tables.flatMap(t => t.columns.map(c => c.id)));
        const unlinked = (await call({ hasNoDomain: true })).value; expect(unlinked.count).toBe(6); expect(unlinked.columns.every((c: { domainId?: string }) => !c.domainId)).toBe(true);
        expect((await call({ hasNoDomain: true, domainId: 'label' })).value).toEqual({ count: 0, columns: [] });
        expect((await call({ name: 'missing' })).value).toEqual({ count: 0, columns: [] });
      }
      if (scenario.tool === 'find_orphan_tables') expect(result.value).toEqual({ count: 1, tables: [{ id: 'audit', name: 'audit', columnCount: 1, group: 'stable' }] });
      if (scenario.tool === 'lint_schema') {
        expect(Array.isArray(result.value)).toBe(true);
        for (const id of ['orders', 'audit']) expect(result.value).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'no-pk', tableId: id, severity: 'warning' })]));
        expect(result.value.some((issue: { ruleId: string }) => issue.ruleId === 'fk-target-missing')).toBe(false);
      }
      if (scenario.tool === 'list_db_objects') {
        expect(result.value).toEqual([{ id: 'view', category: 'Views', name: 'retained_view', comment: null, schema: null, includeInDdl: false, sqlPreview: 'SELECT id FROM users;' }]);
        expect((await call({ category: 'Views' })).value).toEqual(result.value); expect((await call({ category: 'missing' })).value).toEqual([]);
      }
      if (scenario.tool === 'list_db_object_categories') expect(result.value).toEqual([{ category: 'Views', count: 1 }]);
      if (scenario.tool === 'get_db_object') expect(result.value).toEqual(before.dbObjects![0]);
      if (scenario.tool === 'add_db_object') {
        expect(after.dbObjects).toEqual([...before.dbObjects!, { id: result.value.objectId, ...scenario.args }]);
        expect(after.dbObjectCategories).toEqual(['Views', 'Functions']);
        const defaulted = await call({ category: 'Views' });
        expect((await get()).dbObjects!.find(o => o.id === defaulted.value.objectId)).toEqual({ id: defaulted.value.objectId, category: 'Views', name: 'new_views', sql: '' });
      }
      if (scenario.tool === 'update_db_object') {
        if (scenario.variant === 'move-category') {
          expect(after.dbObjects).toEqual([{ ...before.dbObjects![0], category: 'Reporting' }]); expect(after.dbObjectCategories).toEqual(['Views', 'Reporting']);
        } else {
          expect(after.dbObjects).toEqual([{ ...before.dbObjects![0], name: 'renamed_view', sql: '', comment: '', schema: '', includeInDdl: false }]);
          expect(after.dbObjectCategories).toEqual(before.dbObjectCategories);
        }
      }
      if (scenario.tool === 'delete_db_object') { expect(after.dbObjects).toEqual([]); expect(after.dbObjectCategories).toEqual(['Views']); }
      if (scenario.tool === 'add_db_object_category') { expect(after.dbObjectCategories).toEqual(['Views', 'Functions']); expect(after.dbObjects).toEqual(before.dbObjects); }
      if (scenario.tool === 'rename_db_object_category') { expect(after.dbObjectCategories).toEqual(['Functions']); expect(after.dbObjects).toEqual([{ ...before.dbObjects![0], category: 'Functions' }]); }
      if (scenario.tool === 'delete_db_object_category') { expect(after.dbObjectCategories).toEqual([]); expect(after.dbObjects).toEqual([]); }
      if (scenario.tool.includes('db_object')) { expect(after.tables).toEqual(before.tables); expect(after.memos).toEqual(before.memos); expect(after.domains).toEqual(before.domains); }
      if (scenario.tool === 'add_schema') { expect(after.schemas).toEqual(['core', 'analytics', 'billing']); expect(after.tables).toEqual(before.tables); expect(after.memos).toEqual(before.memos); }
      if (scenario.tool === 'rename_schema' || scenario.tool === 'delete_schema') {
        const renamed = scenario.tool === 'rename_schema';
        expect(after.schemas).toEqual(renamed ? ['billing', 'analytics'] : ['analytics']);
        const expectedTable = { ...before.tables[0] }, expectedMemo = { ...before.memos[0] };
        if (renamed) { expectedTable.schema = 'billing'; expectedMemo.schema = 'billing'; }
        else { delete expectedTable.schema; delete expectedMemo.schema; }
        expect(after.tables).toEqual([expectedTable, ...before.tables.slice(1)]);
        expect(after.memos).toEqual([expectedMemo, ...before.memos.slice(1)]);
        if (scenario.variant === 'assigned-object') {
          const obj = { ...before.dbObjects![0] }; if (renamed) obj.schema = 'billing'; else delete obj.schema;
          expect(after.dbObjects).toEqual([obj]);
        } else expect(after.dbObjects).toEqual(before.dbObjects);
      }
      if (scenario.tool === 'bulk_update_table_schema') {
        expect(result.value).toEqual({ updated: 2, schema: 'analytics' });
        expect(after.tables).toEqual(before.tables.map((t, i) => i < 2 ? { ...t, schema: 'analytics' } : t));
        expect(after.memos).toEqual(before.memos); await browser();
        for (const cleared of [null, '']) {
          expect((await call({ tableIds: ['users', 'orders'], schema: cleared })).value).toEqual({ updated: 2, schema: null });
          const saved = await get(); expect(saved.tables.slice(0, 2).every(t => t.schema === undefined)).toBe(true);
          expect(saved.tables[2]).toEqual(before.tables[2]); expect(saved.memos).toEqual(before.memos); await browser();
        }
      }
      if (scenario.tool === 'add_table') {
        const added = after.tables.find(t => t.id === result.value.tableId)!; expect(added).toMatchObject({ name: 'created_table', columns: [], schema: 'analytics', group: 'new_group', color: 'pink', comment: 'Created metadata' });
        expect(after.tables.slice(0, 3)).toEqual(before.tables); expect(Number.isFinite(added.position.x)).toBe(true);
        const second = await call({}); const defaulted = (await get()).tables.find(t => t.id === second.value.tableId)!;
        expect(defaulted.name).toBe('table_1'); expect(defaulted.columns).toHaveLength(1); expect(defaulted.columns[0]).toMatchObject({ name: 'id', type: 'INT', primaryKey: true, nullable: false, unique: true, autoIncrement: true });
      }
      if (scenario.tool === 'update_table') { const expected = { ...before.tables[0], name: 'renamed_users' }; for (const field of ['comment', 'color', 'group', 'schema'] as const) delete expected[field]; expect(users).toEqual(expected); expect(after.tables.slice(1)).toEqual(before.tables.slice(1)); }
      if (scenario.tool === 'delete_table' || scenario.tool === 'delete_tables') {
        const partial = scenario.variant === 'partial'; expect(after.tables.map(t => t.id)).toEqual(partial ? ['audit'] : ['orders', 'audit']);
        expect(after.tables[0].foreignKeys).toEqual([]); expect(after.memos[0].attachedTableId).toBeUndefined(); expect(after.memos[0].position).toEqual(before.memos[0].position); expect(after.memos[0].content).toBe(before.memos[0].content);
        if (scenario.variant === 'duplicate') expect(result.text).toBe('Deleted 1 table(s)');
        if (partial) expect(result.text).toBe('Deleted 2 table(s) (not found: missing)');
      }
      if (scenario.tool === 'duplicate_table') {
        const copy = after.tables.find(t => t.id === result.value.newTableId)!; expect(copy.name).toBe('users_copy'); expect(copy.columns.map(c => c.id)).not.toEqual(before.tables[0].columns.map(c => c.id));
        expect(copy.columns.map(({ id, ...column }) => column)).toEqual(before.tables[0].columns.map(({ id, ...column }) => column)); expect(copy.foreignKeys).toEqual([]); expect(copy.uniqueKeys).toEqual([]); expect(copy.indexes).toEqual([]); expect(after.tables.slice(0, 3)).toEqual(before.tables);
      }
      if (scenario.tool === 'rename_group') { expect(after.tables.map(t => t.group)).toEqual(['business', 'business', 'stable']); expect(after.groupColors).toEqual({ business: 'blue', stable: 'green' }); }
      if (scenario.tool === 'update_group_color') { expect(after.groupColors).toEqual({ core: 'pink', stable: 'green' }); await browser(); await call({ group: 'core' }); expect((await get()).groupColors).toEqual({ stable: 'green' }); }
      if (scenario.tool === 'add_column') { expect(users!.columns.at(-1)).toMatchObject({ id: result.value.columnId, name: 'amount', type: 'DECIMAL', length: 12, scale: 0, primaryKey: true, nullable: false, defaultValue: '0', comment: 'Native metadata' }); expect(users!.columns.slice(0, 3)).toEqual(before.tables[0].columns); }
      if (scenario.tool === 'update_column') { const note = users!.columns.find(c => c.id === 'note')!; expect(note).toMatchObject({ primaryKey: true, nullable: false, type: 'VARCHAR', length: 40, defaultValue: "'retained'", comment: 'Keep column metadata' }); expect(note).not.toHaveProperty('domainId'); }
      if (scenario.tool === 'delete_column') { expect(users!.columns.map(c => c.id)).toEqual(['id', 'note']); expect(users!.uniqueKeys).toEqual([]); expect(users!.indexes.map(i => i.id)).toEqual(['idx_note']); expect(orders!.foreignKeys).toEqual([]); expect(after.tables[2]).toEqual(before.tables[2]); }
      if (scenario.tool === 'move_column') { expect(users!.columns.map(c => c.id)).toEqual(['note', 'id', 'tenant']); expect(users!.columns).toEqual([before.tables[0].columns[2], before.tables[0].columns[0], before.tables[0].columns[1]]); expect(users!.uniqueKeys).toEqual(before.tables[0].uniqueKeys); expect(orders!.foreignKeys).toEqual(before.tables[1].foreignKeys); }
      if (scenario.tool === 'add_unique_key') { expect(users!.uniqueKeys.at(-1)).toEqual({ id: result.value.ukId, name: 'new_key', columnIds: ['note', 'id'] }); expect(users!.uniqueKeys.slice(0, 2)).toEqual(before.tables[0].uniqueKeys); }
      if (scenario.tool === 'delete_unique_key') expect(users!.uniqueKeys).toEqual([before.tables[0].uniqueKeys[0]]);
      if (scenario.tool === 'add_index') { expect(users!.indexes.at(-1)).toEqual({ id: result.value.indexId, name: 'new_index', columnIds: ['note', 'id'], unique: true }); expect(users!.indexes.slice(0, 2)).toEqual(before.tables[0].indexes); }
      if (scenario.tool === 'delete_index') expect(users!.indexes).toEqual([before.tables[0].indexes[0]]);
      if (scenario.tool === 'add_foreign_key') { expect(orders!.foreignKeys.at(-1)).toEqual({ id: result.value.fkId, columnIds: ['a', 't'], referencedTableId: 'users', referencedColumnIds: ['id', 'tenant'], onDelete: 'RESTRICT', onUpdate: 'CASCADE' }); expect(orders!.foreignKeys[0]).toEqual(before.tables[1].foreignKeys[0]); }
      if (scenario.tool === 'update_foreign_key') expect(orders!.foreignKeys[0]).toEqual({ ...before.tables[1].foreignKeys[0], referencedTableId: 'orders', referencedColumnIds: ['a', 't'], onDelete: 'NO ACTION', onUpdate: 'CASCADE', label: 'self relation' });
      if (scenario.tool === 'delete_foreign_key') { expect(orders!.foreignKeys).toEqual([]); expect(after.tables[2].foreignKeys).toEqual(before.tables[2].foreignKeys); }
      if (scenario.tool === 'list_memos') { expect(result.value[0]).toMatchObject({ id: 'attached', content: 'Keep attached memo', attachedTableId: 'users', color: 'blue', locked: false }); expect(result.value[1]).toMatchObject({ id: 'floating', content: 'x'.repeat(100) + '...', color: 'yellow' }); expect((await call({ schema: 'core' })).value.map((m: { id: string }) => m.id)).toEqual(['attached']); expect((await call({ schema: 'missing' })).value).toEqual([]); expect(after).toEqual(before); }
      if (scenario.tool === 'add_memo') { expect(after.memos.at(-1)).toEqual({ id: result.value.memoId, content: 'New memo', color: 'pink', schema: 'core', position: { x: -1000, y: 0 }, width: 0, height: 0 }); const defaults = await call({}); expect((await get()).memos.find(m => m.id === defaults.value.memoId)).toMatchObject({ content: '', position: { x: 0, y: 0 }, width: 200, height: 150 }); }
      if (scenario.tool === 'update_memo') { expect(after.memos[0]).toEqual({ ...before.memos[0], content: 'Updated 메모', color: undefined, position: { x: 0, y: 350 }, width: 240, locked: true }); await browser(); await call({ memoId: 'attached', locked: false }); expect((await get()).memos[0].locked).toBeUndefined(); }
      if (scenario.tool === 'delete_memo') expect(after.memos).toEqual([before.memos[1]]);
      if (scenario.tool === 'attach_memo') expect(after.memos[1]).toEqual({ ...before.memos[1], attachedTableId: 'orders' });
      if (scenario.tool === 'detach_memo') { const expected = { ...before.memos[0] }; delete expected.attachedTableId; expect(after.memos[0]).toEqual(expected); }
      await browser(); await page.reload(); await browser();
      if (scenario.variant === 'move-category') {
        for (let attempt = 0; attempt < 2; attempt++) {
          await page.getByRole('button', { name: /objects 1/i }).click();
          const category = page.locator('.category-group').filter({ has: page.locator('.category-name', { hasText: 'Reporting' }) });
          await expect(category.locator('.object-name')).toHaveText('retained_view'); await category.locator('.object-item').click();
          await expect(page.locator('.db-object-editor')).toBeVisible();
          if (attempt === 0) await page.reload();
        }
      }

      expect(await resources.admin.get(`/api/storage/schemas/${denied.id}`).then(r => r.json())).toEqual(denied.schema);
    } finally {
      if (namingScenario) expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
      expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200);
    }
  });
}

test('MCP project name lookup filters by scoped visibility and case without exposing unscoped projects', async ({ resources }) => {
  const account = await resources.user(), project = await resources.project(), hidden = await resources.project();
  for (const target of [project, hidden]) expect((await resources.admin.post(`/api/storage/projects/${target.id}/permissions`, { data: { userId: account.id, permission: 'viewer' } })).status()).toBe(201);
  const response = await resources.admin.post('/api/admin/api-keys', { data: { userId: account.id, name: 'Project lookup', scopes: [{ projectId: project.id, permission: 'viewer' }] } });
  expect(response.status()).toBe(201); const key = await response.json(); let requestId = 0;
  try {
    const call = async (args: Record<string, unknown>) => {
      const id = ++requestId; const response = await resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'get_project_by_name', arguments: args } } });
      expect(response.status()).toBe(200); const body = await response.json(); expect(body.id).toBe(id); return body;
    };
    for (const name of [project.name.toUpperCase(), project.name.slice(1, -1), '']) {
      const body = await call({ name }); expect(body.error).toBeUndefined(); expect(body.result.isError).not.toBe(true);
      const matches = JSON.parse(body.result.content[0].text); expect(matches.map((p: { id: string }) => p.id)).toEqual([project.id]); expect(matches[0].name).toBe(project.name);
      expect(JSON.stringify(body)).not.toContain(hidden.id); expect(JSON.stringify(body)).not.toContain(key.key);
    }
    for (const args of [{ name: hidden.name }, { name: 'definitely-not-existing' }, { name: 123 }, { name: 'x'.repeat(257) }, {}]) {
      const body = await call(args); expect(Boolean(body.error) || body.result?.isError === true).toBe(true);
    }
    const page = await resources.session(account); await page.goto('/'); await expect(page.getByTestId('table-card')).toHaveCount(1); await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(1);
    for (const target of [project, hidden]) expect(await resources.admin.get(`/api/storage/schemas/${target.id}`).then(r => r.json())).toEqual(target.schema);
  } finally { expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200); }
});

for (const tool of ['list_dictionary_words', 'add_dictionary_word', 'update_dictionary_word', 'delete_dictionary_word', 'import_dictionary_words', 'export_dictionary_words']) {
  test(`MCP dictionary business ${tool} respects roles, status visibility and atomic validation`, async ({ resources }) => {
    const account = await resources.user(), dictionary = await resources.dictionary();
    const keys: { id: string; key: string }[] = [];
    let sequence = 0;
    const makeKey = async (userId?: string) => {
      const response = await resources.admin.post('/api/admin/api-keys', { data: { name: `Dictionary ${tool}`, ...(userId ? { userId } : {}) } });
      expect(response.status()).toBe(201); const key = await response.json(); keys.push(key); return key;
    };
    const adminKey = await makeKey(), userKey = await makeKey(account.id);
    const raw = async (name: string, args: Record<string, unknown>, key = adminKey) => {
      const id = ++sequence; const response = await resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } } });
      expect(response.status()).toBe(200); const body = await response.json(); expect(body.id).toBe(id); return body;
    };
    const call = async (name: string, args: Record<string, unknown>, key = adminKey) => {
      const body = await raw(name, args, key); expect(body.error).toBeUndefined(); expect(body.result.isError, JSON.stringify(body)).not.toBe(true);
      const text = body.result.content[0].text; return /^[\[{]/.test(text) ? JSON.parse(text) : text;
    };
    const state = async () => {
      const rows = [];
      for (const status of ['approved', 'pending', 'rejected']) rows.push(await resources.admin.get(`/api/dictionary?dictionaryId=${dictionary.id}&status=${status}&limit=200`).then(r => r.json()));
      return rows;
    };
    const reject = async (args: Record<string, unknown>, key = adminKey) => {
      const before = await state(); const body = await raw(tool, args, key); expect(Boolean(body.error) || body.result?.isError === true, JSON.stringify(body)).toBe(true); expect(await state()).toEqual(before);
    };
    try {
      const alpha = await call('add_dictionary_word', { dictionaryId: dictionary.id, word: 'alpha', meaning: '첫 번째', description: 'Retain description', category: 'Core' });
      const beta = await call('add_dictionary_word', { dictionaryId: dictionary.id, word: 'beta', meaning: 'Second' });
      const own = await call('add_dictionary_word', { dictionaryId: dictionary.id, word: 'own_pending', meaning: 'Suggestion', status: 'approved' }, userKey);
      const other = await call('add_dictionary_word', { dictionaryId: dictionary.id, word: 'other_pending', meaning: 'Other suggestion', status: 'pending' });
      expect(own.status).toBe('pending'); expect(own.created_by).toBe(account.id);
      const args = { dictionaryId: dictionary.id };
      if (tool === 'list_dictionary_words') {
        const listed = await call(tool, { ...args, status: 'pending' }, userKey); expect(listed.total).toBe(2); expect(listed.words.map((w: { word: string }) => w.word)).toEqual(['beta', 'alpha']);
        expect((await call(tool, { ...args, status: 'pending' })).words.map((w: { word: string }) => w.word)).toEqual(['other_pending', 'own_pending']);
        expect(await call(tool, { ...args, limit: 0 }, userKey)).toEqual({ total: 2, words: [] });
        expect((await call(tool, { ...args, search: 'ALP', category: 'Core' }, userKey)).words.map((w: { id: string }) => w.id)).toEqual([alpha.id]);
        expect((await call(tool, { ...args, category: '' }, userKey)).words.map((w: { id: string }) => w.id)).toEqual([beta.id]);
        expect((await call(tool, { ...args, page: 2, limit: 1 }, userKey)).words.map((w: { id: string }) => w.id)).toEqual([alpha.id]);
        await reject({ ...args, page: 0 }); await reject({ ...args, limit: 201 });
      }
      if (tool === 'add_dictionary_word') {
        await reject({ ...args, word: '   ', meaning: 'Missing word' }); await reject({ ...args, word: 'empty_meaning', meaning: '   ' });
        await reject({ ...args, word: 'ALPHA', meaning: 'Duplicate' });
        const added = await call(tool, { ...args, word: ' gamma ', meaning: ' 세 번째 ', category: ' Finance ', description: ' Detail ' });
        expect(added).toMatchObject({ word: 'gamma', meaning: '세 번째', category: 'Finance', description: 'Detail', status: 'approved' });
      }
      if (tool === 'update_dictionary_word') {
        await reject({ wordId: own.id, status: 'approved' }, userKey);
        await reject({ wordId: 'missing', meaning: 'Invalid target' });
        await reject({ wordId: own.id, word: 'ALPHA', status: 'approved' });
        await call(tool, { wordId: own.id, status: 'approved', meaning: 'Approved suggestion', category: null, description: null });
        const approved = await call('list_dictionary_words', args, userKey); expect(approved.words.find((w: { id: string }) => w.id === own.id)).toMatchObject({ status: 'approved', meaning: 'Approved suggestion', category: null, description: null });
      }
      if (tool === 'delete_dictionary_word') {
        await reject({ wordId: alpha.id }, userKey); await reject({ wordId: other.id }, userKey); await reject({ wordId: 'missing' });
        await call(tool, { wordId: own.id }, userKey); await call(tool, { wordId: other.id });
        expect((await state())[1].words).toEqual([]);
      }
      if (tool === 'import_dictionary_words') {
        await reject({ ...args, words: [{ word: 'gamma', meaning: 'Third' }] }, userKey);
        await reject({ ...args, words: [{ word: 'valid', meaning: 'Valid' }, { word: '', meaning: 'Invalid' }] });
        const result = await call(tool, { ...args, words: [{ word: 'ALPHA', meaning: 'Updated alpha' }, { word: 'gamma', meaning: 'Third' }] });
        expect(result).toEqual({ created: 1, updated: 1, errors: [] });
        expect((await call('list_dictionary_words', { ...args, search: 'alpha' })).words[0]).toMatchObject({ id: alpha.id, meaning: 'Updated alpha' });
      }
      if (tool === 'export_dictionary_words') {
        const exported = await call(tool, args, userKey); expect(exported.map((w: { id: string }) => w.id)).toEqual([beta.id, alpha.id]); expect(exported.every((w: { status: string }) => w.status === 'approved')).toBe(true);
        expect(await call(tool, args)).toEqual(exported); await reject({ dictionaryId: 123 });
      }
      const page = await resources.session(account); await page.goto('/dictionary'); await page.locator('.dictionary-select').selectOption(dictionary.id);
      await expect(page.getByText(tool === 'import_dictionary_words' ? 'Updated alpha' : '첫 번째', { exact: true })).toBeVisible();
      await page.reload(); await page.locator('.dictionary-select').selectOption(dictionary.id); await expect(page.getByText('Second', { exact: true })).toBeVisible();
    } finally {
      for (const key of keys) expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200);
      for (const status of ['approved', 'pending', 'rejected']) {
        const result = await resources.admin.get(`/api/dictionary?dictionaryId=${dictionary.id}&status=${status}&limit=200`).then(r => r.json());
        for (const word of result.words) expect((await resources.admin.delete(`/api/dictionary/${word.id}`)).ok()).toBeTruthy();
      }
    }
  });
}

for (const tool of ['list_dictionaries', 'create_dictionary', 'update_dictionary', 'delete_dictionary']) {
  test(`MCP dictionary management ${tool} preserves metadata and enforces admin and usage restrictions`, async ({ resources }) => {
    const account = await resources.user(), source = await resources.dictionary(), project = await resources.project();
    const createdIds: string[] = [], keyIds: string[] = [], tokenIds: string[] = []; let sequence = 0;
    const dictionaries = async () => resources.admin.get('/api/dictionaries').then(r => r.json());
    const defaultId = (await dictionaries()).find((d: { is_default: number }) => d.is_default).id;
    const makeKey = async (userId?: string) => { const response = await resources.admin.post('/api/admin/api-keys', { data: { name: `Manage ${tool}`, ...(userId ? { userId } : {}) } }); expect(response.status()).toBe(201); const row = await response.json(); keyIds.push(row.id); return row; };
    const adminKey = await makeKey(), userKey = await makeKey(account.id);
    const raw = async (name: string, args: Record<string, unknown>, key = adminKey) => {
      const id = ++sequence; const response = await resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } } });
      expect(response.status()).toBe(200); const body = await response.json(); expect(body.id).toBe(id); return body;
    };
    const call = async (name: string, args: Record<string, unknown>, key = adminKey) => { const body = await raw(name, args, key); expect(body.error).toBeUndefined(); expect(body.result.isError, JSON.stringify(body)).not.toBe(true); const text = body.result.content[0].text; return /^[\[{]/.test(text) ? JSON.parse(text) : text; };
    const reject = async (args: Record<string, unknown>, key = adminKey) => { const before = await dictionaries(); const body = await raw(tool, args, key); expect(Boolean(body.error) || body.result?.isError === true, JSON.stringify(body)).toBe(true); expect(await dictionaries()).toEqual(before); };
    const create = async (name: string, cloneFromDictionaryId?: string) => { const row = await call('create_dictionary', { name, description: 'Keep description', ...(cloneFromDictionaryId ? { cloneFromDictionaryId } : {}) }); createdIds.push(row.id); return row; };
    try {
      for (const status of ['approved', 'pending']) await call('add_dictionary_word', { dictionaryId: source.id, word: `word_${status}`, meaning: '의미', category: 'Core', description: 'Retain word metadata', status });
      expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: { ...project.schema, dictionaryId: source.id } })).status()).toBe(200);
      if (tool === 'list_dictionaries') {
        const admin = await call(tool, {}), regular = await call(tool, {}, userKey);
        expect(admin.find((d: { id: string }) => d.id === source.id)).toMatchObject({ wordCount: 2, projectCount: 1, projects: [{ id: project.id, name: project.name }] });
        const basic = regular.find((d: { id: string }) => d.id === source.id); expect(basic).toMatchObject({ name: source.name });
        for (const field of ['wordCount', 'shareTokenCount', 'projectCount', 'projects']) expect(basic).not.toHaveProperty(field);
      }
      if (tool === 'create_dictionary') {
        await reject({ name: 'Forbidden creation' }, userKey); await reject({ name: '   ' }); await reject({ name: source.name }); await reject({ name: 'Missing clone', cloneFromDictionaryId: 'missing' });
        const empty = await create(`Empty ${randomUUID()}`); expect(empty).toMatchObject({ description: 'Keep description', is_default: 0 });
        const clone = await create(`Clone ${randomUUID()}`, source.id);
        for (const status of ['approved', 'pending']) {
          const get = (id: string) => resources.admin.get(`/api/dictionary?dictionaryId=${id}&status=${status}`).then(r => r.json()); const original = await get(source.id), copied = await get(clone.id);
          expect(copied.words).toHaveLength(1); expect(copied.words[0]).toMatchObject({ word: original.words[0].word, meaning: '의미', status, category: 'Core', description: 'Retain word metadata' }); expect(copied.words[0].id).not.toBe(original.words[0].id);
        }
      }
      if (tool === 'update_dictionary') {
        await reject({ dictionaryId: source.id, name: 'Forbidden' }, userKey); await reject({ dictionaryId: 'missing', name: 'Missing' }); await reject({ dictionaryId: source.id, name: '   ' });
        const renamed = await call(tool, { dictionaryId: source.id, name: `Renamed ${source.name}`, description: null, isDefault: true }); expect(renamed).toMatchObject({ id: source.id, description: null, is_default: 1 });
        expect((await dictionaries()).filter((d: { is_default: number }) => d.is_default).map((d: { id: string }) => d.id)).toEqual([source.id]);
        expect((await call(tool, { dictionaryId: source.id, description: 'Restored description' })).name).toBe(renamed.name);
      }
      if (tool === 'delete_dictionary') {
        await reject({ dictionaryId: source.id }, userKey); await reject({ dictionaryId: 'missing' }); await reject({ dictionaryId: defaultId }); await reject({ dictionaryId: source.id });
        const empty = await create(`Delete ${randomUUID()}`);
        const shared = await resources.admin.post('/api/admin/dictionary-tokens', { data: { dictionaryId: empty.id } }); expect(shared.status()).toBe(201); const token = await shared.json(); tokenIds.push(token.id);
        await reject({ dictionaryId: empty.id }); expect((await resources.admin.delete('/api/admin/dictionary-tokens', { data: { tokenId: token.id } })).status()).toBe(200); tokenIds.splice(tokenIds.indexOf(token.id), 1);
        expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: { ...project.schema, dictionaryId: empty.id } })).status()).toBe(200); await reject({ dictionaryId: empty.id });
        expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(200); expect(await call(tool, { dictionaryId: empty.id })).toBe('OK');
        expect((await dictionaries()).some((d: { id: string }) => d.id === empty.id)).toBe(false); createdIds.splice(createdIds.indexOf(empty.id), 1);
      }
      const page = await resources.session(account); await page.goto('/dictionary'); await expect(page.locator('.dictionary-select option', { hasText: source.name })).toHaveCount(1);
      await page.reload(); await expect(page.locator(`.dictionary-select option[value="${source.id}"]`)).toHaveCount(1);
    } finally {
      expect((await resources.admin.patch(`/api/dictionaries/${defaultId}`, { data: { isDefault: true } })).status()).toBe(200);
      expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: project.schema })).status()).toBe(200);
      for (const id of tokenIds) expect((await resources.admin.delete('/api/admin/dictionary-tokens', { data: { tokenId: id } })).status()).toBe(200);
      for (const id of [source.id, ...createdIds]) {
        for (const status of ['approved', 'pending', 'rejected']) {
          const result = await resources.admin.get(`/api/dictionary?dictionaryId=${id}&status=${status}&limit=200`).then(r => r.json());
          for (const word of result.words) expect((await resources.admin.delete(`/api/dictionary/${word.id}`)).ok()).toBeTruthy();
        }
      }
      for (const id of createdIds) expect((await resources.admin.delete(`/api/dictionaries/${id}`)).status()).toBe(200);
      for (const id of keyIds) expect((await resources.admin.delete(`/api/admin/api-keys/${id}`)).status()).toBe(200);
    }
  });
}

for (const permission of ['viewer', 'editor'] as const) {
  test(`${permission} presence shows transformed cursors and remote selection then clears on leave and rejoins without schema content changes`, async ({ resources }) => {
    const account = await resources.user(), project = await resources.project(), url = `/api/storage/schemas/${project.id}`;
    expect((await resources.admin.post(`/api/storage/projects/${project.id}/permissions`, { data: { userId: account.id, permission } })).status()).toBe(201);
    const owner = await resources.anonymous(); await owner.context().addCookies((await resources.admin.storageState()).cookies); const peer = await resources.session(account);
    for (const page of [owner, peer]) {
      await page.setViewportSize({ width: 1600, height: 1000 });
      const initialSave = page === owner || permission === 'editor'
        ? page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(url)) : undefined;
      await page.goto('/'); if (initialSave) expect((await initialSave).status()).toBe(200);
    }
    await expect(owner.locator('.peer-count')).toHaveText('2'); await expect(peer.locator('.peer-count')).toHaveText('2'); const before = await resources.admin.get(url).then(r => r.json());
    const area = peer.locator('.canvas-viewport'), box = await area.boundingBox(); if (!box) throw new Error('Peer canvas unavailable');
    await peer.mouse.move(box.x + 40, box.y + 70); const cursor = owner.locator('.collab-cursor').filter({ has: owner.locator('.cursor-label', { hasText: account.username }) }); await expect(cursor).toHaveCount(1); const first = await cursor.getAttribute('style');
    await peer.mouse.move(box.x + 300, box.y + 250); await expect(cursor).not.toHaveAttribute('style', first!);
    const world = await peer.locator('.canvas-world').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return { x: m.m41, y: m.m42, scale: m.a }; });
    const point = { x: (300 - world.x) / world.scale, y: (250 - world.y) / world.scale };
    await owner.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } }); await owner.keyboard.press('+');
    await expect.poll(async () => {
      const view = await owner.locator('.canvas-world').evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return { x: m.m41, y: m.m42, scale: m.a }; });
      const actual = await cursor.evaluate(el => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
      return Math.max(Math.abs(actual.x - (point.x * view.scale + view.x)), Math.abs(actual.y - (point.y * view.scale + view.y)));
    }).toBeLessThan(1);
    await peer.getByTestId('table-card').locator('.table-header').click(); await expect(owner.getByTestId('table-card')).toHaveAttribute('style', /box-shadow:/);
    await peer.locator('.canvas-viewport').click({ position: { x: 15, y: 15 } }); await expect(owner.getByTestId('table-card')).not.toHaveAttribute('style', /box-shadow:/);
    await peer.close(); await expect(owner.locator('.peer-count')).toHaveCount(0); await expect(owner.locator('.collab-cursor')).toHaveCount(0); await expect(owner.getByTestId('table-card')).not.toHaveAttribute('style', /box-shadow:/);
    const rejoined = await peer.context().newPage(); await rejoined.goto('/'); await expect(owner.locator('.peer-count')).toHaveText('2'); await expect(rejoined.getByTestId('table-card')).toHaveCount(1);
    const { updatedAt: _beforeTime, ...beforeContent } = before;
    const { updatedAt: _afterTime, ...afterContent } = await resources.admin.get(url).then(r => r.json());
    expect(afterContent).toEqual(beforeContent);
  });
}

test('local login session cookie is HttpOnly Strict and expires after the configured default without leaking to page scripts', async ({ resources }) => {
  const account = await resources.user(), page = await resources.session(account); await page.goto('/');
  const cookie = (await page.context().cookies()).find(c => c.name === 'erdmini_session')!; expect(cookie).toBeDefined(); expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict'); expect(cookie.path).toBe('/');
  const remaining = cookie.expires - Date.now() / 1000; expect(remaining).toBeGreaterThan(29 * 24 * 60 * 60); expect(remaining).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 5);
  expect(await page.evaluate(() => document.cookie)).not.toContain('erdmini_session'); expect((await page.request.get('/api/storage/shared')).status()).toBe(200);
  await page.reload(); expect((await page.context().cookies()).find(c => c.name === 'erdmini_session')!.value).toBe(cookie.value); expect((await page.request.get('/api/storage/shared')).status()).toBe(200);
});

for (const rule of [
  { key: 'columnCase', value: 'PascalCase', label: 'Column name violates case convention', corrected: 'Identifier', column: true },
  { key: 'columnPrefix', value: 'col_', label: 'Column name missing required prefix', corrected: 'col_id', column: true },
  { key: 'columnSuffix', value: '_col', label: 'Column name missing required suffix', corrected: 'id_col', column: true },
  { key: 'tableSuffix', value: '_tbl', label: 'Table name missing required suffix', corrected: 'users_tbl', column: false },
]) {
  test(`server naming lint ${rule.key} reports the exact target and clears only after a compliant saved rename`, async ({ resources }) => {
    const originalRules = await resources.admin.get('/api/admin/naming-rules').then(r => r.json());
    const project = await resources.project(), schemaUrl = `/api/storage/schemas/${project.id}`;
    const page = await resources.anonymous();
    await page.context().addCookies((await resources.admin.storageState()).cookies);
    const writes: string[] = [];
    page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith(schemaUrl)) writes.push(request.url()); });
    const openLint = async () => {
      await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: /^Validate/ }).click();
      return page.locator('.lint-item').filter({ has: page.locator('.lint-rule', { hasText: rule.label }) });
    };
    try {
      expect((await resources.admin.put('/api/admin/naming-rules', { data: { [rule.key]: { enabled: true, value: rule.value, allowOverride: false } } })).status()).toBe(200);
      await page.goto('/'); await expect(page.getByTestId('table-card')).toHaveCount(1);
      const issue = await openLint(); await expect(issue).toHaveCount(1); await expect(issue).toHaveClass(/lint-warning/);
      const table = project.schema.tables[0], col = table.columns[0];
      const detail = rule.column ? `${table.name}.${col.name}` : table.name;
      await expect(issue.locator('.lint-detail')).toContainText(detail);
      await expect(issue.locator('.lint-detail')).toContainText(rule.value);
      await issue.click(); await expect(page.getByTestId('table-name-input')).toHaveValue(table.name);
      if (rule.column) await expect(page.locator(`.column-row[data-column-id="${col.id}"]`)).toHaveClass(/lint-highlighted/);
      expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(project.schema);
      await page.reload(); await expect(await openLint()).toHaveCount(1);
      const corrected = structuredClone(project.schema);
      if (rule.column) corrected.tables[0].columns[0].name = rule.corrected;
      else corrected.tables[0].name = rule.corrected;
      expect((await resources.admin.put(schemaUrl, { data: corrected })).status()).toBe(200);
      await page.reload(); await expect(await openLint()).toHaveCount(0);
      expect(await resources.admin.get(schemaUrl).then(r => r.json())).toEqual(corrected);
      expect(writes).toEqual([]);
    } finally {
      expect((await resources.admin.put('/api/admin/naming-rules', { data: originalRules })).status()).toBe(200);
    }
  });
}

test('server storage uses WAL and a separate read connection observes committed API schema updates', async ({ resources }) => {
  const path = process.env.ERDMINI_E2E_DB_PATH;
  if (!path) throw new Error('Isolated server database path is required');
  const project = await resources.project();
  const reader = new Database(path, { readonly: true, fileMustExist: true });
  try {
    expect(reader.pragma('journal_mode', { simple: true })).toBe('wal');
    const tables = reader.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tables.map(table => table.name)).toContain('schemas');
    const columns = reader.pragma('table_info(schemas)') as { name: string }[];
    const payloadColumn = columns.find(column => ['data', 'schema_json', 'schema'].includes(column.name));
    if (!payloadColumn) throw new Error('Schema payload column was not found');
    // Only identifiers discovered in SQLite metadata enter this query.
    const stored = () => reader.prepare(`SELECT "${payloadColumn.name}" AS payload FROM schemas WHERE project_id = ?`).get(project.id) as { payload: string };
    expect(JSON.parse(stored().payload)).toEqual(project.schema);
    const updated = structuredClone(project.schema); updated.tables[0].comment = 'WAL committed update';
    expect((await resources.admin.put(`/api/storage/schemas/${project.id}`, { data: updated })).status()).toBe(200);
    expect(JSON.parse(stored().payload)).toEqual(updated);
    expect(await resources.admin.get(`/api/storage/schemas/${project.id}`).then(r => r.json())).toEqual(updated);
  } finally { reader.close(); }
});

test('configured initial administrator has one hashed identity and retains it across repeated login and page reload', async ({ resources }) => {
  const path = process.env.ERDMINI_E2E_DB_PATH;
  if (!path) throw new Error('Isolated server database path is required');
  const reader = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const identities = () => reader.prepare('SELECT id, username, role, password_hash FROM users WHERE username = ?').all('e2e-admin') as { id: string; username: string; role: string; password_hash: string }[];
    const initial = identities(); expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ username: 'e2e-admin', role: 'admin' });
    expect(initial[0].password_hash).toMatch(/^\$argon2/);
    expect(initial[0].password_hash).not.toContain('e2e-password');
    const page = await resources.anonymous();
    for (let i = 0; i < 2; i++) {
      await login(page.request, 'e2e-admin', 'e2e-password');
      await page.goto('/admin'); await expect(page).toHaveURL(/\/admin$/);
      expect((await page.request.get('/api/admin/users')).status()).toBe(200);
      await page.reload(); expect(identities()).toEqual(initial);
      expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
    }
  } finally { reader.close(); }
});


test('admin API key persists only its SHA-256 hash, retains it on rename and removes scopes on revocation', async ({ resources }) => {
  const path = process.env.ERDMINI_E2E_DB_PATH;
  if (!path) throw new Error('Isolated server database path is required');
  const project = await resources.project();
  const created = await resources.admin.post('/api/admin/api-keys', { data: { name: 'Hash storage contract', scopes: [{ projectId: project.id, permission: 'viewer' }] } });
  expect(created.status()).toBe(201);
  const key = await created.json() as { id: string; key: string };
  const reader = new Database(path, { readonly: true }); let deleted = false;
  try {
    expect(key.key).toMatch(/^erd_[a-f0-9]{64}$/);
    const stored = () => reader.prepare('SELECT * FROM api_keys WHERE id = ?').get(key.id) as { key_hash: string; name: string } | undefined;
    expect(stored()!.key_hash).toBe(createHash('sha256').update(key.key).digest('hex'));
    expect(JSON.stringify(stored())).not.toContain(key.key);
    const list = await resources.admin.get('/api/admin/api-keys').then(r => r.json());
    expect(JSON.stringify(list)).not.toContain(key.key); expect(JSON.stringify(list)).not.toContain(stored()!.key_hash);
    expect(reader.prepare('SELECT COUNT(*) AS count FROM api_key_scopes WHERE api_key_id = ?').get(key.id)).toEqual({ count: 1 });
    expect((await resources.admin.patch(`/api/admin/api-keys/${key.id}`, { data: { name: 'Renamed hash contract' } })).status()).toBe(200);
    expect(stored()).toMatchObject({ name: 'Renamed hash contract', key_hash: createHash('sha256').update(key.key).digest('hex') });
    const call = () => resources.admin.post('/mcp', { headers: { Authorization: `Bearer ${key.key}`, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} } });
    expect((await call()).status()).toBe(200);
    expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200); deleted = true;
    expect(stored()).toBeUndefined();
    expect(reader.prepare('SELECT COUNT(*) AS count FROM api_key_scopes WHERE api_key_id = ?').get(key.id)).toEqual({ count: 0 });
    expect((await call()).status()).toBe(403);
  } finally {
    reader.close(); if (!deleted) expect((await resources.admin.delete(`/api/admin/api-keys/${key.id}`)).status()).toBe(200);
  }
});
