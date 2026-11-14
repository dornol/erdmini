import { expect, test, type Page } from 'playwright/test';
import * as XLSX from 'xlsx';
import { readFile } from 'node:fs/promises';
import { delayDomainRead } from './helpers/domain-upload';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  return {
    version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    domains: [
      { id: 'email', name: 'email_address', group: 'Identity', type: 'VARCHAR', length: 80, ...flags },
      { id: 'unused', name: 'audit_label', group: 'Audit', type: 'VARCHAR', length: 40, owner: 'Operations', tags: ['compliance'], ...flags },
    ],
    tables: ['accounts', 'contacts'].map((name, i) => ({
      id: name, name, position: { x: 100 + i * 350, y: 150 }, foreignKeys: [], uniqueKeys: [], indexes: [],
      columns: [
        { id: `${name}_email`, name: 'email', type: 'VARCHAR', length: 80, domainId: 'email', ...flags },
        { id: `${name}_note`, name: 'note', type: 'VARCHAR', length: 25, ...flags },
      ],
    })), memos: [],
  };
}

async function openDomains(page: Page) {
  await page.locator('.btn-tools').click();
  await page.getByRole('menuitem', { name: 'Domains', exact: true }).click();
  return page.locator('.backdrop[role="dialog"]');
}

async function columns(page: Page) {
  return (await savedSchema(page))?.tables.flatMap(t => t.columns).map(c => ({
    name: c.name, length: c.length, nullable: c.nullable, domainId: c.domainId,
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.domains.length).toBe(2);
});

test('domain impact cancellation preserves linked columns and confirmation propagates only to linked columns', async ({ page }) => {
  const original = await columns(page);
  const dialog = await openDomains(page);
  await dialog.locator('tr.display-row').filter({ hasText: 'email_address' }).click();
  const form = dialog.locator('.edit-card');
  await expect(form.getByLabel('Domain name', { exact: true })).toHaveValue('email_address');
  await expect(form.locator('input[type="number"]')).toHaveValue('80');
  await form.locator('input[type="number"]').fill('160');
  await form.getByLabel('NULL', { exact: true }).check();
  await form.locator('.edit-btn-save').click();
  const impact = page.getByRole('alertdialog');
  await expect(impact).toContainText('Affects 2 column(s) in 2 table(s)');
  await expect(impact).toContainText('accounts.email');
  await expect(impact).toContainText('contacts.email');
  await impact.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form).toBeVisible();
  expect(await columns(page)).toEqual(original);
  await form.locator('.edit-btn-save').click();
  await impact.getByRole('button', { name: 'Propagate changes?', exact: true }).click();
  const expected = original!.map(c => c.domainId === 'email' ? { ...c, length: 160, nullable: true } : c);
  await expect.poll(() => columns(page)).toEqual(expected);
  await page.reload();
  expect(await columns(page)).toEqual(expected);
  const reopened = await openDomains(page);
  await expect(reopened.locator('tr.display-row').filter({ hasText: 'email_address' })).toContainText('160');
});

test('domain coverage, unused filter and metadata search reflect actual usage without changing schema', async ({ page }) => {
  const original = await savedSchema(page);
  const dialog = await openDomains(page);
  await expect(dialog.locator('.coverage-summary')).toHaveText('Domain coverage: 50% (2/4 columns)');
  await dialog.locator('.coverage-header').click();
  await expect(dialog.locator('.coverage-bar')).toHaveClass(/red/);
  await expect(dialog.locator('tr.display-row').filter({ hasText: 'email_address' }).locator('.usage-badge')).toContainText('2');
  await dialog.locator('.unused-toggle').click();
  await expect(dialog.locator('tr.display-row')).toHaveCount(1);
  await expect(dialog.locator('tr.display-row')).toContainText('audit_label');
  await dialog.locator('.search-input').fill('COMPLIANCE');
  await expect(dialog.locator('tr.display-row')).toHaveCount(1);
  await dialog.locator('.search-input').fill('missing_domain');
  await expect(dialog.locator('tr.display-row')).toHaveCount(0);
  await dialog.locator('.search-input').fill('operations');
  await expect(dialog.locator('tr.display-row')).toHaveCount(1);
  await dialog.locator('.unused-toggle').click();
  await dialog.locator('.search-input').fill('');
  await expect(dialog.locator('tr.display-row')).toHaveCount(2);
  expect(await savedSchema(page)).toEqual(original);
});

test('deleting a used domain cancels safely then unlinks columns without losing their metadata', async ({ page }) => {
  const original = await columns(page);
  const dialog = await openDomains(page);
  const row = dialog.locator('tr.display-row').filter({ hasText: 'email_address' });
  await row.getByRole('button', { name: /delete/i }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toHaveCount(1);
  expect(await columns(page)).toEqual(original);
  await row.getByRole('button', { name: /delete/i }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(dialog.locator('.coverage-summary')).toHaveText('Domain coverage: 0% (0/4 columns)');
  const expected = original!.map(({ domainId, ...c }) => ({ ...c, domainId: undefined }));
  await expect.poll(() => columns(page)).toEqual(expected);
  await page.reload();
  expect(await columns(page)).toEqual(expected);
  expect((await savedSchema(page))?.domains.map(d => d.id)).toEqual(['unused']);
});

test('failed XLSX import preserves domains and allows retrying the same file input', async ({ page }) => {
  const original = await savedSchema(page);
  const dialog = await openDomains(page);
  const input = dialog.locator('input[type="file"]');
  // Invalid ZIP bytes fail workbook parsing rather than being accepted as CSV text.
  await input.setInputFiles({ name: 'domains.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) });
  await expect(dialog).toContainText('Error reading file');
  expect(await savedSchema(page)).toEqual(original);
  await expect(input).toHaveValue('');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Name: 'email_address', Group: 'Identity', Type: 'VARCHAR', Length: 120 },
    { Name: 'status_code', Type: 'INT', Nullable: 'Y' },
    { Name: '   ', Type: 'INT' },
  ]), 'Domains');
  await input.setInputFiles({ name: 'domains.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
  await expect(dialog).toContainText(/1 added.*1 updated/i);
  await expect(dialog.locator('tr.display-row')).toHaveCount(3);
  await expect.poll(async () => (await savedSchema(page))?.tables.map(t => t.columns[0].length)).toEqual([120, 120]);
  await page.reload();
  expect((await savedSchema(page))?.domains.map(d => d.name).sort()).toEqual(['audit_label', 'email_address', 'status_code']);
});

test('switching domain rows respects impact cancellation and saves confirmed edits to the original domain', async ({ page }) => {
  const dialog = await openDomains(page);
  await dialog.locator('tr.display-row').filter({ hasText: 'email_address' }).click();
  const form = dialog.locator('.edit-card');
  await expect(form.getByLabel('Domain name', { exact: true })).toHaveValue('email_address');
  await form.getByLabel('Length', { exact: true }).fill('200');
  const other = dialog.locator('tr.display-row').filter({ hasText: 'audit_label' });
  await other.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(form.getByLabel('Domain name', { exact: true })).toHaveValue('email_address');
  await expect(form.getByLabel('Length', { exact: true })).toHaveValue('200');
  expect((await savedSchema(page))?.domains.find(d => d.id === 'email')?.length).toBe(80);
  await other.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Propagate changes?', exact: true }).click();
  await expect(form.getByLabel('Domain name', { exact: true })).toHaveValue('audit_label');
  await expect(form.getByLabel('Length', { exact: true })).toHaveValue('40');
  await expect.poll(async () => (await savedSchema(page))?.domains.map(d => d.length)).toEqual([200, 40]);
  await expect.poll(async () => (await savedSchema(page))?.tables.map(t => t.columns[0].length)).toEqual([200, 200]);
});

test('a domain workbook finishing after project navigation cannot modify either project', async ({ page }) => {
  const original = await savedSchema(page);
  const sourceName = await page.getByTestId('project-menu-toggle').locator('.project-name').innerText();
  await delayDomainRead(page);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Name: 'unexpected_domain', Type: 'INT' }]), 'Domains');
  const dialog = await openDomains(page);
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'delayed-domains.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { domainReadStarted?: boolean }).domainReadStarted)).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('project-menu-toggle').click();
  await page.getByTestId('project-new').click();
  await page.locator('.project-new-row input').fill('Import destination isolation');
  await page.locator('.project-new-row input').press('Enter');
  await expect(page.getByTestId('project-menu-toggle')).toContainText('Import destination isolation');
  await page.evaluate(() => (window as typeof window & { releaseDomainRead?: () => void }).releaseDomainRead!());
  await expect.poll(() => page.evaluate(() => (window as typeof window & { domainReadFinished?: boolean }).domainReadFinished)).toBe(true);
  const destination = await openDomains(page);
  await expect(destination.locator('tr.display-row')).toHaveCount(0);
  await destination.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  expect((await savedSchema(page))?.domains).toEqual([]);
  await page.getByTestId('project-menu-toggle').click();
  await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: sourceName }) }).locator('.project-item-name').click();
  await expect.poll(async () => (await savedSchema(page))?.tables).toEqual(original?.tables);
  expect((await savedSchema(page))?.domains).toEqual(original?.domains);
});


test('a newer domain upload wins over an older delayed workbook without adding obsolete domains', async ({ page }) => {
  await delayDomainRead(page);
  const dialog = await openDomains(page);
  const input = dialog.locator('input[type="file"]');
  const file = (name: string, domain: string) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Name: domain, Type: 'INT' }]), 'Domains');
    return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
  };
  await input.setInputFiles(file('delayed-domains.xlsx', 'obsolete_domain'));
  await expect.poll(() => page.evaluate(() => (window as typeof window & { domainReadStarted?: boolean }).domainReadStarted)).toBe(true);
  await input.setInputFiles(file('new-domains.xlsx', 'latest_domain'));
  await expect(dialog.locator('tr.display-row').filter({ hasText: 'latest_domain' })).toHaveCount(1);
  await expect(input).toHaveValue('');
  await page.evaluate(() => (window as typeof window & { releaseDomainRead?: () => void }).releaseDomainRead!());
  await expect.poll(() => page.evaluate(() => (window as typeof window & { domainReadFinished?: boolean }).domainReadFinished)).toBe(true);
  await expect(dialog.locator('tr.display-row')).toHaveCount(3);
  await expect(dialog.locator('tr.display-row').filter({ hasText: 'obsolete_domain' })).toHaveCount(0);
  await expect.poll(async () => (await savedSchema(page))?.domains.map(domain => domain.name).sort()).toEqual(['audit_label', 'email_address', 'latest_domain']);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  expect((await savedSchema(page))?.domains.map(domain => domain.name).sort()).toEqual(['audit_label', 'email_address', 'latest_domain']);
});


test('domain XLSX preserves zero and false cells plus documentation through import, export and reload', async ({ page }) => {
  const dialog = await openDomains(page);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Name: 'zero_default', Type: 'DECIMAL', Length: 10, Scale: 0, Default: 0, Nullable: 1, PrimaryKey: false, Unique: 'TRUE', AutoIncrement: 0, Comment: 0, Example: 0, Description: '  Numeric documentation  ', Alias: '  amount  ', DataStandard: ' ISO ', ValidRange: ' 0-100 ', Owner: ' Finance ', Tags: ' finance, , numeric ', Check: ' value >= 0 ' },
    { Name: 'false_default', Type: 'BOOLEAN', Default: false, Nullable: 'N', Example: false, Comment: false },
    { Name: 'enum_metadata', Type: 'ENUM', EnumValues: ' active, , inactive ', Nullable: true, Group: ' Identity ' },
  ]), 'Domains');
  const input = dialog.locator('input[type="file"]');
  await input.setInputFiles({ name: 'cell-boundaries.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
  await expect(dialog.locator('tr.display-row')).toHaveCount(5);
  await expect.poll(async () => (await savedSchema(page))?.domains.find(domain => domain.name === 'zero_default')).toMatchObject({ type: 'DECIMAL', length: 10, scale: 0, defaultValue: '0', nullable: true, primaryKey: false, unique: true, autoIncrement: false, comment: '0', example: '0', description: 'Numeric documentation', alias: 'amount', dataStandard: 'ISO', validRange: '0-100', owner: 'Finance', tags: ['finance', 'numeric'], check: 'value >= 0' });
  expect((await savedSchema(page))?.domains.find(domain => domain.name === 'false_default')).toMatchObject({ type: 'BOOLEAN', defaultValue: 'false', nullable: false, comment: 'false', example: 'false' });
  expect((await savedSchema(page))?.domains.find(domain => domain.name === 'enum_metadata')).toMatchObject({ type: 'ENUM', nullable: true, group: 'Identity', enumValues: ['active', 'inactive'] });
  const expected = (await savedSchema(page))?.domains;
  const downloadEvent = page.waitForEvent('download');
  await dialog.locator('button[title="Download Excel"]').click();
  const download = await downloadEvent;
  const buffer = await readFile((await download.path())!);
  const exported = XLSX.read(buffer);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(exported.Sheets[exported.SheetNames[0]]);
  expect(rows.find(row => row.Name === 'zero_default')).toMatchObject({ Default: '0', Scale: 0, Comment: '0', Example: '0' });
  expect(rows.find(row => row.Name === 'false_default')).toMatchObject({ Default: 'false', Comment: 'false', Example: 'false' });
  await input.setInputFiles({ name: 'domains.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await expect(dialog).toContainText(/0 added.*5 updated/i);
  expect((await savedSchema(page))?.domains).toEqual(expected);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  expect((await savedSchema(page))?.domains).toEqual(expected);
});

for (const bookType of ['xlsx', 'xls'] as const) {
  test(`${bookType} duplicate domain rows update stable identities in row order as one undoable import`, async ({ page }) => {
    const original = (await savedSchema(page))!;
    const dialog = await openDomains(page);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Name: ' email_address ', Type: 'VARCHAR', Length: 100, Comment: 'intermediate' },
      { Name: 'new_status', Type: 'INT', Default: 1 },
      { Name: 'email_address', Type: 'NVARCHAR', Length: 240, Nullable: 'Y', Comment: 'final email' },
      { Name: ' new_status ', Type: 'BIGINT', Default: 0, Comment: 'final status' },
      { Name: '', Type: 'TEXT' },
    ]), 'Domains');
    // Only the first sheet is an import source; unrelated tabs must not add rows.
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Name: 'ignored_tab', Type: 'TEXT' }]), 'Notes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: bookType === 'xls' ? 'biff8' : 'xlsx' });
    const input = dialog.locator('input[type="file"]');
    await input.setInputFiles({ name: `duplicates.${bookType}`, mimeType: bookType === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
    await expect(dialog).toContainText(/1 added.*3 updated/i);
    await expect(dialog.locator('tr.display-row')).toHaveCount(3);
    await expect.poll(async () => (await savedSchema(page))?.domains.find(d => d.id === 'email')).toMatchObject({ name: 'email_address', type: 'NVARCHAR', length: 240, nullable: true, comment: 'final email' });
    const imported = (await savedSchema(page))!;
    expect(imported.domains.find(d => d.id === 'unused')).toEqual(original.domains.find(d => d.id === 'unused'));
    expect(imported.domains.find(d => d.name === 'new_status')).toMatchObject({ type: 'BIGINT', defaultValue: '0', comment: 'final status' });
    expect(new Set(imported.domains.map(d => d.id)).size).toBe(3);
    for (const table of imported.tables) {
      expect(table.columns[0]).toMatchObject({ id: `${table.name}_email`, domainId: 'email', type: 'NVARCHAR', length: 240, nullable: true });
      expect(table.columns[0].comment).toBe(original.tables.find(t => t.id === table.id)!.columns[0].comment);
      expect(table.columns[1]).toEqual(original.tables.find(t => t.id === table.id)!.columns[1]);
    }
    // Reimport updates the same IDs, including the newly created domain.
    await input.setInputFiles({ name: `duplicates.${bookType}`, mimeType: 'application/octet-stream', buffer });
    await expect(dialog).toContainText(/0 added.*4 updated/i);
    expect((await savedSchema(page))?.domains).toEqual(imported.domains);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    // The identical reimport does not create a separate history snapshot.
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains).toEqual(original.domains);
    expect((await savedSchema(page))?.tables).toEqual(original.tables);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains).toEqual(imported.domains);
    expect((await savedSchema(page))?.tables).toEqual(imported.tables);
    await page.reload();
    expect((await savedSchema(page))?.domains).toEqual(imported.domains);
    expect((await savedSchema(page))?.tables).toEqual(imported.tables);
  });
}

for (const contents of ['empty-sheet', 'headers-only', 'missing-name-header'] as const) {
  test(`domain import ${contents} leaves schema and undo history intact and permits a valid retry`, async ({ page }) => {
    const original = (await savedSchema(page))!;
    const dialog = await openDomains(page);
    const workbook = XLSX.utils.book_new();
    const rows = contents === 'empty-sheet' ? [] : contents === 'headers-only' ? [['Name', 'Type', 'Length']] : [['Domain', 'Type', 'Length'], ['unexpected', 'INT', 12]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Domains');
    const input = dialog.locator('input[type="file"]');
    await input.setInputFiles({ name: 'retry.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
    await expect(dialog).toContainText(/0 added.*0 updated/i);
    await expect(input).toHaveValue('');
    expect(await savedSchema(page)).toEqual(original);
    const valid = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(valid, XLSX.utils.json_to_sheet([{ Name: 'recovered', Type: 'INT' }]), 'Domains');
    await input.setInputFiles({ name: 'retry.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(valid, { type: 'buffer', bookType: 'xlsx' }) });
    await expect(dialog).toContainText(/1 added.*0 updated/i);
    await expect(dialog.locator('tr.display-row')).toHaveCount(3);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains).toEqual(original.domains);
    expect((await savedSchema(page))?.tables).toEqual(original.tables);
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains.map(d => d.name)).toEqual(['email_address', 'audit_label', 'recovered']);
    await page.reload();
    expect((await savedSchema(page))?.domains.map(d => d.name)).toEqual(['email_address', 'audit_label', 'recovered']);
    expect((await savedSchema(page))?.tables).toEqual(original.tables);
  });
}

for (const bookType of ['xlsx', 'xls'] as const) {
  test(`${bookType} domain dimensions discard invalid cells and preserve valid numeric strings and zero scale after reload`, async ({ page }) => {
    const original = (await savedSchema(page))!;
    const workbook = XLSX.utils.book_new();
    const cases = [
      { Name: 'invalid_text', Length: 'not a number', Scale: 'invalid' },
      { Name: 'invalid_infinite', Length: 'Infinity', Scale: '-Infinity' },
      { Name: 'invalid_negative', Length: -10, Scale: -1 },
      { Name: 'invalid_fractional', Length: 12.5, Scale: 1.5 },
      { Name: 'invalid_blank', Length: '   ', Scale: '   ' },
      { Name: 'invalid_boolean', Length: true, Scale: false },
      { Name: 'invalid_oversized', Length: 65536, Scale: 31 },
      { Name: 'valid_dimensions', Length: ' 18 ', Scale: ' 0 ' },
      { Name: 'maximum_dimensions', Length: 65535, Scale: 30 },
      { Name: 'missing_dimensions' },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cases.map(row => ({ ...row, Type: 'DECIMAL', Default: 0 }))), 'Domains');
    const dialog = await openDomains(page);
    await dialog.locator('input[type="file"]').setInputFiles({ name: `dimensions.${bookType}`, mimeType: 'application/octet-stream', buffer: XLSX.write(workbook, { type: 'buffer', bookType: bookType === 'xls' ? 'biff8' : 'xlsx' }) });
    await expect(dialog).toContainText(new RegExp(`${cases.length} added.*0 updated`, 'i'));
    await expect(dialog.locator('tr.display-row')).toHaveCount(original.domains.length + cases.length);
    await expect.poll(async () => (await savedSchema(page))?.domains.length).toBe(original.domains.length + cases.length);
    const verify = async () => {
      const saved = (await savedSchema(page))!;
      expect(saved.tables).toEqual(original.tables);
      expect(saved.domains.filter(d => original.domains.some(previous => previous.id === d.id))).toEqual(original.domains);
      for (const row of cases) {
        const domain = saved.domains.find(d => d.name === row.Name)!;
        expect(domain).toMatchObject({ type: 'DECIMAL', defaultValue: '0' });
        expect(domain.length, row.Name).toBe(row.Name === 'valid_dimensions' ? 18 : row.Name === 'maximum_dimensions' ? 65535 : undefined);
        expect(domain.scale, row.Name).toBe(row.Name === 'valid_dimensions' ? 0 : row.Name === 'maximum_dimensions' ? 30 : undefined);
      }
    };
    await verify();
    await page.reload();
    await verify();
    const reopened = await openDomains(page);
    await expect(reopened.locator('tr.display-row')).toHaveCount(original.domains.length + cases.length);
  });
}

for (const mode of ['create', 'edit'] as const) {
  for (const type of ['DECIMAL', 'NUMERIC'] as const) {
    test(`domain ${mode} ${type} rejects invalid dimension drafts through Save, Enter and row navigation and recovers after cancellation`, async ({ page }) => {
      page.setDefaultTimeout(10_000);
      const original = (await savedSchema(page))!;
      const dialog = await openDomains(page);
      const name = mode === 'create' ? 'amount_dimension' : 'audit_label';
      const begin = async () => {
        if (mode === 'create') await dialog.locator('.add-btn').click();
        else await dialog.locator('tr.display-row').filter({ hasText: 'audit_label' }).click();
        const form = dialog.locator('.edit-card');
        await form.getByLabel('Domain name', { exact: true }).fill(name);
        await form.locator('.ss-trigger').first().click();
        await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${type}$`) }).click();
        await form.getByLabel('Length', { exact: true }).fill('10');
        await form.getByLabel('Scale', { exact: true }).fill('0');
        return form;
      };
      let form = await begin();
      const save = form.locator('.edit-btn-save');
      await expect(save).toBeEnabled();
      for (const [label, invalid, valid] of [
        ['Length', ['-1', '0', '65536', '1.5'], '10'],
        ['Scale', ['-1', '31', '1.5'], '0'],
      ] as const) {
        const input = form.getByLabel(label, { exact: true });
        for (const value of invalid) {
          await input.fill(value);
          await expect(save).toBeDisabled();
          await input.press('Enter');
          await dialog.locator('tr.display-row').filter({ hasText: 'email_address' }).click();
          await expect(form.getByLabel('Domain name', { exact: true })).toHaveValue(name);
          expect(await savedSchema(page)).toEqual(original);
          await input.fill(valid);
          await expect(save).toBeEnabled();
        }
      }
      for (const label of ['Length', 'Scale']) {
        await form.getByLabel(label, { exact: true }).fill('');
        await expect(save).toBeEnabled();
      }
      await form.getByLabel('Length', { exact: true }).fill('65535');
      await form.getByLabel('Scale', { exact: true }).fill('30');
      await expect(save).toBeEnabled();
      await form.getByLabel('Length', { exact: true }).fill('-1');
      await form.locator('.edit-btn-cancel').click();
      await expect(dialog.locator('.edit-card')).toHaveCount(0);
      expect(await savedSchema(page)).toEqual(original);
      form = await begin();
      await form.locator('.edit-btn-save').click();
      await expect(dialog.locator('.edit-card')).toHaveCount(0);
      await expect.poll(async () => (await savedSchema(page))?.domains.find(d => d.name === name)).toMatchObject({ type, length: 10, scale: 0 });
      const saved = (await savedSchema(page))!;
      expect(saved.tables).toEqual(original.tables);
      expect(saved.domains.find(d => d.id === 'email')).toEqual(original.domains.find(d => d.id === 'email'));
      if (mode === 'create') {
        expect(saved.domains).toHaveLength(3);
        expect(saved.domains.find(d => d.id === 'unused')).toEqual(original.domains.find(d => d.id === 'unused'));
      } else {
        expect(saved.domains).toHaveLength(2);
        expect(saved.domains.find(d => d.id === 'unused')).toMatchObject({ id: 'unused', owner: 'Operations', tags: ['compliance'] });
      }
      await dialog.locator('tr.display-row').filter({ hasText: name }).click();
      const optional = dialog.locator('.edit-card');
      await optional.getByLabel('Length', { exact: true }).fill('');
      await optional.getByLabel('Scale', { exact: true }).fill('');
      await expect(optional.locator('.edit-btn-save')).toBeEnabled();
      await optional.locator('.edit-btn-save').click();
      await expect.poll(async () => (await savedSchema(page))?.domains.find(d => d.name === name)?.length).toBeUndefined();
      const cleared = (await savedSchema(page))!;
      expect(cleared.domains.find(d => d.name === name)?.scale).toBeUndefined();
      expect(cleared.domains.find(d => d.name === name)?.id).toBe(saved.domains.find(d => d.name === name)?.id);
      await page.reload();
      expect((await savedSchema(page))?.domains).toEqual(cleared.domains);
      expect((await savedSchema(page))?.tables).toEqual(original.tables);
    });
  }
}

for (const type of ['NVARCHAR', 'NCHAR', 'BINARY', 'VARBINARY', 'TIME', 'DATETIMEOFFSET'] as const) {
  test(`domain ${type} preserves imported dimensions during metadata edits and propagates explicit dimension changes`, async ({ page }) => {
    page.setDefaultTimeout(10_000);
    const schema = fixture();
    schema.dialect = 'mssql';
    Object.assign(schema.domains[0], { type, length: 3, comment: 'original native domain' });
    for (const table of schema.tables) Object.assign(table.columns[0], { type, length: 3 });
    await importSchema(page, schema);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains[0].type).toBe(type);
    const original = (await savedSchema(page))!;
    const dialog = await openDomains(page);
    const row = () => dialog.locator('tr.display-row').filter({ hasText: 'email_address' });
    await row().click();
    const form = dialog.locator('.edit-card');
    await expect(form.getByLabel('Length', { exact: true })).toHaveValue('3');
    await form.getByLabel('Owner', { exact: true }).fill('native metadata edit');
    await form.locator('.edit-btn-save').click();
    await expect(form).toHaveCount(0);
    await expect.poll(async () => (await savedSchema(page))?.domains[0]).toMatchObject({ id: 'email', type, length: 3, owner: 'native metadata edit' });
    const metadata = (await savedSchema(page))!;
    for (let i = 0; i < metadata.tables.length; i++) {
      expect(metadata.tables[i].columns[0]).toMatchObject({ id: original.tables[i].columns[0].id, type, length: 3, domainId: 'email' });
      expect(metadata.tables[i].columns[1]).toEqual(original.tables[i].columns[1]);
    }
    await row().click();
    await form.getByLabel('Length', { exact: true }).fill('6');
    await form.locator('.edit-btn-save').click();
    const impact = page.getByRole('alertdialog');
    await expect(impact).toContainText('Affects 2 column(s) in 2 table(s)');
    await impact.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await savedSchema(page)).toEqual(metadata);
    await form.locator('.edit-btn-save').click();
    await impact.getByRole('button', { name: 'Propagate changes?', exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))?.domains[0].length).toBe(6);
    const changed = (await savedSchema(page))!;
    expect(changed.domains[1]).toEqual(original.domains[1]);
    for (let i = 0; i < changed.tables.length; i++) {
      expect(changed.tables[i].columns[0]).toMatchObject({ id: original.tables[i].columns[0].id, type, length: 6, domainId: 'email' });
      expect(changed.tables[i].columns[1]).toEqual(original.tables[i].columns[1]);
    }
    await page.reload();
    expect((await savedSchema(page))?.domains).toEqual(changed.domains);
    expect((await savedSchema(page))?.tables).toEqual(changed.tables);
    const reopened = await openDomains(page);
    await reopened.locator('tr.display-row').filter({ hasText: 'email_address' }).click();
    await expect(reopened.locator('.edit-card').getByLabel('Length', { exact: true })).toHaveValue('6');
  });
}
