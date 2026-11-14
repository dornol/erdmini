import { expect, test, type Locator } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return {
    version: '1', tables: [{ id: 'users', name: 'users', columns: [{ id: 'id', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 100, y: 160 } }],
    domains: [], memos: [{ id: 'memo', content: '번역하지 않는 메모', position: { x: 400, y: 350 }, width: 180, height: 120 }],
    dbObjects: [{ id: 'view', name: 'users_view', category: 'Views', sql: 'SELECT id FROM users;' }], dbObjectCategories: ['Views'],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
});

for (const locale of [
  { code: 'ko', label: '한국어', add: '+ 새 테이블' },
  { code: 'en', label: 'English', add: '+ New Table' },
  { code: 'ja', label: '日本語', add: '+ 新規テーブル' },
  { code: 'zh', label: '中文', add: '+ 新建表' },
]) {
  test(`${locale.label} selection updates the UI and survives reload without losing pending edits`, async ({ page }) => {
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe('users');
    if (locale.code === 'en') {
      await page.locator('.btn-lang').click();
      await page.getByRole('menuitem', { name: '日本語', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    }
    await page.getByTestId('table-card').click();
    await page.getByTestId('table-name-input').fill('pending_locale_edit');
    // Change locale immediately; waiting for autosave here would hide data loss.
    await page.locator('.btn-lang').click();
    await page.getByRole('menuitem', { name: locale.label, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(page.locator('.toolbar .btn-primary')).toHaveText(locale.add);
    await expect(page.locator('.btn-lang')).toHaveText(locale.code.toUpperCase());
    await expect(page.getByTestId('table-card')).toContainText('pending_locale_edit');
    await expect(page.getByTestId('memo-card')).toContainText('번역하지 않는 메모');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(page.locator('.toolbar .btn-primary')).toHaveText(locale.add);
    await expect(page.getByTestId('table-card')).toContainText('pending_locale_edit');
    await expect(page.getByTestId('memo-card')).toContainText('번역하지 않는 메모');
  });
}

for (const surface of ['input', 'column input', 'textarea', 'SQL editor'] as const) {
  test(`${surface} keeps text editing shortcuts from mutating or navigating the diagram`, async ({ page }) => {
    await page.locator('.toolbar .btn-primary').click();
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    let editor: Locator;
    if (surface === 'input') editor = page.getByTestId('table-name-input');
    else if (surface === 'column input') {
      await page.getByTestId('table-card').last().locator('.column-row').first().dblclick();
      editor = page.getByTestId('column-edit-popup').getByTestId('column-name-input');
    } else if (surface === 'textarea') {
      await page.getByTestId('memo-card').locator('.memo-content').dblclick();
      editor = page.getByTestId('memo-card').locator('.memo-textarea');
    } else {
      await page.getByRole('button', { name: /objects 1/i }).click();
      await page.locator('.object-row .object-item').click();
      editor = page.locator('.db-object-editor .cm-content');
    }
    await editor.fill('draft');
    await editor.press('End');
    await editor.pressSequentially('X');
    await editor.press('ControlOrMeta+z');
    await expect(editor).toBeFocused();
    if (surface === 'SQL editor') await expect(editor).toHaveText('draft');
    else await expect(editor).toHaveValue('draft');
    await editor.press('ControlOrMeta+Shift+z');
    if (surface === 'SQL editor') await expect(editor).toHaveText('draftX');
    else await expect(editor).toHaveValue('draftX');
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
    const transform = await page.locator('.canvas-world').getAttribute('style');
    const zoom = await page.locator('.zoom-pct').textContent();
    await editor.press('ControlOrMeta+a');
    await editor.press('Backspace');
    await editor.pressSequentially('draft+-f');
    await editor.press('ArrowRight');
    await editor.press('ControlOrMeta+d');
    await editor.press('Delete');
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.fullscreen-canvas')).toHaveCount(0);
    await expect(page.locator('.canvas-world')).toHaveAttribute('style', transform!);
    await expect(page.locator('.zoom-pct')).toHaveText(zoom!);
    await expect(page.locator('.command-palette')).toHaveCount(0);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await editor.fill('text_only_copy');
    await editor.press('ControlOrMeta+a');
    await editor.press('ControlOrMeta+c');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('text_only_copy');
    const diagramClipboard = JSON.stringify({ _type: 'erdmini_tables', tables: fixture().tables });
    await page.evaluate((text) => navigator.clipboard.writeText(text), diagramClipboard);
    await editor.press('ControlOrMeta+v');
    if (surface === 'SQL editor') await expect(editor).toContainText('erdmini_tables');
    else await expect(editor).toHaveValue(diagramClipboard);
    await expect(page.getByTestId('table-card')).toHaveCount(2);
  });
}

for (const theme of ['Modern', 'Classic', 'Blueprint', 'Minimal']) {
  test(`${theme} theme and dark mode preserve canvas and panel colors and survive reload without schema edits`, async ({ page }) => {
    await expect.poll(async () => (await savedSchema(page))?.memos.length).toBe(1); const before = await savedSchema(page);
    await page.locator('.canvas-bottom-bar button[title="Theme"]').click(); await page.getByRole('menuitem', { name: theme, exact: true }).click();
    const canvas = page.locator('.canvas-viewport'); await expect(canvas).toHaveAttribute('data-theme', theme.toLowerCase());
    const colors = () => canvas.evaluate(el => { const style = getComputedStyle(el); return { bg: style.backgroundColor, variable: style.getPropertyValue('--erd-canvas-bg').trim() }; });
    const panelColor = () => page.locator('.sidebar').evaluate(el => getComputedStyle(el).backgroundColor);
    const lightPanel = await panelColor(); const light = await colors(); expect(light.variable).not.toBe(''); expect(light.bg).not.toBe('rgba(0, 0, 0, 0)');
    await page.reload(); await expect(canvas).toHaveAttribute('data-theme', theme.toLowerCase()); expect(await colors()).toEqual(light);
    await page.getByTestId('theme-toggle').click(); await expect(page.locator('.app')).toHaveAttribute('data-dark', 'true');
    const dark = await colors(); expect(dark).toEqual(light); await expect.poll(panelColor).not.toBe(lightPanel); const darkPanel = await panelColor();
    await page.reload(); await expect(canvas).toHaveAttribute('data-theme', theme.toLowerCase()); await expect(page.locator('.app')).toHaveAttribute('data-dark', 'true'); expect(await colors()).toEqual(dark); expect(await panelColor()).toBe(darkPanel);
    expect(await savedSchema(page)).toEqual(before); await expect(page.getByTestId('memo-card')).toContainText('번역하지 않는 메모');
    await page.getByTestId('theme-toggle').click(); await expect(page.locator('.app')).not.toHaveAttribute('data-dark'); expect(await colors()).toEqual(light); await expect.poll(panelColor).toBe(lightPanel);
  });
}

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier} palette handles empty results keyboard wrap Escape and hidden-namespace column navigation`, async ({ page }) => {
    const target = fixture(); target.schemas = ['core', 'analytics']; target.tables[0].schema = 'core'; target.tables.push({ ...structuredClone(target.tables[0]), id: 'hidden', name: 'hidden_report', schema: 'analytics', position: { x: 1800, y: 900 }, columns: [{ ...target.tables[0].columns[0], id: 'hidden_column', name: 'searchable_payload' }] });
    await page.getByTestId('import-menu-toggle').click(); const chooser = page.waitForEvent('filechooser'); await page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click(); await (await chooser).setFiles({ name: 'palette.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(target)) }); await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2); const before = (await savedSchema(page))!;
    await page.locator('.schema-tab-bar').getByRole('button', { name: 'core', exact: true }).click(); await page.keyboard.press(`${modifier}+k`); const palette = page.locator('.cmd-backdrop'), input = palette.locator('.cmd-input'); await expect(input).toBeFocused();
    await input.fill('not-existing'); await expect(palette).toContainText('No results found.'); await input.press('Enter'); await expect(palette).toBeVisible(); await input.press('Escape'); await expect(palette).toHaveCount(0); expect(await savedSchema(page)).toEqual(before);
    await page.keyboard.press(`${modifier}+k`); await input.fill(''); const items = palette.locator('.cmd-item'); const count = await items.count(); expect(count).toBeGreaterThan(1); await input.press('ArrowUp'); await expect(items.last()).toHaveClass(/highlighted/); await input.press('ArrowDown'); await expect(items.first()).toHaveClass(/highlighted/);
    await input.fill('SEARCHABLE_PAYLOAD'); await expect(items).toHaveCount(1); await input.press('Enter'); await expect(palette).toHaveCount(0);
    const table = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^hidden_report$/ }) }); await expect(table).toBeInViewport(); await expect(table).toHaveClass(/selected/); await expect(page.getByTestId('table-name-input')).toHaveValue('hidden_report'); expect(await savedSchema(page)).toEqual(before);
    await page.reload(); expect(await savedSchema(page)).toEqual(before);
  });
}
