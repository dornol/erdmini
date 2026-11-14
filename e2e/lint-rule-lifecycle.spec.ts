import { expect, test } from 'playwright/test';
import type { ERDSchema } from '../src/lib/types/erd';
import { importSchema, savedSchema } from './helpers/local-schema';

function fixture(): ERDSchema {
  return { version: '1', domains: [], memos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    tables: ['parent', 'child'].map((name, i) => ({ id: name, name, position: { x: 100 + i * 350, y: 160 },
      columns: [{ id: `${name}_id`, name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: true, autoIncrement: false }, { id: `${name}_value`, name: 'value', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false }],
      foreignKeys: i ? [{ id: 'fk', columnIds: ['child_value'], referencedTableId: 'parent', referencedColumnIds: ['parent_id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }] : [], uniqueKeys: [], indexes: [] })),
  };
}
const scenarios: { label: string; severity: string; detail: string; mutate: (s: ERDSchema) => void }[] = [
  { label: 'Domain circular hierarchy reference', severity: 'error', detail: 'self_domain', mutate: s => { s.domains = [{ id: 'self', name: 'self_domain', parentId: 'self', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false }]; } },
  { label: 'Domain circular hierarchy reference', severity: 'error', detail: 'domain_a → domain_b', mutate: s => { s.domains = ['a', 'b'].map((id, i) => ({ id, name: `domain_${id}`, parentId: i ? 'a' : 'b', type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false })); } },
  { label: 'Column type incompatible with DBMS', severity: 'warning', detail: 'child.value: UUID is not native to MYSQL', mutate: s => { s.dialect = 'mysql'; s.tables[1].columns[1].type = 'UUID'; s.tables[1].foreignKeys = []; } },
  { label: 'Table has no primary key', severity: 'warning', detail: 'child', mutate: s => { s.tables[1].columns[0].primaryKey = false; } },
  { label: 'FK references missing table/column', severity: 'error', detail: 'child → ?', mutate: s => { s.tables[1].foreignKeys[0].referencedTableId = 'missing'; } },
  { label: 'FK references missing table/column', severity: 'error', detail: 'child → parent', mutate: s => { s.tables[1].foreignKeys[0].referencedColumnIds = ['missing']; } },
  { label: 'SET NULL on NOT NULL column', severity: 'warning', detail: 'child.value', mutate: s => { s.tables[1].foreignKeys[0].onDelete = 'SET NULL'; } },
  { label: 'Duplicate column name', severity: 'error', detail: 'child.ID', mutate: s => { s.tables[1].columns[1].name = 'ID'; } },
  { label: 'Duplicate table name', severity: 'error', detail: 'PARENT', mutate: s => { s.tables[1].name = 'PARENT'; } },
  { label: 'Duplicate index', severity: 'warning', detail: 'child', mutate: s => { s.tables[1].indexes = ['first', 'second'].map(id => ({ id, name: id, columnIds: ['child_value'], unique: false })); } },
  { label: 'Circular FK reference', severity: 'warning', detail: 'child', mutate: s => { s.tables[0].foreignKeys = [{ id: 'back', columnIds: ['parent_value'], referencedTableId: 'child', referencedColumnIds: ['child_id'], onDelete: 'RESTRICT', onUpdate: 'NO ACTION' }]; } },
  { label: 'Empty table (no columns)', severity: 'info', detail: 'child', mutate: s => { s.tables[1].columns = []; s.tables[1].foreignKeys = []; } },
  { label: 'FK column count mismatch', severity: 'error', detail: 'child → parent (1 vs 2)', mutate: s => { s.tables[1].foreignKeys[0].referencedColumnIds.push('parent_value'); } },
  { label: 'FK references non-unique column', severity: 'warning', detail: 'child → parent(value)', mutate: s => { s.tables[1].foreignKeys[0].referencedColumnIds = ['parent_value']; } },
  { label: 'FK column type mismatch', severity: 'warning', detail: 'child.value(VARCHAR) → parent.id(INT)', mutate: s => { s.tables[1].columns[1].type = 'VARCHAR'; s.tables[1].columns[1].length = 40; } },
];

for (const [index, scenario] of scenarios.entries()) {
  test(`lint rule ${index + 1}: ${scenario.label} displays exact severity and detail without schema writes`, async ({ page }) => {
    await page.goto('/'); await page.getByTestId('create-project').click();
    const model = fixture(); scenario.mutate(model); await importSchema(page, model);
    await expect.poll(async () => (await savedSchema(page))?.tables.length).toBe(2);
    const before = await savedSchema(page);
    const show = async () => {
      await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: /^Validate(?:\s|$)/ }).click();
      const exact = (value: string) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      const issue = page.locator('.lint-item').filter({ has: page.locator('.lint-rule', { hasText: exact(scenario.label) }) }).filter({ has: page.locator('.lint-detail', { hasText: exact(scenario.detail) }) });
      await expect(issue).toHaveCount(1); await expect(issue).toHaveClass(new RegExp(`lint-${scenario.severity}`));
      await expect(issue.locator('.lint-rule')).toHaveText(scenario.label); await expect(issue.locator('.lint-detail')).toHaveText(scenario.detail);
    };
    await show(); expect(await savedSchema(page)).toEqual(before);
    await page.reload(); await show(); expect(await savedSchema(page)).toEqual(before);
  });
}


test('JSON import normalizes nullable primary keys and does not report an unreachable nullable-PK warning', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('create-project').click();
  const model = fixture(); model.tables[1].columns[0].nullable = true;
  await importSchema(page, model);
  await expect.poll(async () => (await savedSchema(page))?.tables[1]?.columns[0]?.nullable).toBe(false);
  const normalized = (await savedSchema(page))!;
  expect(normalized.tables[1].columns[0]).toEqual({ ...model.tables[1].columns[0], nullable: false });
  const inspect = async () => {
    await page.locator('.btn-tools').click(); await page.getByRole('menuitem', { name: /^Validate(?:\s|$)/ }).click();
    await expect(page.locator('.lint-item').filter({ hasText: 'Nullable PK column' })).toHaveCount(0);
  };
  await inspect(); expect(await savedSchema(page)).toEqual(normalized);
  await page.reload(); await inspect(); expect((await savedSchema(page))!.tables).toEqual(normalized.tables);
});
