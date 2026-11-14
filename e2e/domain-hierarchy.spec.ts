import { expect, test, type Page } from 'playwright/test';
import * as XLSX from 'xlsx';
import { readFile } from 'node:fs/promises';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  const flags = { type: 'VARCHAR' as const, nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  return {
    version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), memos: [],
    domains: [
      { ...flags, id: 'root', name: 'base_label', length: 80 },
      { ...flags, id: 'child', name: 'child_label', parentId: 'root' },
      { ...flags, id: 'grandchild', name: 'short_label', parentId: 'child', length: 40 },
      { ...flags, id: 'alternate', name: 'alternate_label', length: 120 },
    ],
    tables: ['root', 'child', 'grandchild'].map((domainId, i) => ({
      id: `table_${domainId}`, name: `table_${domainId}`, position: { x: 70 + i * 290, y: 150 }, foreignKeys: [],
      columns: [{ ...flags, id: `column_${domainId}`, name: 'label', length: i === 2 ? 40 : 80, domainId }],
    })),
  };
}
async function openDomains(page: Page) {
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
  return page.locator('.backdrop[role="dialog"]');
}
async function lengths(page: Page) {
  return (await savedSchema(page))?.tables.map(t => t.columns[0].length);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.domains.length).toBe(4);
});

test('parent selection excludes self and descendants and cancelling keeps the hierarchy intact', async ({ page }) => {
  const original = await savedSchema(page);
  const dialog = await openDomains(page);
  await dialog.locator('tr.display-row').filter({ hasText: 'base_label' }).click();
  const form = dialog.locator('.edit-card');
  const parents = form.getByRole('combobox', { name: 'Parent Domain', exact: true });
  await expect(parents.locator('option')).toHaveText(['(none)', 'alternate_label']);
  await form.locator('.edit-btn-cancel').click();
  await dialog.locator('tr.display-row').filter({ hasText: 'child_label' }).click();
  await expect(parents.locator('option')).toHaveText(['(none)', 'base_label', 'alternate_label']);
  await parents.selectOption('alternate');
  await form.locator('.edit-btn-cancel').click();
  expect(await savedSchema(page)).toEqual(original);
  await page.reload();
  expect((await savedSchema(page))?.domains.map(d => d.parentId)).toEqual([undefined, 'root', 'child', undefined]);
});

test('parent edits preview inherited descendant changes and preserve explicit child overrides after confirmation', async ({ page }) => {
  const dialog = await openDomains(page);
  await dialog.locator('tr.display-row').filter({ hasText: 'base_label' }).click();
  const form = dialog.locator('.edit-card');
  await form.getByLabel('Length', { exact: true }).fill('160');
  await form.locator('.edit-btn-save').click();
  const impact = page.getByRole('alertdialog');
  await expect(impact).toContainText('Affects 2 column(s) in 2 table(s)');
  await expect(impact).toContainText('table_root.label');
  await expect(impact).toContainText('table_child.label');
  await expect(impact).not.toContainText('table_grandchild.label');
  await impact.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await lengths(page)).toEqual([80, 80, 40]);
  await form.locator('.edit-btn-save').click();
  await impact.getByRole('button', { name: 'Propagate changes?', exact: true }).click();
  await expect.poll(() => lengths(page)).toEqual([160, 160, 40]);
  await page.reload();
  expect(await lengths(page)).toEqual([160, 160, 40]);
  expect((await savedSchema(page))?.domains.find(d => d.id === 'child')?.length).toBeUndefined();
});

test('changing a parent previews effective inherited values and cancellation preserves the old parent', async ({ page }) => {
  const dialog = await openDomains(page);
  await dialog.locator('tr.display-row').filter({ hasText: 'child_label' }).click();
  const form = dialog.locator('.edit-card');
  await form.getByRole('combobox', { name: 'Parent Domain', exact: true }).selectOption('alternate');
  await form.locator('.edit-btn-save').click();
  const impact = page.getByRole('alertdialog');
  await expect(impact).toContainText('Affects 1 column(s) in 1 table(s)');
  await expect(impact).toContainText('80 → 120');
  await impact.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await savedSchema(page))?.domains.find(d => d.id === 'child')?.parentId).toBe('root');
  expect(await lengths(page)).toEqual([80, 80, 40]);
  await form.locator('.edit-btn-save').click();
  await impact.getByRole('button', { name: 'Propagate changes?', exact: true }).click();
  await expect.poll(() => lengths(page)).toEqual([80, 120, 40]);
  await page.reload();
  expect((await savedSchema(page))?.domains.find(d => d.id === 'child')?.parentId).toBe('alternate');
  expect(await lengths(page)).toEqual([80, 120, 40]);
});

for (const target of ['middle', 'root'] as const) {
  test(`${target} domain deletion reparents descendants, recomputes inherited fields and supports cancel/undo/redo/reload`, async ({ page }) => {
    const schema = fixture();
    schema.domains[2].length = undefined;
    if (target === 'middle') schema.domains[1].length = 120;
    schema.tables[1].columns[0].length = target === 'middle' ? 120 : 80;
    schema.tables[2].columns[0].length = target === 'middle' ? 120 : 80;
    await page.getByTestId('import-menu-toggle').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'hierarchy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(schema)) });
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(() => lengths(page)).toEqual(target === 'middle' ? [80, 120, 120] : [80, 80, 80]);
    const original = await savedSchema(page);
    const dialog = await openDomains(page);
    const name = target === 'middle' ? 'child_label' : 'base_label';
    const victim = target === 'middle' ? 'child' : 'root';
    const row = dialog.locator('tr.display-row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Delete domain', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await savedSchema(page)).toEqual(original);
    await row.getByRole('button', { name: 'Delete domain', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    const expectedLengths = target === 'middle' ? [80, 120, 80] : [80, undefined, undefined];
    await expect.poll(() => lengths(page)).toEqual(expectedLengths);
    const deleted = await savedSchema(page);
    expect(deleted?.domains.some(d => d.id === victim)).toBe(false);
    expect(deleted?.domains.some(d => d.parentId === victim)).toBe(false);
    expect(deleted?.domains.find(d => d.id === (target === 'middle' ? 'grandchild' : 'child'))?.parentId).toBe(target === 'middle' ? 'root' : undefined);
    expect(deleted?.tables[target === 'middle' ? 1 : 0].columns[0].domainId).toBeUndefined();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains).toEqual(original?.domains);
    expect((await savedSchema(page))?.tables).toEqual(original?.tables);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(() => lengths(page)).toEqual(expectedLengths);
    await page.reload();
    expect(await lengths(page)).toEqual(expectedLengths);
    expect((await savedSchema(page))?.domains).toEqual(deleted?.domains);
  });
}

for (const bookType of ['xlsx', 'xls'] as const) {
  test(`${bookType} workbook reimport preserves hierarchy identities and inherited column overrides through undo, redo and reload`, async ({ page }) => {
    const original = (await savedSchema(page))!;
    let dialog = await openDomains(page);
    const downloadEvent = page.waitForEvent('download');
    await dialog.locator('button[title="Download Excel"]').click();
    const download = await downloadEvent;
    const workbook = XLSX.read(await readFile((await download.path())!));
    const upload = async (book: XLSX.WorkBook) => {
      await dialog.locator('input[type="file"]').setInputFiles({ name: `hierarchy.${bookType}`, mimeType: 'application/octet-stream', buffer: XLSX.write(book, { type: 'buffer', bookType: bookType === 'xls' ? 'biff8' : 'xlsx' }) });
      await expect(dialog).toContainText(/0 added.*4 updated/i);
      await expect(dialog.locator('tr.display-row')).toHaveCount(4);
    };
    // A physical-domain workbook leaves existing parent relationships intact.
    await upload(workbook);
    expect((await savedSchema(page))?.domains).toEqual(original.domains);
    expect((await savedSchema(page))?.tables).toEqual(original.tables);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]]);
    const root = rows.find(row => row.Name === 'base_label')!;
    root.Length = 160;
    root.Description = 'Updated through workbook';
    workbook.Sheets[workbook.SheetNames[0]] = XLSX.utils.json_to_sheet(rows);
    // Reset the identical status before the second upload so it cannot satisfy
    // the completion assertion for a still-pending file read.
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    dialog = await openDomains(page);
    await upload(workbook);
    await expect.poll(() => lengths(page)).toEqual([160, 160, 40]);
    const imported = (await savedSchema(page))!;
    expect(imported.domains).toEqual(original.domains.map(domain => domain.id === 'root' ? { ...domain, length: 160, description: 'Updated through workbook' } : domain));
    expect(imported.tables).toEqual(original.tables.map(table => ({ ...table, columns: table.columns.map(column => ({ ...column, length: column.domainId === 'grandchild' ? 40 : 160 })) })));
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains).toEqual(original.domains);
    expect((await savedSchema(page))?.tables).toEqual(original.tables);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(() => lengths(page)).toEqual([160, 160, 40]);
    await page.reload();
    expect((await savedSchema(page))?.domains).toEqual(imported.domains);
    expect((await savedSchema(page))?.tables).toEqual(imported.tables);
    const reopened = await openDomains(page);
    await reopened.locator('tr.display-row').filter({ hasText: 'child_label' }).click();
    const form = reopened.locator('.edit-card');
    await expect(form.getByRole('combobox', { name: 'Parent Domain', exact: true })).toHaveValue('root');
    await expect(form.getByLabel('Length', { exact: true })).toHaveValue('');
  });
}
