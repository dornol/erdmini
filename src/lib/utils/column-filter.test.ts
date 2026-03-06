import { describe, it, expect } from 'vitest';
import { getFilteredColumns, getFilteredColumnCount } from './column-filter';
import { makeColumn, makeTable } from './test-helpers';

describe('getFilteredColumns', () => {
  const pkCol = makeColumn({ name: 'id', type: 'INT', primaryKey: true });
  const fkCol = makeColumn({ name: 'user_id', type: 'INT' });
  const normalCol = makeColumn({ name: 'email', type: 'VARCHAR' });
  const normalCol2 = makeColumn({ name: 'name', type: 'VARCHAR' });

  const table = makeTable({
    name: 'orders',
    columns: [pkCol, fkCol, normalCol, normalCol2],
    foreignKeys: [
      {
        id: 'fk1',
        columnIds: [fkCol.id],
        referencedTableId: 'users_tbl',
        referencedColumnIds: ['uid'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    ],
  });

  it('returns all columns in "all" mode', () => {
    const result = getFilteredColumns(table, 'all');
    expect(result).toHaveLength(4);
  });

  it('returns all columns in "names-only" mode', () => {
    const result = getFilteredColumns(table, 'names-only');
    expect(result).toHaveLength(4);
  });

  it('returns only PK and FK columns in "pk-fk-only" mode', () => {
    const result = getFilteredColumns(table, 'pk-fk-only');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(['id', 'user_id']);
  });

  it('returns empty when no PK/FK columns in pk-fk-only mode', () => {
    const plainTable = makeTable({
      name: 'config',
      columns: [normalCol, normalCol2],
    });
    const result = getFilteredColumns(plainTable, 'pk-fk-only');
    expect(result).toHaveLength(0);
  });

  it('handles table with only PK column', () => {
    const pkOnlyTable = makeTable({
      name: 'simple',
      columns: [pkCol],
    });
    expect(getFilteredColumns(pkOnlyTable, 'pk-fk-only')).toHaveLength(1);
  });

  it('handles composite FK referencing multiple columns', () => {
    const fkCol2 = makeColumn({ name: 'tenant_id', type: 'INT' });
    const compositeTable = makeTable({
      name: 'items',
      columns: [pkCol, fkCol, fkCol2, normalCol],
      foreignKeys: [
        {
          id: 'fk_composite',
          columnIds: [fkCol.id, fkCol2.id],
          referencedTableId: 'ref_tbl',
          referencedColumnIds: ['a', 'b'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        },
      ],
    });
    const result = getFilteredColumns(compositeTable, 'pk-fk-only');
    // PK + 2 FK cols = 3
    expect(result).toHaveLength(3);
  });
});

describe('getFilteredColumnCount', () => {
  const pkCol = makeColumn({ name: 'id', type: 'INT', primaryKey: true });
  const fkCol = makeColumn({ name: 'user_id', type: 'INT' });
  const normalCol = makeColumn({ name: 'email', type: 'VARCHAR' });

  const table = makeTable({
    name: 'orders',
    columns: [pkCol, fkCol, normalCol],
    foreignKeys: [
      {
        id: 'fk1',
        columnIds: [fkCol.id],
        referencedTableId: 'users_tbl',
        referencedColumnIds: ['uid'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    ],
  });

  it('returns total count in "all" mode', () => {
    expect(getFilteredColumnCount(table, 'all')).toBe(3);
  });

  it('returns total count in "names-only" mode', () => {
    expect(getFilteredColumnCount(table, 'names-only')).toBe(3);
  });

  it('returns PK+FK count in "pk-fk-only" mode', () => {
    expect(getFilteredColumnCount(table, 'pk-fk-only')).toBe(2);
  });

  it('matches getFilteredColumns length', () => {
    const modes = ['all', 'pk-fk-only', 'names-only'] as const;
    for (const mode of modes) {
      expect(getFilteredColumnCount(table, mode)).toBe(
        getFilteredColumns(table, mode).length,
      );
    }
  });
});
