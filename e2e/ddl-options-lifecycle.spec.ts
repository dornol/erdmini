import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

async function open(page: Page) {
  await page.getByTestId('export-menu-toggle').click();
  await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
  const modal = page.getByTestId('ddl-modal');
  await modal.getByRole('button', { name: 'DDL options', exact: true }).click();
  return modal;
}
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.getByTestId('create-project').click();
  const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  const model: ERDSchema = { version: '1', domains: [{ ...flags, id: 'domain', name: 'identity_domain', type: 'INT' }], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: ['users', 'orders'].map((name, i) => ({ id: name, name, comment: 'Table documentation', position: { x: 100 + i * 350, y: 150 },
      columns: [{ ...flags, id: `${name}_id`, name: 'id', type: 'INT', primaryKey: true, domainId: 'domain', comment: 'Column documentation' }],
      foreignKeys: i ? [{ id: 'fk', columnIds: ['orders_id'], referencedTableId: 'users', referencedColumnIds: ['users_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }] : [], uniqueKeys: [], indexes: [{ id: `${name}_idx`, name: `${name}_lookup`, columnIds: [`${name}_id`], unique: false }] })),
  };
  await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
});

for (const [indent, prefix] of [['2spaces', '  '], ['4spaces', '    '], ['tab', '\t']]) {
  test(`DDL indentation ${indent} changes actual column lines and persists after reload without schema edits`, async ({ page }) => {
    const before = await savedSchema(page), modal = await open(page);
    await modal.locator('.ddl-options select').nth(0).selectOption(indent);
    await modal.locator('.ddl-options select').nth(1).selectOption('none');
    await expect(modal.locator('.code-area')).toHaveValue(new RegExp(`\\n${prefix}id INT`));
    const text = await modal.locator('.code-area').inputValue();
    expect(await savedSchema(page)).toEqual(before);
    await page.reload(); const reopened = await open(page);
    await expect(reopened.locator('.ddl-options select').nth(0)).toHaveValue(indent);
    await expect(reopened.locator('.code-area')).toHaveValue(text);
    expect(await savedSchema(page)).toEqual(before);
  });
}

for (const [style, name] of [['none', 'users'], ['backtick', '`users`'], ['double', '"users"'], ['bracket', '[users]']]) {
  test(`DDL quoting ${style} changes table identifiers and lowercase keywords preserve literal comments`, async ({ page }) => {
    const before = await savedSchema(page), modal = await open(page);
    await modal.locator('.ddl-options select').nth(1).selectOption(style);
    const checks = modal.locator('.ddl-options > .opt-check input');
    await checks.nth(0).uncheck();
    await expect(modal.locator('.code-area')).toHaveValue(new RegExp('create table'));
    const text = await modal.locator('.code-area').inputValue();
    expect(text).toContain(`create table ${name} (`);
    expect(text).not.toContain('CREATE TABLE'); expect(text).toContain('Column documentation');
    await page.reload(); const reopened = await open(page);
    await expect(reopened.locator('.ddl-options select').nth(1)).toHaveValue(style);
    await expect(reopened.locator('.ddl-options > .opt-check input').nth(0)).not.toBeChecked();
    await expect(reopened.locator('.code-area')).toHaveValue(text);
    expect(await savedSchema(page)).toEqual(before);
  });
}

test('DDL include switches remove and restore comments indexes foreign keys and domain annotations independently', async ({ page }) => {
  const before = await savedSchema(page), modal = await open(page);
  const checks = modal.locator('.ddl-options > .opt-check input');
  const fragments = ['Column documentation', 'CREATE INDEX', 'FOREIGN KEY', '-- domain: identity_domain'];
  const text = () => modal.locator('.code-area').inputValue();
  for (let i = 0; i < fragments.length; i++) {
    await checks.nth(i + 1).check();
  }
  const baseline = await text();
  for (const fragment of fragments) expect(baseline).toContain(fragment);
  for (let i = 0; i < fragments.length; i++) {
    await checks.nth(i + 1).uncheck();
    await expect.poll(text).not.toContain(fragments[i]);
    for (let j = 0; j < fragments.length; j++) if (j !== i) expect(await text()).toContain(fragments[j]);
    await checks.nth(i + 1).check(); await expect.poll(text).toBe(baseline);
  }
  expect(await savedSchema(page)).toEqual(before);
  await page.reload(); const reopened = await open(page);
  await expect(reopened.locator('.code-area')).toHaveValue(baseline);
  expect(await savedSchema(page)).toEqual(before);
});
