import { expect, test, type Page } from 'playwright/test';

let adminSessionCookie: { name: string; value: string; domain: string; path: string } | null = null;

async function loginAsAdmin(page: Page) {
  if (adminSessionCookie) {
    await page.context().addCookies([adminSessionCookie]);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="create-project"], [data-testid="project-menu-toggle"]')).toBeVisible({ timeout: 15_000 });
    return;
  }
  await page.goto('/login');
  await page.locator('#username').fill('e2e-admin');
  await page.locator('#password').fill('e2e-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-testid="create-project"], [data-testid="project-menu-toggle"]')).toBeVisible({ timeout: 15_000 });
  const session = (await page.context().cookies()).find((cookie) => cookie.name === 'erdmini_session');
  if (!session) throw new Error('Admin session cookie was not created');
  adminSessionCookie = { name: session.name, value: session.value, domain: session.domain, path: session.path };
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

  test('creates, edits, and deletes a manual admin group', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await page.getByRole('button', { name: /Groups/ }).click();
    const groupsTab = page.locator('.admin-page .section').filter({ hasText: 'Create Group' });
    const groupName = `e2e-group-${Date.now()}`;
    await groupsTab.locator('input[placeholder="Name"]').fill(groupName);
    await groupsTab.locator('input[placeholder="Description"]').fill('E2E group');
    await groupsTab.getByRole('button', { name: 'Create Group', exact: true }).click();

    const groupRow = groupsTab.locator('tbody tr').filter({ hasText: groupName }).first();
    await expect(groupRow).toBeVisible();
    await groupRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const editingRow = groupsTab.locator('tbody tr').first();
    await editingRow.locator('input.inline-input').nth(1).fill('Edited E2E group');
    await editingRow.getByRole('button', { name: 'Save', exact: true }).click();
    const editedRow = groupsTab.locator('tbody tr').filter({ hasText: 'Edited E2E group' }).first();
    await expect(editedRow).toBeVisible();

    await editedRow.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(groupsTab.locator('tbody tr').filter({ hasText: groupName })).toHaveCount(0);
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

  test('creates, edits, and deletes a regular admin user', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    const username = `e2e-user-${Date.now()}`;
    const usersTab = page.locator('.admin-page .section').filter({ hasText: 'Create User' });
    await expect(usersTab).toBeVisible();
    await usersTab.locator('input[placeholder="Username"]').fill(username);
    await usersTab.locator('input[placeholder="Display Name"]').fill('E2E User');
    await usersTab.locator('input[placeholder="Email"]').fill(`${username}@example.test`);
    await usersTab.locator('input[type="password"]').fill('e2e-user-password');
    await usersTab.getByRole('button', { name: 'Create', exact: true }).click();

    const userRow = page.locator('.data-table tbody tr').filter({ hasText: username });
    await expect(userRow).toBeVisible();
    await userRow.getByRole('button', { name: 'Edit', exact: true }).click();
    await userRow.locator('input.inline-input').first().fill('Edited E2E User');
    await userRow.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(userRow).toContainText('Edited E2E User');

    await userRow.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.locator('.data-table tbody tr').filter({ hasText: username })).toHaveCount(0);
  });

  test('grants, changes, and revokes project permissions', async ({ page }) => {
    await loginAsAdmin(page);
    const username = `e2e-share-${Date.now()}`;
    const userResponse = await page.request.post('/api/admin/users', {
      data: { username, displayName: 'E2E Share User', email: `${username}@example.test`, password: 'share-password', role: 'user' },
    });
    expect(userResponse.status()).toBe(201);
    const user = await userResponse.json() as { id: string };

    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
    const projectIndexResponse = await page.request.get('/api/storage/index');
    const projectIndex = await projectIndexResponse.json() as { activeProjectId: string };
    const projectId = projectIndex.activeProjectId;
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const modal = page.locator('.modal[role="dialog"]');
    await expect(modal).toBeVisible();
    const search = modal.locator('input.search-input').first();
    await search.fill(username);
    await expect(modal.locator('.search-result-item')).toBeVisible({ timeout: 5_000 });
    await modal.locator('.perm-select').first().selectOption('viewer');
    await modal.locator('.search-result-item').click();

    const permissionRow = modal.locator('.perm-row').filter({ hasText: username });
    await expect(permissionRow).toContainText(/viewer/i);
    await permissionRow.locator('select.perm-select-sm').selectOption('editor');
    await expect(permissionRow).toContainText(/editor/i);
    await permissionRow.locator('.remove-btn').click();
    await expect(modal.locator('.perm-row').filter({ hasText: username })).toHaveCount(0);
    await modal.locator('.close-btn').click();

    const projectCleanup = await page.request.delete(`/api/storage/schemas/${projectId}`);
    expect(projectCleanup.ok()).toBeTruthy();
    const cleanup = await page.request.delete(`/api/admin/users/${user.id}`);
    expect(cleanup.ok()).toBeTruthy();
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
    adminSessionCookie = null;
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

  test('creates a password-protected embed and handles wrong and correct passwords', async ({ page }) => {
    await loginAsAdmin(page);
    const emptyCreate = page.getByTestId('create-project');
    if (await emptyCreate.isVisible().catch(() => false)) {
      await emptyCreate.click();
    } else {
      await page.getByTestId('project-menu-toggle').click();
      await page.getByTestId('project-new').click();
      const projectInput = page.locator('.project-rename-input');
      await projectInput.fill(`E2E Embed ${Date.now()}`);
      await projectInput.press('Enter');
    }
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /embed/i }).click();
    const modal = page.locator('.modal-panel');
    await expect(modal).toBeVisible();
    await modal.locator('input[type="password"]').fill('embed-secret');
    await modal.locator('.btn-create').click();

    const tokenCard = modal.locator('.token-card').first();
    await expect(tokenCard).toBeVisible();
    const embedUrl = await tokenCard.locator('.embed-url-display').inputValue();
    expect(embedUrl).toMatch(/\/embed\//);

    const embedPage = await page.context().newPage();
    await embedPage.goto(embedUrl);
    await expect(embedPage.locator('.embed-password')).toBeVisible({ timeout: 15_000 });
    await embedPage.locator('.embed-password input').fill('wrong-password');
    await embedPage.locator('.embed-password button').click();
    await expect(embedPage.locator('.embed-password .error-text')).toBeVisible();
    await embedPage.locator('.embed-password input').fill('embed-secret');
    await embedPage.locator('.embed-password button').click();
    await expect(embedPage.locator('.embed-app')).toBeVisible({ timeout: 15_000 });
    await expect(embedPage.locator('.embed-badge')).toContainText(/view only/i);
    await embedPage.close();
  });
});
