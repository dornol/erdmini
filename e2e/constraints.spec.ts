import { expect, test, type Page } from 'playwright/test';
import { savedSchema } from './helpers/local-schema';

async function waitForSavedConstraints(page: Page, kind: 'unique' | 'index', count: number) {
  await expect.poll(async () => {
    const table = (await savedSchema(page))?.tables[0];
    return table ? (kind === 'unique' ? table.uniqueKeys : table.indexes)?.length ?? 0 : -1;
  }).toBe(count);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await page.getByTestId('empty-add-table').click();
  await page.getByTestId('add-column').click();
  await page.getByTestId('column-name-input').fill('email');
  await page.keyboard.press('Escape');
});

for (const kind of ['unique', 'index'] as const) {
  test(`${kind}: validates columns, excludes duplicates, cancels and persists deletion`, async ({ page }) => {
    const editor = page.getByTestId('table-editor');
    const open = editor.getByRole('button', { name: kind === 'unique' ? /add unique/i : /add index/i });
    const rows = editor.locator(kind === 'unique' ? '.uk-section .fk-row' : '.idx-section .fk-row');
    const modal = page.locator('.modal[role="dialog"]');
    await open.click();
    await expect(modal.locator('.btn-submit')).toBeDisabled();
    await modal.locator('#constraint-name').fill('email_constraint');
    await modal.locator('.ss-trigger').first().click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^email$/ }).click();
    if (kind === 'unique') {
      await expect(modal.locator('.btn-submit')).toBeDisabled();
      await modal.locator('.btn-add-col').click();
      await modal.locator('.ss-trigger').nth(1).click();
      await expect(page.locator('.ss-dropdown .ss-item').filter({ hasText: /^email$/ })).toHaveCount(0);
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
      await expect(modal.locator('.btn-submit')).toBeEnabled();
      await modal.locator('.btn-remove-col').nth(1).click();
      await expect(modal.locator('.btn-submit')).toBeDisabled();
      await modal.locator('.btn-add-col').click();
      await modal.locator('.ss-trigger').nth(1).click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
    } else {
      await modal.locator('.btn-add-col').click();
      await modal.locator('.btn-remove-col').first().click();
      await expect(modal.locator('.btn-submit')).toBeDisabled();
      await modal.locator('.ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^email$/ }).click();
    }
    await expect(modal.locator('.btn-submit')).toBeEnabled();
    await modal.getByRole('button', { name: /cancel/i }).click();
    await expect(rows).toHaveCount(0);

    // Reopening must discard the cancelled draft.
    await open.click();
    await expect(modal.locator('#constraint-name')).toHaveValue('');
    await expect(modal.locator('.btn-submit')).toBeDisabled();
    await modal.locator('#constraint-name').fill('saved_constraint');
    await modal.locator('.ss-trigger').first().click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^email$/ }).click();
    if (kind === 'unique') {
      await modal.locator('.btn-add-col').click();
      await modal.locator('.ss-trigger').nth(1).click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^id$/ }).click();
    }
    await modal.locator('.btn-submit').click();
    await expect(rows).toContainText('saved_constraint');
    await waitForSavedConstraints(page, kind, 1);
    await page.reload();
    await page.getByTestId('table-card').click();
    await expect(rows).toContainText('saved_constraint');
    await rows.locator('button.del').click();
    await expect(rows).toHaveCount(0);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(rows).toContainText('saved_constraint');
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(rows).toHaveCount(0);
    await waitForSavedConstraints(page, kind, 0);
    await page.reload();
    await page.getByTestId('table-card').click();
    await expect(rows).toHaveCount(0);
  });
}

test('cancelling table deletion preserves its columns after reload', async ({ page }) => {
  const table = page.getByTestId('table-card');
  await table.hover();
  await table.getByTestId('delete-table').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
  await expect(table).toHaveCount(1);
  await waitForSavedConstraints(page, 'unique', 0);
  await page.reload();
  await table.click();
  await expect(page.getByTestId('column-row')).toHaveCount(2);
  await expect(page.getByTestId('column-row').nth(1)).toContainText('email');
});
