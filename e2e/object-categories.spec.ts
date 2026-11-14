import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return {
    version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: [{ id: 'table', name: 'accounts', columns: [], foreignKeys: [], position: { x: 100, y: 100 } }], domains: [], memos: [],
    dbObjectCategories: ['Views', 'Functions', 'Empty'],
    dbObjects: [
      { id: 'view1', name: 'accounts_view', category: 'Views', sql: 'SELECT 1;', comment: 'Account reporting', includeInDdl: true },
      { id: 'view2', name: 'orders_view', category: 'Views', sql: 'SELECT 2;', includeInDdl: false },
      { id: 'function', name: 'count_accounts', category: 'Functions', sql: 'SELECT COUNT(*) FROM accounts;' },
    ],
  };
}
const group = (page: Page, name: string) => page.locator('.category-group').filter({ has: page.locator('.category-name', { hasText: new RegExp(`^${name}$`) }) });
async function openObjects(page: Page) {
  await page.getByRole('button', { name: /objects 3/i }).click();
}
async function rename(page: Page, from: string, value: string, key = 'Enter') {
  await group(page, from).hover();
  await group(page, from).locator('.cat-action-btn:not(.cat-action-delete)').click();
  const input = page.locator('.category-rename-input');
  await input.fill(value);
  await input.press(key);
}
async function data(page: Page) {
  const schema = await savedSchema(page);
  return { categories: schema?.dbObjectCategories, objects: schema?.dbObjects };
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.dbObjects?.length).toBe(3);
  await openObjects(page);
});

test('category rename validates duplicate and blank names, cancels safely and updates all member objects', async ({ page }) => {
  const original = await data(page);
  await rename(page, 'Views', 'discarded', 'Escape');
  await rename(page, 'Views', '   ');
  await rename(page, 'Views', 'Functions');
  await expect(page.locator('.category-name')).toHaveText(['Views', 'Functions', 'Empty']);
  expect(await data(page)).toEqual(original);
  await rename(page, 'Views', '  Reports  ');
  await expect(group(page, 'Reports').locator('.object-name')).toHaveText(['accounts_view', 'orders_view']);
  await expect.poll(async () => (await data(page)).objects?.map(o => o.category)).toEqual(['Reports', 'Reports', 'Functions']);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(group(page, 'Views')).toHaveCount(1);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect(group(page, 'Reports')).toHaveCount(1);
  await expect.poll(async () => (await data(page)).categories).toEqual(['Reports', 'Functions', 'Empty']);
  await page.reload();
  await openObjects(page);
  await expect(group(page, 'Reports').locator('.object-name')).toHaveText(['accounts_view', 'orders_view']);
  expect((await data(page)).objects).toEqual(original.objects?.map(o => o.category === 'Views' ? { ...o, category: 'Reports' } : o));
});

test('category deletion cancels, removes only its members and restores them with undo before redo/reload', async ({ page }) => {
  const original = await data(page);
  await group(page, 'Views').locator('.object-item').first().click();
  await group(page, 'Views').hover();
  await group(page, 'Views').locator('.cat-action-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await data(page)).toEqual(original);
  await group(page, 'Views').hover();
  await group(page, 'Views').locator('.cat-action-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(group(page, 'Views')).toHaveCount(0);
  await expect(page.locator('.db-object-editor')).toHaveCount(0);
  await expect(page.locator('.object-name')).toHaveText(['count_accounts']);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(group(page, 'Views').locator('.object-name')).toHaveCount(2);
  await expect.poll(() => data(page)).toEqual(original);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await data(page)).objects).toEqual(original.objects?.filter(o => o.category !== 'Views'));
  await page.reload();
  await page.getByRole('button', { name: /objects 1/i }).click();
  await expect(page.locator('.category-name')).toHaveText(['Functions', 'Empty']);
  await expect(page.locator('.object-name')).toHaveText(['count_accounts']);
});

test('category drag reorder persists while search and collapse leave membership unchanged', async ({ page }) => {
  const original = await data(page);
  await group(page, 'Empty').locator('.category-header').dragTo(group(page, 'Views').locator('.category-header'));
  await expect(page.locator('.category-name')).toHaveText(['Empty', 'Views', 'Functions']);
  await expect(group(page, 'Empty').locator('.empty-hint')).toBeVisible();
  await page.locator('.db-objects-sidebar .search-input').fill('REPORTING');
  await expect(page.locator('.object-name')).toHaveText(['accounts_view']);
  await expect(group(page, 'Views').locator('.category-count')).toHaveText('1');
  await page.locator('.db-objects-sidebar .search-input').fill('missing_object');
  await expect(page.locator('.object-name')).toHaveCount(0);
  await page.locator('.db-objects-sidebar .search-input').fill('');
  await group(page, 'Views').locator('.category-toggle').click();
  await expect(group(page, 'Views').locator('.object-name')).toHaveCount(0);
  await group(page, 'Views').locator('.category-toggle').click();
  await expect(group(page, 'Views').locator('.object-name')).toHaveCount(2);
  await expect.poll(async () => (await data(page)).categories).toEqual(['Empty', 'Views', 'Functions']);
  expect((await data(page)).objects).toEqual(original.objects);
  await page.reload();
  await openObjects(page);
  await expect(page.locator('.category-name')).toHaveText(['Empty', 'Views', 'Functions']);
  expect((await data(page)).objects).toEqual(original.objects);
});

test('an empty namespace clears hidden selections and creates scoped content without changing existing objects', async ({ page }) => {
  const original = await savedSchema(page);
  await page.getByTestId('table-card').click();
  await expect(page.getByTestId('table-name-input')).toHaveValue('accounts');
  await page.locator('.schema-tab-add').click();
  await page.locator('.schema-tab-input').fill('vacant');
  await page.locator('.schema-tab-input').press('Enter');
  await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
  await expect(page.getByTestId('table-card')).toHaveCount(0);
  await expect(page.getByTestId('table-editor')).toHaveCount(0);
  await expect.poll(async () => (await savedSchema(page))?.schemas).toEqual(['vacant']);
  await page.reload();
  await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
  await page.getByTestId('empty-add-memo').click();
  await expect(page.getByTestId('memo-card')).toHaveCount(1);
  await expect.poll(async () => (await savedSchema(page))?.memos[0]?.schema).toBe('vacant');
  await page.getByRole('button', { name: '+ New Table', exact: true }).click();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect.poll(async () => (await savedSchema(page))?.tables.map(t => t.schema)).toEqual([undefined, 'vacant']);
  await page.locator('.schema-tab-bar').getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  const saved = await savedSchema(page);
  expect(saved?.tables[0]).toEqual(original?.tables[0]);
  expect(saved?.dbObjects).toEqual(original?.dbObjects);
  expect(saved?.dbObjectCategories).toEqual(original?.dbObjectCategories);
  await page.reload();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  expect((await savedSchema(page))?.memos[0].schema).toBe('vacant');
});
