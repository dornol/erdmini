import { expect, test, type Page } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedCanvas, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return {
    version: '1', tables: ['core', 'analytics'].map((schema, i) => ({
      id: schema, name: `${schema}_users`, schema,
      columns: [{ id: `${schema}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }],
      foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 100 + i * 300, y: 180 },
    })), schemas: ['core', 'analytics'], domains: [], memos: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

async function viewport(page: Page) {
  return page.locator('.canvas-world').evaluate((node) => {
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return { x: matrix.m41, y: matrix.m42, scale: matrix.a };
  });
}

async function waitForSavedViewport(page: Page, expected: { x: number; y: number; scale: number }) {
  await expect.poll(async () => {
    const actual = await savedCanvas(page);
    if (!actual) return Infinity;
    // CSS matrices round to a limited number of significant digits while storage
    // keeps full float precision; compare within a thousandth of a CSS pixel.
    return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y), Math.abs(actual.scale - expected.scale));
  }).toBeLessThan(0.001);
}

async function moveViewport(page: Page) {
  await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.zoom-pct')).toHaveText('110%');
  return viewport(page);
}

async function createProject(page: Page, name: string) {
  await page.getByTestId('project-menu-toggle').click();
  await page.getByTestId('project-new').click();
  const input = page.locator('.project-new-row input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByTestId('project-menu-toggle')).toContainText(name);
  await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
}

async function switchProject(page: Page, name: string) {
  await page.getByTestId('project-menu-toggle').click();
  await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: new RegExp(`^${name}$`) }) }).locator('.project-item-name').click();
  await expect(page.getByTestId('project-menu-toggle')).toContainText(name);
}

async function projectId(page: Page) {
  await page.getByTestId('project-menu-toggle').click();
  const id = await page.locator('.project-item.active .id-copy-btn').innerText();
  await page.getByTestId('project-menu-toggle').click();
  return id.trim();
}

async function snapshot(page: Page, name: string) {
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
  const panel = page.locator('.snapshot-panel');
  await panel.locator('.snapshot-input').first().fill(name);
  await panel.locator('.snapshot-save-btn').click();
  await expect(panel.locator('.snapshot-item').filter({ hasText: name })).toHaveCount(1);
  await panel.locator('.snapshot-close').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
});

test('the final project has no delete action and survives reload with its schema', async ({ page }) => {
  await page.getByTestId('project-menu-toggle').click();
  await expect(page.locator('.project-item')).toHaveCount(1);
  await expect(page.getByTestId('project-delete')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await page.getByTestId('project-menu-toggle').click();
  await expect(page.locator('.project-item')).toHaveCount(1);
  await expect(page.getByTestId('project-delete')).toHaveCount(0);
});

test('deleting the active project falls back to the survivor and removes its schema, canvas and snapshots', async ({ page }) => {
  const originalId = await projectId(page);
  await snapshot(page, 'Original snapshot');
  await createProject(page, 'Delete active');
  await page.getByTestId('empty-add-table').click();
  await snapshot(page, 'Deleted project snapshot');
  const deletedId = await projectId(page);
  await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(1);
  await expect.poll(async () => !!await savedCanvas(page)).toBe(true);
  await page.getByTestId('project-menu-toggle').click();
  await page.locator('.project-item.active').hover();
  await page.locator('.project-item.active').getByTestId('project-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect(page.getByTestId('project-menu-toggle')).toContainText('My Project');
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await expect.poll(() => savedSchema(page, deletedId)).toBeUndefined();
  await expect.poll(() => savedCanvas(page, deletedId)).toBeUndefined();
  expect((await savedSchema(page, originalId))?.tables).toHaveLength(2);
  const keys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('erdmini');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = db.transaction('snapshots').objectStore('snapshots').getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
  expect(keys.some((key) => String(key).startsWith(`${deletedId}:`))).toBe(false);
  expect(keys.some((key) => String(key).startsWith(`${originalId}:`))).toBe(true);
  await page.reload();
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Snapshots', exact: true }).click();
  await expect(page.locator('.snapshot-item').filter({ hasText: 'Original snapshot' })).toHaveCount(1);
  await expect(page.locator('.snapshot-item').filter({ hasText: 'Deleted project snapshot' })).toHaveCount(0);
});

test('pan and zoom are saved and restored without requiring a schema edit', async ({ page }) => {
  await expect.poll(async () => !!await savedCanvas(page)).toBe(true);
  const changed = await moveViewport(page);
  await waitForSavedViewport(page, changed);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.reload();
  await expect.poll(() => viewport(page)).toEqual(changed);
  await expect(page.getByTestId('table-card')).toHaveCount(2);
});

test('new projects start at the default viewport and project switching restores each viewport', async ({ page }) => {
  const first = await moveViewport(page);
  await createProject(page, 'Viewport second');
  expect(await viewport(page)).toEqual({ x: 0, y: 0, scale: 1 });
  await page.getByTestId('empty-add-table').click();
  await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ArrowLeft');
  const second = await viewport(page);
  await switchProject(page, 'My Project');
  await expect.poll(() => viewport(page)).toEqual(first);
  await switchProject(page, 'Viewport second');
  await expect.poll(() => viewport(page)).toEqual(second);
  await page.reload();
  await expect.poll(() => viewport(page)).toEqual(second);
});

test('namespace switching restores separate pan and zoom values across reload', async ({ page }) => {
  const tabs = page.locator('.schema-tab-bar');
  await tabs.getByRole('button', { name: 'core', exact: true }).click();
  const core = await moveViewport(page);
  await tabs.getByRole('button', { name: 'analytics', exact: true }).click();
  await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ArrowLeft');
  const analytics = await viewport(page);
  expect(analytics).not.toEqual(core);
  await tabs.getByRole('button', { name: 'core', exact: true }).click();
  await expect.poll(() => viewport(page)).toEqual(core);
  await tabs.getByRole('button', { name: 'analytics', exact: true }).click();
  await expect.poll(() => viewport(page)).toEqual(analytics);
  await tabs.getByRole('button', { name: 'core', exact: true }).click();
  await waitForSavedViewport(page, core);
  await page.reload();
  await tabs.getByRole('button', { name: 'core', exact: true }).click();
  await expect.poll(() => viewport(page)).toEqual(core);
  await tabs.getByRole('button', { name: 'analytics', exact: true }).click();
  await expect.poll(() => viewport(page)).toEqual(analytics);
});

test('Space plus left drag pans without moving or selecting objects and persists the viewport', async ({ page }) => {
  const before = await savedSchema(page), initial = await viewport(page), area = page.locator('.canvas-viewport');
  const box = await area.boundingBox(); if (!box) throw new Error('Canvas unavailable');
  await area.click({ position: { x: 15, y: 15 } }); await page.keyboard.down('Space');
  await expect(area).toHaveCSS('cursor', 'grab');
  await page.mouse.move(box.x + 25, box.y + 35); await page.mouse.down(); await page.mouse.move(box.x + 135, box.y + 115, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Space');
  const final = await viewport(page); expect(final.x - initial.x).toBeCloseTo(110, 4); expect(final.y - initial.y).toBeCloseTo(80, 4); expect(final.scale).toBe(initial.scale);
  await expect(page.locator('[data-testid=table-card].selected')).toHaveCount(0); await expect(area).toHaveCSS('cursor', 'default');
  await waitForSavedViewport(page, final); expect(await savedSchema(page)).toEqual(before);
  await page.reload(); await expect.poll(() => viewport(page)).toEqual(final); expect(await savedSchema(page)).toEqual(before);
});

test('mouse-wheel zoom preserves the world point under the cursor and persists without schema edits', async ({ page }) => {
  const schema = await savedSchema(page), area = page.locator('.canvas-viewport'), box = await area.boundingBox(); if (!box) throw new Error('Canvas unavailable');
  const cursor = { x: 35, y: 45 }; await page.mouse.move(box.x + cursor.x, box.y + cursor.y);
  await area.evaluate(el => el.addEventListener('wheel', e => { (window as unknown as { wheelPoint: { x: number; y: number } }).wheelPoint = { x: (e as WheelEvent).clientX, y: (e as WheelEvent).clientY }; }, { capture: true }));
  const initial = await viewport(page); let anchor = { x: 0, y: 0 };
  const checkAnchor = async () => { const current = await viewport(page); expect((cursor.x - current.x) / current.scale).toBeCloseTo(anchor.x, 2); expect((cursor.y - current.y) / current.scale).toBeCloseTo(anchor.y, 2); return current; };
  await page.mouse.wheel(0, -200); await expect.poll(async () => (await viewport(page)).scale).toBeGreaterThan(initial.scale);
  const actual = await page.evaluate(() => (window as unknown as { wheelPoint: { x: number; y: number } }).wheelPoint); cursor.x = actual.x - box.x; cursor.y = actual.y - box.y;
  anchor = { x: (cursor.x - initial.x) / initial.scale, y: (cursor.y - initial.y) / initial.scale }; const enlarged = await checkAnchor();
  await page.mouse.wheel(0, 200); await expect.poll(async () => (await viewport(page)).scale).toBeLessThan(enlarged.scale); const final = await checkAnchor();
  await waitForSavedViewport(page, final); expect(await savedSchema(page)).toEqual(schema); await page.reload(); await expect.poll(() => viewport(page)).toEqual(final); expect(await savedSchema(page)).toEqual(schema);
});

for (const zoomSteps of [0, 5]) {
  for (const point of [{ x: 35, y: 30 }, { x: 145, y: 90 }]) {
    test(`minimap click ${point.x},${point.y} centers the corresponding world point at ${Math.round(100 * 1.1 ** zoomSteps)}% and persists without edits`, async ({ page }) => {
      // Infer the map/world ratio from the rendered table rather than duplicating
      // the minimap's padding/bounds algorithm in the expected result.
      await page.locator('.canvas-viewport').click({ position: { x: 10, y: 10 } });
      for (let i = 0; i < zoomSteps; i++) await page.keyboard.press('+');
      await expect(page.locator('.zoom-pct')).toHaveText(`${Math.round(100 * 1.1 ** zoomSteps)}%`);
      const before = await savedSchema(page), initial = await viewport(page);
      const mapping = await page.locator('.minimap').evaluate(el => {
        const mini = el.querySelector('.mini-table') as HTMLElement;
        const table = document.querySelector('[data-testid="table-card"]') as HTMLElement;
        const parent = el.parentElement!.parentElement!.getBoundingClientRect();
        return { x: parseFloat(mini.style.left), y: parseFloat(mini.style.top), ratio: parseFloat(mini.style.width) / table.offsetWidth, width: parent.width, height: parent.height };
      });
      expect(mapping.ratio).toBeGreaterThan(0);
      await page.locator('.minimap').evaluate(el => {
        el.addEventListener('click', event => {
          const e = event as MouseEvent, rect = el.getBoundingClientRect();
          (el as HTMLElement).dataset.lastClick = JSON.stringify({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }, { once: true });
      });
      await page.locator('.minimap').click({ position: point });
      const clicked = JSON.parse((await page.locator('.minimap').getAttribute('data-last-click'))!) as { x: number; y: number };
      const worldPoint = { x: 100 + (clicked.x - mapping.x) / mapping.ratio, y: 180 + (clicked.y - mapping.y) / mapping.ratio };
      const expected = { x: mapping.width / 2 - worldPoint.x * initial.scale, y: mapping.height / 2 - worldPoint.y * initial.scale, scale: initial.scale };
      await expect.poll(async () => {
        const actual = await viewport(page);
        return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
      }).toBeLessThan(0.1);
      const moved = await viewport(page); expect(moved).not.toEqual(initial);
      expect(moved.scale).toBe(initial.scale); await waitForSavedViewport(page, moved);
      // The viewport marker must center on the actual click as well.
      const marker = await page.locator('.mini-viewport').evaluate(el => {
        const node = el as HTMLElement;
        return { x: parseFloat(node.style.left) + parseFloat(node.style.width) / 2, y: parseFloat(node.style.top) + parseFloat(node.style.height) / 2 };
      });
      expect(marker.x).toBeCloseTo(clicked.x, 1); expect(marker.y).toBeCloseTo(clicked.y, 1);
      expect(await savedSchema(page)).toEqual(before);
      await page.reload();
      await expect.poll(async () => {
        const restored = await viewport(page);
        return Math.max(Math.abs(restored.x - moved.x), Math.abs(restored.y - moved.y), Math.abs(restored.scale - moved.scale));
      }).toBeLessThan(0.001);
      expect(await savedSchema(page)).toEqual(before);
    });
  }
}
