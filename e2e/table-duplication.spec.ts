import { expect, test } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier} duplicate preserves namespace and column metadata with fresh IDs and independent edits`, async ({ page }) => {
    await page.goto('/'); await page.getByTestId('create-project').click();
    const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const model: ERDSchema = { version: '1', schemas: ['core'], domains: [{ ...flags, id: 'label', name: 'label_domain', type: 'VARCHAR', length: 80 }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      tables: [{ id: 'users', name: 'users', schema: 'core', group: 'accounts', color: 'pink', comment: 'Retain table metadata', position: { x: 100, y: 150 },
        columns: [{ ...flags, id: 'id', name: 'id', type: 'INT', primaryKey: true, unique: true, autoIncrement: true }, { ...flags, id: 'label_col', name: 'label', type: 'VARCHAR', length: 80, domainId: 'label', defaultValue: "'kept'", check: 'length(label) > 0', comment: '보존할 속성' }],
        foreignKeys: [{ id: 'self', columnIds: ['id'], referencedTableId: 'users', referencedColumnIds: ['id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }], uniqueKeys: [{ id: 'uk', columnIds: ['id', 'label_col'], name: 'original_key' }], indexes: [{ id: 'idx', name: 'original_index', columnIds: ['label_col'], unique: false }] }],
      memos: [{ id: 'memo', content: 'Original attachment', attachedTableId: 'users', position: { x: 100, y: 80 }, width: 180, height: 100 }],
    };
    await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(1); const before = await savedSchema(page);
    await page.locator('.schema-tab-bar').getByRole('button', { name: 'core', exact: true }).click(); await page.getByTestId('table-card').locator('.table-header').click(); await page.keyboard.press(`${modifier}+d`);
    await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2); const after = (await savedSchema(page))!, copy = after.tables[1];
    expect(copy).toMatchObject({ name: 'users_copy', schema: 'core', group: 'accounts', color: 'pink', comment: 'Retain table metadata', foreignKeys: [], uniqueKeys: [], indexes: [] });
    expect(copy.id).not.toBe('users'); expect(new Set([...after.tables[0].columns, ...copy.columns].map(c => c.id)).size).toBe(4);
    expect(copy.columns.map(({ id, ...column }) => column)).toEqual(before!.tables[0].columns.map(({ id, ...column }) => column)); expect(after.tables[0]).toEqual(before!.tables[0]); expect(after.memos).toEqual(before!.memos); expect(after.domains).toEqual(before!.domains);
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await expect(page.getByTestId('table-name-input')).toHaveValue('users_copy'); await page.getByTestId('table-name-input').fill('edited_copy'); await page.getByTestId('table-name-input').press('Enter');
    await expect.poll(async () => (await savedSchema(page))?.tables[1].name).toBe('edited_copy'); expect((await savedSchema(page))!.tables[0]).toEqual(before!.tables[0]);
    await page.reload(); await page.locator('.schema-tab-bar').getByRole('button', { name: 'core', exact: true }).click(); await expect(page.getByTestId('table-card')).toHaveCount(2); const reloaded = (await savedSchema(page))!;
    expect(reloaded.tables).toEqual([before!.tables[0], { ...copy, name: 'edited_copy' }]); expect(reloaded.memos).toEqual(before!.memos);
  });
}
