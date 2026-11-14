import { expect, test, type Locator, type Page } from 'playwright/test';
import type { ERDSchema, ForeignKey } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  const tables = ['parent', 'child', 'alternate'].map((name, i) => ({
    id: name, name, position: { x: 100 + i * 280, y: 150 },
    columns: ['id', 'tenant', 'code'].map(suffix => ({ id: `${name}_${suffix}`, name: `${name}_${suffix}`, type: 'INT' as const, nullable: false, primaryKey: false, unique: false, autoIncrement: false })),
    foreignKeys: [] as ForeignKey[],
  }));
  tables[1].foreignKeys = [{ id: 'ownership', columnIds: ['child_id', 'child_tenant'], referencedTableId: 'parent', referencedColumnIds: ['parent_id', 'parent_tenant'], onDelete: 'CASCADE', onUpdate: 'NO ACTION', label: 'original ownership' }];
  return { version: '1', tables, domains: [], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
async function choose(page: Page, trigger: Locator, name: string) {
  await trigger.click();
  await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${name}$`) }).click();
}
async function currentFk(page: Page) {
  return (await savedSchema(page))?.tables.find(t => t.id === 'child')?.foreignKeys[0];
}
async function edit(page: Page) {
  await page.locator('.fk-section .fk-row button[title="Edit"]').click();
  return page.getByTestId('fk-modal');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(() => currentFk(page)).toEqual(fixture().tables[1].foreignKeys[0]);
  await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^child$/ }) }).click();
});

test('composite FK edit cancels draft changes, excludes duplicate columns and persists confirmed pairs and actions', async ({ page }) => {
  const original = await currentFk(page);
  let modal = await edit(page);
  await expect(modal.locator('.pair-row')).toHaveCount(2);
  await expect(modal.locator('#fkm-label')).toHaveValue('original ownership');
  await choose(page, modal.locator('.pair-row').nth(1).locator('.ss-trigger').first(), 'child_code');
  await choose(page, modal.locator('.pair-row').nth(1).locator('.ss-trigger').last(), 'parent_code');
  await modal.locator('#fkm-label').fill('discarded draft');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await currentFk(page)).toEqual(original);
  modal = await edit(page);
  await expect(modal.locator('.pair-row').nth(1)).toContainText('child_tenant');
  await expect(modal.locator('.pair-row').nth(1)).toContainText('parent_tenant');
  await expect(modal.locator('#fkm-label')).toHaveValue('original ownership');
  await modal.locator('.btn-add-pair').click();
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  const third = modal.locator('.pair-row').nth(2);
  await third.locator('.ss-trigger').first().click();
  await expect(page.locator('.ss-dropdown .ss-item').filter({ hasText: /^child_id$/ })).toHaveCount(0);
  await expect(page.locator('.ss-dropdown .ss-item').filter({ hasText: /^child_tenant$/ })).toHaveCount(0);
  await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^child_code$/ }).click();
  await third.locator('.ss-trigger').last().click();
  await expect(page.locator('.ss-dropdown .ss-item').filter({ hasText: /^parent_id$/ })).toHaveCount(0);
  await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^parent_code$/ }).click();
  await modal.locator('.pair-row').nth(1).locator('.btn-remove-pair').click();
  await choose(page, modal.locator('.form-row-2col .ss-trigger').first(), 'SET NULL');
  await expect(modal.locator('.set-null-warning')).toBeVisible();
  await choose(page, modal.locator('.form-row-2col .ss-trigger').first(), 'RESTRICT');
  await expect(modal.locator('.set-null-warning')).toHaveCount(0);
  await choose(page, modal.locator('.form-row-2col .ss-trigger').last(), 'CASCADE');
  await modal.locator('#fkm-label').fill('  revised ownership  ');
  await modal.getByTestId('fk-submit').click();
  const expected = { ...original, columnIds: ['child_id', 'child_code'], referencedColumnIds: ['parent_id', 'parent_code'], onDelete: 'RESTRICT', onUpdate: 'CASCADE', label: 'revised ownership' };
  await expect.poll(() => currentFk(page)).toEqual(expected);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(() => currentFk(page)).toEqual(original);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(() => currentFk(page)).toEqual(expected);
  await page.reload();
  await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^child$/ }) }).click();
  modal = await edit(page);
  await expect(modal.locator('.pair-row').nth(1)).toContainText('child_code');
  await expect(modal.locator('.pair-row').nth(1)).toContainText('parent_code');
  await expect(modal.locator('#fkm-label')).toHaveValue('revised ownership');
});

test('changing the referenced table clears stale target columns and requires complete new pairs', async ({ page }) => {
  const modal = await edit(page);
  await choose(page, modal.locator('.form-row').first().locator('.ss-trigger'), 'parent');
  await expect(modal.getByTestId('fk-submit')).toBeEnabled();
  await expect(modal.locator('.pair-row').first()).toContainText('parent_id');
  await choose(page, modal.locator('.form-row').first().locator('.ss-trigger'), 'alternate');
  await expect(modal.locator('.pair-row').first()).toContainText('child_id');
  await expect(modal.locator('.pair-row').nth(1)).toContainText('child_tenant');
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  await expect(modal.locator('.pair-row').first()).not.toContainText('parent_id');
  await expect(modal.locator('.pair-row').nth(1)).not.toContainText('parent_tenant');
  await choose(page, modal.locator('.pair-row').first().locator('.ss-trigger').last(), 'alternate_id');
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  await choose(page, modal.locator('.pair-row').nth(1).locator('.ss-trigger').last(), 'alternate_tenant');
  await expect(modal.getByTestId('fk-submit')).toBeEnabled();
  await modal.getByTestId('fk-submit').click();
  await expect.poll(async () => {
    const fk = await currentFk(page);
    return fk && { target: fk.referencedTableId, columns: fk.referencedColumnIds };
  }).toEqual({ target: 'alternate', columns: ['alternate_id', 'alternate_tenant'] });
  await page.reload();
  expect((await currentFk(page))?.referencedTableId).toBe('alternate');
});


test('new FK validates incomplete pairs, removes a draft pair and clears cancelled creation', async ({ page }) => {
  const original = await currentFk(page);
  await page.getByTestId('add-foreign-key').click();
  const modal = page.getByTestId('fk-modal');
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  await expect(modal.locator('.pair-row .ss-trigger').last()).toBeDisabled();
  await choose(page, modal.locator('.form-row').first().locator('.ss-trigger'), 'alternate');
  await choose(page, modal.locator('.pair-row .ss-trigger').first(), 'child_code');
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  await choose(page, modal.locator('.pair-row .ss-trigger').last(), 'alternate_code');
  await expect(modal.getByTestId('fk-submit')).toBeEnabled();
  await modal.locator('.btn-add-pair').click();
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  await modal.locator('.pair-row').nth(1).locator('.btn-remove-pair').click();
  await expect(modal.getByTestId('fk-submit')).toBeEnabled();
  await expect(modal.locator('.btn-remove-pair')).toHaveCount(0);
  await modal.locator('#fkm-label').fill('cancelled creation');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await currentFk(page)).toEqual(original);
  await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
  await page.getByTestId('add-foreign-key').click();
  await expect(modal.locator('.pair-row')).toHaveCount(1);
  await expect(modal.getByTestId('fk-submit')).toBeDisabled();
  await expect(modal.locator('#fkm-label')).toHaveValue('');
  await expect(modal.locator('.pair-row .ss-trigger').last()).toBeDisabled();
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  expect(await currentFk(page)).toEqual(original);
  expect((await savedSchema(page))?.tables.find(t => t.id === 'child')?.foreignKeys).toHaveLength(1);
});

for (const style of ['Orthogonal', 'Bezier', 'Rounded']) {
  test(`${style} composite FK changes nullable dash rendering through edit, undo, redo and reload`, async ({ page }) => {
    const before = await savedSchema(page);
    const lineStyle = page.locator('.canvas-bottom-bar button').filter({ hasText: /Orthogonal|Bezier|Rounded/ }).first();
    await lineStyle.click(); await page.getByRole('menuitem', { name: new RegExp(`^${style}`, 'i') }).click();
    const strokes = page.locator('.canvas-world > svg path[stroke-dasharray]');
    const assertDash = async (nullable: boolean) => {
      await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
      await expect(strokes).toHaveCount(2);
      await expect(strokes.nth(0)).toHaveAttribute('stroke-dasharray', nullable ? '6 3' : 'none');
      await expect(strokes.nth(1)).toHaveAttribute('stroke-dasharray', 'none');
      const svg = page.locator('.canvas-world > svg');
      // Optional participation uses a hollow circle; required participation
      // uses a second tick. Each composite pair still has its own crow foot.
      await expect(svg.locator('circle[r="4.5"]')).toHaveCount(nullable ? 1 : 0);
      await expect(svg.locator('text').filter({ hasText: /^1:N$/ })).toHaveCount(2);
      const feet = svg.locator('path[stroke-width="1.8"][stroke-linejoin="round"]');
      await expect(feet).toHaveCount(2);
      for (const foot of await feet.all()) {
        const geometry = await foot.evaluate(el => {
          const path = el as SVGPathElement, length = path.getTotalLength();
          const start = path.getPointAtLength(0), middle = path.getPointAtLength(length / 2), end = path.getPointAtLength(length);
          return { start: { x: start.x, y: start.y }, middle: { x: middle.x, y: middle.y }, end: { x: end.x, y: end.y } };
        });
        expect(geometry.start.x).toBeCloseTo(geometry.end.x, 4);
        expect(Math.abs(geometry.start.y - geometry.end.y)).toBeGreaterThan(0);
        expect(Math.abs(geometry.middle.x - geometry.start.x)).toBeGreaterThan(0);
        expect(geometry.middle.y).toBeCloseTo((geometry.start.y + geometry.end.y) / 2, 4);
      }
      for (const stroke of await strokes.all()) expect((await stroke.getAttribute('d'))?.length).toBeGreaterThan(20);
    };
    await assertDash(false);
    const child = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^child$/ }) });
    await child.locator('.column-row').first().dblclick(); const popup = page.getByTestId('column-edit-popup');
    await popup.locator('.flags-row label').filter({ hasText: /^\s*NN\s*$/ }).locator('input').uncheck();
    await popup.getByRole('button', { name: 'Close', exact: true }).click(); await page.mouse.move(10, 10);
    await assertDash(true); await expect.poll(async () => (await savedSchema(page))?.tables[1].columns[0].nullable).toBe(true);
    await page.getByRole('button', { name: /^Undo/ }).click(); await assertDash(false);
    await page.getByRole('button', { name: /^Redo/ }).click(); await assertDash(true);
    await expect.poll(async () => (await savedSchema(page))?.tables[1].columns[0].nullable).toBe(true);
    const expected = structuredClone(before!); expected.tables[1].columns[0].nullable = true;
    const final = await savedSchema(page); expect(final!.tables).toEqual(expected.tables); expect(final!.domains).toEqual(expected.domains);
    await page.reload(); await assertDash(true); expect((await savedSchema(page))!.tables).toEqual(expected.tables);
  });
}

for (const interaction of ['mouse', 'keyboard']) {
  test(`FK line ${interaction} popover cancels and deletes the whole composite relationship with undo and reload`, async ({ page }) => {
    const before = await savedSchema(page);
    const open = async () => {
      const hit = page.getByRole('button', { name: 'FK line', exact: true }).first();
      if (interaction === 'keyboard') { await hit.focus(); await hit.press('Enter'); }
      else {
        const point = await hit.evaluate(el => { const path = el as SVGPathElement; const point = path.getPointAtLength(path.getTotalLength() * 0.3).matrixTransform(path.getScreenCTM()!); return { x: point.x, y: point.y }; });
        await page.mouse.click(point.x, point.y);
      }
      await expect(page.locator('.fk-popover')).toBeVisible(); await expect(page.locator('.fk-popover')).toContainText('child_id, child_tenant');
      await page.locator('.fk-popover').getByRole('button', { name: /Delete/ }).click();
    };
    await open(); await page.getByRole('alertdialog').getByRole('button', { name: /Cancel/ }).click();
    expect((await savedSchema(page))!.tables).toEqual(before!.tables); await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
    await open(); await page.getByRole('alertdialog').getByRole('button', { name: /Delete/ }).click();
    await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(0);
    await expect.poll(async () => (await currentFk(page)) === undefined).toBe(true);
    const expected = structuredClone(before!.tables); expected[1].foreignKeys = []; expect((await savedSchema(page))!.tables).toEqual(expected);
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
    await expect.poll(() => currentFk(page)).toEqual(before!.tables[1].foreignKeys[0]);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await currentFk(page)) === undefined).toBe(true);
    await page.reload(); await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(0); expect((await savedSchema(page))!.tables).toEqual(expected);
  });
}

test('viewport-only pan and zoom preserve relation world geometry and minimap objects while updating the visible viewport', async ({ page }) => {
  const before = await savedSchema(page);
  await page.mouse.move(10, 10);
  const paths = page.locator('.canvas-world > svg path[stroke-dasharray]');
  const geometry = () => paths.evaluateAll(nodes => nodes.map(node => ({ d: node.getAttribute('d'), dash: node.getAttribute('stroke-dasharray') })));
  const miniObjects = () => page.locator('.mini-table').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.cssText));
  const originalGeometry = await geometry(), originalMini = await miniObjects();
  expect(originalGeometry).toHaveLength(2); expect(originalMini).toHaveLength(3);
  const marker = page.locator('.mini-viewport'), initialMarker = await marker.getAttribute('style');
  const world = page.locator('.canvas-world'), initialTransform = await world.getAttribute('style');
  await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  }
  await expect(world).not.toHaveAttribute('style', initialTransform!);
  await expect(marker).not.toHaveAttribute('style', initialMarker!);
  expect(await geometry()).toEqual(originalGeometry); expect(await miniObjects()).toEqual(originalMini);
  const pannedMarker = await marker.getAttribute('style');
  await page.keyboard.press('+'); await expect(page.locator('.zoom-pct')).toHaveText('110%');
  await expect(marker).not.toHaveAttribute('style', pannedMarker!);
  expect(await geometry()).toEqual(originalGeometry); expect(await miniObjects()).toEqual(originalMini);
  expect(await savedSchema(page)).toEqual(before);
  await page.reload(); await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
  expect(await geometry()).toEqual(originalGeometry); expect(await miniObjects()).toEqual(originalMini);
  expect(await savedSchema(page)).toEqual(before);
});

for (const style of ['Orthogonal', 'Bezier', 'Rounded']) {
  test(`${style} FK paths follow the moving table before mouse release and retain endpoints after undo redo reload`, async ({ page }) => {
    const before = (await savedSchema(page))!;
    await page.locator('.canvas-bottom-bar button').filter({ hasText: /Orthogonal|Bezier|Rounded/ }).first().click();
    await page.getByRole('menuitem', { name: new RegExp(`^${style}`, 'i') }).click();
    const child = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^child$/ }) });
    const paths = page.locator('.canvas-world > svg path[stroke-dasharray]');
    const geometry = () => paths.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
    await page.mouse.move(10, 10); const initial = await geometry();
    const header = await child.locator('.table-header').boundingBox(); if (!header) throw new Error('Child header missing');
    const x = header.x + header.width / 2, y = header.y + header.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 80, y + 60, { steps: 8 });
    // Assert while the pointer is held: update only on release would fail this.
    await expect.poll(geometry).not.toEqual(initial);
    await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(2);
    await page.mouse.up(); await page.mouse.move(10, 10);
    const moved = await geometry();
    await expect.poll(async () => (await savedSchema(page))?.tables[1]?.position).not.toEqual(before.tables[1].position);
    const after = (await savedSchema(page))!;
    expect(after.tables[0]).toEqual(before.tables[0]); expect(after.tables[2]).toEqual(before.tables[2]);
    expect(after.tables[1]).toEqual({ ...before.tables[1], position: after.tables[1].position });
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(geometry).toEqual(initial);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(geometry).toEqual(moved);
    await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(after.tables);
    await page.reload();
    await page.locator('.canvas-bottom-bar button').filter({ hasText: /Orthogonal|Bezier|Rounded/ }).first().click();
    await page.getByRole('menuitem', { name: new RegExp(`^${style}`, 'i') }).click();
    await expect.poll(geometry).toEqual(moved); expect((await savedSchema(page))!.tables).toEqual(after.tables);
  });
}
