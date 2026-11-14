import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function model(): ERDSchema {
  const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  return { version: '1', domains: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: ['alpha', 'beta', 'gamma'].map((name, i) => ({ id: name, name, position: { x: [100, 450, 900][i], y: [120, 350, 680][i] }, comment: `Retain ${name}`,
      columns: [{ ...flags, id: `${name}_id`, name: 'id', type: 'INT', primaryKey: true }, { ...flags, id: `${name}_parent`, name: 'parent_id', type: 'INT' }, { ...flags, id: `${name}_payload`, name: 'payload', type: 'VARCHAR', length: 80, defaultValue: "'kept'" }],
      foreignKeys: i === 1 ? [{ id: 'beta_alpha', columnIds: ['beta_parent'], referencedTableId: 'alpha', referencedColumnIds: ['alpha_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }] : [], uniqueKeys: [], indexes: [] })),
    memos: [{ id: 'memo', content: 'Attached metadata', attachedTableId: 'beta', position: { x: 450, y: 300 }, width: 180, height: 100 }],
  };
}
async function selectAll(page: Page) {
  const rows = page.locator('.table-item'); await rows.first().click(); await rows.nth(1).click({ modifiers: ['ControlOrMeta'] }); await rows.nth(2).click({ modifiers: ['ControlOrMeta'] });
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1200 }); await page.goto('/'); await page.getByTestId('create-project').click(); await importSchema(page, model()); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(3);
});

for (const mode of ['PK/FK Only', 'Names Only']) {
  test(`${mode} renders the intended columns and types without changing schema or history`, async ({ page }) => {
    const before = (await savedSchema(page))!, undoEnabled = await page.getByRole('button', { name: /^Undo/ }).isEnabled();
    await page.locator('.canvas-bottom-bar button[title="Column View"]').click(); await page.getByRole('menuitem', { name: mode, exact: true }).click();
    const cards = page.getByTestId('table-card');
    if (mode === 'PK/FK Only') {
      await expect(cards.nth(0).locator('.column-row .col-name')).toHaveText(['id']); await expect(cards.nth(1).locator('.column-row .col-name')).toHaveText(['id', 'parent_id']); await expect(cards.nth(2).locator('.column-row .col-name')).toHaveText(['id']);
    } else { await expect(cards.locator('.column-row')).toHaveCount(9); await expect(cards.locator('.col-type')).toHaveCount(0); }
    await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(1); expect(await savedSchema(page)).toEqual(before); expect(await page.getByRole('button', { name: /^Undo/ }).isEnabled()).toBe(undoEnabled);
    await page.locator('.canvas-bottom-bar button[title="Column View"]').click(); await page.getByRole('menuitem', { name: 'All', exact: true }).click(); await expect(cards.locator('.column-row')).toHaveCount(9); await expect(cards.locator('.col-type')).toHaveCount(9);
    await page.reload(); expect(await savedSchema(page)).toEqual(before); await expect(cards.locator('.column-row')).toHaveCount(9);
  });
}

for (const action of ['Align Left', 'Align Right', 'Align Top', 'Align Bottom', 'Distribute H', 'Distribute V']) {
  test(`${action} arranges selected tables and attached memo with metadata-preserving undo and reload`, async ({ page }) => {
    const before = (await savedSchema(page))!; await selectAll(page);
    await page.locator('.canvas-bottom-bar button[title*="Align"]').click(); await page.getByRole('menuitem', { name: action, exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))!.tables.map(t => t.position)).not.toEqual(before.tables.map(t => t.position)); const after = (await savedSchema(page))!;
    const rectangles = await page.getByTestId('table-card').evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    if (action.startsWith('Align')) { const edge = action.split(' ')[1].toLowerCase() as keyof typeof rectangles[0]; const values = rectangles.map(r => r[edge]); expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1); }
    else { const axis = action.endsWith('H') ? 'x' : 'y'; const previous = before.tables.map(t => t.position[axis]).sort((a, b) => a - b), current = after.tables.map(t => t.position[axis]).sort((a, b) => a - b); expect(current[0]).toBe(previous[0]); expect(current[2]).toBe(previous[2]); expect(current[1] - current[0]).toBeCloseTo(current[2] - current[1], 4); }
    expect(after.tables.map(({ position, ...table }) => table)).toEqual(before.tables.map(({ position, ...table }) => table));
    expect(after.memos[0]).toEqual({ ...before.memos[0], position: { x: before.memos[0].position.x + after.tables[1].position.x - before.tables[1].position.x, y: before.memos[0].position.y + after.tables[1].position.y - before.tables[1].position.y } });
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before.tables);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(after.tables); await page.reload(); expect((await savedSchema(page))!.tables).toEqual(after.tables); expect((await savedSchema(page))!.memos).toEqual(after.memos);
  });
}

for (const action of ['Smart (beta)', 'Grid', 'Hierarchical', 'Radial', 'Radial Tree', 'Align Left', 'Align Right', 'Align Top', 'Align Bottom', 'Distribute H', 'Distribute V']) {
  test(`locked table stays fixed during ${action} while movable tables retain metadata and reload`, async ({ page }) => {
    await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^alpha$/ }) }).click(); await page.getByTestId('table-editor').locator('.lock-btn').click();
    await expect.poll(async () => (await savedSchema(page))?.tables[0].locked).toBe(true); const before = (await savedSchema(page))!;
    await selectAll(page); const layout = !action.startsWith('Align') && !action.startsWith('Distribute');
    await page.locator(layout ? '.canvas-bottom-bar button[title*="Auto Layout"]' : '.canvas-bottom-bar button[title*="Align"]').click(); await page.getByRole('menuitem', { name: action, exact: true }).click();
    if (action.startsWith('Distribute')) {
      // One locked member leaves only two movable tables: distribution is a no-op.
      const live = await page.getByTestId('table-card').evaluateAll(cards => cards.map(card => ({ x: parseFloat((card as HTMLElement).style.left), y: parseFloat((card as HTMLElement).style.top) })));
      expect(live).toEqual(before.tables.map(t => t.position)); expect(await savedSchema(page)).toEqual(before);
      await page.reload(); expect((await savedSchema(page))!.tables).toEqual(before.tables); return;
    }
    await expect.poll(async () => (await savedSchema(page))!.tables.slice(1).map(t => t.position)).not.toEqual(before.tables.slice(1).map(t => t.position)); const after = (await savedSchema(page))!;
    expect(after.tables[0]).toEqual(before.tables[0]); expect(after.tables.slice(1).map(({ position, ...table }) => table)).toEqual(before.tables.slice(1).map(({ position, ...table }) => table));
    expect(after.memos[0]).toEqual({ ...before.memos[0], position: { x: before.memos[0].position.x + after.tables[1].position.x - before.tables[1].position.x, y: before.memos[0].position.y + after.tables[1].position.y - before.tables[1].position.y } });
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before.tables);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(after.tables); await page.reload(); expect((await savedSchema(page))!.tables).toEqual(after.tables); expect((await savedSchema(page))!.memos).toEqual(after.memos);
  });
}
