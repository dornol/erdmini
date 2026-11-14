import { expect, test } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import { importSchema, savedSchema } from './helpers/local-schema';
import type { ERDSchema } from '../src/lib/types/erd';

for (const format of ['SVG', 'PNG', 'PDF']) {
  test(`${format} export includes memo content and preserves the live schema and viewport`, async ({ page }) => {
    await page.goto('/'); await page.getByTestId('create-project').click();
    const model: ERDSchema = { version: '1', domains: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      tables: [{ id: 'users', name: 'users', position: { x: 100, y: 100 }, columns: [{ id: 'id', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }], foreignKeys: [], uniqueKeys: [], indexes: [] }],
      memos: [{ id: 'free', content: 'FREE_MEMO_EXPORT', color: 'pink', position: { x: 500, y: 300 }, width: 250, height: 120 }, { id: 'attached', content: 'ATTACHED_EXPORT', color: 'blue', attachedTableId: 'users', position: { x: 100, y: 50 }, width: 200, height: 100 }],
    };
    await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.memos.length).toBe(2);
    const before = await savedSchema(page), worldStyle = await page.locator('.canvas-world').getAttribute('style');
    const region = await page.evaluate(() => {
      const world = document.querySelector<HTMLElement>('.canvas-world')!; const scale = new DOMMatrix(getComputedStyle(world).transform).a;
      const cards = [...world.querySelectorAll<HTMLElement>('.table-card, .memo-card')].map(el => el.getBoundingClientRect());
      const minX = Math.min(...cards.map(r => r.left)), minY = Math.min(...cards.map(r => r.top));
      const memo = [...world.querySelectorAll<HTMLElement>('.memo-card')].find(el => el.textContent?.includes('FREE_MEMO_EXPORT'))!; const rect = memo.getBoundingClientRect();
      return { x: (rect.left - minX) / scale + 40, y: (rect.top - minY) / scale + 40, width: rect.width / scale, height: rect.height / scale, background: getComputedStyle(memo).backgroundColor };
    });
    await page.getByTestId('export-menu-toggle').click(); const pending = page.waitForEvent('download'); await page.getByTestId('export-menu').getByRole('menuitem', { name: new RegExp(format) }).click();
    const download = await pending, bytes = await readFile((await download.path())!);
    if (format === 'SVG') {
      const text = bytes.toString('utf8'); expect(text).toContain('FREE_MEMO_EXPORT'); expect(text).toContain('ATTACHED_EXPORT'); expect(text).toContain('memo-clip-free');
    }
    if (format === 'PDF') {
      const text = bytes.toString('latin1'); expect(text.startsWith('%PDF-')).toBe(true); expect(text).toContain('FREE_MEMO_EXPORT'); expect(bytes.includes(Buffer.from('ATTACHED_EXPORT', 'utf16le').swap16())).toBe(true);
    }
    if (format === 'PNG') {
      const stats = await page.evaluate(async ({ data, region }) => {
        const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(Math.round((region.x + 4) * 2), Math.round((region.y + 32) * 2), Math.round((region.width - 8) * 2), Math.round((region.height - 40) * 2)).data;
        const rgb = region.background.match(/\d+/g)!.slice(0, 3).map(Number); let background = 0, ink = 0;
        for (let i = 0; i < pixels.length; i += 4) { if (rgb.every((n, k) => Math.abs(n - pixels[i + k]) < 3)) background++; if (pixels[i] < 160 && pixels[i + 1] < 160 && pixels[i + 2] < 160 && pixels[i + 3] > 200) ink++; }
        return { background, ink, width: img.width, height: img.height };
      }, { data: bytes.toString('base64'), region });
      expect(stats.background).toBeGreaterThan(1000); expect(stats.ink).toBeGreaterThan(20); expect(stats.width).toBeGreaterThan(1000);
    }
    expect(await page.locator('.canvas-world').getAttribute('style')).toBe(worldStyle); expect(await savedSchema(page)).toEqual(before);
    await page.reload(); expect((await savedSchema(page))!.memos).toEqual(before!.memos);
  });
}
