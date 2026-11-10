import { expect, test, type Page } from 'playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill('e2e-admin');
  await page.locator('#password').fill('e2e-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('create-project')).toBeVisible({ timeout: 15_000 });
}

async function buildShareHash(page: Page) {
  return page.evaluate(async () => {
    const schema = {
      version: '1',
      tables: [{
        id: 'shared-table',
        name: 'shared_users',
        columns: [{
          id: 'shared-id',
          name: 'id',
          type: 'INT',
          nullable: false,
          primaryKey: true,
          unique: true,
          autoIncrement: true,
        }],
        foreignKeys: [],
        uniqueKeys: [],
        indexes: [],
        position: { x: 100, y: 100 },
      }],
      domains: [],
      memos: [],
      groupColors: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const json = JSON.stringify({ n: 'Shared schema', s: schema });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(json));
        controller.close();
      },
    }).pipeThrough(new CompressionStream('deflate'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
}

test.describe('server-mode authentication', () => {
  test('redirects unauthenticated users to the login page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('redirects unauthenticated users away from the admin console', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#username')).toBeVisible();
  });

  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#username').fill('e2e-admin');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('.error')).toBeVisible();
  });

  test('logs in with the configured admin account', async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('navigates across the admin console tabs', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.locator('.admin-page h1')).toHaveText('Admin');

    const tabs = page.locator('.admin-page .tabs .tab');
    await expect(tabs).toHaveCount(12);
    for (const label of ['Groups', 'OIDC', 'LDAP', 'API Keys', 'Embeds', 'Dictionary', 'Naming Rules', 'Projects', 'Branding', 'Backup', 'Audit Log']) {
      const tab = tabs.filter({ hasText: label });
      await tab.click();
      await expect(tab).toHaveClass(/active/);
    }
  });

  test('creates and deletes a dictionary word from the server dictionary', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dictionary');
    await expect(page.locator('.dict-page')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Add Word', exact: true })).toBeEnabled();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Add Word', exact: true }).click();
    const addRow = page.locator('tr').filter({ has: page.locator('input[placeholder="seq"]') });
    await expect(addRow).toBeVisible();
    await addRow.locator('input.inline-input').nth(0).fill('e2e_word');
    await addRow.locator('input.inline-input').nth(1).fill('E2E test word');
    await addRow.getByRole('button', { name: /save/i }).click();

    const wordRow = page.locator('tr').filter({ hasText: 'e2e_word' }).last();
    await expect(wordRow).toContainText('E2E test word');
    await wordRow.locator('.btn-danger').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(page.locator('tr').filter({ hasText: 'e2e_word' })).toHaveCount(0);
  });

  test('protects storage APIs and logs out an authenticated user', async ({ page }) => {
    const response = await page.request.get('/api/storage/index');
    expect(response.status()).toBe(401);

    await loginAsAdmin(page);
    await page.reload();
    await expect(page.getByTestId('user-menu-toggle')).toBeVisible();

    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#username')).toBeVisible();
  });

  test('opens a shared schema as read-only', async ({ page }) => {
    await loginAsAdmin(page);
    const shareHash = await buildShareHash(page);

    await page.goto(`/#s=${shareHash}`);
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByTestId('readonly-badge')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('table-card')).toContainText('shared_users');
    await expect(page.locator('.toolbar .btn-primary')).toBeDisabled();
  });

  test('persists a project schema through the server storage provider', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();

    await page.getByTestId('empty-add-table').click();
    await expect(page.getByTestId('table-card')).toHaveCount(1);
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByTestId('table-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('table-card')).toContainText('table_1');
  });
});
