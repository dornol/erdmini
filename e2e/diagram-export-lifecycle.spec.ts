import { readFile } from 'node:fs/promises';
import { expect, test } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

for (const format of ['Mermaid', 'PlantUML'] as const) {
  for (const nullable of [false, true]) {
    test(`${format} exports composite FK ${nullable ? 'optional' : 'required'} cardinality, constraints and exact download without writes`, async ({ page }) => {
      await page.goto('/'); await page.getByTestId('create-project').click();
      const column = { type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
      const model: ERDSchema = { version: '1', domains: [], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        tables: [
          { id: 'parent', name: 'accounts', position: { x: 100, y: 100 }, columns: [
            { ...column, id: 'tenant', name: 'tenant_id', primaryKey: true },
            { ...column, id: 'account', name: 'account_id', primaryKey: true, autoIncrement: true },
            { ...column, id: 'code', name: 'external_code', type: 'VARCHAR', length: 40, nullable: true, unique: true },
          ], foreignKeys: [], uniqueKeys: [], indexes: [] },
          { id: 'child', name: 'orders', position: { x: 450, y: 100 }, columns: [
            { ...column, id: 'order', name: 'order_id', primaryKey: true },
            { ...column, id: 'order_tenant', name: 'tenant_id', nullable },
            { ...column, id: 'order_account', name: 'account_id', nullable },
          ], foreignKeys: [{ id: 'relation', columnIds: ['order_tenant', 'order_account'], referencedTableId: 'parent', referencedColumnIds: ['tenant', 'account'], onDelete: 'RESTRICT', onUpdate: 'CASCADE' }], uniqueKeys: [], indexes: [] },
        ],
      };
      await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
      const before = await savedSchema(page);
      await page.getByTestId('export-menu-toggle').click();
      await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
      const modal = page.getByTestId('ddl-modal');
      await modal.getByRole('button', { name: format, exact: true }).click();
      const text = await modal.locator('.code-area').inputValue();
      const relationship = `accounts ||--${nullable ? 'o{' : '|{'} orders`;
      expect(text.split('\n').filter(line => line.includes('||--'))).toEqual([format === 'Mermaid' ? `    ${relationship} : ""` : relationship]);
      if (format === 'Mermaid') {
        expect(text).toMatch(/^erDiagram\n/);
        expect(text).toContain('INT account_id PK');
        expect(text).toContain('VARCHAR(40) external_code UK "nullable"');
        expect(text).toContain(`INT tenant_id FK${nullable ? ' "nullable"' : ''}`);
        expect(text).toContain(`INT account_id FK${nullable ? ' "nullable"' : ''}`);
      } else {
        expect(text).toMatch(/^@startuml\n/); expect(text).toMatch(/\n@enduml$/);
        expect(text).toContain('entity "accounts" as accounts');
        expect(text).toContain('* account_id : INT <<PK, AI>>');
        expect(text).toContain('external_code : VARCHAR(40) <<UK>>');
        expect(text).toContain(`${nullable ? '  ' : '* '}tenant_id : INT <<FK>>`);
        expect(text).toContain(`${nullable ? '  ' : '* '}account_id : INT <<FK>>`);
      }
      const ext = format === 'Mermaid' ? '.mmd' : '.puml';
      const downloading = page.waitForEvent('download');
      await modal.getByRole('button', { name: ext, exact: true }).click();
      const download = await downloading; expect(download.suggestedFilename()).toMatch(new RegExp(`\\${ext}$`));
      const path = await download.path(); if (!path) throw new Error('Diagram download missing');
      expect(await readFile(path, 'utf8')).toBe(text);
      expect(await savedSchema(page)).toEqual(before);
      await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(2);
      expect(await savedSchema(page)).toEqual(before);
    });
  }
}
