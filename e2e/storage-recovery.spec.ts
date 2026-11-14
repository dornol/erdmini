import { expect, test } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import { importSchema, savedSchema } from './helpers/local-schema';
import type { ERDSchema } from '../src/lib/types/erd';

for (const dismiss of [false, true]) {
  test(`quota failure preserves persisted schema and emergency backup, then recovers with banner ${dismiss ? 'dismissed' : 'visible'}`, async ({ page }) => {
    await page.goto('/'); await page.getByTestId('create-project').click();
    const schema: ERDSchema = {
      version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), domains: [],
      tables: [{ id: 'users', name: 'users', position: { x: 100, y: 100 }, columns: [{ id: 'id', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: true }], foreignKeys: [], uniqueKeys: [], indexes: [], comment: 'Retain metadata' }],
      memos: [{ id: 'memo', content: '보존할 메모', attachedTableId: 'users', position: { x: 120, y: 300 }, width: 200, height: 100 }],
      dbObjectCategories: ['Views'], dbObjects: [{ id: 'view', name: 'users_view', category: 'Views', sql: 'SELECT id FROM users;' }],
    };
    await importSchema(page, schema); await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe('users');
    const persisted = await savedSchema(page);
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'schemas') throw new DOMException('Simulated storage quota', 'QuotaExceededError');
        return original.apply(this, args);
      };
      (window as unknown as { restoreSchemaWrites: () => void }).restoreSchemaWrites = () => { IDBObjectStore.prototype.put = original; };
    });
    const rename = async (name: string) => {
      if (!await page.getByTestId('table-name-input').isVisible()) await page.locator('.table-name').dblclick();
      await page.getByTestId('table-name-input').fill(name); await page.getByTestId('table-name-input').press('Enter');
    };
    await rename('unsaved_users'); await expect(page.locator('.storage-banner')).toBeVisible();
    expect(await savedSchema(page)).toEqual(persisted);
    await page.keyboard.press('+'); await expect(page.locator('.storage-banner')).toBeVisible();
    const download = page.waitForEvent('download'); await page.locator('.storage-export-btn').click(); const file = await download;
    expect(file.suggestedFilename()).toBe('erdmini-backup.json');
    const backup = JSON.parse(await readFile((await file.path())!, 'utf8')) as ERDSchema;
    expect(backup.tables).toEqual([{ ...schema.tables[0], name: 'unsaved_users' }]); expect(backup.memos).toEqual(schema.memos); expect(backup.dbObjects).toEqual(schema.dbObjects);
    if (dismiss) { await page.locator('.storage-close-btn').click(); await expect(page.locator('.storage-banner')).toHaveCount(0); }
    await page.evaluate(() => (window as unknown as { restoreSchemaWrites: () => void }).restoreSchemaWrites());
    await rename('recovered_users'); await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe('recovered_users'); await expect(page.locator('.storage-banner')).toHaveCount(0);
    await page.reload(); await expect(page.locator('.table-name')).toHaveText('recovered_users'); const recovered = await savedSchema(page);
    expect(recovered!.memos).toEqual(schema.memos); expect(recovered!.dbObjects).toEqual(schema.dbObjects); expect(recovered!.tables[0]).toEqual({ ...schema.tables[0], name: 'recovered_users' });
  });
}
