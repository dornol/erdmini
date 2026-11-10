import { expect, test, type Page } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

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

  test('edits and deletes a memo with confirmation', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-memo').click();

    const memo = page.getByTestId('memo-card');
    const textarea = memo.locator('.memo-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Review relationship naming');
    await textarea.blur();
    await expect(memo.locator('.memo-text')).toHaveText('Review relationship naming');

    await memo.hover();
    await memo.getByTestId('delete-memo').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(page.getByTestId('memo-card')).toHaveCount(0);
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
  });

  test('changes memo color and resizes it from the canvas', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-memo').click();
    const memo = page.getByTestId('memo-card');
    await memo.locator('.memo-header').click();
    await expect(memo).toHaveClass(/selected/);

    await memo.getByRole('button', { name: 'blue' }).click();
    await expect(memo).toHaveAttribute('style', /rgb\(219, 234, 254\)/);

    const initialWidth = await memo.evaluate((node) => (node as HTMLElement).getBoundingClientRect().width);
    const resize = memo.locator('.resize-handle');
    const box = await resize.boundingBox();
    if (!box) throw new Error('Memo resize handle is not measurable');
    await resize.dispatchEvent('mousedown', { button: 0, clientX: box.x, clientY: box.y });
    await page.mouse.move(box.x + 80, box.y + 40);
    await page.mouse.up();
    await expect.poll(async () => memo.evaluate((node) => (node as HTMLElement).getBoundingClientRect().width)).toBeGreaterThan(initialWidth);
  });

  test('restores an attached memo and detaches it from the pin', async ({ page }) => {
    await openEmptyCanvas(page);
    const schema = {
      version: '1',
      tables: [{ id: 'attached-table', name: 'notes', columns: [{ id: 'note-id', name: 'id', type: 'INT', nullable: false, primaryKey: true }], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 300, y: 180 } }],
      domains: [],
      memos: [{ id: 'attached-memo', content: 'Table note', color: 'yellow', position: { x: 300, y: 300 }, width: 180, height: 120, attachedTableId: 'attached-table' }],
      groupColors: {}, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await page.getByTestId('import-menu-toggle').click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON' }).click(),
    ]);
    await fileChooser.setFiles({ name: 'attached-memo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(schema)) });
    const table = page.getByTestId('table-card');
    await expect(table.locator('.memo-chip')).toBeVisible();
    await expect(table.locator('.memo-chip')).toContainText('Table note');

    await table.locator('.memo-chip').click();
    await expect(table.locator('.memo-chip')).toHaveCount(0);
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

  test('filters tables in the sidebar and selects a matching table', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    const tableName = page.getByTestId('table-name-input');
    await tableName.fill('users');
    await tableName.press('Enter');

    const search = page.locator('.search-input');
    await search.fill('missing');
    await expect(page.locator('.table-item')).toHaveCount(0);
    await expect(page.locator('.empty-hint')).toBeVisible();

    await search.fill('users');
    const tableItem = page.locator('.table-item').filter({ hasText: 'users' });
    await expect(tableItem).toHaveCount(1);
    await tableItem.click();

    await expect(tableItem).toHaveClass(/active/);
    await expect(page.getByTestId('table-card')).toHaveClass(/selected/);
  });

  test('bulk-edits multiple selected tables and groups them in the sidebar', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.locator('.toolbar .btn-primary').click();
    await expect(page.getByTestId('table-card')).toHaveCount(2);

    await page.locator('.table-item').first().click();
    await page.locator('.table-item').nth(1).click({ modifiers: ['Control'] });
    await expect(page.locator('.bulk-edit-btn')).toBeVisible();
    await page.locator('.bulk-edit-btn').click();

    const bulkModal = page.locator('.modal[role="dialog"]');
    await expect(bulkModal).toBeVisible();
    const groupToggle = bulkModal.locator('.field-toggle').filter({ hasText: /group/i });
    await groupToggle.locator('input[type="checkbox"]').check();
    await bulkModal.locator('input.text-input').fill('core');
    await bulkModal.getByRole('button', { name: /apply/i }).click();

    await page.locator('.search-bar .sort-btn').filter({ hasText: 'Group' }).click();
    await expect(page.locator('.group-header')).toContainText('core');
    await expect(page.locator('.table-item-grouped')).toHaveCount(2);
  });

  test('locks selected tables and exposes the locked state', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.locator('.toolbar .btn-primary').click();
    await expect(page.getByTestId('table-card')).toHaveCount(2);

    await page.locator('.table-item').first().click();
    await page.locator('.table-item').nth(1).click({ modifiers: ['Control'] });
    const lockButton = page.locator('.bulk-lock-btn');
    await expect(lockButton).toBeVisible();
    await lockButton.click();
    await expect(page.locator('[data-testid="table-card"].locked')).toHaveCount(2);
    await expect(page.locator('.table-card.locked .lock-icon')).toHaveCount(2);
  });

  test('supports sidebar attribute and prefix filters', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    const editor = page.getByTestId('table-editor');
    await editor.locator('.cg-header').click();
    await page.locator('#tbl-group').fill('auth');
    await editor.locator('.lock-btn').click();

    const search = page.locator('.search-input');
    await search.fill('locked:');
    await expect(page.locator('.table-item')).toHaveCount(1);
    await search.fill('has:pk');
    await expect(page.locator('.table-item')).toHaveCount(1);
    await search.fill('no:fk');
    await expect(page.locator('.table-item')).toHaveCount(1);
    await search.fill('type:varchar');
    await expect(page.locator('.table-item')).toHaveCount(0);
    await search.fill('group:auth');
    await expect(page.locator('.table-item')).toHaveCount(1);
  });

  test('creates and removes a database object from the Objects sidebar', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByRole('button', { name: /objects 0/i }).click();

    await page.getByRole('button', { name: /add category/i }).click();
    await page.locator('.category-input').fill('Views');
    await page.locator('.category-input').press('Enter');
    const category = page.locator('.category-group').filter({ hasText: 'Views' });
    await expect(category).toBeVisible();

    await category.locator('.cat-add-btn').click();
    const objectEditor = page.locator('.db-object-editor');
    await expect(objectEditor).toBeVisible();
    await objectEditor.locator('#dbo-name').fill('active_users');
    await objectEditor.locator('#dbo-comment').fill('Active users view');
    await objectEditor.locator('.ddl-toggle input').check();
    await expect(category.locator('.object-row')).toContainText('active_users');

    const objectRow = category.locator('.object-row').filter({ hasText: 'active_users' });
    await objectRow.hover();
    await objectRow.locator('.object-delete-btn').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(category.locator('.object-row')).toHaveCount(0);
  });

  test('adds a schema, switches to it, and creates a scoped table', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.locator('.schema-tab-add').click();
    const schemaInput = page.locator('.schema-tab-input');
    await expect(schemaInput).toBeVisible();
    await schemaInput.fill('analytics');
    await schemaInput.press('Enter');

    const analyticsTab = page.locator('button.schema-tab').filter({ hasText: 'analytics' });
    await expect(analyticsTab).toHaveCount(1);
    await analyticsTab.click();
    await expect(analyticsTab).toHaveClass(/active/);

    await page.getByTestId('empty-add-table').click();
    await expect(page.getByTestId('table-card')).toHaveCount(1);

    await page.getByTestId('table-editor').locator('.cg-header').click();
    await expect(page.locator('#tbl-schema')).toHaveValue('analytics');
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

  test('edits column constraints and default values', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('column-row').first().click();
    const popup = page.getByTestId('column-edit-popup');
    await expect(popup).toBeVisible();

    const flags = popup.locator('.flags-row input[type="checkbox"]');
    await flags.nth(0).check();
    await flags.nth(1).check();
    await popup.locator('#ce-default').fill('0');
    await popup.getByRole('button', { name: /close/i }).click();

    await expect(page.getByTestId('column-row').first()).toContainText('PK');
    await page.getByTestId('column-row').first().click();
    await expect(popup.locator('.flags-row input[type="checkbox"]').nth(0)).toBeChecked();
    await expect(popup.locator('.flags-row input[type="checkbox"]').nth(1)).toBeChecked();
    await expect(popup.locator('#ce-default')).toHaveValue('0');
  });

  test('creates composite unique keys and unique indexes', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('add-column').click();
    await page.getByTestId('column-name-input').fill('email');
    await page.keyboard.press('Escape');

    const editor = page.getByTestId('table-editor');
    await editor.getByRole('button', { name: /add unique/i }).click();
    const uniqueModal = page.locator('.modal[role="dialog"]').filter({ hasText: /unique/i });
    await expect(uniqueModal).toBeVisible();
    const uniqueTriggers = uniqueModal.locator('.ss-trigger');
    await uniqueTriggers.nth(0).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
    await uniqueModal.locator('.btn-add-col').click();
    await uniqueTriggers.nth(1).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'email' }).click();
    await uniqueModal.getByRole('button', { name: /add/i }).last().click();
    await expect(editor.locator('.uk-section .fk-row')).toHaveCount(1);

    await editor.getByRole('button', { name: /add index/i }).click();
    const indexModal = page.locator('.modal[role="dialog"]').filter({ hasText: /index/i });
    await expect(indexModal).toBeVisible();
    await indexModal.locator('.ss-trigger').click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'email' }).click();
    await indexModal.locator('.unique-label input').check();
    await indexModal.getByRole('button', { name: /add/i }).last().click();
    await expect(editor.locator('.idx-section .fk-row')).toHaveCount(1);
    await expect(editor.locator('.idx-section .idx-unique-badge')).toBeVisible();
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
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
    await selects.nth(2).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
    await modal.getByTestId('fk-submit').click();

    await expect(modal).toBeHidden();
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
    await expect(page.locator('.fk-section .fk-row')).toContainText('table_1.id');

    const fkRow = page.locator('.fk-section .fk-row');
    await fkRow.locator('button[title="Edit"]').click();
    await expect(modal).toBeVisible();
    await modal.locator('#fkm-label').fill('user ownership');
    await modal.getByTestId('fk-submit').click();
    await fkRow.locator('button[title="Edit"]').click();
    await expect(modal.locator('#fkm-label')).toHaveValue('user ownership');
    await modal.getByRole('button', { name: /close/i }).click();
    await fkRow.locator('button.del').click();
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(0);
  });

  test('creates a self-referencing foreign key and warns for SET NULL on a non-nullable column', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('add-column').click();
    await page.getByTestId('column-name-input').fill('parent_id');
    await page.keyboard.press('Escape');

    await page.getByTestId('add-foreign-key').click();
    const modal = page.getByTestId('fk-modal');
    await expect(modal).toBeVisible();
    const selects = modal.locator('.ss-trigger');
    await selects.nth(0).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'table_1' }).click();
    await selects.nth(1).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
    await selects.nth(2).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();

    await selects.nth(3).click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'SET NULL' }).click();
    await expect(modal.locator('.set-null-warning')).toBeVisible();
    await modal.locator('#fkm-label').fill('parent hierarchy');
    await modal.getByTestId('fk-submit').click();

    await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
    await expect(page.locator('.fk-section .fk-row')).toContainText('table_1.id');
    await page.locator('.fk-section .fk-row').locator('button[title="Edit"]').click();
    await expect(modal.locator('#fkm-label')).toHaveValue('parent hierarchy');
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

  test('duplicates the selected table with the keyboard shortcut', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('table-card').click();
    await page.keyboard.press('Control+d');

    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await expect(page.getByTestId('table-card').nth(1)).toContainText('table_1_copy');
  });

  test('searches and navigates from the command palette', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.keyboard.press('Control+k');

    const palette = page.locator('.cmd-backdrop');
    await expect(palette).toBeVisible();
    await palette.locator('.cmd-input').fill('table_1');
    await expect(palette.locator('.cmd-item-label').first()).toContainText('table_1');
    await palette.locator('.cmd-input').press('Enter');
    await expect(palette).toBeHidden();
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

  test('shows an error for invalid DDL import input', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('import-menu-toggle').click();
    await page.getByTestId('import-menu').getByRole('menuitem', { name: 'DDL' }).click();
    const modal = page.getByTestId('ddl-modal');
    await modal.getByTestId('ddl-import-input').fill('THIS IS NOT VALID SQL;');
    await modal.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(modal.locator('.msg-errors')).toBeVisible();
    await expect(page.getByTestId('table-card')).toHaveCount(0);
  });

  test('opens tools panels from the toolbar', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /domains/i }).click();
    const domainDialog = page.locator('.backdrop[role="dialog"]');
    await expect(domainDialog).toBeVisible();
    await domainDialog.getByRole('button', { name: /close/i }).click();
    await expect(domainDialog).toBeHidden();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /validate/i }).click();
    await expect(page.locator('.lint-panel')).toBeVisible();
    await page.locator('.lint-panel .lint-close').click();
    await expect(page.locator('.lint-panel')).toBeHidden();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-panel')).toBeVisible();
    await page.locator('.history-panel .history-close').click();
    await expect(page.locator('.history-panel')).toBeHidden();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
    await expect(page.locator('.snapshot-panel')).toBeVisible();
    await page.locator('.snapshot-panel .snapshot-close').click();
    await expect(page.locator('.snapshot-panel')).toBeHidden();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Schema Diff', exact: true }).click();
    const diffDialog = page.locator('.modal[role="dialog"]');
    await expect(diffDialog).toBeVisible();
    await diffDialog.locator('.close-btn').click();
    await expect(diffDialog).toBeHidden();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'SQL Playground', exact: true }).click();
    await expect(page.locator('.sp-panel')).toBeVisible();
    await page.locator('.sp-panel .close-btn').click();
    await expect(page.locator('.sp-panel')).toBeHidden();
  });

  test('compares a historical schema and generates migration SQL', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    const tableName = page.getByTestId('table-name-input');
    await tableName.fill('users');
    await tableName.press('Enter');
    await page.getByTestId('table-editor').getByRole('button', { name: /add/i }).first().click();
    await page.getByRole('dialog', { name: 'Table Editor' }).getByRole('button', { name: 'Close' }).click();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Schema Diff', exact: true }).click();
    const modal = page.locator('.modal[role="dialog"]');
    const historySelect = modal.locator('.history-select');
    await expect(historySelect).toBeVisible();
    await historySelect.selectOption({ index: 1 });
    await modal.locator('.btn-compare').click();
    await expect(modal.locator('.diff-summary-row')).toBeVisible();
    await expect(modal.locator('.diff-results')).toBeVisible();
    if (await modal.locator('.migration-controls').isVisible()) {
      await modal.locator('.btn-migration').click();
      await expect(modal.locator('.migration-preview')).toBeVisible();
      await expect(modal.locator('.migration-preview')).toContainText(/ALTER|CREATE|DROP/i);
    }
  });

  test('creates, links, unlinks, and deletes a domain', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /domains/i }).click();
    const domainDialog = page.locator('.backdrop[role="dialog"]');
    await domainDialog.locator('.add-btn').click();

    const editCard = domainDialog.locator('.edit-card');
    await expect(editCard).toBeVisible();
    await editCard.locator('input.edit-input').first().fill('email_address');
    await editCard.locator('.edit-btn-save').click();

    const domainRow = domainDialog.locator('tr.display-row').filter({ hasText: 'email_address' });
    await expect(domainRow).toHaveCount(1);
    await domainDialog.getByRole('button', { name: /close/i }).click();

    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('column-row').first().click();
    const columnPopup = page.getByTestId('column-edit-popup');
    await columnPopup.locator('.ss-trigger').last().click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: 'email_address' }).click();
    await expect(columnPopup.locator('.domain-badge')).toContainText('email_address');
    await columnPopup.getByRole('button', { name: /unlink/i }).click();
    await columnPopup.getByRole('button', { name: /close/i }).click();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /domains/i }).click();
    const deletableRow = page.locator('.backdrop[role="dialog"] tr.display-row').filter({ hasText: 'email_address' });
    await deletableRow.getByRole('button', { name: /delete/i }).click();
    await expect(deletableRow).toHaveCount(0);
  });

  test('imports domains from an XLSX file and applies typed metadata', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /domains/i }).click();
    const domainDialog = page.locator('.backdrop[role="dialog"]');

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([{
      Group: 'Identity', Name: 'account_status', Type: 'ENUM', Nullable: 'Y',
      EnumValues: 'active, locked', Tags: 'auth, account', Description: 'Account state',
    }]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Domains');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await domainDialog.locator('input[type="file"]').setInputFiles({
      name: 'domains.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });

    await expect(domainDialog).toContainText(/added|updated/i);
    const row = domainDialog.locator('tr.display-row').filter({ hasText: 'account_status' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('ENUM');
    await expect(row).toContainText('Identity');
  });

  test('downloads domain XLSX data and a reusable template', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: /domains/i }).click();
    const domainDialog = page.locator('.backdrop[role="dialog"]');

    const dataDownload = page.waitForEvent('download');
    await domainDialog.locator('button[title="Download Excel"]').click();
    expect((await dataDownload).suggestedFilename()).toBe('domains.xlsx');

    const templateDownload = page.waitForEvent('download');
    await domainDialog.getByRole('button', { name: /download template/i }).click();
    expect((await templateDownload).suggestedFilename()).toBe('domains_template.xlsx');
  });

  test('changes canvas display settings from the bottom bar', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    const gridToggle = page.locator('.canvas-bottom-bar button[title*="grid" i]').first();
    await expect(gridToggle).toHaveClass(/bar-btn-active/);
    await gridToggle.click();
    await expect(gridToggle).not.toHaveClass(/bar-btn-active/);
  });

  test('switches column view, line style, theme, and presentation mode', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    const viewButton = page.locator('.canvas-bottom-bar button[title="Column View"]');
    await viewButton.dispatchEvent('click');
    await page.getByRole('menuitem', { name: /names only/i }).dispatchEvent('click');
    await expect(viewButton).toContainText(/names only/i);

    const lineButton = page.locator('.canvas-bottom-bar button').filter({ hasText: /Orthogonal|Bezier|Rounded/ }).first();
    await lineButton.dispatchEvent('click');
    await page.getByRole('menuitem', { name: /bezier/i }).dispatchEvent('click');
    await expect(lineButton).toContainText(/bezier/i);

    await page.locator('.canvas-bottom-bar button[title="Theme"]').dispatchEvent('click');
    await page.getByRole('menuitem', { name: 'Blueprint', exact: true }).dispatchEvent('click');
    await expect(page.locator('.canvas-viewport[data-theme="blueprint"]')).toBeVisible();

    await page.getByRole('button', { name: 'Present' }).dispatchEvent('click');
    await expect(page.locator('.fullscreen-canvas')).toBeVisible();
    await page.locator('.fullscreen-close-btn').click();
    await expect(page.locator('.fullscreen-canvas')).toBeHidden();
  });

  test('selects all tables, clears selection, and resets canvas zoom', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.locator('.toolbar .btn-primary').click();

    await page.locator('.canvas-viewport').click({ position: { x: 700, y: 500 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true })));
    await expect(page.locator('[data-testid="table-card"].selected')).toHaveCount(2);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })));
    await expect(page.locator('[data-testid="table-card"].selected')).toHaveCount(0);

    const viewport = page.locator('.canvas-viewport');
    await viewport.dispatchEvent('wheel', { deltaY: -100, clientX: 500, clientY: 300 });
    await expect(page.locator('.zoom-pct')).not.toHaveText('100%');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('.zoom-pct')).toHaveText('100%');
  });

  test('zooms and pans with keyboard shortcuts', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    const world = page.locator('.canvas-world');
    const initialTransform = await world.getAttribute('style');

    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', bubbles: true })));
    await expect(page.locator('.zoom-pct')).toHaveText('110%');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })));
    await expect.poll(() => world.getAttribute('style')).not.toBe(initialTransform);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', code: 'Minus', bubbles: true })));
    await expect(page.locator('.zoom-pct')).toHaveText('99%');
  });

  test('selects tables with marquee and renders them in the minimap', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.locator('.toolbar .btn-primary').click();
    await expect(page.locator('.minimap')).toBeVisible();
    await expect(page.locator('.mini-table')).toHaveCount(2);

    const viewport = page.locator('.canvas-viewport');
    const box = await viewport.boundingBox();
    if (!box) throw new Error('Canvas viewport is not measurable');
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 12, box.y + box.height - 12);
    await page.mouse.up();
    await expect(page.locator('[data-testid="table-card"].selected')).toHaveCount(2);
  });

  test('pans and pinches the canvas through touch events', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    const viewport = page.locator('.canvas-viewport');
    const world = page.locator('.canvas-world');
    const initialTransform = await world.getAttribute('style');

    await viewport.evaluate((element) => {
      const target = element as HTMLElement;
      const makeTouch = (identifier: number, clientX: number, clientY: number) =>
        new Touch({ identifier, target, clientX, clientY, pageX: clientX, pageY: clientY, screenX: clientX, screenY: clientY });
      const start = makeTouch(1, 300, 260);
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [start], changedTouches: [start] }));
      const moved = makeTouch(1, 360, 300);
      window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [moved], changedTouches: [moved] }));
      window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [moved] }));
    });
    await expect.poll(() => world.getAttribute('style')).not.toBe(initialTransform);

    await viewport.evaluate((element) => {
      const target = element as HTMLElement;
      const makeTouch = (identifier: number, clientX: number, clientY: number) =>
        new Touch({ identifier, target, clientX, clientY, pageX: clientX, pageY: clientY, screenX: clientX, screenY: clientY });
      const left = makeTouch(1, 280, 260);
      const right = makeTouch(2, 320, 260);
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [left, right], changedTouches: [left, right] }));
      const fartherLeft = makeTouch(1, 250, 260);
      const fartherRight = makeTouch(2, 350, 260);
      window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [fartherLeft, fartherRight], changedTouches: [fartherLeft, fartherRight] }));
      window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [fartherLeft, fartherRight] }));
    });
    await expect(page.locator('.zoom-pct')).toHaveText(/(1[1-9][0-9]|[2-9][0-9]{2})%/);
  });

  test('creates, restores, and deletes a manual snapshot', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    const tableName = page.getByTestId('table-name-input');
    await tableName.fill('users');
    await tableName.press('Enter');

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
    const snapshotPanel = page.locator('.snapshot-panel');
    await snapshotPanel.locator('.snapshot-input').first().fill('before rename');
    await snapshotPanel.locator('.snapshot-save-btn').click();
    const snapshotItem = snapshotPanel.locator('.snapshot-item').filter({ hasText: 'before rename' });
    await expect(snapshotItem).toHaveCount(1);
    await snapshotPanel.locator('.snapshot-close').click();

    await tableName.fill('orders');
    await tableName.press('Enter');
    await expect(page.getByTestId('table-card')).toContainText('orders');

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
    const restoredSnapshot = page.locator('.snapshot-item').filter({ hasText: 'before rename' });
    await restoredSnapshot.locator('.snap-restore').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /restore/i }).click();
    await expect(page.getByTestId('table-card')).toContainText('users');

    await restoredSnapshot.locator('.snap-delete').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(restoredSnapshot).toHaveCount(0);
  });

  test('executes SQL and reports invalid SQL errors in the playground', async ({ page }) => {
    test.setTimeout(60_000);
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.locator('.btn-tools').click();
    await page.getByRole('menuitem', { name: 'SQL Playground', exact: true }).click();
    const playground = page.locator('.sp-panel');
    await expect(playground.locator('.sp-loading')).toBeHidden({ timeout: 30_000 });
    const editor = playground.locator('.cm-content');
    await editor.fill('SELECT * FROM "table_1"');
    await playground.getByRole('button', { name: /execute/i }).click();
    await expect(playground.locator('.sp-result-msg')).toBeVisible();
    await expect(playground.locator('.sp-result-msg')).toContainText(/0/);

    await editor.fill('SELECT * FROM');
    await playground.getByRole('button', { name: /execute/i }).click();
    await expect(playground.locator('.sp-result-error')).toBeVisible();
  });

  test('imports a JSON schema from a file', async ({ page }) => {
    await openEmptyCanvas(page);
    const schema = {
      version: '1',
      tables: [{
        id: 'json-table',
        name: 'json_users',
        columns: [{ id: 'json-id', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true }],
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

    await page.getByTestId('import-menu-toggle').click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON' }).click(),
    ]);
    await fileChooser.setFiles({
      name: 'schema.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(schema)),
    });

    await expect(page.getByTestId('table-card')).toHaveCount(1);
    await expect(page.getByTestId('table-card')).toContainText('json_users');
  });

  test('merges JSON imports and handles duplicate table choices', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('table-name-input').fill('users');
    await page.getByTestId('table-name-input').press('Enter');

    const importedSchema = {
      version: '1',
      tables: [
        {
          id: 'import-users',
          name: 'users',
          columns: [{ id: 'import-users-id', name: 'id', type: 'INT', nullable: false, primaryKey: true }],
          foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 100, y: 100 },
        },
        {
          id: 'import-orders',
          name: 'orders',
          columns: [{ id: 'import-orders-id', name: 'id', type: 'INT', nullable: false, primaryKey: true }],
          foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 420, y: 100 },
        },
      ],
      domains: [], memos: [], groupColors: {}, createdAt: Date.now(), updatedAt: Date.now(),
    };

    await page.getByTestId('import-menu-toggle').click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON' }).click(),
    ]);
    await fileChooser.setFiles({
      name: 'merge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedSchema)),
    });
    const mergeDialog = page.getByRole('alertdialog');
    await expect(mergeDialog).toBeVisible();
    await mergeDialog.getByRole('button', { name: /merge/i }).click();
    const duplicateDialog = page.getByRole('alertdialog');
    await expect(duplicateDialog).toBeVisible();
    await duplicateDialog.getByRole('button', { name: /skip/i }).click();
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await expect(page.getByTestId('table-card').filter({ hasText: 'orders' })).toHaveCount(1);
  });

  test('imports a Prisma schema into the empty canvas', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('import-menu-toggle').click();
    await page.getByTestId('import-menu').getByRole('menuitem', { name: 'DDL' }).click();
    const modal = page.getByTestId('ddl-modal');
    await modal.getByRole('button', { name: /Import DDL/i }).click();
    await modal.getByRole('button', { name: 'Prisma', exact: true }).click();
    await modal.getByTestId('ddl-import-input').fill(`
      model User {
        id Int @id @default(autoincrement())
        email String @unique
      }
    `);
    await modal.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(modal).toContainText(/imported|success/i);
    await expect(page.getByTestId('table-card')).toHaveCount(1);
    await expect(page.getByTestId('table-card')).toContainText('User');
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

  test('renders DBML export text for the current schema', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL' }).click();
    const modal = page.getByTestId('ddl-modal');
    await modal.getByRole('button', { name: 'DBML', exact: true }).click();
    await expect(modal.locator('.code-area')).toHaveValue(/Table/i);
    await expect(modal.locator('.code-area')).toHaveValue(/table_1/);
  });

  test('renders Mermaid, PlantUML, and Prisma export text', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL' }).click();
    const modal = page.getByTestId('ddl-modal');

    await modal.getByRole('button', { name: 'Mermaid', exact: true }).click();
    await expect(modal.locator('.code-area')).toHaveValue(/erDiagram/);
    await expect(modal.locator('.code-area')).toHaveValue(/table_1/);

    await modal.getByRole('button', { name: 'PlantUML', exact: true }).click();
    await expect(modal.locator('.code-area')).toHaveValue(/@startuml/);
    await expect(modal.locator('.code-area')).toHaveValue(/table_1/);

    await modal.getByRole('button', { name: 'Prisma', exact: true }).click();
    await expect(modal.locator('.code-area')).toHaveValue(/model Table1/);
    await expect(modal.locator('.code-area')).toHaveValue(/@@map\("table_1"\)/);
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

  test('exports and restores an all-project backup with confirmation', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await expect(page.getByTestId('table-card')).toHaveCount(1);

    await page.getByTestId('export-menu-toggle').click();
    const backupDownload = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: /backup all/i }).click();
    const backup = await backupDownload;
    const backupPath = await backup.path();
    if (!backupPath) throw new Error('Backup download path is unavailable');
    const backupBuffer = await readFile(backupPath);

    await page.getByTestId('import-menu-toggle').click();
    const restoreChooser = page.waitForEvent('filechooser');
    await page.getByTestId('import-menu').getByRole('menuitem', { name: /restore all/i }).click();
    const chooser = await restoreChooser;
    await chooser.setFiles({ name: 'erdmini-backup.json', mimeType: 'application/json', buffer: backupBuffer });
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText(/backup restored/i);
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByTestId('table-card')).toHaveCount(1);
  });

  test('exports the diagram as SVG and a full backup', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('export-menu-toggle').click();
    const svgDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: /^SVG$/ }).click();
    const svgDownload = await svgDownloadPromise;
    expect(svgDownload.suggestedFilename()).toMatch(/^erdmini_.*\.svg$/);

    await page.getByTestId('export-menu-toggle').click();
    const backupDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: /backup all/i }).click();
    const backupDownload = await backupDownloadPromise;
    expect(backupDownload.suggestedFilename()).toMatch(/^erdmini_backup_\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('exports the diagram as PNG and PDF', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();

    await page.getByTestId('export-menu-toggle').click();
    const pngDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: /PNG/i }).click();
    const pngDownload = await pngDownloadPromise;
    expect(pngDownload.suggestedFilename()).toMatch(/^erdmini_.*\.png$/);

    await page.getByTestId('export-menu-toggle').click();
    const pdfDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-menu').getByRole('menuitem', { name: /PDF/i }).click();
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toMatch(/^erdmini_.*\.pdf$/);
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

  test('duplicates the active project with its schema', async ({ page }) => {
    await openEmptyCanvas(page);
    await page.getByTestId('empty-add-table').click();
    await page.getByTestId('project-menu-toggle').click();
    await page.locator('.project-item').first().locator('[title="Duplicate project"]').click();

    await expect(page.getByTestId('project-menu-toggle')).toContainText('(copy)');
    await expect(page.getByTestId('table-card')).toHaveCount(1);
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

  test('deletes a project after confirmation', async ({ page }) => {
    await openEmptyCanvas(page);

    await page.getByTestId('project-menu-toggle').click();
    await page.getByTestId('project-new').click();
    const newProjectInput = page.locator('.project-new-row input');
    await newProjectInput.fill('To delete');
    await newProjectInput.press('Enter');
    await expect(page.getByTestId('project-menu-toggle')).toContainText('To delete');

    await page.getByTestId('project-menu-toggle').click();
    await page.locator('.project-item').first().getByTestId('project-delete').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();

    await expect(page.getByTestId('project-menu-toggle')).toContainText('To delete');
    await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
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
