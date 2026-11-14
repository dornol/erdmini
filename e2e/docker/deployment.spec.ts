import { availablePort } from '../helpers/available-port';
import { waitForDeployedTable } from '../helpers/deployed-storage';
import { assertProductionMcp } from '../helpers/production-mcp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'playwright/test';

const exec = promisify(execFile);
async function docker(...args: string[]) {
  return (await exec('docker', args, { timeout: 720_000, maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
}

for (const mode of ['local', 'server'] as const) {
  test(`Docker ${mode} deployment serves the application and retains saved schema across container restart`, async ({ page }) => {
    const suffix = randomUUID(), name = `erdmini-e2e-${suffix}`, image = `${name}:test`, volume = `${name}-data`;
    let built = false, created = false, volumeCreated = false;
    try {
      await docker('build', '-f', mode === 'local' ? 'Dockerfile' : 'Dockerfile.server', '-t', image, '.'); built = true;
      const hostPort = await availablePort();
      const args = ['run', '-d', '--name', name, '-p', `127.0.0.1:${hostPort}:${mode === 'local' ? 80 : 3000}`];
      if (mode === 'server') {
        await docker('volume', 'create', volume); volumeCreated = true;
        args.push('-v', `${volume}:/data`, '-e', 'ADMIN_USERNAME=docker_admin', '-e', 'ADMIN_PASSWORD=docker-password');
      }
      args.push(image); await docker(...args); created = true;
      const binding = await docker('port', name, mode === 'local' ? '80/tcp' : '3000/tcp');
      const url = `http://${binding.split('\n')[0]}`;
      const ready = async () => {
        await expect.poll(async () => { try { return (await fetch(`${url}/${mode === 'server' ? 'login' : ''}`, { signal: AbortSignal.timeout(5_000) })).status; } catch { return 0; } }, { timeout: 90_000, intervals: [500] }).toBe(200);
      };
      await ready(); await page.goto(url);
      if (mode === 'server') {
        await page.locator('#username').fill('docker_admin'); await page.locator('#password').fill('docker-password');
        await page.getByRole('button', { name: /sign in/i }).click(); await expect(page).toHaveURL(`${url}/`);
      }
      await page.getByTestId('create-project').click(); await page.getByTestId('empty-add-table').click();
      await page.getByTestId('table-name-input').fill('container_persisted'); await page.getByTestId('table-name-input').press('Enter');
      await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('container_persisted');
      await waitForDeployedTable(page, url, mode === 'local', 'container_persisted');
      // Reload after observing durable storage, before stopping the container.
      await page.reload(); await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('container_persisted');
      await docker('restart', name); await ready(); await page.reload();
      await expect(page.getByTestId('table-card').locator('.table-name')).toHaveText('container_persisted');
      if (mode === 'server') {
        await assertProductionMcp(page.request, url);
        // A fresh browser session reads the shared persisted server database.
        const fresh = await page.context().browser()!.newContext();
        try {
          const peer = await fresh.newPage(); await peer.goto(`${url}/login`);
          await peer.locator('#username').fill('docker_admin'); await peer.locator('#password').fill('docker-password'); await peer.getByRole('button', { name: /sign in/i }).click();
          await expect(peer.getByTestId('table-card').locator('.table-name')).toHaveText('container_persisted');
        } finally { await fresh.close(); }
      } else {
        // Static nginx deployment must return the SPA shell for a deep link.
        const response = await page.request.get(`${url}/deployment/deep-link`);
        expect(response.status()).toBe(200); expect(await response.text()).toContain('<html');
      }
    } finally {
      if (created) await docker('rm', '-f', name);
      if (volumeCreated) await docker('volume', 'rm', volume);
      if (built) await docker('image', 'rm', image);
    }
  });
}
