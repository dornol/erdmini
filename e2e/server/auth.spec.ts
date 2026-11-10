import { expect, test, type Page } from 'playwright/test';
import * as XLSX from 'xlsx';

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

  test('validates and manages OIDC and LDAP provider configurations', async ({ page }) => {
    await loginAsAdmin(page);

    const missingOidc = await page.request.post('/api/admin/oidc-providers', { data: { displayName: 'Incomplete' } });
    expect(missingOidc.status()).toBe(400);
    const oidcIssuer = `https://oidc-${Date.now()}.example.test`;
    const oidcPayload = {
      displayName: 'E2E OIDC', issuerUrl: oidcIssuer, clientId: 'e2e-client', clientSecret: 'e2e-secret',
      scopes: 'openid email', enabled: true, autoCreateUsers: false, syncGroups: true,
      groupClaim: 'roles', allowedGroups: 'engineering', adminGroups: 'admins',
    };
    const createdOidc = await page.request.post('/api/admin/oidc-providers', { data: oidcPayload });
    expect(createdOidc.status()).toBe(201);
    const oidcId = (await createdOidc.json() as { id: string }).id;
    expect((await (await page.request.get('/api/admin/oidc-providers')).json()).some((p: { client_secret?: string; display_name: string }) => p.display_name === 'E2E OIDC' && !('client_secret' in p))).toBeTruthy();
    expect((await page.request.post('/api/admin/oidc-providers', { data: oidcPayload })).status()).toBe(409);
    const updatedOidc = await page.request.put(`/api/admin/oidc-providers/${oidcId}`, {
      data: {
        displayName: 'E2E OIDC Edited', issuerUrl: oidcIssuer, clientId: 'e2e-client', clientSecret: 'e2e-secret',
        scopes: 'openid email', enabled: true, autoCreateUsers: false, syncGroups: true,
        groupClaim: 'roles', allowedGroups: 'engineering', adminGroups: 'admins',
      },
    });
    expect(updatedOidc.ok()).toBeTruthy();
    expect((await page.request.delete(`/api/admin/oidc-providers/${oidcId}`)).ok()).toBeTruthy();

    const missingLdap = await page.request.post('/api/admin/ldap-providers', { data: { displayName: 'Incomplete' } });
    expect(missingLdap.status()).toBe(400);
    const ldapServer = `ldap://127.0.0.1:${30000 + Math.floor(Math.random() * 1000)}`;
    const ldapPayload = {
      displayName: 'E2E LDAP', serverUrl: ldapServer, bindDn: 'cn=admin,dc=e2e,dc=test', bindPassword: 'e2e-secret',
      userSearchBase: 'ou=users,dc=e2e,dc=test', userSearchFilter: '(uid={{username}})',
      emailAttribute: 'mail', displayNameAttribute: 'cn', enabled: true, autoCreateUsers: true, syncGroups: false,
    };
    const createdLdap = await page.request.post('/api/admin/ldap-providers', { data: ldapPayload });
    expect(createdLdap.status()).toBe(201);
    const ldapId = (await createdLdap.json() as { id: string }).id;
    expect((await (await page.request.get('/api/admin/ldap-providers')).json()).some((p: { bind_password?: string; display_name: string }) => p.display_name === 'E2E LDAP' && !('bind_password' in p))).toBeTruthy();
    expect((await page.request.post('/api/admin/ldap-providers', { data: ldapPayload })).status()).toBe(409);
    const updatedLdap = await page.request.put(`/api/admin/ldap-providers/${ldapId}`, {
      data: {
        displayName: 'E2E LDAP Edited', serverUrl: ldapServer, bindDn: 'cn=admin,dc=e2e,dc=test',
        userSearchBase: 'ou=users,dc=e2e,dc=test', userSearchFilter: '(uid={{username}})',
        emailAttribute: 'mail', displayNameAttribute: 'cn', enabled: true, autoCreateUsers: true, syncGroups: false,
      },
    });
    expect(updatedLdap.ok()).toBeTruthy();
    expect((await page.request.delete(`/api/admin/ldap-providers/${ldapId}`)).ok()).toBeTruthy();
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

  test('adds and removes a user from an admin group', async ({ page }) => {
    await loginAsAdmin(page);
    const username = `e2e-member-${Date.now()}`;
    const userResponse = await page.request.post('/api/admin/users', {
      data: { username, displayName: 'E2E Member', email: `${username}@example.test`, password: 'member-password', role: 'user' },
    });
    expect(userResponse.status()).toBe(201);
    const userId = (await userResponse.json() as { id: string }).id;
    const groupResponse = await page.request.post('/api/admin/groups', { data: { name: `e2e-members-${Date.now()}`, description: 'Membership E2E' } });
    expect(groupResponse.status()).toBe(201);
    const groupId = (await groupResponse.json() as { id: string }).id;

    const addResponse = await page.request.post(`/api/admin/groups/${groupId}/members`, { data: { userId } });
    expect(addResponse.ok()).toBeTruthy();
    const members = await (await page.request.get(`/api/admin/groups/${groupId}/members`)).json() as { id: string; username: string }[];
    expect(members.some((member) => member.id === userId && member.username === username)).toBeTruthy();
    expect((await page.request.delete(`/api/admin/groups/${groupId}/members`, { data: { userId } })).ok()).toBeTruthy();
    expect((await page.request.delete(`/api/admin/groups/${groupId}`)).ok()).toBeTruthy();
    expect((await page.request.delete(`/api/admin/users/${userId}`)).ok()).toBeTruthy();
  });

  test('creates, edits, and deletes an admin API key', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await page.getByRole('button', { name: /API Keys/ }).click();
    const apiKeysTab = page.locator('.admin-page .section').filter({ hasText: 'Create API Key' });
    const keyName = `e2e-key-${Date.now()}`;
    await apiKeysTab.locator('input[placeholder="Key name (e.g. MCP Server)"]').fill(keyName);
    await apiKeysTab.getByRole('button', { name: 'Create Key', exact: true }).click();
    await expect(apiKeysTab.locator('.key-reveal')).toBeVisible();
    await expect(apiKeysTab.locator('.key-value')).toContainText(/^erd_/);
    const createdKey = await apiKeysTab.locator('.key-value').innerText();
    expect((await page.request.post('/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } })).status()).toBe(401);
    expect((await page.request.post('/mcp', { headers: { Authorization: 'Bearer invalid-key' }, data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } })).status()).toBe(403);
    const mcpResponse = await page.request.post('/mcp', {
      headers: { Authorization: `Bearer ${createdKey}`, Accept: 'application/json, text/event-stream' },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1.0' } },
      },
    });
    expect(mcpResponse.ok()).toBeTruthy();
    expect((await mcpResponse.json()).result.serverInfo).toBeTruthy();

    const keyRow = apiKeysTab.locator('tbody tr').filter({ hasText: keyName }).first();
    await expect(keyRow).toBeVisible();
    await keyRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const editRow = apiKeysTab.locator('tbody tr').first();
    await editRow.locator('input[placeholder="Key name"]').fill(`${keyName}-edited`);
    await editRow.getByRole('button', { name: 'Save', exact: true }).click();
    const editedRow = apiKeysTab.locator('tbody tr').filter({ hasText: `${keyName}-edited` }).first();
    await expect(editedRow).toBeVisible();
    await editedRow.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(apiKeysTab.locator('tbody tr').filter({ hasText: `${keyName}-edited` })).toHaveCount(0);
  });

  test('creates and deletes a personal API key from the user menu', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId('user-menu-toggle').click();
    await page.getByRole('menuitem', { name: 'API Keys', exact: true }).click();
    const modal = page.locator('.modal[role="dialog"]');
    await expect(modal).toBeVisible();
    const keyName = `e2e-personal-${Date.now()}`;
    await modal.locator('input[placeholder="Name"]').fill(keyName);
    await modal.getByRole('button', { name: /create/i }).click();
    await expect(modal.locator('.key-reveal .key-value')).toContainText(/^erd_/);
    await modal.getByRole('button', { name: 'Dismiss', exact: true }).click();
    const keyRow = modal.locator('.key-row').filter({ hasText: keyName });
    await expect(keyRow).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await keyRow.getByRole('button', { name: /delete/i }).click();
    await expect(keyRow).toHaveCount(0);
  });

  test('downloads the admin database backup', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Backup' }).click();
    const backupTab = page.locator('.admin-page .section');
    await expect(backupTab).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await backupTab.getByRole('button', { name: /download/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.db$/);
  });

  test('saves branding and naming-rule settings from the admin console', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Branding' }).click();
    const branding = page.locator('.admin-page .section');
    const siteName = branding.locator('input[placeholder="erdmini"]');
    await siteName.fill('E2E Brand');
    await branding.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(branding.locator('.msg-success')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Branding' }).click();
    await expect(page.locator('.admin-page .section input[placeholder="erdmini"]')).toHaveValue('E2E Brand');
    await page.locator('.admin-page .section input[placeholder="erdmini"]').fill('erdmini');
    await page.locator('.admin-page .section').getByRole('button', { name: 'Save', exact: true }).click();

    await page.getByRole('button', { name: 'Naming Rules' }).click();
    const namingRules = page.locator('.admin-page .section');
    await namingRules.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(namingRules.locator('.msg-success')).toBeVisible();
  });

  test('creates and deletes a dictionary word from the server dictionary', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dictionary');
    await expect(page.locator('.dictionary-select')).toHaveValue(/.+/);
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

  test('shares a password-protected dictionary and filters the public view', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dictionary');
    const word = `e2e_share_${Date.now()}`;
    await page.getByRole('button', { name: 'Add Word', exact: true }).click();
    const addRow = page.locator('tr').filter({ has: page.locator('input[placeholder="seq"]') });
    await addRow.locator('input.inline-input').nth(0).fill(word);
    await addRow.locator('input.inline-input').nth(1).fill('Shared meaning');
    await addRow.getByRole('button', { name: /save/i }).click();
    await expect(page.locator('tr').filter({ hasText: word })).toBeVisible();

    await page.getByRole('button', { name: 'Share Dictionary', exact: true }).click();
    const shareSection = page.locator('.form-section').filter({ hasText: /Share Dictionary|Dictionary Share/i });
    await shareSection.locator('input[type="password"]').fill('dictionary-secret');
    await shareSection.getByRole('button', { name: /create/i }).click();
    await expect(shareSection.locator('tbody tr')).toHaveCount(1);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await shareSection.getByRole('button', { name: 'Copy URL', exact: true }).click();
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toMatch(/\/dictionary\/share\//);

    const publicPage = await page.context().newPage();
    await publicPage.goto(shareUrl);
    await expect(publicPage.locator('.password-card')).toBeVisible({ timeout: 15_000 });
    await publicPage.locator('.password-input').fill('wrong-password');
    await publicPage.getByRole('button', { name: /submit/i }).click();
    await expect(publicPage.locator('.msg-error')).toBeVisible();
    await publicPage.locator('.password-input').fill('dictionary-secret');
    await publicPage.getByRole('button', { name: /submit/i }).click();
    await expect(publicPage.locator('.dict-table')).toBeVisible({ timeout: 15_000 });
    await publicPage.locator('.search-input').fill(word);
    await expect(publicPage.locator('.dict-table tbody tr')).toContainText(word);
    await publicPage.close();
  });

  test('exports dictionary files and imports a JSON word list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dictionary');
    await expect(page.locator('.dictionary-select')).toHaveValue(/.+/);
    const dictionaryId = await page.locator('.dictionary-select').inputValue();
    const exportResponse = await page.request.get(`/api/dictionary/export?dictionaryId=${encodeURIComponent(dictionaryId)}`);
    expect(exportResponse.ok()).toBeTruthy();
    expect(await exportResponse.json()).toEqual(expect.any(Array));
    await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Template', exact: true })).toBeEnabled();
    const excelDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    expect((await excelDownload).suggestedFilename()).toBe('word-dictionary.xlsx');
    const templateDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Template', exact: true }).click();
    expect((await templateDownload).suggestedFilename()).toBe('word-dictionary-template.xlsx');

    const word = `e2e_import_${Date.now()}`;
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'e2e-words.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ word, meaning: 'Imported meaning', category: 'e2e' }])),
    });
    await expect(page.locator('tr').filter({ hasText: word })).toBeVisible({ timeout: 15_000 });

    const xlsxWord = `e2e_xlsx_${Date.now()}`;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Word: xlsxWord, Meaning: 'XLSX meaning', Category: 'e2e' }]), 'Dictionary');
    const xlsxChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const xlsxChooser = await xlsxChooserPromise;
    await xlsxChooser.setFiles({
      name: 'e2e-words.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    });
    await expect(page.locator('tr').filter({ hasText: xlsxWord })).toBeVisible({ timeout: 15_000 });
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

  test('grants, changes, and revokes project permissions', async ({ page, browser }) => {
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

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto('/login');
    await viewerPage.locator('#username').fill(username);
    await viewerPage.locator('#password').fill('share-password');
    await viewerPage.getByRole('button', { name: /sign in/i }).click();
    await expect(viewerPage).toHaveURL(/\/$/);
    await expect(viewerPage.getByTestId('readonly-badge')).toBeVisible({ timeout: 15_000 });
    await expect(viewerPage.locator('.toolbar .btn-primary')).toBeDisabled();
    await viewerContext.close();

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

  test('joins a collaboration room and propagates a table operation to a second tab', async ({ page }) => {
    await loginAsAdmin(page);
    const emptyCreate = page.getByTestId('create-project');
    if (await emptyCreate.isVisible().catch(() => false)) {
      await emptyCreate.click();
    } else {
      await page.getByTestId('project-menu-toggle').click();
      await page.getByTestId('project-new').click();
      const projectInput = page.locator('.project-rename-input');
      await projectInput.fill(`E2E Collaboration ${Date.now()}`);
      await projectInput.press('Enter');
    }
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();

    const projectId = (await (await page.request.get('/api/storage/index')).json() as { activeProjectId: string }).activeProjectId;
    const secondPage = await page.context().newPage();
    await secondPage.goto('/');
    await expect(secondPage.getByTestId('canvas-empty-state')).toBeVisible({ timeout: 15_000 });

    // Both tabs share the authenticated cookie and must appear in the same WS room.
    await expect(page.locator('.collab-btn')).toHaveAttribute('title', /live|collaborators/i, { timeout: 15_000 });
    await expect(page.locator('.peer-count')).toHaveText('2', { timeout: 15_000 });

    await secondPage.getByTestId('empty-add-table').click();
    await expect(page.getByTestId('table-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('table-card')).toContainText('table_1');

    await secondPage.close();
    await expect(page.locator('.peer-count')).toHaveCount(0, { timeout: 15_000 });
    expect(projectId).toBeTruthy();
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
    const embedMenuItem = page.getByRole('menuitem', { name: 'Embed', exact: true });
    await expect(embedMenuItem).toBeVisible();
    await embedMenuItem.dispatchEvent('click');
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
