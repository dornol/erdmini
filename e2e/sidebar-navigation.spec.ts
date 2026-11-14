import { expect, test } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.getByTestId('create-project').click();
  const model: ERDSchema = { version: '1', domains: [], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: ['zulu', 'alpha', 'middle'].map((name, i) => ({ id: name, name, group: i < 2 ? 'Core' : 'Other', position: { x: 100 + i * 280, y: 150 }, columns: [{ id: `${name}_column`, name: i === 2 ? 'customer_email' : 'id', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false, comment: i === 1 ? 'Searchable billing contact' : '' }], foreignKeys: [], uniqueKeys: [], indexes: [] })),
  };
  await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(3);
});

test('sidebar name sorting and group collapse change visible rows without changing table data', async ({ page }) => {
  const before = await savedSchema(page), names = page.locator('.table-item .item-name');
  await expect(names).toHaveText(['zulu', 'alpha', 'middle']); await page.locator('.search-bar .sort-btn').first().click(); await expect(names).toHaveText(['alpha', 'middle', 'zulu']);
  await page.locator('.search-bar .sort-btn').first().click(); await expect(names).toHaveText(['zulu', 'alpha', 'middle']);
  await page.locator('.search-bar .sort-btn').filter({ hasText: 'Group' }).click();
  const core = page.locator('.group-header').filter({ has: page.locator('.group-label', { hasText: /^Core$/ }) });
  await expect(core.locator('.group-count')).toHaveText('2'); await core.click(); await expect(names).toHaveText(['middle']);
  expect(await savedSchema(page)).toEqual(before); await page.reload();
  await page.locator('.search-bar .sort-btn').filter({ hasText: 'Group' }).click(); await expect(core.locator('.group-chevron')).toHaveClass(/collapsed/); await expect(names).toHaveText(['middle']);
  await core.click(); await expect(names).toHaveText(['zulu', 'alpha', 'middle']); expect(await savedSchema(page)).toEqual(before);
});

test('sidebar column and comment search resolves the matching table and clearing restores all rows', async ({ page }) => {
  const before = await savedSchema(page), search = page.locator('.search-input'), names = page.locator('.table-item .item-name');
  await search.fill('CUSTOMER_EMAIL'); await expect(names).toHaveText(['middle']); await page.locator('.table-item').click();
  await expect(page.getByTestId('table-name-input')).toHaveValue('middle'); await expect(page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^middle$/ }) })).toHaveClass(/selected/);
  await search.fill('BILLING CONTACT'); await expect(names).toHaveText(['alpha']); await page.locator('.table-item').click(); await expect(page.getByTestId('table-name-input')).toHaveValue('alpha');
  await search.fill('unmatched_column'); await expect(names).toHaveCount(0); await expect(page.locator('.empty-hint')).toBeVisible();
  await page.locator('.clear-search').click(); await expect(names).toHaveText(['zulu', 'alpha', 'middle']); expect(await savedSchema(page)).toEqual(before);
  await page.reload(); await expect(names).toHaveText(['zulu', 'alpha', 'middle']); expect(await savedSchema(page)).toEqual(before);
});

test('sidebar width clamps at both limits and restores the final width without schema changes', async ({ page }) => {
  const before = await savedSchema(page), sidebar = page.locator('aside.sidebar');
  const width = () => sidebar.evaluate(el => parseFloat((el as HTMLElement).style.width));
  const resize = async (delta: number) => {
    const handle = sidebar.locator(':scope > .resize-handle'), box = await handle.boundingBox(); if (!box) throw new Error('Sidebar resize handle unavailable');
    const bounds = await sidebar.boundingBox(); const x = Math.min(box.x + box.width / 2, bounds!.x + bounds!.width - 2), y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + delta, y, { steps: 8 }); await page.mouse.up();
  };
  await resize(600); await expect.poll(width).toBe(480); await resize(-400); await expect.poll(width).toBe(180);
  await resize(140); await expect.poll(width).toBe(320);
  expect(await page.evaluate(() => localStorage.getItem('erdmini_sidebar_width'))).toBe('320'); expect(await savedSchema(page)).toEqual(before);
  await page.reload(); await expect.poll(width).toBe(320); expect(await savedSchema(page)).toEqual(before);
});
