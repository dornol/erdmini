import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { TABLE_COLORS, TABLE_COLOR_IDS } from '../src/lib/constants/table-colors';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return { version: '1', domains: [], groupColors: { Core: 'blue', Other: 'green' },
    tables: [{ id: 'users', name: 'users', group: 'Core', comment: 'Preserved comment', position: { x: 120, y: 180 }, columns: [{ id: 'id', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }], foreignKeys: [], uniqueKeys: [], indexes: [] }],
    memos: [{ id: 'note', content: 'First line preview\nSecond line is not a preview', color: 'pink', position: { x: 450, y: 180 }, width: 220, height: 140 }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
const card = (page: Page) => page.getByTestId('table-card');
async function openColors(page: Page) {
  await card(page).locator('.table-name').dblclick();
  await page.locator('.cg-header').click();
}
async function headerColor(page: Page, hex: string) {
  const rgb = hex.match(/\w\w/g)!.map(v => parseInt(v, 16));
  await expect(card(page).locator('.table-header')).toHaveCSS('background-color', `rgb(${rgb.join(', ')})`);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.getByTestId('create-project').click();
});

for (const color of TABLE_COLOR_IDS) {
  test(`table palette ${color} overrides group color and clears with undo redo and reload`, async ({ page }) => {
    await importSchema(page, fixture());
    await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(1);
    const before = (await savedSchema(page))!;
    await openColors(page);
    const picker = page.locator('.color-group-section .color-dots');
    await expect(picker.locator('.color-dot')).toHaveCount(15);
    await picker.getByTitle(color, { exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.color).toBe(color);
    await headerColor(page, TABLE_COLORS[color].themes.modern.headerBg);
    await expect(picker.getByTitle(color, { exact: true })).toHaveClass(/active/);
    const colored = (await savedSchema(page))!;
    expect(colored.tables).toEqual([{ ...before.tables[0], color }]);
    expect(colored.memos).toEqual(before.memos); expect(colored.groupColors).toEqual(before.groupColors);
    await picker.getByTitle('None', { exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.color).toBeUndefined();
    await expect(page.locator('.color-inherited-hint')).toHaveText('Using group color');
    await headerColor(page, TABLE_COLORS.blue.themes.modern.headerBg);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.color).toBe(color);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.color).toBeUndefined();
    await page.reload(); await headerColor(page, TABLE_COLORS.blue.themes.modern.headerBg);
    const after = (await savedSchema(page))!;
    expect(after.tables).toEqual(before.tables); expect(after.memos).toEqual(before.memos);
  });
}

test('table group change trims names, changes inherited color and can clear membership', async ({ page }) => {
  await importSchema(page, fixture()); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(1);
  const before = (await savedSchema(page))!; await openColors(page);
  await page.locator('#tbl-group').fill('  Other  '); await page.locator('#tbl-group').blur();
  await expect.poll(async () => (await savedSchema(page))?.tables[0]?.group).toBe('Other');
  await headerColor(page, TABLE_COLORS.green.themes.modern.headerBg);
  expect((await savedSchema(page))!.tables).toEqual([{ ...before.tables[0], group: 'Other' }]);
  await page.locator('#tbl-group').fill(''); await page.locator('#tbl-group').blur();
  await expect.poll(async () => (await savedSchema(page))?.tables[0]?.group).toBeUndefined();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0]?.group).toBe('Other');
  await page.reload(); await headerColor(page, TABLE_COLORS.green.themes.modern.headerBg);
  const after = (await savedSchema(page))!;
  expect(after.tables).toEqual([{ ...before.tables[0], group: 'Other' }]);
  expect(after.groupColors).toEqual({ Other: 'green' }); expect(after.memos).toEqual(before.memos);
});

for (const entry of [
  { label: 'multiline', content: 'First line preview\nSecond line is not a preview', preview: 'First line preview' },
  { label: 'long Unicode', content: '가'.repeat(35), preview: '가'.repeat(30) },
  { label: 'empty first line', content: '\nSecond line', preview: 'Type memo here...' },
  { label: 'empty memo', content: '', preview: 'Type memo here...' },
]) {
  test(`sidebar memo ${entry.label} preview selects, deletes and restores the exact memo`, async ({ page }) => {
    const model = fixture(); model.memos![0].content = entry.content;
    await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.memos?.length).toBe(1);
    const before = (await savedSchema(page))!, row = page.locator('.memo-item');
    await expect(row.locator('.memo-preview')).toHaveText(entry.preview);
    await expect(row.locator('.item-color-dot')).toHaveCSS('background-color', 'rgb(244, 114, 182)');
    await row.click(); await expect(row).toHaveClass(/active/);
    await expect(page.getByTestId('memo-card')).toHaveClass(/selected/);
    expect(await savedSchema(page)).toEqual(before);
    await row.locator('.memo-delete-btn').click();
    await expect(row).toHaveCount(0); await expect(page.getByTestId('memo-card')).toHaveCount(0);
    await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([]);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(row.locator('.memo-preview')).toHaveText(entry.preview);
    await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(before.memos);
    await page.reload(); await expect(row.locator('.memo-preview')).toHaveText(entry.preview);
    const after = (await savedSchema(page))!;
    expect(after.memos).toEqual(before.memos); expect(after.tables).toEqual(before.tables);
  });
}
