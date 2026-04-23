import { describe, it, expect } from 'vitest';
import { isFkUnique } from './fk-cardinality';
import type { ForeignKey, Table, Column } from '$lib/types/erd';

function col(id: string, over: Partial<Column> = {}): Column {
  return {
    id,
    name: id,
    type: 'INT',
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...over,
  };
}

function table(columns: Column[], over: Partial<Table> = {}): Table {
  return {
    id: 't1',
    name: 'test',
    columns,
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...over,
  };
}

function fk(columnIds: string[]): ForeignKey {
  return {
    id: 'fk1',
    columnIds,
    referencedTableId: 't2',
    referencedColumnIds: columnIds.map(() => 'ref'),
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  };
}

describe('isFkUnique', () => {
  it('returns false for empty FK', () => {
    expect(isFkUnique(fk([]), table([]))).toBe(false);
  });

  it('returns false when FK column does not exist in table', () => {
    expect(isFkUnique(fk(['missing']), table([col('a')]))).toBe(false);
  });

  it('returns false for plain non-unique column', () => {
    expect(isFkUnique(fk(['a']), table([col('a')]))).toBe(false);
  });

  it('detects single-column unique flag', () => {
    expect(isFkUnique(fk(['a']), table([col('a', { unique: true })]))).toBe(true);
  });

  it('detects single FK column that is PRIMARY KEY', () => {
    expect(isFkUnique(fk(['a']), table([col('a', { primaryKey: true })]))).toBe(true);
  });

  it('detects composite PK matching composite FK', () => {
    const t = table([col('a', { primaryKey: true }), col('b', { primaryKey: true })]);
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(true);
  });

  it('returns false when composite FK is only partially PK', () => {
    const t = table([col('a', { primaryKey: true }), col('b')]);
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(false);
  });

  it('detects composite uniqueKey match', () => {
    const t = table(
      [col('a'), col('b')],
      { uniqueKeys: [{ id: 'u1', columnIds: ['a', 'b'] }] },
    );
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(true);
  });

  it('uniqueKey match is order-insensitive', () => {
    const t = table(
      [col('a'), col('b')],
      { uniqueKeys: [{ id: 'u1', columnIds: ['b', 'a'] }] },
    );
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(true);
  });

  it('returns false when uniqueKey is larger than FK (superset)', () => {
    const t = table(
      [col('a'), col('b'), col('c')],
      { uniqueKeys: [{ id: 'u1', columnIds: ['a', 'b', 'c'] }] },
    );
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(false);
  });

  it('returns false when FK is larger than uniqueKey (subset)', () => {
    const t = table(
      [col('a'), col('b'), col('c')],
      { uniqueKeys: [{ id: 'u1', columnIds: ['a', 'b'] }] },
    );
    expect(isFkUnique(fk(['a', 'b', 'c']), t)).toBe(false);
  });

  it('detects unique index match', () => {
    const t = table(
      [col('a'), col('b')],
      { indexes: [{ id: 'i1', columnIds: ['a', 'b'], unique: true }] },
    );
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(true);
  });

  it('ignores non-unique index', () => {
    const t = table(
      [col('a'), col('b')],
      { indexes: [{ id: 'i1', columnIds: ['a', 'b'], unique: false }] },
    );
    expect(isFkUnique(fk(['a', 'b']), t)).toBe(false);
  });
});
