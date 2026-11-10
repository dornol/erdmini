import { defineConfig, devices } from 'playwright/test';

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
      DB_PATH: `data/playwright-e2e-${process.pid}.db`,
      ADMIN_USERNAME: 'e2e-admin',
      ADMIN_PASSWORD: 'e2e-password',
    },
  },
});
