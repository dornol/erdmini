import { expect, test, type Page } from 'playwright/test';

async function openEmptyCanvas(page: Page) {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
}

test.describe('canvas smoke flows', () => {
  test('creates a table from the empty canvas state', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('empty-add-table').click();

    await expect(page.getByTestId('canvas-empty-state')).toBeHidden();
    await expect(page.getByTestId('table-card')).toHaveCount(1);
  });

  test('creates a memo from the empty canvas state', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('empty-add-memo').click();

    await expect(page.getByTestId('canvas-empty-state')).toBeHidden();
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
  });

  test('persists a created table after reload', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await expect(page.getByTestId('table-card')).toHaveCount(1);

    // The app autosaves schema changes after a short debounce.
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByTestId('table-card')).toHaveCount(1);
    await expect(page.getByTestId('canvas-empty-state')).toBeHidden();
  });

  test('renames the selected table from the table editor', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    const tableName = page.getByTestId('table-name-input');
    await expect(tableName).toHaveValue('table_1');
    await tableName.fill('users');
    await tableName.press('Enter');

    await expect(tableName).toHaveValue('users');
    await expect(page.getByTestId('table-card')).toContainText('users');
  });

  test('adds and edits a column from the table editor', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await expect(page.getByTestId('column-row')).toHaveCount(1);
    await page.getByTestId('add-column').click();
    await expect(page.getByTestId('column-edit-popup')).toBeVisible();

    const columnName = page.getByTestId('column-name-input');
    await columnName.fill('email');
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('column-edit-popup')).toBeHidden();
    await expect(page.getByTestId('column-row')).toHaveCount(2);
    await expect(page.getByTestId('column-row').nth(1)).toContainText('email');
  });

  test('creates a foreign-key relationship between two tables', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.locator('.toolbar .btn-primary').click();
    await expect(page.getByTestId('table-card')).toHaveCount(2);

    // Select the second table as the FK source and open its relationship editor.
    await page.getByTestId('table-card').nth(1).click();
    await page.getByTestId('add-foreign-key').click();
    const modal = page.getByTestId('fk-modal');
    await expect(modal).toBeVisible();

    const selects = modal.locator('.ss-trigger');
    await selects.nth(0).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'table_1' }).click();
    await selects.nth(1).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'id' }).click();
    await selects.nth(2).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'id' }).click();
    await modal.getByTestId('fk-submit').click();

    await expect(modal).toBeHidden();
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
    await expect(page.locator('.fk-section .fk-row')).toContainText('table_1.id');
  });

  test('deletes a table after confirmation', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    const table = page.getByTestId('table-card');
    await table.hover();
    await table.getByTestId('delete-table').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();

    await expect(page.getByTestId('table-card')).toHaveCount(0);
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
  });

  test('undoes and redoes a table creation', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await expect(page.getByTestId('table-card')).toHaveCount(1);

    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('table-card')).toHaveCount(0);
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();

    await page.keyboard.press('Control+y');
    await expect(page.getByTestId('table-card')).toHaveCount(1);
  });

  test('imports a DDL schema into the empty canvas', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('import-menu-toggle').click();
    await page.getByTestId('import-menu').getByRole('menuitem', { name: 'DDL' }).click();
    await expect(page.getByTestId('ddl-modal')).toBeVisible();

    await page.getByTestId('ddl-import-input').fill(`
      CREATE TABLE users (
        id INT PRIMARY KEY,
        email VARCHAR(255) NOT NULL
      );
    `);
    await page.getByTestId('ddl-modal').getByRole('button', { name: 'Import', exact: true }).click();

    await expect(page.getByTestId('ddl-modal')).toContainText(/imported|success/i);
    await expect(page.getByTestId('table-card')).toHaveCount(1);
    await expect(page.getByTestId('table-card')).toContainText('users');
  });

  test('imports a DBML schema into the empty canvas', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('import-menu-toggle').click();
    await page.getByTestId('import-menu').getByRole('menuitem', { name: 'DDL' }).click();
    const modal = page.getByTestId('ddl-modal');
    await modal.getByRole('button', { name: /Import DDL/i }).click();
    await modal.getByRole('button', { name: 'DBML', exact: true }).click();
    await modal.getByTestId('ddl-import-input').fill(`
      Table orders {
        id int [pk]
        user_id int
      }
    `);
    await modal.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(modal).toContainText(/imported|success/i);
    await expect(page.getByTestId('table-card')).toHaveCount(1);
    await expect(page.getByTestId('table-card')).toContainText('orders');
  });

  test('renders DDL export text for the current schema', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL' }).click();
    const modal = page.getByTestId('ddl-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.code-area')).toHaveValue(/CREATE TABLE/i);
    await expect(modal.locator('.code-area')).toHaveValue(/table_1/);
  });

  test('exports the current schema as JSON', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('export-menu-toggle').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^erdmini_.*\.json$/);
  });

  test('opens a copied share link in a fresh browser context', async ({ page, browser }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('copy-share-link').click();
    await expect(page.getByTestId('copy-share-link')).toHaveClass(/copied/);
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toMatch(/#s=[A-Za-z0-9_-]+$/);

    const sharedContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const sharedPage = await sharedContext.newPage();
    await sharedPage.goto(shareUrl);
    await expect(sharedPage.getByTestId('table-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(sharedPage.getByTestId('table-card')).toContainText('table_1');
    await sharedContext.close();
  });

  test('creates a second project and switches to its empty canvas', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('project-menu-toggle').click();
    await page.getByTestId('project-new').click();
    const newProjectInput = page.locator('.project-new-row input');
    await expect(newProjectInput).toBeVisible();
    await newProjectInput.fill('Analytics');
    await newProjectInput.press('Enter');

    await expect(page.getByTestId('project-menu-toggle')).toContainText('Analytics');
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
  });

  test('renames the active project and restores the name after reload', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('project-menu-toggle').click();
    await page.getByTestId('project-rename').click();
    const renameInput = page.locator('.project-item .project-rename-input');
    await renameInput.fill('Renamed project');
    await renameInput.press('Enter');

    await expect(page.getByTestId('project-menu-toggle')).toContainText('Renamed project');
    await page.reload();
    await expect(page.getByTestId('project-menu-toggle')).toContainText('Renamed project');
  });

  test('toggles dark mode and collapses the sidebar', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('.app')).toHaveAttribute('data-dark', 'true');

    await page.getByTestId('sidebar-collapse').click();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.expand-btn')).toBeVisible();
  });
});

test.describe('responsive layout', () => {
  test('shows the mobile notice and allows continuing to the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('.mobile-notice')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByTestId('create-project')).toBeVisible();
  });
});
