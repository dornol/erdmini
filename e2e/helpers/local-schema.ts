import { expect, type Page } from 'playwright/test';
import type { ERDSchema } from '../../src/lib/types/erd';
import type { CanvasData } from '../../src/lib/storage/types';

export async function importSchema(page: Page, schema: ERDSchema) {
  await page.getByTestId('import-menu-toggle').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
  await (await chooser).setFiles({
    name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(schema)),
  });
  await expect(page.getByTestId('table-card')).toHaveCount(schema.tables.length);
}

async function savedRecord(page: Page, storeName: 'schemas' | 'canvas', projectId?: string): Promise<unknown> {
  return page.evaluate(async ({ storeName, projectId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('erdmini');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(['projects', storeName]);
        const index = transaction.objectStore('projects').get('index');
        index.onerror = () => reject(index.error);
        index.onsuccess = () => {
          const id = projectId ?? index.result?.activeProjectId;
          if (!id) return resolve(undefined);
          const request = transaction.objectStore(storeName).get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        };
      });
    } finally {
      db.close();
    }
  }, { storeName, projectId });
}

export async function savedSchema(page: Page, projectId?: string): Promise<ERDSchema | undefined> {
  return await savedRecord(page, 'schemas', projectId) as ERDSchema | undefined;
}

export async function savedCanvas(page: Page, projectId?: string): Promise<CanvasData | undefined> {
  return await savedRecord(page, 'canvas', projectId) as CanvasData | undefined;
}
