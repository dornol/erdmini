import { test, expect, type BrowserContext, type Page } from 'playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema, savedCanvas } from './helpers/local-schema';

async function index(page: Page): Promise<{ activeProjectId: string; projects: { id: string; name: string }[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('erdmini'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<{ activeProjectId: string; projects: { id: string; name: string }[] }>((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').get('index'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}
const projectData = (model: ERDSchema | undefined) => model && Object.fromEntries(['tables', 'domains', 'memos', 'schemas', 'dbObjects', 'dbObjectCategories'].map(field => [field, model[field as keyof ERDSchema]]));
async function viewport(page: Page) {
  return page.locator('.canvas-world').evaluate(node => { const value = new DOMMatrix(getComputedStyle(node).transform); return { x: value.m41, y: value.m42, scale: value.a }; });
}

test('closing every tab and restarting the browser retains independent projects, native metadata, snapshots and viewport, then persists another edit', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const directory = await mkdtemp(join(tmpdir(), 'erdmini-durability-profile-'));
  let context: BrowserContext | undefined;
  const launch = async () => {
    context = await browser.browserType().launchPersistentContext(directory, { headless: true, locale: 'en-US', viewport: { width: 1440, height: 1000 } });
    const page = context.pages()[0] ?? await context.newPage(); page.setDefaultTimeout(10_000); await page.goto(baseURL!); return page;
  };
  try {
    let page = await launch();
    await page.getByTestId('create-project').click();
    await page.getByTestId('project-menu-toggle').click(); await page.getByTestId('project-rename').click();
    await page.locator('.project-rename-input').fill('Durable A'); await page.locator('.project-rename-input').press('Enter');
    const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const schema: ERDSchema = { version: '1', dialect: 'postgresql', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemas: ['core', 'reporting'],
      domains: [{ ...flags, id: 'amount-domain', name: 'amount_domain', type: 'NUMERIC', length: 12, scale: 0 }],
      tables: [
        { id: 'accounts', name: 'accounts', schema: 'core', comment: 'Retain table metadata', position: { x: 100, y: 150 }, foreignKeys: [], uniqueKeys: [], indexes: [], columns: [
          { ...flags, id: 'id', name: 'id', type: 'INT', primaryKey: true },
          { ...flags, id: 'amount', name: 'amount', type: 'NUMERIC', length: 12, scale: 0, domainId: 'amount-domain', defaultValue: '0', comment: 'Retain zero scale' },
          { ...flags, id: 'state', name: 'state', type: 'ENUM', enumValues: ["O'Brien", 'comma,value', '완료', ''] },
        ] },
        { id: 'orders', name: 'orders', schema: 'reporting', position: { x: 500, y: 150 }, columns: [{ ...flags, id: 'account_id', name: 'account_id', type: 'INT' }], uniqueKeys: [], indexes: [], foreignKeys: [{ id: 'account_fk', columnIds: ['account_id'], referencedTableId: 'accounts', referencedColumnIds: ['id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }] },
      ], memos: [{ id: 'note', content: 'Retain memo across shutdown', color: 'pink', width: 180, height: 100, schema: 'core', position: { x: 100, y: 400 } }],
      dbObjectCategories: ['Views'], dbObjects: [{ id: 'account_view', name: 'account_view', category: 'Views', schema: 'core', sql: 'SELECT id FROM accounts;', includeInDdl: true }],
    };
    await importSchema(page, schema);
    await expect.poll(async () => projectData(await savedSchema(page))).toEqual(projectData(schema));
    const a = (await index(page)).activeProjectId;
    const original = projectData(await savedSchema(page));
    await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
    const panel = page.locator('.snapshot-panel'); await panel.locator('.snapshot-input').first().fill('Durable snapshot'); await panel.locator('.snapshot-save-btn').click();
    await expect(panel.locator('.snapshot-item')).toContainText('Durable snapshot'); await panel.locator('.snapshot-close').click();
    await page.getByTestId('project-menu-toggle').click(); await page.getByTestId('project-new').click();
    await page.locator('.project-new-row input').fill('Durable B'); await page.locator('.project-new-row input').press('Enter');
    await page.getByTestId('empty-add-table').click(); await page.getByTestId('table-name-input').fill('independent_archive'); await page.getByTestId('table-name-input').press('Enter');
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe('independent_archive');
    const b = (await index(page)).activeProjectId, independent = projectData(await savedSchema(page));
    await page.getByTestId('project-menu-toggle').click();
    await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: /^Durable A$/ }) }).locator('.project-item-name').click();
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } }); await page.keyboard.press('+'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
    const expectedViewport = await viewport(page);
    await expect.poll(async () => { const saved = await savedCanvas(page); return saved ? Math.max(Math.abs(saved.x - expectedViewport.x), Math.abs(saved.y - expectedViewport.y), Math.abs(saved.scale - expectedViewport.scale)) : Infinity; }).toBeLessThan(0.0001);
    const verify = async () => {
      await expect(page.getByTestId('project-menu-toggle')).toContainText('Durable A'); await expect(page.getByTestId('table-card')).toHaveCount(2);
      expect((await index(page)).activeProjectId).toBe(a);
      expect((await index(page)).projects.map(p => ({ id: p.id, name: p.name }))).toEqual([{ id: a, name: 'Durable A' }, { id: b, name: 'Durable B' }]);
      expect(projectData(await savedSchema(page, a))).toEqual(original); expect(projectData(await savedSchema(page, b))).toEqual(independent);
      await expect.poll(async () => { const value = await viewport(page); return Math.max(Math.abs(value.x - expectedViewport.x), Math.abs(value.y - expectedViewport.y), Math.abs(value.scale - expectedViewport.scale)); }).toBeLessThan(0.0001);
      await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
      await expect(page.locator('.snapshot-panel .snapshot-item')).toContainText('Durable snapshot'); await page.locator('.snapshot-close').click();
    };
    // Closing the only page is a different lifecycle from page.reload().
    await page.close(); page = await context!.newPage(); page.setDefaultTimeout(10_000); await page.goto(baseURL!); await verify();
    // Shut down the actual Chromium process, then reopen its isolated disk profile.
    await context!.close(); context = undefined; page = await launch(); await verify();
    await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^accounts$/ }) }).click();
    await page.getByTestId('table-name-input').fill('accounts_after_restart'); await page.getByTestId('table-name-input').press('Enter');
    await expect.poll(async () => (await savedSchema(page, a))?.tables[0]?.name).toBe('accounts_after_restart');
    const edited = projectData(await savedSchema(page, a));
    await context!.close(); context = undefined; page = await launch();
    await expect(page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^accounts_after_restart$/ }) })).toBeVisible();
    expect(projectData(await savedSchema(page, a))).toEqual(edited); expect(projectData(await savedSchema(page, b))).toEqual(independent);
    expect((await savedSchema(page, a))?.tables[1].foreignKeys[0]).toEqual(schema.tables[1].foreignKeys[0]);
  } finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
});
