import { expect, type Page } from 'playwright/test';
import { savedSchema } from './local-schema';

/** Wait for durable storage, not merely the optimistic table label. */
export async function waitForDeployedTable(page: Page, url: string, local: boolean, name: string) {
  await expect.poll(async () => {
    if (local) return (await savedSchema(page))?.tables.map(table => table.name);
    const indexResponse = await page.request.get(`${url}/api/storage/index`);
    if (!indexResponse.ok()) return undefined;
    const index = await indexResponse.json();
    if (!index.activeProjectId) return undefined;
    const schemaResponse = await page.request.get(`${url}/api/storage/schemas/${index.activeProjectId}`);
    if (!schemaResponse.ok()) return undefined;
    const schema = await schemaResponse.json();
    return schema.tables.map((table: { name: string }) => table.name);
  }).toEqual([name]);
}
