import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './e2e/docker', workers: 1, fullyParallel: false,
  timeout: 900_000, retries: 0,
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
