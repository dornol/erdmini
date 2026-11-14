import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return {
    version: '1', schemas: ['core', 'analytics'], domains: [], memos: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: ['accounts', 'report'].map((name, i) => ({
      id: name, name, schema: i ? 'analytics' : 'core', position: { x: 100 + i * 2200, y: 150 },
      columns: [{ id: `${name}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: i === 0, unique: i === 0, autoIncrement: false }], foreignKeys: [],
    })),
  };
}
async function openTool(page: Page, name: string) {
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).click();
}
async function rename(page: Page, name: string) {
  const input = page.getByTestId('table-name-input');
  await input.fill(name);
  await input.press('Enter');
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe(name);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
});

test('validation navigates to a hidden namespace and updating its column clears the live issue and persists', async ({ page }) => {
  await page.locator('.schema-tab-bar').getByRole('button', { name: 'core', exact: true }).click();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await openTool(page, 'Validate');
  const panel = page.locator('.lint-panel');
  const issue = panel.locator('.lint-item').filter({ hasText: 'Table has no primary key' });
  await expect(issue).toHaveCount(1);
  await expect(issue).toContainText('report');
  await issue.click();
  const report = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^report$/ }) });
  await expect(report).toBeInViewport();
  await expect(page.getByTestId('table-name-input')).toHaveValue('report');
  await panel.locator('.lint-close').click();
  await page.getByTestId('column-row').click();
  const popup = page.getByTestId('column-edit-popup');
  await popup.locator('.flags-row input[type="checkbox"]').first().check();
  await popup.getByRole('button', { name: 'Close', exact: true }).click();
  await openTool(page, 'Validate');
  await expect(panel.locator('.lint-empty')).toHaveText(/No issues found/);
  await expect.poll(async () => (await savedSchema(page))?.tables[1].columns[0].primaryKey).toBe(true);
  await page.reload();
  await openTool(page, 'Validate');
  await expect(panel.locator('.lint-empty')).toHaveText(/No issues found/);
});

test('jumping to the oldest history entry redoes intermediate edits in their original order', async ({ page }) => {
  await page.getByTestId('table-card').filter({ hasText: 'accounts' }).click();
  await rename(page, 'accounts_second');
  await rename(page, 'accounts_third');
  await openTool(page, 'History');
  const panel = page.locator('.history-panel');
  await expect(panel.locator('.history-entry:not(.redo-item)')).toHaveCount(2);
  await panel.locator('.history-entry:not(.redo-item)').last().click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts');
  await expect(panel.locator('.redo-item')).toHaveCount(2);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts_second');
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts_third');
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
  await page.reload();
  expect((await savedSchema(page))?.tables[0].name).toBe('accounts_third');
});

test('editing after undo discards the abandoned future and reload retains the new branch', async ({ page }) => {
  await page.getByTestId('table-card').filter({ hasText: 'accounts' }).click();
  await rename(page, 'accounts_second');
  await rename(page, 'abandoned_future');
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(page.getByTestId('table-name-input')).toHaveValue('accounts_second');
  await openTool(page, 'History');
  const panel = page.locator('.history-panel');
  await expect(panel.locator('.redo-item')).toHaveCount(1);
  await rename(page, 'new_branch');
  await expect(panel.locator('.redo-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts_second');
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('new_branch');
  await page.reload();
  expect((await savedSchema(page))?.tables[0].name).toBe('new_branch');
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
});

test('lint sorts errors before warnings and info and column navigation highlights only the offending hidden column', async ({ page }) => {
  const schema = fixture();
  schema.tables[1].columns.push({ ...schema.tables[1].columns[0], id: 'duplicate_id', name: 'ID' });
  schema.tables.push({ id: 'empty', name: 'empty_table', schema: 'core', position: { x: 200, y: 500 }, columns: [], foreignKeys: [] });
  await page.getByTestId('project-menu-toggle').click();
  await page.getByTestId('project-new').click();
  await page.locator('.project-new-row input').fill('Lint boundary fixture');
  await page.locator('.project-new-row input').press('Enter');
  await expect(page.getByTestId('table-card')).toHaveCount(0);
  await importSchema(page, schema);
  await page.locator('.schema-tab-bar').getByRole('button', { name: 'core', exact: true }).click();
  await openTool(page, 'Validate');
  const panel = page.locator('.lint-panel');
  const items = panel.locator('.lint-item');
  await expect(items).toHaveCount(4);
  expect(await items.evaluateAll(nodes => nodes.map(node => ['error', 'warning', 'info'].find(level => node.classList.contains(`lint-${level}`))))).toEqual(['error', 'warning', 'warning', 'info']);
  const duplicate = panel.locator('.lint-error');
  await expect(duplicate).toContainText('report.ID');
  await duplicate.click();
  await expect(page.locator('.schema-tab-bar').getByRole('button', { name: 'analytics', exact: true })).toHaveClass(/active/);
  await expect(page.getByTestId('table-name-input')).toHaveValue('report');
  const rows = page.getByTestId('column-row');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.column-row[data-column-id=duplicate_id]')).toHaveClass(/lint-highlighted/);
  await expect(page.locator('.column-row[data-column-id=report_id]')).not.toHaveClass(/lint-highlighted/);
  await panel.locator('.lint-close').click();
  await rows.nth(1).click();
  const popup = page.getByTestId('column-edit-popup');
  await popup.getByTestId('column-name-input').fill('report_key');
  await popup.getByRole('button', { name: 'Close', exact: true }).click();
  await openTool(page, 'Validate');
  await expect(panel.locator('.lint-error')).toHaveCount(0);
  await expect(panel.locator('.lint-warning')).toHaveCount(2);
  await expect(panel.locator('.lint-info')).toHaveCount(1);
  await expect.poll(async () => (await savedSchema(page))?.tables.find(table => table.id === 'report')?.columns[1]?.name).toBe('report_key');
  await page.reload();
  await openTool(page, 'Validate');
  await expect(panel.locator('.lint-error')).toHaveCount(0);
  await expect(panel.locator('.lint-item')).toHaveCount(3);
});


test('history future entries jump through intermediate redo steps and allow returning to an earlier saved state', async ({ page }) => {
  await page.getByTestId('table-card').filter({ hasText: 'accounts' }).click();
  await rename(page, 'first_state');
  await rename(page, 'second_state');
  await rename(page, 'third_state');
  await openTool(page, 'History');
  const panel = page.locator('.history-panel');
  await expect(panel.locator('.history-entry:not(.redo-item)')).toHaveCount(3);
  await panel.locator('.history-entry:not(.redo-item)').last().click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts');
  await expect(panel.locator('.redo-item')).toHaveCount(3);
  await panel.locator('.redo-item').nth(1).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('second_state');
  await expect(panel.locator('.redo-item')).toHaveCount(1);
  await expect(panel.locator('.history-entry:not(.redo-item)')).toHaveCount(2);
  await panel.locator('.redo-item').click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('third_state');
  await expect(panel.locator('.redo-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
  await panel.locator('.history-entry:not(.redo-item)').first().click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('second_state');
  await page.reload();
  expect((await savedSchema(page))?.tables[0].name).toBe('second_state');
});

test('history retains exactly 200 edits after overflow and replays every retained state in order', async ({ page }) => {
  test.setTimeout(120_000);
  const original = await savedSchema(page);
  await page.getByTestId('table-card').filter({ hasText: 'accounts' }).click();
  await openTool(page, 'History'); const panel = page.locator('.history-panel');
  const input = page.getByTestId('table-name-input');
  for (let step = 1; step <= 205; step++) {
    await input.fill(`accounts_${step}`); await input.press('Enter');
    await expect(panel.locator('.history-entry:not(.redo-item)')).toHaveCount(Math.min(step, 200));
  }
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts_205');
  await panel.locator('.history-entry:not(.redo-item)').last().click();
  await expect(input).toHaveValue('accounts_5'); await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await expect(panel.locator('.redo-item')).toHaveCount(200);
  for (let step = 6; step <= 205; step++) {
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect(input).toHaveValue(`accounts_${step}`);
  }
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
  await expect(panel.locator('.history-entry:not(.redo-item)')).toHaveCount(200);
  await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('accounts_205');
  const final = await savedSchema(page); expect(final!.tables).toEqual([{ ...original!.tables[0], name: 'accounts_205' }, original!.tables[1]]);
  expect(final!.schemas).toEqual(original!.schemas); expect(final!.domains).toEqual(original!.domains);
  await page.reload(); await expect(page.locator('.table-name').filter({ hasText: /^accounts_205$/ })).toBeVisible();
  expect((await savedSchema(page))!.tables).toEqual(final!.tables); await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
});
