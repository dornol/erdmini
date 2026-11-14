import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema, Table } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  const tables: Table[] = ['accounts', 'orders', 'report'].map((name, i) => ({
    id: name, name, schema: i === 2 ? 'analytics' : 'core',
    columns: [{ id: `${name}_id`, name: 'id', type: 'INT', primaryKey: true, nullable: false, unique: true, autoIncrement: false }],
    foreignKeys: i === 0 ? [] : [{ id: `${name}_fk`, columnIds: [`${name}_id`], referencedTableId: 'accounts', referencedColumnIds: ['accounts_id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }],
    uniqueKeys: [], indexes: [], position: { x: 50 + i * 250, y: 100 },
  }));
  return {
    version: '1', tables, schemas: ['core', 'analytics'], domains: [],
    memos: [{ id: 'note', content: 'Core documentation', schema: 'core', width: 180, height: 120, position: { x: 80, y: 300 } }],
    dbObjects: [{ id: 'view', name: 'account_view', category: 'Views', sql: 'SELECT id FROM accounts;', schema: 'core' }],
    dbObjectCategories: ['Views'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const tab = (page: Page, name: string) => page.locator('.schema-tab-bar').getByRole('button', { name, exact: true });
const wrapper = (page: Page, name: string) => page.locator('.schema-tab-wrapper').filter({ has: page.getByRole('button', { name, exact: true }) });

async function renameNamespace(page: Page, from: string, to: string, key = 'Enter') {
  await tab(page, from).dblclick();
  const input = page.locator('.schema-tab-input');
  await input.fill(to);
  await input.press(key);
}

async function createProject(page: Page, name: string) {
  await page.getByTestId('project-menu-toggle').click();
  await page.getByTestId('project-new').click();
  const input = page.locator('.project-new-row input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByTestId('project-menu-toggle')).toContainText(name);
}

async function switchProject(page: Page, name: string) {
  await page.getByTestId('project-menu-toggle').click();
  await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: new RegExp(`^${name}$`) }) }).locator('.project-item-name').click();
  await expect(page.getByTestId('project-menu-toggle')).toContainText(name);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
});

test('namespace filters tables, memos and only relationships with both endpoints visible', async ({ page }) => {
  await importSchema(page, fixture());
  const relations = page.getByRole('button', { name: 'FK line', exact: true });
  await expect(relations).toHaveCount(2);
  await tab(page, 'core').click();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.locator('.table-item')).toHaveCount(2);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await expect(relations).toHaveCount(1);
  await tab(page, 'analytics').click();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect(page.getByTestId('table-card')).toContainText('report');
  await expect(page.locator('.table-item')).toHaveCount(1);
  await expect(page.getByTestId('memo-card')).toHaveCount(0);
  await expect(relations).toHaveCount(0);
  await tab(page, 'All').click();
  await expect(page.getByTestId('table-card')).toHaveCount(3);
  await expect(relations).toHaveCount(2);
});

test('namespace rename cancels safely and updates scoped data after reload', async ({ page }) => {
  await importSchema(page, fixture());
  await tab(page, 'core').click();
  await renameNamespace(page, 'core', 'discarded', 'Escape');
  await expect(tab(page, 'core')).toHaveClass(/active/);
  await expect(tab(page, 'discarded')).toHaveCount(0);
  await renameNamespace(page, 'core', 'business');
  await expect(tab(page, 'business')).toHaveClass(/active/);
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.getByTestId('memo-card')).toContainText('Core documentation');
  await expect.poll(async () => {
    const saved = await savedSchema(page);
    return { schemas: saved?.schemas, tables: saved?.tables.map((t) => t.schema), memo: saved?.memos[0]?.schema, object: saved?.dbObjects?.[0]?.schema };
  }).toEqual({ schemas: ['business', 'analytics'], tables: ['business', 'business', 'analytics'], memo: 'business', object: 'business' });
  await page.reload();
  await tab(page, 'business').click();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await expect(tab(page, 'core')).toHaveCount(0);
});

test('duplicate or blank namespace rename leaves the active namespace and its data intact', async ({ page }) => {
  await importSchema(page, fixture());
  await tab(page, 'core').click();
  for (const name of ['analytics', '   ']) {
    await renameNamespace(page, 'core', name);
    await expect(tab(page, 'core')).toHaveClass(/active/);
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await expect(page.getByTestId('memo-card')).toHaveCount(1);
    await expect(page.locator('.schema-tab-wrapper')).toHaveCount(2);
  }
});

test('namespace deletion cancels, unassigns scoped data without deleting it, and supports undo/redo', async ({ page }) => {
  await importSchema(page, fixture());
  await tab(page, 'core').click();
  await wrapper(page, 'core').hover();
  await wrapper(page, 'core').locator('.schema-tab-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
  await expect(tab(page, 'core')).toHaveClass(/active/);
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await wrapper(page, 'core').hover();
  await wrapper(page, 'core').locator('.schema-tab-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect(tab(page, 'core')).toHaveCount(0);
  await expect(tab(page, 'All')).toHaveClass(/active/);
  await expect(page.getByTestId('table-card')).toHaveCount(3);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(tab(page, 'core')).toBeVisible();
  await tab(page, 'core').click();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await tab(page, 'All').click();
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect(tab(page, 'core')).toHaveCount(0);
  await expect.poll(async () => {
    const saved = await savedSchema(page);
    return { schemas: saved?.schemas, tables: saved?.tables.map((t) => t.schema ?? null), memo: saved?.memos[0]?.schema ?? null, object: saved?.dbObjects?.[0]?.schema ?? null };
  }).toEqual({ schemas: ['analytics'], tables: [null, null, 'analytics'], memo: null, object: null });
  await page.reload();
  await expect(page.getByTestId('table-card')).toHaveCount(3);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await expect(tab(page, 'core')).toHaveCount(0);
});

test('project switching saves pending edits and isolates schemas, selection and undo history', async ({ page }) => {
  await importSchema(page, fixture());
  await tab(page, 'core').click();
  await createProject(page, 'Second');
  await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
  await expect(page.locator('.schema-tab-wrapper')).toHaveCount(0);
  await expect(tab(page, 'All')).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.getByTestId('empty-add-table').click();
  await page.getByTestId('table-name-input').fill('second_only');
  await page.getByTestId('table-name-input').press('Enter');
  await expect.poll(async () => (await savedSchema(page))?.tables.map((t) => ({ name: t.name, schema: t.schema ?? null }))).toEqual([{ name: 'second_only', schema: null }]);
  await switchProject(page, 'My Project');
  await tab(page, 'All').click();
  await expect(page.getByTestId('table-card')).toHaveCount(3);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await expect(page.getByTestId('table-name-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await switchProject(page, 'Second');
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect(page.getByTestId('table-card')).toContainText('second_only');
  await expect(page.getByTestId('memo-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('project-menu-toggle')).toContainText('Second');
  await expect(page.getByTestId('table-card')).toContainText('second_only');
});

test('cancelling project deletion preserves the active project and its saved schema', async ({ page }) => {
  await importSchema(page, fixture());
  await createProject(page, 'Keep me');
  await page.getByTestId('empty-add-table').click();
  await page.getByTestId('project-menu-toggle').click();
  await page.locator('.project-item.active').getByTestId('project-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
  await expect(page.getByTestId('project-menu-toggle')).toContainText('Keep me');
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(1);
  await page.reload();
  await expect(page.getByTestId('project-menu-toggle')).toContainText('Keep me');
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await switchProject(page, 'My Project');
  await expect(page.getByTestId('table-card')).toHaveCount(3);
});

test('edits database object SQL, category and export metadata and preserves a cancelled deletion', async ({ page }) => {
  const schema = fixture();
  schema.dbObjectCategories = ['Views', 'Reports'];
  await importSchema(page, schema);
  await page.getByRole('button', { name: /objects 1/i }).click();
  await page.locator('.object-row').filter({ hasText: 'account_view' }).locator('.object-item').click();
  const editor = page.locator('.db-object-editor');
  await editor.locator('#dbo-name').fill('active_accounts');
  await editor.locator('#dbo-comment').fill('Only active accounts');
  await editor.locator('#dbo-category').selectOption('Reports');
  await editor.locator('.ddl-toggle input').check();
  await editor.locator('.cm-content').fill('CREATE VIEW active_accounts AS SELECT id FROM accounts;');
  await expect.poll(async () => (await savedSchema(page))?.dbObjects?.[0]).toMatchObject({
    name: 'active_accounts', comment: 'Only active accounts', category: 'Reports', includeInDdl: true,
    sql: 'CREATE VIEW active_accounts AS SELECT id FROM accounts;',
  });
  const row = page.locator('.object-row').filter({ hasText: 'active_accounts' });
  await row.hover();
  await row.locator('.object-delete-btn').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
  await expect(row).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /objects 1/i }).click();
  await page.locator('.object-row').filter({ hasText: 'active_accounts' }).locator('.object-item').click();
  await expect(editor.locator('#dbo-category')).toHaveValue('Reports');
  await expect(editor.locator('#dbo-comment')).toHaveValue('Only active accounts');
  await expect(editor.locator('.ddl-toggle input')).toBeChecked();
  await expect(editor.locator('.cm-content')).toContainText('CREATE VIEW active_accounts AS SELECT id FROM accounts;');
});

test('quick SQL edits on two objects are saved to their own objects', async ({ page }) => {
  const schema = fixture();
  schema.dbObjects!.push({ id: 'other_view', name: 'second_view', category: 'Views', sql: 'SELECT 2;' });
  await importSchema(page, schema);
  await page.getByRole('button', { name: /objects 2/i }).click();
  await page.locator('.object-row').filter({ hasText: 'account_view' }).locator('.object-item').click();
  const content = page.locator('.db-object-editor .cm-content');
  await content.fill('SELECT 100;');
  await page.locator('.object-row').filter({ hasText: 'second_view' }).locator('.object-item').click();
  await expect(content).toContainText('SELECT 2;');
  await content.fill('SELECT 200;');
  await expect.poll(async () => (await savedSchema(page))?.dbObjects?.map((o) => ({ id: o.id, sql: o.sql }))).toEqual([
    { id: 'view', sql: 'SELECT 100;' }, { id: 'other_view', sql: 'SELECT 200;' },
  ]);
  await page.reload();
  await page.getByRole('button', { name: /objects 2/i }).click();
  await page.locator('.object-row').filter({ hasText: 'account_view' }).locator('.object-item').click();
  await expect(content).toContainText('SELECT 100;');
  await page.locator('.object-row').filter({ hasText: 'second_view' }).locator('.object-item').click();
  await expect(content).toContainText('SELECT 200;');
});

for (const destination of ['close', 'project'] as const) {
  test(`leaving SQL editing by ${destination} preserves the pending edit in the original project`, async ({ page }) => {
    await importSchema(page, fixture());
    await page.getByRole('button', { name: /objects 1/i }).click();
    await page.locator('.object-row').locator('.object-item').click();
    const editor = page.locator('.db-object-editor');
    await editor.locator('.cm-content').fill('SELECT 999;');
    if (destination === 'close') {
      await editor.locator('.close-btn').click();
      await expect(editor).toBeHidden();
    } else {
      await createProject(page, 'Separate SQL project');
      await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
      await expect.poll(async () => (await savedSchema(page))?.dbObjects ?? []).toEqual([]);
      await switchProject(page, 'My Project');
    }
    await expect.poll(async () => (await savedSchema(page))?.dbObjects?.[0]?.sql).toBe('SELECT 999;');
    await page.reload();
    await page.getByRole('button', { name: /objects 1/i }).click();
    await page.locator('.object-row').locator('.object-item').click();
    await expect(editor.locator('.cm-content')).toContainText('SELECT 999;');
  });
}

test('namespace drag reorder persists without changing memberships', async ({ page }) => {
  await importSchema(page, fixture());
  await wrapper(page, 'analytics').dragTo(wrapper(page, 'core'));
  await expect(page.locator('.schema-tab-wrapper .schema-tab')).toHaveText(['analytics', 'core']);
  await expect.poll(async () => (await savedSchema(page))?.schemas).toEqual(['analytics', 'core']);
  await page.reload();
  await expect(page.locator('.schema-tab-wrapper .schema-tab')).toHaveText(['analytics', 'core']);
  await tab(page, 'core').click();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
});
