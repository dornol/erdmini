import { expect, test, type Page } from 'playwright/test';

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
});

test.describe('responsive layout', () => {
  test('shows the mobile notice and allows continuing to the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('.mobile-notice')).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByTestId('create-project')).toBeVisible();
  });
});
