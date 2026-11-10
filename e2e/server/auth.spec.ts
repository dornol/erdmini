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
});
