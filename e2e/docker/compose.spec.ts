import { availablePort } from '../helpers/available-port';
import { waitForDeployedTable } from '../helpers/deployed-storage';
import { assertProductionMcp } from '../helpers/production-mcp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'playwright/test';

const exec = promisify(execFile);
for (const local of [false, true]) {
  test(`Compose ${local ? 'local profile' : 'server'} starts the configured service and persists UI data after restart`, async ({ page }) => {
    const project = `erdmini-e2e-${randomUUID()}`, directory = await mkdtemp(join(tmpdir(), 'erdmini-compose-'));
    const service = local ? 'erdmini-local' : 'erdmini', envFile = join(directory, 'test.env'), config = join(directory, 'compose.yml');
    // Preserve the checked-in services, profiles, mounts and commands. Relocate
    // only path references and environment values to this isolated test project.
    const source = await readFile('docker-compose.yml', 'utf8');
    const relocated = source.replaceAll('context: .', `context: ${JSON.stringify(resolve('.'))}`).replace('env_file: .env', `env_file: ${JSON.stringify(envFile)}`);
    await writeFile(config, relocated); await writeFile(envFile, 'PORT=3000\nADMIN_USERNAME=compose_admin\nADMIN_PASSWORD=compose-password\n');
    const hostPort = await availablePort();
    const compose = async (...args: string[]) => (await exec('docker', ['compose', '--project-name', project, '--env-file', envFile, '-f', config, ...(local ? ['--profile', 'local'] : []), ...args], { env: { ...process.env, PORT: String(hostPort) }, timeout: 720_000, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
    let attempted = false;
    try {
      attempted = true; await compose('up', '-d', '--build', service);
      const binding = await compose('port', service, local ? '80' : '3000');
      const port = binding.split('\n')[0].split(':').at(-1), url = `http://127.0.0.1:${port}`;
      const ready = async () => {
        await expect.poll(async () => { try { return (await fetch(`${url}/${local ? '' : 'login'}`, { signal: AbortSignal.timeout(5_000) })).status; } catch { return 0; } }, { timeout: 90_000, intervals: [500] }).toBe(200);
      };
      await ready(); await page.goto(url);
      if (!local) {
        await page.locator('#username').fill('compose_admin'); await page.locator('#password').fill('compose-password');
        await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).toHaveURL(`${url}/`);
      }
      await page.getByTestId('create-project').click(); await page.getByTestId('empty-add-table').click();
      await page.getByTestId('table-name-input').fill('compose_saved'); await page.getByTestId('table-name-input').press('Enter');
      await waitForDeployedTable(page, url, local, 'compose_saved');
      await page.reload(); await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('compose_saved');
      await compose('restart', service); await ready(); await page.reload();
      await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('compose_saved');
      if (!local) {
        await assertProductionMcp(page.request, url);
        const context = await page.context().browser()!.newContext();
        try {
          const fresh = await context.newPage(); await fresh.goto(`${url}/login`);
          await fresh.locator('#username').fill('compose_admin'); await fresh.locator('#password').fill('compose-password');
          await fresh.getByRole('button', { name: /sign in/i }).click();
          await expect(fresh.getByTestId('table-card').locator('.table-name')).toHaveText('compose_saved');
        } finally { await context.close(); }
      }
    } finally {
      try { if (attempted) await compose('down', '--volumes', '--rmi', 'local', '--remove-orphans'); }
      finally { await rm(directory, { recursive: true, force: true }); }
    }
  });
}
