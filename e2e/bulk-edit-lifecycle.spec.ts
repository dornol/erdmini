import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return { version: '1', schemas: ['core', 'analytics'], domains: [],
    tables: ['users', 'orders', 'audit'].map((name, i) => ({ id: name, name, schema: 'core', color: 'blue', group: 'Original', comment: 'Original comment', position: { x: 100 + i * 300, y: 160 },
      columns: [{ id: `${name}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }],
      foreignKeys: i > 0 ? [{ id: `${name}_fk`, columnIds: [`${name}_id`], referencedTableId: 'users', referencedColumnIds: ['users_id'], onDelete: 'RESTRICT', onUpdate: 'CASCADE' }] : [], uniqueKeys: [], indexes: [] })),
    memos: [{ id: 'memo', attachedTableId: 'users', content: 'Keep attached documentation', position: { x: 100, y: 80 }, width: 180, height: 100 }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
async function selectPair(page: Page) {
  await page.locator('.table-item').filter({ hasText: 'users' }).click();
  await page.locator('.table-item').filter({ hasText: 'orders' }).click({ modifiers: ['ControlOrMeta'] });
}
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.getByTestId('create-project').click(); await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(3);
});

for (const field of ['color', 'group', 'comment', 'schema'] as const) {
  for (const clear of [false, true]) {
    test(`bulk ${field} ${clear ? 'clear' : 'set'} affects only selected tables and is a single undo step`, async ({ page }) => {
      const before = (await savedSchema(page))!; await selectPair(page); await page.locator('.bulk-edit-btn').click();
      const modal = page.getByRole('dialog'), row = modal.locator('.field-row').filter({ has: page.locator('.field-toggle', { hasText: new RegExp(field, 'i') }) });
      await expect(modal.locator('.btn-submit')).toBeDisabled();
      await row.locator('input[type="checkbox"]').check();
      const value = clear ? undefined : field === 'color' ? 'pink' : field === 'schema' ? 'analytics' : field === 'group' ? 'New group' : '새 주석';
      if (field === 'color') await row.getByTitle(clear ? 'None' : 'pink', { exact: true }).click();
      else if (field === 'schema') await row.locator('select').selectOption(value ?? '');
      else await row.locator('input.text-input').fill(clear ? '' : field === 'group' ? '  New group  ' : value!);
      await modal.locator('.btn-submit').click(); await expect(modal).toHaveCount(0);
      // Empty comments and other optional metadata clear to undefined.
      const expectedValue = value;
      const expected = before.tables.map((table, i) => i < 2 ? { ...table, [field]: expectedValue } : table);
      await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(expected);
      expect((await savedSchema(page))!.memos).toEqual(before.memos);
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(before.tables);
      await page.getByRole('button', { name: /^Redo/ }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(expected);
      await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(3);
      const after = (await savedSchema(page))!; expect(after.tables).toEqual(expected);
      expect(after.memos).toEqual(before.memos); expect(after.schemas).toEqual(before.schemas); expect(after.domains).toEqual(before.domains);
    });
  }
}

test('bulk edit cancel discards all enabled fields and leaves schema untouched through reload', async ({ page }) => {
  const before = await savedSchema(page); await selectPair(page); await page.locator('.bulk-edit-btn').click();
  const modal = page.getByRole('dialog');
  for (const checkbox of await modal.locator('.field-toggle input').all()) await checkbox.check();
  await modal.getByRole('button', { name: 'pink', exact: true }).click();
  await modal.locator('input.text-input').nth(0).fill('Discard group');
  await modal.locator('input.text-input').nth(1).fill('Discard comment');
  await modal.locator('select').selectOption('analytics');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await savedSchema(page)).toEqual(before); await page.reload(); expect(await savedSchema(page)).toEqual(before);
});

test('bulk lock and unlock preserve unrelated metadata with single-step history and reload', async ({ page }) => {
  const before = (await savedSchema(page))!; await selectPair(page);
  await page.locator('.bulk-lock-btn').click();
  const locked = before.tables.map((table, i) => i < 2 ? { ...table, locked: true } : table);
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(locked);
  await expect(page.locator('[data-testid="table-card"].locked')).toHaveCount(2);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(before.tables);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(locked);
  await page.locator('.bulk-lock-btn').click();
  await expect(page.locator('[data-testid="table-card"].locked')).toHaveCount(0);
  await expect.poll(async () => (await savedSchema(page))?.tables.slice(0, 2).every(table => !table.locked)).toBe(true);
  const unlocked = (await savedSchema(page))!;
  expect(unlocked.tables.map(({ locked, ...table }) => table)).toEqual(before.tables);
  expect(unlocked.tables.slice(0, 2).every(table => !table.locked)).toBe(true);
  expect(unlocked.memos).toEqual(before.memos);
  await page.reload(); await expect(page.locator('[data-testid="table-card"].locked')).toHaveCount(0);
  expect((await savedSchema(page))!.tables).toEqual(unlocked.tables);
});

for (const modifier of ['Control', 'Meta'] as const) {
  for (const key of ['Delete', 'Backspace']) {
    test(`${modifier} multi-selection ${key} bulk deletion cancels safely and restores exact tables and attached memo`, async ({ page }) => {
      const before = (await savedSchema(page))!;
      const users = page.locator('.table-item').filter({ hasText: 'users' });
      const orders = page.locator('.table-item').filter({ hasText: 'orders' });
      await users.click();
      // macOS reserves native Control-click for the context menu. Exercise
      // the application's ctrlKey branch explicitly on that platform.
      if (modifier === 'Control' && process.platform === 'darwin') await orders.dispatchEvent('click', { ctrlKey: true });
      else await orders.click({ modifiers: [modifier] });
      await expect(page.locator('[data-testid="table-card"].selected')).toHaveCount(2);
      await page.keyboard.press(key);
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await savedSchema(page)).toEqual(before); await expect(page.getByTestId('table-card')).toHaveCount(3);
      await page.keyboard.press(key); await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      const memo = { ...before.memos[0] }; delete memo.attachedTableId;
      const survivor = { ...before.tables[2], foreignKeys: [] };
      await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(0);
      await expect.poll(async () => (await savedSchema(page))?.tables).toEqual([survivor]);
      await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([memo]);
      await expect(page.getByTestId('memo-card').locator('.memo-text')).toHaveText(memo.content);
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(before.tables);
      await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(before.memos);
      await expect(page.getByTestId('table-card')).toHaveCount(3);
      await page.getByRole('button', { name: /^Redo/ }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables).toEqual([survivor]);
      await page.reload(); await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('audit');
      const after = (await savedSchema(page))!;
      expect(after.tables).toEqual([survivor]); expect(after.memos).toEqual([memo]);
      expect(after.domains).toEqual(before.domains); expect(after.schemas).toEqual(before.schemas);
    });
  }
}

test('deleting every table retains detached documentation and can restore the complete graph in one undo', async ({ page }) => {
  const before = (await savedSchema(page))!;
  await page.locator('.table-item').filter({ hasText: 'users' }).click();
  for (const name of ['orders', 'audit']) await page.locator('.table-item').filter({ hasText: name }).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('[data-testid="table-card"].selected')).toHaveCount(3);
  await page.keyboard.press('Delete'); await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  const detached = { ...before.memos[0] }; delete detached.attachedTableId;
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual([]);
  await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([detached]);
  await expect(page.getByTestId('table-card')).toHaveCount(0);
  await expect(page.getByTestId('memo-card').locator('.memo-text')).toHaveText(detached.content);
  await expect(page.locator('.memo-item .memo-preview')).toHaveText(detached.content.slice(0, 30));
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(before.tables);
  await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(before.memos);
  await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual([]);
  await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(0);
  await expect(page.getByTestId('memo-card').locator('.memo-text')).toHaveText(detached.content);
  const after = (await savedSchema(page))!; expect(after.memos).toEqual([detached]);
  expect(after.schemas).toEqual(before.schemas); expect(after.domains).toEqual(before.domains);
});
