import { defineConfig, devices } from 'playwright/test';

// Run separately from local/server suites: Vite generates shared project files.
export default defineConfig({
  testDir: './e2e/startup', workers: 1, fullyParallel: false,
  timeout: 240_000, retries: 0,
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
