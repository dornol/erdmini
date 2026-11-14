import { expect, test } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

for (const algorithm of ['Smart', 'Grid', 'Hierarchical', 'Radial', 'Radial Tree']) {
  test(`${algorithm} layout changes only positions and supports undo, redo and reload`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto('/'); await page.getByTestId('create-project').click();
    const model: ERDSchema = { version: '1', domains: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), memos: [],
      tables: ['root', 'child', 'leaf'].map((name, i) => ({ id: name, name, position: { x: 91 + i * 311, y: 133 + i * 113 }, comment: `Retain ${name}`,
        columns: [{ id: `${name}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }],
        foreignKeys: i ? [{ id: `${name}_fk`, columnIds: [`${name}_id`], referencedTableId: i === 1 ? 'root' : 'child', referencedColumnIds: [i === 1 ? 'root_id' : 'child_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }] : [], uniqueKeys: [], indexes: [] })),
    };
    await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(3); const before = (await savedSchema(page))!;
    await page.locator('.canvas-bottom-bar button[title*="Auto Layout"]').click(); await page.getByRole('menuitem', { name: algorithm === 'Smart' ? 'Smart (beta)' : algorithm, exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))!.tables.map(t => t.position)).not.toEqual(before.tables.map(t => t.position)); const after = (await savedSchema(page))!;
    expect(new Set(after.tables.map(t => `${t.position.x},${t.position.y}`)).size).toBe(3); for (const t of after.tables) { expect(Number.isFinite(t.position.x)).toBe(true); expect(Number.isFinite(t.position.y)).toBe(true); }
    const metadata = (s: ERDSchema) => s.tables.map(({ position, ...table }) => table); expect(metadata(after)).toEqual(metadata(before)); expect(after.memos).toEqual(before.memos); expect(after.domains).toEqual(before.domains);
    await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before.tables);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(after.tables);
    await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(3); expect((await savedSchema(page))!.tables).toEqual(after.tables); await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
  });
}
