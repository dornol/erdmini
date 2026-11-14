import { defineConfig, devices } from 'playwright/test';
import { fileURLToPath } from 'node:url';

// Keep the isolated DB path identical when Playwright reloads config in workers.
const databasePath = process.env.ERDMINI_E2E_DB_PATH ?? `data/playwright-e2e-${process.pid}.db`;
process.env.ERDMINI_E2E_DB_PATH = databasePath;

export default defineConfig({
  testDir: './e2e/server',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-server',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PUBLIC_STORAGE_MODE: 'server',
      PUBLIC_APP_URL: 'http://127.0.0.1:4174',
      NODE_EXTRA_CA_CERTS: fileURLToPath(new URL('./e2e/fixtures/oidc-cert.pem', import.meta.url)),
      DB_PATH: databasePath,
      ADMIN_USERNAME: 'e2e-admin',
      ADMIN_PASSWORD: 'e2e-password',
    },
  },
});
