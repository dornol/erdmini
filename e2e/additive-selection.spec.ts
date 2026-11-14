import { expect, test } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier} marquee adds tables and memos while ordinary marquee replaces selection without saving edits`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto('/'); await page.getByTestId('create-project').click();
    const model: ERDSchema = { version: '1', domains: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      tables: ['first', 'second'].map((name, i) => ({ id: name, name, position: { x: 100 + i * 350, y: 150 }, columns: [{ id: `${name}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }], foreignKeys: [], uniqueKeys: [], indexes: [], comment: `Retain ${name}` })),
      memos: [{ id: 'note', content: 'Add to selection', position: { x: 450, y: 400 }, width: 180, height: 100 }],
    };
    await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.memos.length).toBe(1); const before = await savedSchema(page);
    const first = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^first$/ }) }), second = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^second$/ }) }), memo = page.getByTestId('memo-card');
    await first.locator('.table-header').click(); await expect(first).toHaveClass(/selected/);
    const marquee = async (includeMemo: boolean, additive: boolean) => {
      const table = await second.boundingBox(), note = await memo.boundingBox(); if (!table || !note) throw new Error('Selection bounds unavailable');
      const x = table.x - 12, y = table.y - 12, right = Math.max(table.x + table.width, includeMemo ? note.x + note.width : 0) + 12, bottom = includeMemo ? note.y + note.height + 12 : table.y + table.height + 12;
      if (additive) await page.keyboard.down(modifier);
      try { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(right, bottom, { steps: 12 }); await page.mouse.up(); }
      finally { if (additive) await page.keyboard.up(modifier); }
    };
    await marquee(true, true); await expect(page.locator('[data-testid=table-card].selected')).toHaveCount(2); await expect(memo).toHaveClass(/selected/);
    await marquee(false, false); await expect(page.locator('[data-testid=table-card].selected')).toHaveCount(1); await expect(second).toHaveClass(/selected/); await expect(memo).not.toHaveClass(/selected/);
    expect(await savedSchema(page)).toEqual(before); await page.reload(); await expect(page.locator('[data-testid=table-card].selected')).toHaveCount(0); await expect(page.locator('[data-testid=memo-card].selected')).toHaveCount(0); expect(await savedSchema(page)).toEqual(before);
  });
}
