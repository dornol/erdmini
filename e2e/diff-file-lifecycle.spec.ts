import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';
function schema(old = false): ERDSchema {
  const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  return { version: '1', domains: [], memos: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    tables: [{ id: 'users', name: 'users', position: { x: 100, y: 150 }, columns: [{ ...flags, id: 'id', name: 'id', type: 'INT', primaryKey: true }, { ...flags, id: 'amount', name: 'amount', type: 'DECIMAL', length: 12, scale: old ? 2 : 0 }], foreignKeys: [], uniqueKeys: [], indexes: [] },
      { id: old ? 'retired' : 'introduced', name: old ? 'retired' : 'introduced', position: { x: 450, y: 150 }, columns: [{ ...flags, id: 'other_id', name: 'id', type: 'INT', primaryKey: true }], foreignKeys: [], uniqueKeys: [], indexes: [] }],
  };
}
async function open(page: Page) { await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: 'Schema Diff', exact: true }).click(); const modal = page.locator('.modal[role=dialog]'); await modal.locator('.source-tabs').getByRole('button', { name: 'Upload File', exact: true }).click(); return modal; }
async function upload(page: Page, source: string) { const pending = page.waitForEvent('filechooser'); await page.locator('.modal[role=dialog] .btn-upload').click(); await (await pending).setFiles({ name: 'baseline.json', mimeType: 'application/json', buffer: Buffer.from(source) }); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.getByTestId('create-project').click(); await importSchema(page, schema()); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2); });
for (const dialect of ['mysql', 'postgresql', 'mariadb', 'mssql', 'sqlite', 'oracle', 'h2']) {
  test(`${dialect} uploaded diff identifies added removed and changed tables and downloads exact migration without writes`, async ({ page }) => {
    const before = (await savedSchema(page))!, modal = await open(page); await expect(modal.locator('.btn-compare')).toBeDisabled(); await upload(page, JSON.stringify(schema(true))); await expect(modal.locator('.btn-compare')).toBeEnabled(); await modal.locator('.btn-compare').click();
    await expect(modal.locator('.diff-summary')).toHaveText('1 added, 1 removed, 1 modified'); await expect(modal.locator('.diff-added .diff-table-name')).toHaveText('introduced'); await expect(modal.locator('.diff-removed .diff-table-name')).toHaveText('retired'); await expect(modal.locator('.diff-modified')).toContainText('users'); await expect(modal.locator('.diff-modified')).toContainText('amount');
    const modified = modal.locator('.diff-modified'); await modified.locator('.diff-table-header').click(); await expect(modified.locator('.diff-table-body')).toHaveCount(0); await modified.locator('.diff-table-header').click(); await expect(modified.locator('.diff-table-body')).toBeVisible();
    await modal.locator('.dialect-select').selectOption(dialect); await modal.locator('.btn-migration').click(); const preview = modal.locator('.migration-preview'); await expect(preview).toContainText('introduced'); await expect(preview).toContainText('retired'); await expect(preview).toContainText('users'); await expect(preview).toContainText('amount');
    const sql = (await preview.textContent())!; expect(sql).toMatch(/CREATE TABLE/i); expect(sql).toMatch(/DROP TABLE/i); expect(sql).toMatch(/ALTER TABLE/i);
    const pending = page.waitForEvent('download'); await modal.getByRole('button', { name: 'Download', exact: true }).click(); const file = await pending; expect(file.suggestedFilename()).toMatch(new RegExp(`^migration_${dialect}_.*\\.sql$`)); expect(await readFile((await file.path())!, 'utf8')).toBe(sql);
    expect(await savedSchema(page)).toEqual(before); await modal.locator('.close-btn').click(); await page.reload(); expect(await savedSchema(page)).toEqual(before);
  });
}
for (const invalid of ['{bad json', JSON.stringify({ version: '1' })]) {
  test(`invalid diff upload ${invalid.startsWith('{bad') ? 'syntax' : 'missing tables'} leaves schema intact and permits corrected retry`, async ({ page }) => {
    const before = (await savedSchema(page))!, modal = await open(page); await upload(page, invalid); await expect(modal.locator('.upload-error')).toHaveText('Invalid JSON schema file'); await expect(modal.locator('.btn-compare')).toBeDisabled(); expect(await savedSchema(page)).toEqual(before);
    await upload(page, JSON.stringify(schema(true))); await expect(modal.locator('.upload-error')).toHaveCount(0); await modal.locator('.btn-compare').click(); await expect(modal.locator('.diff-summary')).toHaveText('1 added, 1 removed, 1 modified'); expect(await savedSchema(page)).toEqual(before);
    await modal.locator('.close-btn').click(); await page.reload(); expect(await savedSchema(page)).toEqual(before);
  });
}
test('identical diff file has no changes or migration controls and never edits stored data', async ({ page }) => {
  const before = (await savedSchema(page))!, modal = await open(page); await upload(page, JSON.stringify(before)); await modal.locator('.btn-compare').click(); await expect(modal.locator('.diff-no-changes')).toBeVisible(); await expect(modal.locator('.migration-controls')).toHaveCount(0); await expect(modal.locator('.diff-table')).toHaveCount(0); expect(await savedSchema(page)).toEqual(before);
});
