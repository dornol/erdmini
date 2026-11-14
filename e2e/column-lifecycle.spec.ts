import { expect, test, type Page } from 'playwright/test';
import type { Column, ERDSchema, Table } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function column(id: string): Column {
  return { id, name: id, type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false };
}

function fixture(): ERDSchema {
  const tables: Table[] = ['parent', 'child'].map((id, i) => ({
    id, name: id, columns: [column(`${id}_id`), column(`${id}_tenant`), column(`${id}_code`)],
    position: { x: 100 + i * 300, y: 120 }, foreignKeys: [],
    uniqueKeys: [
      { id: `${id}_composite`, name: 'tenant_key', columnIds: [`${id}_id`, `${id}_tenant`] },
      { id: `${id}_unrelated`, name: 'code_key', columnIds: [`${id}_id`, `${id}_code`] },
    ],
    indexes: [
      { id: `${id}_tenant_index`, name: 'tenant_index', columnIds: [`${id}_tenant`], unique: false },
      { id: `${id}_code_index`, name: 'code_index', columnIds: [`${id}_code`], unique: false },
    ],
  }));
  tables[1].foreignKeys = [{
    id: 'composite_fk', columnIds: ['child_id', 'child_tenant'], referencedTableId: 'parent',
    referencedColumnIds: ['parent_id', 'parent_tenant'], onDelete: 'CASCADE', onUpdate: 'NO ACTION',
  }];
  return { version: '1', tables, domains: [], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

async function selectTable(page: Page, name: string) {
  await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: new RegExp(`^${name}$`) }) }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
});

for (const target of ['parent', 'child'] as const) {
  test(`deleting ${target} composite-FK column cancels safely, cleans dependencies and supports undo/redo`, async ({ page }) => {
    const schema = fixture();
    await importSchema(page, schema);
    await selectTable(page, target);
    const rows = page.getByTestId('column-row');
    const tenant = rows.filter({ has: page.locator('.col-name', { hasText: `${target}_tenant` }) });
    await tenant.hover();
    await tenant.locator('.col-del-btn').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
    await expect(rows).toHaveCount(3);
    await expect(page.locator('.uk-section .fk-row')).toHaveCount(2);
    await expect(page.locator('.idx-section .fk-row')).toHaveCount(2);
    await selectTable(page, 'child');
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
    await selectTable(page, target);

    await tenant.hover();
    await tenant.locator('.col-del-btn').click();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.locator('.uk-section .fk-row')).toHaveText(/code_key/);
    await expect(page.locator('.idx-section .fk-row')).toHaveText(/code_index/);
    await selectTable(page, 'child');
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(0);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await selectTable(page, target);
    await expect(rows).toHaveCount(3);
    await expect(page.locator('.uk-section .fk-row')).toHaveCount(2);
    await expect(page.locator('.idx-section .fk-row')).toHaveCount(2);
    await selectTable(page, 'child');
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(0);
    await expect.poll(async () => {
      const saved = await savedSchema(page);
      return saved?.tables.find((t) => t.id === target)?.columns.map((c) => c.name);
    }).toEqual([`${target}_id`, `${target}_code`]);
    await page.reload();
    await selectTable(page, target);
    await expect(rows.locator('.col-name')).toHaveText([`${target}_id`, `${target}_code`]);
    await expect(page.locator('.uk-section .fk-row')).toHaveText(/code_key/);
    await expect(page.locator('.idx-section .fk-row')).toHaveText(/code_index/);
    await selectTable(page, 'child');
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(0);
  });
}

test('reorders columns by dragging and preserves constraint identities after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await importSchema(page, fixture());
  await selectTable(page, 'child');
  const rows = page.getByTestId('column-row');
  const handle = rows.nth(2).locator('.drag-handle');
  await handle.hover();
  const source = await handle.boundingBox();
  const target = await rows.first().boundingBox();
  if (!source || !target) throw new Error('Column drag endpoints are not measurable');
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2, { steps: 5 });
  await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  const order = ['child_code', 'child_id', 'child_tenant'];
  await expect(rows.locator('.col-name')).toHaveText(order);
  await expect(page.locator('.fk-section .fk-row')).toContainText('(child_id, child_tenant)');
  await expect.poll(async () => (await savedSchema(page))?.tables.find((t) => t.id === 'child')?.columns.map((c) => c.name)).toEqual(order);
  await page.reload();
  await selectTable(page, 'child');
  await expect(rows.locator('.col-name')).toHaveText(order);
  await expect(page.locator('.fk-section .fk-row')).toContainText('(child_id, child_tenant)');
  await expect(page.locator('.uk-section .fk-row').first()).toContainText('(child_id, child_tenant)');
});

for (const entry of ['row', 'popup'] as const) {
  test(`deleting the target of a self-reference from the ${entry} confirms and removes its FK`, async ({ page }) => {
    const schema = fixture();
    schema.tables = [schema.tables[0]];
    schema.tables[0].foreignKeys = [{
      id: 'self_fk', columnIds: ['parent_code'], referencedTableId: 'parent',
      referencedColumnIds: ['parent_id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION',
    }];
    await importSchema(page, schema);
    await selectTable(page, 'parent');
    const row = page.getByTestId('column-row').first();
    if (entry === 'popup') await row.click();
    else await row.hover();
    const deletion = entry === 'popup'
      ? page.getByTestId('column-edit-popup').locator('.delete-col-btn')
      : row.locator('.col-del-btn');
    await deletion.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toContainText('1 related FK(s)');
    await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByTestId('column-row')).toHaveCount(3);
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(1);
    if (entry === 'row') await row.hover();
    await deletion.click();
    await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(0);
    await expect(page.getByTestId('column-row')).toHaveCount(2);
    await expect(page.getByTestId('column-edit-popup')).toBeHidden();
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.foreignKeys).toEqual([]);
    await page.reload();
    await selectTable(page, 'parent');
    await expect(page.locator('.fk-section .fk-row')).toHaveCount(0);
    await expect(page.getByTestId('column-row').locator('.col-name')).toHaveText(['parent_tenant', 'parent_code']);
  });
}

for (const type of ['DECIMAL', 'NUMERIC'] as const) {
  for (const boundary of ['zero', 'invalid'] as const) {
    test(`${type} column ${boundary} dimensions preserve metadata, domain links and undo history through reload`, async ({ page }) => {
      page.setDefaultTimeout(10_000);
      const schema = fixture();
      const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
      schema.domains = [{ id: 'amount', name: 'money_amount', type, length: 10, scale: 2, ...flags, defaultValue: '0', comment: 'Domain documentation' }];
      for (const table of schema.tables) {
        table.columns[2] = { ...table.columns[2], type, length: 10, scale: 2, domainId: 'amount', defaultValue: '0', comment: 'Local column comment' };
      }
      await importSchema(page, schema);
      const current = async () => (await savedSchema(page))?.tables.find(t => t.id === 'parent')?.columns.find(c => c.id === 'parent_code');
      await expect.poll(async () => (await current())?.scale).toBe(2);
      const original = (await savedSchema(page))!;
      const originalColumn = (await current())!;
      await selectTable(page, 'parent');
      const row = page.getByTestId('column-row').filter({ has: page.locator('.col-name', { hasText: /^parent_code$/ }) });
      const popup = page.getByTestId('column-edit-popup');
      const open = async () => { await row.click(); await expect(popup).toBeVisible(); };
      const close = async () => { await popup.getByRole('button', { name: 'Close', exact: true }).click(); await expect(popup).toBeHidden(); };
      await open();
      if (boundary === 'invalid') {
        for (const [id, values, originalValue] of [
          ['ce-length', ['-1', '0', '65536', '1.5'], '10'],
          ['ce-scale', ['-1', '31', '1.5'], '2'],
        ] as const) {
          for (const value of values) {
            const input = popup.locator(`#${id}`);
            await input.fill(value);
            expect(await input.evaluate(node => (node as HTMLInputElement).validity.valid)).toBe(false);
            await close();
            await open();
            await expect(popup.locator(`#${id}`)).toHaveValue(originalValue);
            expect(await current()).toEqual(originalColumn);
          }
        }
      }
      const scale = boundary === 'zero' ? 0 : 3;
      await popup.locator('#ce-scale').fill(String(scale));
      await expect(popup.locator('#ce-scale')).toHaveValue(String(scale));
      await close();
      const expectedColumn = { ...originalColumn, scale, domainId: undefined };
      await expect.poll(current).toEqual(expectedColumn);
      const expectedTables = original.tables.map(table => table.id === 'parent' ? { ...table, columns: table.columns.map(c => c.id === 'parent_code' ? expectedColumn : c) } : table);
      expect((await savedSchema(page))?.tables).toEqual(expectedTables);
      expect((await savedSchema(page))?.domains).toEqual(original.domains);
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(current).toEqual(originalColumn);
      expect((await savedSchema(page))?.tables).toEqual(original.tables);
      await page.getByRole('button', { name: /^Redo/ }).click();
      await expect.poll(current).toEqual(expectedColumn);
      await page.reload();
      await selectTable(page, 'parent');
      await open();
      await expect(popup.locator('#ce-scale')).toHaveValue(String(scale));
      expect((await savedSchema(page))?.tables).toEqual(expectedTables);
      expect((await savedSchema(page))?.domains).toEqual(original.domains);
      // An empty optional scale is distinct from an explicit zero.
      await popup.locator('#ce-scale').fill('');
      await close();
      await expect.poll(current).toEqual({ ...expectedColumn, scale: undefined });
      await page.getByRole('button', { name: /^Undo/ }).click();
      await expect.poll(current).toEqual(expectedColumn);
      await page.getByRole('button', { name: /^Redo/ }).click();
      await expect.poll(current).toEqual({ ...expectedColumn, scale: undefined });
      await page.reload();
      await selectTable(page, 'parent');
      await open();
      await expect(popup.locator('#ce-scale')).toHaveValue('');
      expect((await savedSchema(page))?.domains).toEqual(original.domains);
    });
  }
}

test('column tooltips do not block selecting an adjacent table', async ({ page }) => {
  await importSchema(page, fixture());
  const parent = page.getByTestId('table-card').filter({ hasText: 'parent_code' });
  const child = page.getByTestId('table-card').filter({ hasText: 'child_code' });
  await parent.locator('[data-column-id="parent_id"]').hover();
  const tooltip = parent.locator('[data-column-id="parent_id"] .col-tooltip');
  await expect(tooltip).toBeVisible();
  const overlay = await tooltip.boundingBox();
  const target = await child.locator('[data-column-id="child_id"]').boundingBox();
  if (!overlay || !target) throw new Error('Tooltip overlap is not measurable');
  const left = Math.max(overlay.x, target.x);
  const right = Math.min(overlay.x + overlay.width, target.x + target.width);
  const top = Math.max(overlay.y, target.y);
  const bottom = Math.min(overlay.y + overlay.height, target.y + target.height);
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);
  await page.mouse.click((left + right) / 2, (top + bottom) / 2);
  await expect(page.getByTestId('table-name-input')).toHaveValue('child');
});

for (const flag of [
  { label: 'PK', field: 'primaryKey' }, { label: 'NN', field: 'nullable' },
  { label: 'UQ', field: 'unique' }, { label: 'AI', field: 'autoIncrement' },
] as const) {
  test(`${flag.label} column flag enables and clears with undo, redo, metadata preservation and reload`, async ({ page }) => {
    const model = fixture(); Object.assign(model.tables[0].columns[0], { nullable: true, defaultValue: '0', check: 'value >= 0', comment: 'Retain flag metadata' });
    await importSchema(page, model); await expect.poll(async () => (await savedSchema(page))?.tables[0]?.columns[0]?.nullable).toBe(true); const before = await savedSchema(page);
    const open = async () => { const parent = page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^parent$/ }) }); await parent.locator('.column-row').first().dblclick(); return page.getByTestId('column-edit-popup'); };
    let popup = await open(); await popup.locator('.flag-label').filter({ hasText: new RegExp(`^\\s*${flag.label}\\s*$`) }).locator('input').check();
    if (flag.label === 'PK') await expect(popup.locator('.flag-label').filter({ hasText: /^\s*NN\s*$/ }).locator('input')).toBeChecked();
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    const enabled = structuredClone(before!.tables); Object.assign(enabled[0].columns[0], flag.label === 'NN' ? { nullable: false } : flag.label === 'PK' ? { primaryKey: true, nullable: false } : { [flag.field]: true });
    await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(enabled);
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before!.tables);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(enabled);
    await page.reload(); popup = await open(); const checkbox = popup.locator('.flag-label').filter({ hasText: new RegExp(`^\\s*${flag.label}\\s*$`) }).locator('input'); await expect(checkbox).toBeChecked(); await checkbox.uncheck();
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    const cleared = structuredClone(enabled); Object.assign(cleared[0].columns[0], flag.label === 'NN' ? { nullable: true } : { [flag.field]: false });
    await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(cleared); await page.reload(); expect((await savedSchema(page))!.tables).toEqual(cleared);
    popup = await open(); await expect(popup.locator('.flag-label').filter({ hasText: new RegExp(`^\\s*${flag.label}\\s*$`) }).locator('input')).not.toBeChecked();
  });
}

test('new column name and type edits persist and independent deletion restores metadata on undo and reloads cleanly', async ({ page }) => {
  await importSchema(page, fixture()); await selectTable(page, 'parent');
  await expect.poll(async () => (await savedSchema(page))?.tables[0]?.columns.length).toBe(3); const before = await savedSchema(page);
  await page.getByTestId('add-column').click(); const popup = page.getByTestId('column-edit-popup'); await expect(popup).toBeVisible();
  await popup.getByTestId('column-name-input').fill('contact_email'); await popup.locator('.ss-trigger').first().click(); await page.locator('.ss-dropdown .ss-item').filter({ hasText: /^VARCHAR$/ }).click();
  await popup.locator('#ce-length').fill('80'); await popup.locator('#ce-default').fill("'none'"); await popup.locator('#ce-comment').fill('보존할 컬럼 설명'); await popup.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(async () => (await savedSchema(page))?.tables[0]?.columns.at(-1)?.name).toBe('contact_email');
  const added = (await savedSchema(page))!; const column = added.tables[0].columns.at(-1)!; expect(column).toMatchObject({ name: 'contact_email', type: 'VARCHAR', length: 80, defaultValue: "'none'", comment: '보존할 컬럼 설명' });
  expect(added.tables[0]).toEqual({ ...before!.tables[0], columns: [...before!.tables[0].columns, column] }); expect(added.tables[1]).toEqual(before!.tables[1]);
  await page.reload(); await selectTable(page, 'parent');
  const open = async () => { await page.getByTestId('column-row').filter({ hasText: 'contact_email' }).click(); await expect(popup).toBeVisible(); };
  await open(); await expect(popup.getByTestId('column-name-input')).toHaveValue('contact_email'); await expect(popup.locator('.ss-trigger').first()).toContainText('VARCHAR'); await expect(popup.locator('#ce-length')).toHaveValue('80'); await expect(popup.locator('#ce-default')).toHaveValue("'none'"); await expect(popup.locator('#ce-comment')).toHaveValue('보존할 컬럼 설명');
  await popup.locator('.delete-col-btn').click(); await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before!.tables);
  await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(added.tables);
  await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before!.tables); await page.reload(); expect((await savedSchema(page))!.tables).toEqual(before!.tables);
});

for (const clear of [false, true]) {
  test(`ENUM popup ${clear ? 'clears optional values' : 'trims Unicode values and drops blank tokens'} with metadata and history preserved`, async ({ page }) => {
    const model = fixture();
    model.tables[0].columns[2] = { ...model.tables[0].columns[2], type: 'ENUM', enumValues: ['draft', 'active'], defaultValue: "'draft'", comment: 'Preserve local documentation' };
    await importSchema(page, model);
    const current = async () => (await savedSchema(page))?.tables[0]?.columns[2];
    await expect.poll(async () => (await current())?.enumValues).toEqual(['draft', 'active']);
    const before = (await savedSchema(page))!;
    await selectTable(page, 'parent');
    const row = page.getByTestId('column-row').filter({ has: page.locator('.col-name', { hasText: /^parent_code$/ }) });
    await row.click();
    const popup = page.getByTestId('column-edit-popup');
    await expect(popup.locator('#ce-enum')).toHaveValue('draft, active');
    await popup.locator('#ce-enum').fill(clear ? ' ,  , ' : ' draft, , 진행 중 , 완료,  ');
    const values = clear ? undefined : ['draft', '진행 중', '완료'];
    await expect.poll(async () => (await current())?.enumValues).toEqual(values);
    const expected = { ...before.tables[0].columns[2], enumValues: values };
    expect(await current()).toEqual(expected);
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(current).toEqual(before.tables[0].columns[2]);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(current).toEqual(expected);
    const after = (await savedSchema(page))!;
    expect(after.tables).toEqual(before.tables.map((table, i) => i === 0 ? { ...table, columns: table.columns.map((col, j) => j === 2 ? expected : col) } : table));
    expect(after.domains).toEqual(before.domains); expect(after.memos).toEqual(before.memos);
    await page.reload(); await selectTable(page, 'parent'); await row.click();
    await expect(popup.locator('#ce-enum')).toHaveValue(values?.join(', ') ?? '');
    expect((await savedSchema(page))!.tables).toEqual(after.tables);
  });
}

for (const field of ['check', 'comment'] as const) {
  test(`column ${field} set and clear preserve constraints with undo redo and reload`, async ({ page }) => {
    await importSchema(page, fixture()); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
    const before = (await savedSchema(page))!, current = async () => (await savedSchema(page))?.tables[0]?.columns[2];
    await selectTable(page, 'parent');
    const row = page.getByTestId('column-row').filter({ has: page.locator('.col-name', { hasText: /^parent_code$/ }) });
    await row.click(); const popup = page.getByTestId('column-edit-popup');
    const value = field === 'check' ? 'parent_code >= 0 AND parent_code < 100' : "한글 설명 O'Brien";
    await popup.locator(`#ce-${field}`).fill(value);
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    const expected = { ...before.tables[0].columns[2], [field]: value };
    await expect.poll(current).toEqual(expected);
    await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(current).toEqual(before.tables[0].columns[2]);
    await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(current).toEqual(expected);
    await page.reload(); await selectTable(page, 'parent'); await row.click();
    await expect(popup.locator(`#ce-${field}`)).toHaveValue(value);
    await popup.locator(`#ce-${field}`).fill(''); await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await expect.poll(async () => (await current())?.[field] ?? '').toBe('');
    const after = (await savedSchema(page))!;
    expect(after.tables[0].foreignKeys).toEqual(before.tables[0].foreignKeys);
    expect(after.tables[0].uniqueKeys).toEqual(before.tables[0].uniqueKeys); expect(after.tables[0].indexes).toEqual(before.tables[0].indexes);
    expect(after.tables[1]).toEqual(before.tables[1]);
    await page.reload(); expect((await savedSchema(page))!.tables).toEqual(after.tables);
  });
}
