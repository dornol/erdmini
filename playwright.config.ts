import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/server/**', '**/startup/**', '**/docker/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Local IndexedDB-backed flows are more representative and less flaky when
  // each test gets the browser process to itself.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PUBLIC_STORAGE_MODE: 'local',
    },
  },
});
