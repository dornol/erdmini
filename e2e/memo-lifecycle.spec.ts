import { expect, test, type Locator, type Page } from 'playwright/test';
import type { ERDSchema, Table } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(attached = true): ERDSchema {
  const tables: Table[] = ['notes', 'audit'].map((id, i) => ({
    id, name: id, columns: [{ id: `${id}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }],
    foreignKeys: i ? [{ id: 'audit_fk', columnIds: ['audit_id'], referencedTableId: 'notes', referencedColumnIds: ['notes_id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' }] : [],
    uniqueKeys: [], indexes: [], position: { x: 120 + i * 350, y: 220 },
  }));
  return {
    version: '1', tables, domains: [],
    memos: [{ id: 'note', content: 'Keep this documentation', color: 'blue', width: 180, height: 120, position: { x: 120, y: 340 }, ...(attached ? { attachedTableId: 'notes' } : {}) }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  await handle.hover();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Drag handle is not measurable');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const table = (page: Page) => page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^notes$/ }) });
const position = (locator: Locator) => locator.evaluate((node) => ({ x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) }));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
});

for (const entry of ['button', 'keyboard'] as const) {
  test(`memo ${entry} deletion can be cancelled, undone and redone without losing content`, async ({ page }) => {
    await importSchema(page, fixture(false));
    const memo = page.getByTestId('memo-card');
    await memo.locator('.memo-content').dblclick();
    await memo.locator('.memo-textarea').fill('Discard this edit');
    await page.keyboard.press('Escape');
    await expect(memo.locator('.memo-text')).toHaveText('Keep this documentation');
    await memo.locator('.memo-header').click();
    const requestDeletion = async () => {
      if (entry === 'button') {
        await memo.hover();
        await memo.getByTestId('delete-memo').click();
      } else {
        await memo.locator('.memo-header').click();
        await page.keyboard.press('Delete');
      }
    };
    await requestDeletion();
    await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
    await expect(memo.locator('.memo-text')).toHaveText('Keep this documentation');
    await requestDeletion();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(memo).toHaveCount(0);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(memo.locator('.memo-text')).toHaveText('Keep this documentation');
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(memo).toHaveCount(0);
    await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([]);
    await page.reload();
    await expect(memo).toHaveCount(0);
    await expect(page.getByTestId('table-card')).toHaveCount(2);
  });
}

for (const mode of ['single', 'group'] as const) {
  test(`${mode} table drag moves its attached memo and persists the final position before detaching`, async ({ page }) => {
    await importSchema(page, fixture());
    await expect(table(page).locator('.memo-chip')).toContainText('Keep this documentat');
    await expect(page.getByTestId('memo-card')).toHaveCount(0);
    const start = await position(table(page));
    if (mode === 'group') {
      await table(page).click();
      await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^audit$/ }) }).click({ modifiers: ['ControlOrMeta'] });
    }
    await drag(page, table(page).locator('.table-header'), 100, 80);
    const moved = await position(table(page));
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.y).toBeGreaterThan(start.y);
    const expectedMemo = { x: 120 + moved.x - start.x, y: 340 + moved.y - start.y };
    await expect.poll(async () => {
      const saved = await savedSchema(page);
      return { table: saved?.tables.find((t) => t.id === 'notes')?.position, other: saved?.tables.find((t) => t.id === 'audit')?.position, memo: saved?.memos[0]?.position };
    }).toEqual({ table: moved, other: mode === 'group' ? { x: 470 + moved.x - start.x, y: 220 + moved.y - start.y } : { x: 470, y: 220 }, memo: expectedMemo });
    await page.reload();
    await expect(table(page).locator('.memo-chip')).toBeVisible();
    expect(await position(table(page))).toEqual(moved);
    await table(page).locator('.memo-chip').click();
    const memo = page.getByTestId('memo-card');
    await expect(memo.locator('.memo-text')).toHaveText('Keep this documentation');
    expect(await position(memo)).toEqual({ x: moved.x, y: moved.y - 120 - 12 });
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(table(page).locator('.memo-chip')).toBeVisible();
    await expect(memo).toHaveCount(0);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(memo).toHaveCount(1);
    await expect.poll(async () => (await savedSchema(page))?.memos[0]?.attachedTableId ?? null).toBeNull();
    await page.reload();
    await expect(memo.locator('.memo-text')).toHaveText('Keep this documentation');
    await expect(table(page).locator('.memo-chip')).toHaveCount(0);
  });
}

test('table deletion preserves its memo, removes incoming FKs and restores both on undo', async ({ page }) => {
  await importSchema(page, fixture());
  await table(page).hover();
  await table(page).getByTestId('delete-table').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
  await expect(table(page).locator('.memo-chip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(1);
  await table(page).hover();
  await table(page).getByTestId('delete-table').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect(page.getByTestId('memo-card').locator('.memo-text')).toHaveText('Keep this documentation');
  await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(table(page).locator('.memo-chip')).toBeVisible();
  await expect(page.getByTestId('memo-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => {
    const saved = await savedSchema(page);
    return { tables: saved?.tables.map((t) => ({ name: t.name, foreignKeys: t.foreignKeys })), memo: saved?.memos[0] };
  }).toMatchObject({ tables: [{ name: 'audit', foreignKeys: [] }], memo: { content: 'Keep this documentation', position: { x: 120, y: 340 } } });
  await page.reload();
  await expect(page.getByTestId('table-card')).toHaveCount(1);
  await expect(page.getByTestId('memo-card').locator('.memo-text')).toHaveText('Keep this documentation');
  await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(0);
});

test('locked tables and memos remain selectable but cannot be moved or edited', async ({ page }) => {
  const schema = fixture(false);
  schema.tables[0].locked = true;
  schema.memos[0].locked = true;
  await importSchema(page, schema);
  const memo = page.getByTestId('memo-card');
  const tableStart = await position(table(page));
  const memoStart = await position(memo);
  await drag(page, table(page).locator('.table-header'), 80, 60);
  await expect(table(page)).toHaveClass(/selected/);
  expect(await position(table(page))).toEqual(tableStart);
  await drag(page, memo.locator('.memo-header'), 80, 60);
  await expect(memo).toHaveClass(/selected/);
  expect(await position(memo)).toEqual(memoStart);
  await memo.locator('.memo-content').dblclick();
  await expect(memo.locator('.memo-textarea')).toHaveCount(0);
  await expect(memo.locator('.resize-handle')).toHaveCount(0);
  await expect(memo.locator('.memo-colors')).toHaveCount(0);
  await expect(memo.locator('.memo-text')).toHaveText('Keep this documentation');
});

test('free memo drag saves its final position and is undone as one gesture', async ({ page }) => {
  await importSchema(page, fixture(false));
  const memo = page.getByTestId('memo-card');
  const start = await position(memo);
  await drag(page, memo.locator('.memo-header'), 100, 60);
  const moved = await position(memo);
  expect(moved.x).toBeGreaterThan(start.x);
  expect(moved.y).toBeGreaterThan(start.y);
  await expect.poll(async () => (await savedSchema(page))?.memos[0]?.position).toEqual(moved);
  await page.getByRole('button', { name: /^Undo/ }).click();
  expect(await position(memo)).toEqual(start);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Redo/ }).click();
  expect(await position(memo)).toEqual(moved);
  await expect.poll(async () => (await savedSchema(page))?.memos[0]?.position).toEqual(moved);
  await page.reload();
  expect(await position(memo)).toEqual(moved);
});

test('group memo drag preserves relative positions and saves one undoable gesture', async ({ page }) => {
  const schema = fixture(false);
  schema.memos.push({ id: 'second', content: 'Second note', width: 180, height: 120, position: { x: 420, y: 340 } });
  await importSchema(page, schema);
  const memos = page.getByTestId('memo-card');
  await memos.first().locator('.memo-header').click();
  await memos.nth(1).locator('.memo-header').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('.memo-card.selected')).toHaveCount(2);
  await drag(page, memos.first().locator('.memo-header'), 50, 50);
  const first = await position(memos.first());
  const second = await position(memos.nth(1));
  expect(first.x).toBeGreaterThan(120);
  expect(second).toEqual({ x: first.x + 300, y: first.y });
  await expect.poll(async () => (await savedSchema(page))?.memos.map((m) => m.position)).toEqual([first, second]);
  await page.getByRole('button', { name: /^Undo/ }).click();
  expect(await position(memos.first())).toEqual({ x: 120, y: 340 });
  expect(await position(memos.nth(1))).toEqual({ x: 420, y: 340 });
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await savedSchema(page))?.memos.map((m) => m.position)).toEqual([first, second]);
  await page.reload();
  expect(await position(memos.first())).toEqual(first);
  expect(await position(memos.nth(1))).toEqual(second);
});

for (const target of ['table', 'memo'] as const) {
  test(`${target} grid snap rounds around half a cell and ignores a no-op drag`, async ({ page }) => {
    await importSchema(page, fixture(false));
    await page.getByRole('button', { name: 'Snap: OFF', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Snap: ON', exact: true })).toBeVisible();
    const card = target === 'table' ? table(page) : page.getByTestId('memo-card');
    const handle = card.locator(target === 'table' ? '.table-header' : '.memo-header');
    const start = await position(card);
    await drag(page, handle, 9, 9);
    expect(await position(card)).toEqual(start);
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
    await drag(page, handle, 11, 11);
    const expected = { x: start.x + 20, y: start.y + 20 };
    expect(await position(card)).toEqual(expected);
    await expect.poll(async () => {
      const saved = await savedSchema(page);
      return target === 'table' ? saved?.tables.find((t) => t.id === 'notes')?.position : saved?.memos[0]?.position;
    }).toEqual(expected);
    await page.getByRole('button', { name: /^Undo/ }).click();
    expect(await position(card)).toEqual(start);
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  });
}

for (const target of ['table', 'memo'] as const) {
  test(`${target} group drag skips locked members without jumping the unlocked member`, async ({ page }) => {
    const schema = fixture(false);
    schema.tables[1].locked = true;
    schema.memos.push({ id: 'locked', content: 'Locked note', locked: true, width: 180, height: 120, position: { x: 420, y: 340 } });
    await importSchema(page, schema);
    const cards = page.getByTestId(target === 'table' ? 'table-card' : 'memo-card');
    const handleClass = target === 'table' ? '.table-header' : '.memo-header';
    const first = cards.first();
    const second = cards.nth(1);
    const start = await position(first);
    const lockedStart = await position(second);
    await first.locator(handleClass).click();
    await second.locator(handleClass).click({ modifiers: ['ControlOrMeta'] });
    await drag(page, first.locator(handleClass), 80, 40);
    const expected = { x: start.x + 80, y: start.y + 40 };
    expect(await position(first)).toEqual(expected);
    expect(await position(second)).toEqual(lockedStart);
    await expect.poll(async () => {
      const saved = await savedSchema(page);
      return target === 'table' ? saved?.tables.map((t) => t.position) : saved?.memos.map((m) => m.position);
    }).toEqual([expected, lockedStart]);
    await page.getByRole('button', { name: /^Undo/ }).click();
    expect(await position(first)).toEqual(start);
    expect(await position(second)).toEqual(lockedStart);
  });
}

for (const color of ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']) {
  test(`${color} memo color updates minimap and survives undo, redo and reload`, async ({ page }) => {
    const schema = fixture(false); schema.memos[0].color = color === 'yellow' ? 'blue' : 'yellow';
    await importSchema(page, schema); await expect.poll(async () => (await savedSchema(page))?.memos[0]?.color).toBe(schema.memos[0].color);
    const before = await savedSchema(page), memo = page.getByTestId('memo-card'), miniature = page.locator('.mini-memo');
    await expect(miniature).toHaveCount(1); const originalColor = await memo.locator('.memo-header').evaluate(el => getComputedStyle(el).backgroundColor);
    await memo.locator('.memo-header').click(); await memo.getByRole('button', { name: color, exact: true }).click();
    const assertColor = async (expected: string) => {
      await expect(memo.locator('.memo-header')).toHaveCSS('background-color', expected); await expect(miniature).toHaveCSS('background-color', expected);
      const box = await miniature.boundingBox(); expect(box!.width).toBeGreaterThan(1); expect(box!.height).toBeGreaterThan(1);
    };
    const selectedColor = await memo.getByRole('button', { name: color, exact: true }).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(selectedColor).not.toBe(originalColor); await assertColor(selectedColor);
    await expect.poll(async () => (await savedSchema(page))?.memos[0]?.color).toBe(color);
    await page.getByRole('button', { name: /^Undo/ }).click(); await assertColor(originalColor);
    await page.getByRole('button', { name: /^Redo/ }).click(); await assertColor(selectedColor);
    await expect.poll(async () => (await savedSchema(page))?.memos[0]?.color).toBe(color);
    const expected = { ...before!.memos[0], color }; expect((await savedSchema(page))!.memos).toEqual([expected]); expect((await savedSchema(page))!.tables).toEqual(before!.tables);
    await page.reload(); await assertColor(selectedColor); expect((await savedSchema(page))!.memos).toEqual([expected]);
  });
}

test('minimap namespace filtering excludes attached memos and updates after detach, undo and reload', async ({ page }) => {
  const schema = fixture(true); schema.schemas = ['core', 'analytics']; schema.tables[0].schema = 'core'; schema.tables[1].schema = 'analytics'; schema.memos[0].schema = 'core';
  schema.memos.push({ id: 'free_core', content: 'Free core memo', schema: 'core', color: 'pink', position: { x: 600, y: 400 }, width: 190, height: 110 }, { id: 'free_analytics', content: 'Free analytics memo', schema: 'analytics', color: 'green', position: { x: 800, y: 450 }, width: 190, height: 110 });
  await importSchema(page, schema); await expect.poll(async () => (await savedSchema(page))?.memos.length).toBe(3); const before = (await savedSchema(page))!;
  const tab = (name: string) => page.locator('.schema-tab-bar').getByRole('button', { name, exact: true });
  await expect(page.locator('.mini-memo')).toHaveCount(2); await expect(page.locator('.mini-table')).toHaveCount(2);
  await tab('analytics').click(); await expect(page.locator('.mini-memo')).toHaveCount(1); await expect(page.locator('.mini-memo')).toHaveCSS('background-color', 'rgb(74, 222, 128)'); await expect(page.locator('.mini-table')).toHaveCount(1);
  await tab('core').click(); await expect(page.locator('.mini-memo')).toHaveCount(1); await expect(page.locator('.mini-memo')).toHaveCSS('background-color', 'rgb(244, 114, 182)'); expect((await savedSchema(page))!.memos).toEqual(before.memos);
  await table(page).locator('.memo-chip').click(); await expect(page.locator('.mini-memo')).toHaveCount(2); await expect.poll(async () => (await savedSchema(page))?.memos[0]?.attachedTableId ?? null).toBeNull();
  const detached = (await savedSchema(page))!; expect(detached.memos[0]).toMatchObject({ id: 'note', content: before.memos[0].content, schema: 'core', color: 'blue' }); expect(detached.memos.slice(1)).toEqual(before.memos.slice(1)); expect(detached.tables).toEqual(before.tables);
  await page.getByRole('button', { name: /^Undo/ }).click(); await expect(page.locator('.mini-memo')).toHaveCount(1); await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(before.memos);
  await page.getByRole('button', { name: /^Redo/ }).click(); await expect(page.locator('.mini-memo')).toHaveCount(2); await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(detached.memos);
  await page.reload(); await tab('core').click(); await expect(page.locator('.mini-memo')).toHaveCount(2); await tab('analytics').click(); await expect(page.locator('.mini-memo')).toHaveCount(1); expect((await savedSchema(page))!.memos).toEqual(detached.memos);
});

for (const zoomSteps of [0, 5]) {
  for (const shrink of [false, true]) {
    test(`memo resize ${shrink ? 'clamps at minimum' : 'uses world dimensions'} at ${Math.round(100 * 1.1 ** zoomSteps)}% with history and reload`, async ({ page }) => {
      await importSchema(page, fixture(false));
      await expect.poll(async () => (await savedSchema(page))?.memos.length).toBe(1);
      const before = (await savedSchema(page))!, memo = page.getByTestId('memo-card');
      await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
      for (let i = 0; i < zoomSteps; i++) await page.keyboard.press('+');
      await expect(page.locator('.zoom-pct')).toHaveText(`${Math.round(100 * 1.1 ** zoomSteps)}%`);
      const scale = await page.locator('.canvas-world').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
      const dx = shrink ? -110 : 60, dy = shrink ? -70 : 40;
      await drag(page, memo.locator('.resize-handle'), dx * scale, dy * scale);
      const expected = { ...before.memos[0], width: shrink ? 120 : 240, height: shrink ? 80 : 160 };
      await expect.poll(async () => (await savedSchema(page))?.memos[0]).toEqual(expected);
      await expect(memo).toHaveCSS('width', `${expected.width}px`);
      await expect(memo).toHaveCSS('height', `${expected.height}px`);
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(before.memos);
      await page.getByRole('button', { name: /^Redo/ }).click();
      await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([expected]);
      expect((await savedSchema(page))!.tables).toEqual(before.tables);
      await page.reload(); await expect(memo).toHaveCSS('width', `${expected.width}px`);
      expect((await savedSchema(page))!.memos).toEqual([expected]);
    });
  }
}

for (const content of ['수정된 첫 줄\nSecond line with symbols <>&', '']) {
  test(`memo blur commits ${content ? 'multiline Unicode text' : 'empty content'} and supports exact undo redo and reload`, async ({ page }) => {
    await importSchema(page, fixture(false));
    await expect.poll(async () => (await savedSchema(page))?.memos.length).toBe(1);
    const before = (await savedSchema(page))!, memo = page.getByTestId('memo-card');
    await memo.locator('.memo-content').dblclick();
    await memo.locator('.memo-textarea').fill(content);
    // The editor holds a draft until focus leaves the textarea.
    expect((await savedSchema(page))!.memos).toEqual(before.memos);
    await memo.locator('.memo-textarea').blur();
    const expected = { ...before.memos[0], content };
    await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([expected]);
    await expect(memo.locator('.memo-textarea')).toHaveCount(0);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.memos).toEqual(before.memos);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.memos).toEqual([expected]);
    await page.reload(); await memo.locator('.memo-content').dblclick();
    await expect(memo.locator('.memo-textarea')).toHaveValue(content);
    expect((await savedSchema(page))!.memos).toEqual([expected]);
    expect((await savedSchema(page))!.tables).toEqual(before.tables);
  });
}
