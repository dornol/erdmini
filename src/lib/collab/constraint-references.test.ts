import { describe, expect, it } from 'vitest';
import type { ForeignKey, Table } from '$lib/types/erd';
import { hasConstraintColumns, hasForeignKeyReferences } from './constraint-references';

const tables = (): Table[] => ['source', 'target'].map(id => ({
  id, name: id, position: { x: 0, y: 0 }, foreignKeys: [], uniqueKeys: [], indexes: [],
  columns: ['id', 'tenant'].map(name => ({ id: `${id}_${name}`, name, type: 'INT', nullable: false, primaryKey: false, unique: false, autoIncrement: false })),
}));
const fk: ForeignKey = { id: 'link', columnIds: ['source_id', 'source_tenant'], referencedTableId: 'target', referencedColumnIds: ['target_id', 'target_tenant'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' };

describe('current constraint references', () => {
  it('accepts live scalar/composite columns without mutating their identity or order', () => {
    const current = tables();
    const before = structuredClone(current);
    expect(hasConstraintColumns(current[0], ['source_id'])).toBe(true);
    expect(hasConstraintColumns(current[0], ['source_tenant', 'source_id'])).toBe(true);
    expect(current).toEqual(before);
  });

  for (const ids of [[], ['missing'], ['source_id', 'missing'], ['source_id', 'source_id'], [1], null, undefined, 'source_id']) {
    it(`rejects missing, duplicate or malformed column references ${JSON.stringify(ids)}`, () => {
      expect(hasConstraintColumns(tables()[0], ids)).toBe(false);
    });
  }

  it('rejects a deleted owning table', () => {
    expect(hasConstraintColumns(undefined, ['source_id'])).toBe(false);
  });

  it('accepts composite and self FK endpoints that still exist', () => {
    const current = tables();
    expect(hasForeignKeyReferences(current, 'source', fk)).toBe(true);
    expect(hasForeignKeyReferences(current, 'source', { ...fk, referencedTableId: 'source', referencedColumnIds: [...fk.columnIds] })).toBe(true);
  });

  for (const endpoint of ['source-table', 'target-table', 'source-column', 'target-column']) {
    it(`rejects an FK after deleting its ${endpoint}`, () => {
      const current = tables();
      if (endpoint.endsWith('table')) current.splice(endpoint.startsWith('source') ? 0 : 1, 1);
      else current[endpoint.startsWith('source') ? 0 : 1].columns.shift();
      expect(hasForeignKeyReferences(current, 'source', fk)).toBe(false);
    });
  }

  it('rejects missing payloads and unequal pair counts', () => {
    expect(hasForeignKeyReferences(tables(), 'source', undefined)).toBe(false);
    expect(hasForeignKeyReferences(tables(), 'source', { ...fk, referencedColumnIds: ['target_id'] })).toBe(false);
  });
});
