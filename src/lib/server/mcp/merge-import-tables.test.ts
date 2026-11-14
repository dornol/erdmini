import { describe, expect, it } from 'vitest';
import type { Table, Column } from '$lib/types/erd';
import { mergeImportTables } from './merge-import-tables';
const column = (id: string, name = id): Column => ({ id, name, type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false });
const table = (id: string, name: string, columns: Column[]): Table => ({ id, name, columns, position: { x: 0, y: 0 }, foreignKeys: [], uniqueKeys: [], indexes: [] });
function fixture() {
  const retained = table('old', 'users', [column('old_id', 'ID'), column('old_tenant', 'tenant')]);
  const parent = table('import', 'USERS', [column('new_id', 'id'), column('new_tenant', 'TENANT')]);
  const child = table('child', 'child', [column('parent_id'), column('tenant')]);
  child.foreignKeys = [{ id: 'fk', columnIds: ['tenant', 'parent_id'], referencedTableId: parent.id, referencedColumnIds: ['new_tenant', 'new_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT', label: 'Keep label' }];
  return { retained, parent, child };
}
describe('mergeImportTables', () => {
  it('remaps composite target IDs by case-insensitive names in FK order without mutating inputs', () => {
    const { retained, parent, child } = fixture(); const before = structuredClone([retained, parent, child]);
    const merged = mergeImportTables([retained], [parent, child]);
    expect(merged[0]).toBe(retained); expect(merged).toHaveLength(2);
    expect(merged[1].foreignKeys[0]).toEqual({ ...child.foreignKeys[0], referencedTableId: 'old', referencedColumnIds: ['old_tenant', 'old_id'] });
    expect([retained, parent, child]).toEqual(before);
    expect(mergeImportTables(merged, [parent, child])).toEqual(merged);
  });
  it('rejects missing retained columns atomically', () => {
    const { retained, parent, child } = fixture(); retained.columns.pop(); const before = structuredClone([retained, parent, child]);
    expect(() => mergeImportTables([retained], [parent, child])).toThrow(/target column/); expect([retained, parent, child]).toEqual(before);
  });
  it('keeps links among newly imported tables', () => {
    const { parent, child } = fixture(); const merged = mergeImportTables([], [parent, child]); expect(merged).toEqual([parent, child]);
  });
  it('rejects missing FK target tables', () => {
    const { child } = fixture(); expect(() => mergeImportTables([], [child])).toThrow(/target table/);
  });
});
