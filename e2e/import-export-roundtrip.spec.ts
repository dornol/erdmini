import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from 'playwright/test';
import type { Column, ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function column(id: string, name: string, patch: Partial<Column> = {}): Column {
  return { id, name, type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false, ...patch };
}
function fixture(): ERDSchema {
  return {
    version: '1', dialect: 'mysql', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: [
      { id: 'accounts', name: 'accounts', position: { x: 100, y: 160 }, columns: [column('a_id', 'id', { primaryKey: true, unique: true, autoIncrement: true }), column('a_name', 'name', { type: 'VARCHAR', length: 64, nullable: true })], foreignKeys: [] },
      { id: 'orders', name: 'orders', position: { x: 440, y: 160 }, columns: [column('o_id', 'id', { primaryKey: true, unique: true, autoIncrement: true }), column('o_account', 'account_id')], foreignKeys: [{ id: 'order_account', columnIds: ['o_account'], referencedTableId: 'accounts', referencedColumnIds: ['a_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }] },
    ], domains: [], memos: [],
  };
}
function structure(schema: ERDSchema | undefined) {
  return schema?.tables.map(t => ({
    name: t.name,
    columns: t.columns.map(c => ({ name: c.name, type: c.type, length: c.length, nullable: c.nullable, primaryKey: c.primaryKey, autoIncrement: c.autoIncrement })),
    foreignKeys: t.foreignKeys.map(f => ({
      columns: f.columnIds.map(id => t.columns.find(c => c.id === id)?.name),
      table: schema.tables.find(r => r.id === f.referencedTableId)?.name,
      target: f.referencedColumnIds.map(id => schema.tables.find(r => r.id === f.referencedTableId)?.columns.find(c => c.id === id)?.name),
      onDelete: f.onDelete, onUpdate: f.onUpdate,
    })),
  })).sort((a, b) => a.name.localeCompare(b.name));
}
async function uploadJson(page: Page, schema: unknown) {
  await page.getByTestId('import-menu-toggle').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(schema)) });
}
async function newProject(page: Page) {
  await page.getByTestId('project-menu-toggle').click();
  await page.getByTestId('project-new').click();
  const input = page.locator('.project-new-row input');
  await input.fill('Roundtrip destination');
  await input.press('Enter');
  await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
}
async function openImport(page: Page, format: string) {
  await page.getByTestId('import-menu-toggle').click();
  await page.getByTestId('import-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
  const modal = page.getByTestId('ddl-modal');
  await modal.getByRole('button', { name: format, exact: true }).click();
  return modal;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-project').click();
  await importSchema(page, fixture());
  await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
});

test('JSON download and reimport preserve schema metadata, IDs, constraints, objects and attached memos', async ({ page }) => {
  const schema = fixture();
  schema.schemas = ['app'];
  schema.tables.forEach(t => { t.schema = 'app'; t.group = 'Commerce'; });
  schema.groupColors = { Commerce: '#abcdef' };
  schema.domains = [{ id: 'label_domain', name: 'display_label', type: 'VARCHAR', length: 64, nullable: true, primaryKey: false, unique: false, autoIncrement: false }];
  schema.tables[0].columns[1].domainId = 'label_domain';
  schema.tables[0].uniqueKeys = [{ id: 'account_pair', name: 'account_pair', columnIds: ['a_id', 'a_name'] }];
  schema.tables[1].indexes = [{ id: 'account_index', name: 'account_index', columnIds: ['o_account'], unique: false }];
  schema.memos = [{ id: 'memo', content: '注文 / Orders\nKeep this note', position: { x: 460, y: 320 }, width: 180, height: 100, attachedTableId: 'orders', schema: 'app' }];
  schema.dbObjectCategories = ['Views'];
  schema.dbObjects = [{ id: 'view', name: 'active_accounts', category: 'Views', sql: 'SELECT * FROM accounts;', schema: 'app', includeInDdl: true, comment: 'Read model' }];
  await uploadJson(page, schema);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
  await expect.poll(async () => (await savedSchema(page))?.dbObjects?.length).toBe(1);
  const original = await savedSchema(page);
  await page.getByTestId('export-menu-toggle').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click();
  const download = await pending;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as ERDSchema;
  expect(exported).toEqual(original);
  await newProject(page);
  await uploadJson(page, exported);
  const { updatedAt: _timestamp, ...expected } = exported;
  await expect.poll(async () => {
    const saved = await savedSchema(page);
    if (!saved) return null;
    const { updatedAt: _timestamp, ...data } = saved;
    return data;
  }).toEqual(expected);
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Memo: 注文 \/ Orders/ })).toBeVisible();
  await page.reload();
  const { updatedAt: _reloadedTimestamp, ...reloaded } = (await savedSchema(page))!;
  expect(reloaded).toEqual(expected);
});

test('cancelled JSON replacement and duplicate merge preserve the original saved schema', async ({ page }) => {
  const original = await savedSchema(page);
  const replacement = fixture();
  replacement.tables[0].columns[1].name = 'must_not_replace';
  await uploadJson(page, replacement);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await savedSchema(page)).toEqual(original);
  await uploadJson(page, replacement);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Merge', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await savedSchema(page)).toEqual(original);
  await expect(page.getByTestId('table-card')).toHaveCount(2);
  await page.reload();
  expect(structure(await savedSchema(page))).toEqual(structure(original));
});

for (const format of ['DBML', 'Prisma']) {
  test(`${format} invalid input leaves existing schema intact and supports corrected retry`, async ({ page }) => {
    const original = await savedSchema(page);
    const modal = await openImport(page, format);
    await modal.getByTestId('ddl-import-input').fill(format === 'DBML' ? 'Ref: broken.missing > nowhere.id' : 'model Broken { id ???');
    await modal.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(modal.locator('.msg-errors')).toBeVisible();
    expect(await savedSchema(page)).toEqual(original);
    await expect(modal.locator('.msg-success')).toHaveCount(0);
    await modal.getByTestId('ddl-import-input').fill(format === 'DBML' ? 'Table retry_table {\n id int [pk, not null]\n}' : 'model retry_table {\n id Int @id\n}');
    await modal.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(modal.locator('.msg-success')).toBeVisible();
    await expect(modal.locator('.msg-errors')).toHaveCount(0);
    await expect.poll(async () => (await savedSchema(page))?.tables.map(t => t.name).sort()).toEqual(['accounts', 'orders', 'retry_table']);
    await page.reload();
    await expect(page.getByTestId('table-card')).toHaveCount(3);
  });
}

for (const { format, dialect } of [
  ...['MySQL', 'PostgreSQL', 'MariaDB', 'MSSQL', 'SQLite', 'Oracle', 'H2'].map(dialect => ({ format: 'DDL', dialect })),
  { format: 'DBML', dialect: '' }, { format: 'Prisma', dialect: '' },
]) {
  test(`${format} ${dialect} export reimports table and column semantics with resolved foreign keys in a new project`, async ({ page }) => {
    const original = structure(await savedSchema(page))!;
    // Export uses each dialect's native type representation.
    for (const table of original) {
      for (const column of table.columns) {
        if (dialect === 'SQLite' && column.type === 'VARCHAR') { column.type = 'TEXT'; column.length = undefined; }
        if (dialect === 'MSSQL' && column.type === 'VARCHAR') column.type = 'NVARCHAR';
        if (dialect === 'Oracle' && column.type === 'INT') { column.type = 'DECIMAL'; column.length = 10; }
      }
    }
    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
    const exporter = page.getByTestId('ddl-modal');
    await exporter.getByRole('button', { name: format, exact: true }).click();
    if (dialect) {
      await exporter.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}$`) }).click();
    }
    const text = await exporter.locator('textarea.code-area').inputValue();
    expect(text).toContain('accounts');
    expect(text).toContain('orders');
    await exporter.locator('.close-btn').click();
    await newProject(page);
    const importer = await openImport(page, format);
    await importer.getByTestId('ddl-import-input').fill(text);
    if (dialect) {
      await importer.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
    }
    await importer.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(importer.locator('.msg-success')).toBeVisible();
    await expect(importer.locator('.msg-errors')).toHaveCount(0);
    await expect.poll(async () => structure(await savedSchema(page))).toEqual(original);
    await page.reload();
    await expect(page.getByTestId('table-card')).toHaveCount(2);
    expect(structure(await savedSchema(page))).toEqual(original);
  });
}

function compositeFixture(): ERDSchema {
  return {
    version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), domains: [], memos: [],
    tables: [
      { id: 'parent', name: 'parent_records', position: { x: 100, y: 160 },
        columns: [column('p_tenant', 'tenant_id', { primaryKey: true }), column('p_id', 'id', { primaryKey: true }), column('p_code', 'code')],
        uniqueKeys: [{ id: 'uq', name: 'uq_code_tenant', columnIds: ['p_code', 'p_tenant'] }],
        indexes: [{ id: 'ui', name: 'idx_tenant_code', columnIds: ['p_tenant', 'p_code'], unique: true }], foreignKeys: [] },
      { id: 'child', name: 'child_records', position: { x: 520, y: 160 },
        columns: [column('c_id', 'id', { primaryKey: true }), column('c_tenant', 'tenant_id', { nullable: true }), column('c_parent', 'parent_id', { nullable: true })],
        indexes: [{ id: 'ci', name: 'idx_child_lookup', columnIds: ['c_tenant', 'c_parent'], unique: false }],
        foreignKeys: [{ id: 'fk', columnIds: ['c_parent', 'c_tenant'], referencedTableId: 'parent', referencedColumnIds: ['p_id', 'p_tenant'], onDelete: 'SET NULL', onUpdate: 'RESTRICT' }] },
    ],
  };
}
function constraintStructure(schema: ERDSchema | undefined) {
  return schema?.tables.map(table => {
    const names = (ids: string[]) => ids.map(id => table.columns.find(c => c.id === id)?.name);
    return {
      name: table.name,
      primaryKey: table.columns.filter(c => c.primaryKey).map(c => c.name),
      uniqueKeys: (table.uniqueKeys ?? []).map(key => names(key.columnIds)).sort(),
      indexes: (table.indexes ?? []).map(index => ({ columns: names(index.columnIds), unique: index.unique })).sort((a, b) => a.columns.join().localeCompare(b.columns.join())),
      foreignKeys: table.foreignKeys.map(fk => {
        const parent = schema.tables.find(t => t.id === fk.referencedTableId);
        return { columns: names(fk.columnIds), table: parent?.name, target: fk.referencedColumnIds.map(id => parent?.columns.find(c => c.id === id)?.name), onDelete: fk.onDelete, onUpdate: fk.onUpdate };
      }),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

for (const dialect of ['MySQL', 'PostgreSQL', 'MariaDB', 'MSSQL', 'SQLite', 'Oracle', 'H2']) {
  test(`${dialect} composite constraints retain column order and FK actions through export, import and reload`, async ({ page }) => {
    const schema = compositeFixture();
    await uploadJson(page, schema);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => constraintStructure(await savedSchema(page))).toEqual(constraintStructure(schema));
    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
    const exporter = page.getByTestId('ddl-modal');
    await exporter.locator('.dialect-select-wrap .ss-trigger').click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}$`) }).click();
    const sql = await exporter.locator('textarea.code-area').inputValue();
    expect(sql).toContain('uq_code_tenant');
    expect(sql).toContain('idx_child_lookup');
    await exporter.locator('.close-btn').click();
    await newProject(page);
    const importer = await openImport(page, 'DDL');
    await importer.getByTestId('ddl-import-input').fill(sql);
    await importer.locator('.dialect-select-wrap .ss-trigger').click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
    await importer.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(importer.locator('.msg-success')).toBeVisible();
    await expect(importer.locator('.msg-errors')).toHaveCount(0);
    await expect.poll(async () => constraintStructure(await savedSchema(page))).toEqual(constraintStructure(schema));
    await page.reload();
    expect(constraintStructure(await savedSchema(page))).toEqual(constraintStructure(schema));
  });
}

function portableConstraints(schema: ERDSchema | undefined) {
  return constraintStructure(schema)?.map(table => ({
    ...table,
    // DBML and Prisma represent composite unique indexes as unique constraints.
    uniqueKeys: [...table.uniqueKeys, ...table.indexes.filter(index => index.unique).map(index => index.columns)].sort(),
    indexes: table.indexes.filter(index => !index.unique),
  }));
}

for (const format of ['DBML', 'Prisma']) {
  test(`${format} composite keys, indexes and FK pairs preserve semantics through export and reimport`, async ({ page }) => {
    const schema = compositeFixture();
    await uploadJson(page, schema);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => portableConstraints(await savedSchema(page))).toEqual(portableConstraints(schema));
    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
    const exporter = page.getByTestId('ddl-modal');
    await exporter.getByRole('button', { name: format, exact: true }).click();
    const text = await exporter.locator('textarea.code-area').inputValue();
    expect(text).toContain('parent_records');
    expect(text).toContain('child_records');
    await exporter.locator('.close-btn').click();
    await newProject(page);
    const importer = await openImport(page, format);
    await importer.getByTestId('ddl-import-input').fill(text);
    await importer.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(importer.locator('.msg-success')).toBeVisible();
    await expect(importer.locator('.msg-errors')).toHaveCount(0);
    await expect.poll(async () => portableConstraints(await savedSchema(page))).toEqual(portableConstraints(schema));
    await page.reload();
    expect(portableConstraints(await savedSchema(page))).toEqual(portableConstraints(schema));
  });
}

for (const dialect of ['MySQL', 'PostgreSQL', 'MariaDB', 'MSSQL', 'SQLite', 'Oracle', 'H2']) {
  for (const escaped of [false, true]) {
    test(`${dialect} ${escaped ? 'escaped delimiter identifiers' : 'quoted names, Unicode'}, decimal scale zero and defaults survive DDL round trip and reload`, async ({ page }) => {
      const delimiter = dialect === 'MySQL' || dialect === 'MariaDB' ? '\x60' : dialect === 'MSSQL' ? ']' : '"';
      const names = {
        parent: escaped ? `order ${delimiter} detail` : 'order detail',
        primary: escaped ? `select${delimiter}value` : 'select',
        label: escaped ? `회원${delimiter}명` : '회원 명',
        related: escaped ? `related ${delimiter} records` : 'related records',
        reference: escaped ? `order${delimiter}ref` : 'order ref',
      };
      const schema: ERDSchema = {
        version: '1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), domains: [], memos: [],
        tables: [
          { id: 'quoted', name: names.parent, position: { x: 100, y: 100 }, foreignKeys: [],
            columns: [
              column('q_id', names.primary, { primaryKey: true }),
              column('q_label', names.label, { type: 'VARCHAR', length: 63, nullable: true, defaultValue: "'O''Brien'" }),
              column('q_amount', 'amount', { type: 'DECIMAL', length: 10, scale: 0, defaultValue: '0' }),
            ] },
          { id: 'references', name: names.related, position: { x: 480, y: 100 },
            columns: [column('r_id', names.reference, { nullable: true })],
            foreignKeys: [{ id: 'quoted_fk', columnIds: ['r_id'], referencedTableId: 'quoted', referencedColumnIds: ['q_id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' }] },
        ],
      };
      await uploadJson(page, schema);
      await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables.map(t => t.name)).toEqual([names.parent, names.related]);
      await page.getByTestId('export-menu-toggle').click();
      await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
      const exporter = page.getByTestId('ddl-modal');
      await exporter.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}$`) }).click();
      const sql = await exporter.locator('textarea.code-area').inputValue();
      expect(sql).toContain('order');
      if (escaped) expect(sql).toContain(delimiter.repeat(2));
      expect(sql).toContain('회원');
      expect(sql).toContain("O''Brien");
      await exporter.locator('.close-btn').click();
      await newProject(page);
      const importer = await openImport(page, 'DDL');
      await importer.getByTestId('ddl-import-input').fill(sql);
      await importer.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
      await importer.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(importer.locator('.msg-success')).toBeVisible();
      await expect(importer.locator('.msg-errors')).toHaveCount(0);
      const expectedColumns = [
        { name: names.primary, type: dialect === 'Oracle' ? 'DECIMAL' : 'INT', length: dialect === 'Oracle' ? 10 : undefined, scale: undefined, nullable: false, primaryKey: true, defaultValue: undefined },
        { name: names.label, type: dialect === 'MSSQL' ? 'NVARCHAR' : dialect === 'SQLite' ? 'TEXT' : 'VARCHAR', length: dialect === 'SQLite' ? undefined : 63, scale: undefined, nullable: true, primaryKey: false, defaultValue: "'O''Brien'" },
        { name: 'amount', type: dialect === 'SQLite' ? 'REAL' : dialect === 'PostgreSQL' ? 'NUMERIC' : 'DECIMAL', length: dialect === 'SQLite' ? undefined : 10, scale: dialect === 'SQLite' ? undefined : 0, nullable: false, primaryKey: false, defaultValue: '0' },
      ];
      const inspect = async () => {
        const saved = await savedSchema(page);
        const table = saved?.tables.find(t => t.name === names.parent);
        const related = saved?.tables.find(t => t.name === names.related);
        return {
          names: saved?.tables.map(t => t.name).sort(),
          columns: table?.columns.map(c => ({ name: c.name, type: c.type, length: c.length, scale: c.scale, nullable: c.nullable, primaryKey: c.primaryKey, defaultValue: c.defaultValue })),
          references: related?.foreignKeys.map(fk => ({
            columns: fk.columnIds.map(id => related.columns.find(c => c.id === id)?.name),
            table: saved?.tables.find(t => t.id === fk.referencedTableId)?.name,
            target: fk.referencedColumnIds.map(id => table?.columns.find(c => c.id === id)?.name),
          })),
        };
      };
      const expected = { names: [names.parent, names.related], columns: expectedColumns, references: [{ columns: [names.reference], table: names.parent, target: [names.primary] }] };
      await expect.poll(inspect).toEqual(expected);
      await page.reload();
      await expect(page.getByTestId('table-card')).toHaveCount(2);
      expect(await inspect()).toEqual(expected);
    });
  }
}

for (const dialect of ['MySQL', 'MariaDB', 'PostgreSQL', 'H2']) {
  test(`${dialect} native ENUM preserves ordered escaped, comma, Unicode and empty values through DDL and reload`, async ({ page }) => {
    page.setDefaultTimeout(10_000);
    const values = ['pending', "O'Brien", 'comma,value', '완료', ''];
    const schema = fixture();
    schema.tables = [{ id: 'enum_table', name: 'enum_records', position: { x: 100, y: 150 }, foreignKeys: [], columns: [
      column('enum_id', 'id', { primaryKey: true }),
      column('enum_state', 'state_value', { type: 'ENUM', enumValues: values, nullable: true }),
      column('enum_note', 'note', { type: 'VARCHAR', length: 24, defaultValue: "'unchanged'" }),
    ] }];
    await uploadJson(page, schema);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe(schema.tables[0].name);
    await page.getByTestId('export-menu-toggle').click();
    await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
    const exporter = page.getByTestId('ddl-modal');
    await exporter.locator('.dialect-select-wrap .ss-trigger').click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}$`) }).click();
    const sql = await exporter.locator('textarea.code-area').inputValue();
    expect(sql).toContain("O''Brien");
    expect(sql).toContain("'comma,value'");
    expect(sql).toContain("'완료'");
    await exporter.locator('.close-btn').click();
    await newProject(page);
    const importer = await openImport(page, 'DDL');
    await importer.getByTestId('ddl-import-input').fill(sql);
    await importer.locator('.dialect-select-wrap .ss-trigger').click();
    await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
    await importer.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(importer.locator('.msg-errors')).toHaveCount(0);
    await expect(importer.locator('.msg-success')).toBeVisible();
    const inspect = async () => (await savedSchema(page))?.tables[0]?.columns.map(c => ({ name: c.name, type: c.type, enumValues: c.enumValues, nullable: c.nullable, defaultValue: c.defaultValue }));
    const expected = [
      { name: 'id', type: 'INT', enumValues: undefined, nullable: false, defaultValue: undefined },
      { name: 'state_value', type: 'ENUM', enumValues: values, nullable: true, defaultValue: undefined },
      { name: 'note', type: 'VARCHAR', enumValues: undefined, nullable: false, defaultValue: "'unchanged'" },
    ];
    await expect.poll(inspect).toEqual(expected);
    await page.reload();
    expect(await inspect()).toEqual(expected);
  });
}

for (const dialect of ['MySQL', 'MariaDB', 'PostgreSQL', 'MSSQL', 'Oracle', 'SQLite', 'H2']) {
  for (const boundary of (['Oracle', 'SQLite', 'H2'].includes(dialect) ? ['binary'] as const : ['temporal', 'binary'] as const)) {
    test(`${dialect} native ${boundary} dimensions preserve explicit boundaries through DDL export, import and reload`, async ({ page }) => {
      page.setDefaultTimeout(10_000);
      const schema = fixture();
      const columns = boundary === 'temporal'
        ? [column('zero', 'zero_precision', { type: 'TIME', length: 0 }), column('precise', 'fractional_precision', { type: 'TIME', length: 6, nullable: true }),
          ...(dialect === 'MSSQL' ? [column('offset', 'offset_precision', { type: 'DATETIMEOFFSET', length: 0, nullable: true })] : [])]
        : [column('fixed', 'fixed_bytes', { type: 'BINARY', length: 1 }), column('variable', 'variable_bytes', { type: 'VARBINARY', length: dialect === 'Oracle' ? 2000 : 8000, nullable: true })];
      schema.tables = [{ id: 'native', name: 'native_records', position: { x: 100, y: 150 }, foreignKeys: [], columns }];
      await uploadJson(page, schema);
      await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe(schema.tables[0].name);
      await page.getByTestId('export-menu-toggle').click();
      await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
      const exporter = page.getByTestId('ddl-modal');
      await exporter.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}$`) }).click();
      const sql = await exporter.locator('textarea.code-area').inputValue();
      if (boundary === 'temporal') {
        expect(sql).toMatch(/TIME\(0\)/i);
        expect(sql).toMatch(/TIME\(6\)/i);
        if (dialect === 'MSSQL') expect(sql).toMatch(/DATETIMEOFFSET\(0\)/i);
      } else if (dialect === 'PostgreSQL') expect(sql.match(/BYTEA/gi)).toHaveLength(2);
      else if (dialect === 'SQLite') expect(sql.match(/BLOB/gi)).toHaveLength(2);
      else if (dialect === 'Oracle') {
        expect(sql).toMatch(/RAW\(1\)/i);
        expect(sql).toMatch(/RAW\(2000\)/i);
      }
      else {
        expect(sql).toMatch(/\bBINARY\(1\)/i);
        expect(sql).toMatch(/\bVARBINARY\(8000\)/i);
      }
      await exporter.locator('.close-btn').click();
      await newProject(page);
      const importer = await openImport(page, 'DDL');
      await importer.getByTestId('ddl-import-input').fill(sql);
      await importer.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
      await importer.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(importer.locator('.msg-errors')).toHaveCount(0);
      await expect(importer.locator('.msg-success')).toBeVisible();
      const expected = columns.map(c => ({ name: c.name, type: boundary === 'binary' && ['PostgreSQL', 'SQLite'].includes(dialect) ? 'BLOB' : dialect === 'Oracle' ? 'VARBINARY' : c.type,
        length: boundary === 'binary' && ['PostgreSQL', 'SQLite'].includes(dialect) ? undefined : c.length, nullable: c.nullable }));
      const inspect = async () => (await savedSchema(page))?.tables[0]?.columns.map(c => ({ name: c.name, type: c.type, length: c.length, nullable: c.nullable }));
      await expect.poll(inspect).toEqual(expected);
      await page.reload();
      expect(await inspect()).toEqual(expected);
    });
  }
}

for (const dialect of ['Oracle', 'SQLite', 'H2', 'MSSQL']) {
  for (const boundary of (dialect === 'H2' ? ['temporal'] : dialect === 'MSSQL' ? ['enum-fallback'] : ['temporal', 'enum-fallback'])) {
    test(`${dialect} additional ${boundary} conversion follows native representation and persists canonical imported semantics`, async ({ page }) => {
      page.setDefaultTimeout(10_000);
      const schema = fixture();
      const columns = boundary === 'temporal'
        ? [column('time0', 'time_zero', { type: 'TIME', length: 0 }), column('time6', 'time_six', { type: 'TIME', length: 6, nullable: true }),
          column('offset0', 'offset_zero', { type: 'DATETIMEOFFSET', length: 0 }), column('offset6', 'offset_six', { type: 'DATETIMEOFFSET', length: 6, nullable: true })]
        : [column('state', 'state_value', { type: 'ENUM', enumValues: ["O'Brien", 'comma,value', '완료', ''], nullable: true })];
      schema.tables = [{ id: 'conversion', name: 'conversion_records', position: { x: 100, y: 150 }, columns, foreignKeys: [], uniqueKeys: [], indexes: [] }];
      await uploadJson(page, schema); await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
      await expect.poll(async () => (await savedSchema(page))?.tables[0]?.name).toBe('conversion_records');
      await page.getByTestId('export-menu-toggle').click();
      await page.getByTestId('export-menu').getByRole('menuitem', { name: 'DDL', exact: true }).click();
      const exporter = page.getByTestId('ddl-modal');
      await exporter.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}$`) }).click();
      const sql = await exporter.locator('textarea.code-area').inputValue();
      if (boundary === 'enum-fallback') {
        expect(sql).not.toContain('ENUM'); expect(sql).not.toContain("O''Brien");
        expect(sql).toMatch(dialect === 'Oracle' ? /VARCHAR2\(255\)/ : dialect === 'MSSQL' ? /NVARCHAR\(255\)/ : /TEXT/);
      } else if (dialect !== 'SQLite') {
        expect(sql).toMatch(dialect === 'H2' ? /TIME\(0\)/ : /TIMESTAMP\(0\)/);
        expect(sql).toMatch(/TIMESTAMP\(6\) WITH TIME ZONE/);
      } else expect(sql.match(/TEXT/g)).toHaveLength(4);
      await exporter.locator('.close-btn').click(); await newProject(page);
      const importer = await openImport(page, 'DDL'); await importer.getByTestId('ddl-import-input').fill(sql);
      await importer.locator('.dialect-select-wrap .ss-trigger').click();
      await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
      await importer.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(importer.locator('.msg-success')).toBeVisible();
      const expected = columns.map(c => ({ name: c.name, nullable: c.nullable, enumValues: undefined,
        type: dialect === 'SQLite' ? 'TEXT' : boundary === 'enum-fallback' ? dialect === 'MSSQL' ? 'NVARCHAR' : 'VARCHAR' : c.type === 'TIME' && dialect === 'Oracle' ? 'TIMESTAMP' : c.type,
        length: dialect === 'SQLite' ? undefined : boundary === 'enum-fallback' ? 255 : c.length }));
      const inspect = async () => (await savedSchema(page))?.tables[0]?.columns.map(c => ({ name: c.name, type: c.type, length: c.length, nullable: c.nullable, enumValues: c.enumValues }));
      await expect.poll(inspect).toEqual(expected); await page.reload(); expect(await inspect()).toEqual(expected);
    });
  }
}

for (const dialect of ['MySQL', 'PostgreSQL']) {
  test(`${dialect} schema-qualified DDL preserves table and column comments and resolves ALTER TABLE foreign keys`, async ({ page }) => {
    await newProject(page); const modal = await openImport(page, 'DDL');
    const sql = dialect === 'MySQL'
      ? "CREATE TABLE app.users (id INT PRIMARY KEY, email VARCHAR(80) COMMENT 'Email column') COMMENT = 'User table'; CREATE TABLE app.orders (id INT PRIMARY KEY, user_id INT); ALTER TABLE app.orders ADD CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE ON UPDATE RESTRICT;"
      : "CREATE TABLE app.users (id INT PRIMARY KEY, email VARCHAR(80)); CREATE TABLE app.orders (id INT PRIMARY KEY, user_id INT); COMMENT ON TABLE app.users IS 'User table'; COMMENT ON COLUMN app.users.email IS 'Email column'; ALTER TABLE app.orders ADD CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE ON UPDATE RESTRICT;";
    await modal.getByTestId('ddl-import-input').fill(sql); await modal.locator('.dialect-select-wrap .ss-trigger').click(); await page.locator('.ss-dropdown .ss-item').filter({ hasText: new RegExp(`^${dialect}( [(]auto[)])?$`) }).click();
    await modal.getByRole('button', { name: 'Import', exact: true }).click(); await expect(modal.locator('.msg-errors')).toHaveCount(0); await expect(modal.locator('.msg-success')).toBeVisible(); await modal.locator('.close-btn').click();
    await expect(page.getByTestId('table-card')).toHaveCount(2); await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
    const imported = (await savedSchema(page))!, users = imported.tables.find(t => t.name === 'users')!, orders = imported.tables.find(t => t.name === 'orders')!;
    expect(imported.tables.map(t => t.name)).toEqual(['users', 'orders']); expect(users).toMatchObject({ schema: 'app', comment: 'User table' }); expect(orders.schema).toBe('app');
    expect(users.columns.find(c => c.name === 'email')).toMatchObject({ type: 'VARCHAR', length: 80, comment: 'Email column' }); expect(orders.foreignKeys).toHaveLength(1);
    expect(orders.foreignKeys[0]).toMatchObject({ columnIds: [orders.columns.find(c => c.name === 'user_id')!.id], referencedTableId: users.id, referencedColumnIds: [users.columns.find(c => c.name === 'id')!.id], onDelete: 'CASCADE', onUpdate: 'RESTRICT' });
    await page.getByTestId('table-card').filter({ has: page.locator('.table-name', { hasText: /^orders$/ }) }).click(); await expect(page.locator('.fk-section .fk-row')).toContainText('users'); await expect(page.getByRole('button', { name: 'FK line', exact: true })).toHaveCount(1);
    await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(2); expect((await savedSchema(page))!.tables).toEqual(imported.tables);
  });
}

for (const related of [false, true]) {
  for (const action of ['Skip', 'Overwrite']) {
    test(`DDL import ${related ? 'related' : 'independent'} tables with ${action} keeps existing canvas metadata and saves new placement`, async ({ page }) => {
      const original = fixture(); Object.assign(original.tables[0], { position: { x: 777, y: 555 }, locked: true, color: 'pink', group: 'Pinned' }); Object.assign(original.tables[1], { position: { x: 100, y: 650 }, color: 'green', group: 'Existing' });
      await uploadJson(page, original); await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click(); await expect.poll(async () => (await savedSchema(page))?.tables[0]?.position.x).toBe(777); const before = (await savedSchema(page))!;
      const modal = await openImport(page, 'DDL');
      await modal.getByTestId('ddl-import-input').fill(`CREATE TABLE accounts (id INT PRIMARY KEY, name VARCHAR(88)); CREATE TABLE added_a (id INT PRIMARY KEY, account_id INT${related ? ', FOREIGN KEY (account_id) REFERENCES accounts(id)' : ''}); CREATE TABLE added_b (id INT PRIMARY KEY);`);
      await modal.getByRole('button', { name: 'Import', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: action, exact: true }).click(); await expect(modal.locator('.msg-success')).toBeVisible(); await modal.locator('.close-btn').click();
      await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(4); const after = (await savedSchema(page))!;
      const retained = after.tables.find(t => t.id === 'accounts')!; for (const field of ['id', 'position', 'color', 'group', 'locked'] as const) expect(retained[field]).toEqual(before.tables[0][field]);
      expect(after.tables.find(t => t.id === 'orders')).toEqual(before.tables[1]); if (action === 'Skip') expect(retained).toEqual(before.tables[0]); else expect(retained.columns.find(c => c.name === 'name')).toMatchObject({ id: 'a_name', length: 88 });
      const fresh = after.tables.filter(t => t.name.startsWith('added_')); expect(fresh).toHaveLength(2); expect(fresh.map(t => t.position)).not.toEqual([{ x: 340, y: 40 }, { x: 640, y: 40 }]); expect(new Set(fresh.map(t => `${t.position.x},${t.position.y}`)).size).toBe(2); for (const t of fresh) { expect(Number.isFinite(t.position.x)).toBe(true); expect(Number.isFinite(t.position.y)).toBe(true); }
      const added = fresh.find(t => t.name === 'added_a')!; if (related) expect(added.foreignKeys[0]).toMatchObject({ referencedTableId: 'accounts', referencedColumnIds: ['a_id'], columnIds: [added.columns.find(c => c.name === 'account_id')!.id] }); else expect(added.foreignKeys).toEqual([]);
      await page.getByRole('button', { name: /^Undo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(before.tables);
      await page.getByRole('button', { name: /^Redo/ }).click(); await expect.poll(async () => (await savedSchema(page))!.tables).toEqual(after.tables);
      await page.reload(); await expect(page.getByTestId('table-card')).toHaveCount(4); expect((await savedSchema(page))!.tables).toEqual(after.tables);
    });
  }
}

function richTransferFixture(label: string): ERDSchema {
  const schema = fixture(); schema.schemas = ['app']; schema.groupColors = { Commerce: 'blue' };
  schema.tables.forEach(table => { table.name += `_${label}`; table.schema = 'app'; table.group = 'Commerce'; table.comment = `Retain ${label}`; });
  schema.domains = [{ id: 'label_domain', name: `label_${label}`, type: 'VARCHAR', length: 64, nullable: true, primaryKey: false, unique: false, autoIncrement: false }];
  schema.tables[0].columns[1].domainId = 'label_domain'; schema.tables[0].columns[1].defaultValue = "'보존'";
  schema.tables[0].uniqueKeys = [{ id: 'pair', name: 'pair_key', columnIds: ['a_id', 'a_name'] }];
  schema.tables[1].indexes = [{ id: 'lookup', name: 'lookup', columnIds: ['o_account'], unique: false }];
  schema.memos = [{ id: 'note', content: `문서 ${label}\nSecond line`, attachedTableId: 'orders', schema: 'app', position: { x: 400, y: 350 }, width: 200, height: 100 }];
  schema.dbObjectCategories = ['Views']; schema.dbObjects = [{ id: 'view', name: `report_${label}`, category: 'Views', sql: 'SELECT 1;', comment: 'Retain object', includeInDdl: true }];
  return schema;
}
const transferContent = (schema: ERDSchema) => {
  const { updatedAt, createdAt, ...content } = schema; return content;
};

test('copied share URL preserves rich schema in a fresh editable local copy without changing the source', async ({ page, browser }) => {
  await uploadJson(page, richTransferFixture('shared')); await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click();
  await expect.poll(async () => (await savedSchema(page))?.dbObjects?.length).toBe(1); const source = (await savedSchema(page))!;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']); await page.getByTestId('copy-share-link').click(); await expect(page.getByTestId('copy-share-link')).toHaveClass(/copied/);
  const url = await page.evaluate(() => navigator.clipboard.readText()); expect(url).toMatch(/#s=[A-Za-z0-9_-]+$/);
  const context = await browser.newContext();
  try {
    const shared = await context.newPage(); await shared.goto(url); await expect(shared.getByTestId('table-card')).toHaveCount(2); await expect(shared.getByRole('combobox', { name: 'Target DBMS' })).toBeEnabled();
    const exported = async () => { await shared.getByTestId('export-menu-toggle').click(); const pending = shared.waitForEvent('download'); await shared.getByTestId('export-menu').getByRole('menuitem', { name: 'JSON', exact: true }).click(); return JSON.parse(await readFile((await (await pending).path())!, 'utf8')) as ERDSchema; };
    expect(transferContent(await exported())).toEqual(transferContent(source)); await shared.reload(); await expect(shared.getByTestId('table-card')).toHaveCount(2); expect(transferContent(await exported())).toEqual(transferContent(source));
    expect(await savedSchema(page)).toEqual(source);
  } finally { await context.close(); }
});

for (const restore of [false, true]) {
  test(`rich all-project backup ${restore ? 'restores both project schemas' : 'cancel preserves newer edits'} with IDs and relationships intact`, async ({ page }) => {
    await uploadJson(page, richTransferFixture('first')); await page.getByRole('alertdialog').getByRole('button', { name: 'Replace', exact: true }).click(); await expect.poll(async () => (await savedSchema(page))?.dbObjects?.length).toBe(1);
    await newProject(page); await uploadJson(page, richTransferFixture('second')); await expect.poll(async () => (await savedSchema(page))?.dbObjects?.length).toBe(1);
    await page.getByTestId('export-menu-toggle').click(); const pending = page.waitForEvent('download'); await page.getByTestId('export-menu').getByRole('menuitem', { name: /backup all/i }).click(); const bytes = await readFile((await (await pending).path())!);
    const backup = JSON.parse(bytes.toString('utf8')) as { _type: string; index: { activeProjectId: string; projects: { id: string; name: string }[] }; schemas: Record<string, ERDSchema> };
    expect(backup._type).toBe('erdmini_backup'); expect(backup.index.projects).toHaveLength(2); expect(Object.keys(backup.schemas).sort()).toEqual(backup.index.projects.map(p => p.id).sort());
    for (const project of backup.index.projects) expect(transferContent((await savedSchema(page, project.id))!)).toEqual(transferContent(backup.schemas[project.id]));
    await page.getByTestId('table-card').first().click(); await page.getByTestId('table-name-input').fill('newer_than_backup'); await page.getByTestId('table-name-input').press('Enter'); await expect.poll(async () => (await savedSchema(page))?.tables[0].name).toBe('newer_than_backup'); const newer = (await savedSchema(page))!;
    await page.getByTestId('import-menu-toggle').click(); const chooser = page.waitForEvent('filechooser'); await page.getByTestId('import-menu').getByRole('menuitem', { name: /restore all/i }).click(); await (await chooser).setFiles({ name: 'rich-backup.json', mimeType: 'application/json', buffer: bytes });
    await page.getByRole('alertdialog').getByRole('button', { name: restore ? 'Restore' : 'Cancel', exact: true }).click();
    if (restore) { await expect(page.getByRole('alertdialog')).toContainText(/backup restored/i); await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click(); }
    for (const project of backup.index.projects) {
      const expected = !restore && project.id === backup.index.activeProjectId ? newer : backup.schemas[project.id];
      await expect.poll(async () => transferContent((await savedSchema(page, project.id))!)).toEqual(transferContent(expected));
    }
    await page.reload();
    for (const project of backup.index.projects) {
      const expected = !restore && project.id === backup.index.activeProjectId ? newer : backup.schemas[project.id]; expect(transferContent((await savedSchema(page, project.id))!)).toEqual(transferContent(expected));
      await page.getByTestId('project-menu-toggle').click(); await page.locator('.project-item').filter({ has: page.locator('.project-item-label', { hasText: new RegExp(`^${project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).locator('.project-item-name').click(); await expect(page.getByTestId('table-card')).toHaveCount(2);
    }
  });
}
