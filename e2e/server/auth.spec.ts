import { expect, test } from 'playwright/test';

test.describe('server-mode authentication', () => {
  test('redirects unauthenticated users to the login page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#username').fill('e2e-admin');
    await page.locator('#password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('.error')).toBeVisible();
  });

  test('logs in with the configured admin account', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#username').fill('e2e-admin');
    await page.locator('#password').fill('e2e-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('create-project')).toBeVisible({ timeout: 15_000 });
  });
});
