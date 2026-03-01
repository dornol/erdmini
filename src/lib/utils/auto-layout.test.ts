import { describe, it, expect, beforeEach } from 'vitest';
import { computeLayout } from './auto-layout';
import { makeColumn, makeTable, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

function simpleTables(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeTable({
      name: `table_${String.fromCharCode(65 + i)}`, // A, B, C, ...
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ name: 'name', type: 'VARCHAR', nullable: false }),
      ],
    }),
  );
}

function parentChildTables() {
  const parent = makeTable({
    id: 'parent_id',
    name: 'parent',
    columns: [
      makeColumn({ id: 'p_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
    ],
  });
  const child = makeTable({
    id: 'child_id',
    name: 'child',
    columns: [
      makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
      makeColumn({ id: 'c_pid', name: 'parent_id', type: 'INT', nullable: false }),
    ],
    foreignKeys: [
      {
        id: 'fk_1',
        columnIds: ['c_pid'],
        referencedTableId: 'parent_id',
        referencedColumnIds: ['p_id'],
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT',
      },
    ],
  });
  return [parent, child];
}

describe('computeLayout — grid', () => {
  it('returns empty map for empty array', () => {
    const result = computeLayout([], 'grid');
    expect(result.size).toBe(0);
  });

  it('assigns position for single table', () => {
    const tables = simpleTables(1);
    const result = computeLayout(tables, 'grid');
    expect(result.size).toBe(1);
    const pos = result.get(tables[0].id)!;
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it('assigns unique positions to each table', () => {
    const tables = simpleTables(6);
    const result = computeLayout(tables, 'grid');
    expect(result.size).toBe(6);
    const positions = [...result.values()].map((p) => `${p.x},${p.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(6);
  });

  it('tables do not overlap', () => {
    const tables = simpleTables(9);
    const result = computeLayout(tables, 'grid');
    const rects = [...result.entries()].map(([id, pos]) => {
      const table = tables.find((t) => t.id === id)!;
      return {
        x: pos.x,
        y: pos.y,
        w: 200, // TABLE_W
        h: 37 + table.columns.length * 26 + 8,
      };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap =
          a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap, `Tables ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
});

describe('computeLayout — hierarchical', () => {
  it('returns empty map for empty array', () => {
    const result = computeLayout([], 'hierarchical');
    expect(result.size).toBe(0);
  });

  it('places parent at lower y than child', () => {
    const tables = parentChildTables();
    const result = computeLayout(tables, 'hierarchical');
    const parentPos = result.get('parent_id')!;
    const childPos = result.get('child_id')!;
    expect(parentPos.y).toBeLessThan(childPos.y);
  });

  it('assigns positions to all tables', () => {
    const tables = simpleTables(4);
    const result = computeLayout(tables, 'hierarchical');
    expect(result.size).toBe(4);
  });
});

describe('computeLayout — radial', () => {
  it('returns empty map for empty array', () => {
    const result = computeLayout([], 'radial');
    expect(result.size).toBe(0);
  });

  it('assigns positions to all tables', () => {
    const tables = simpleTables(5);
    const result = computeLayout(tables, 'radial');
    expect(result.size).toBe(5);
    for (const pos of result.values()) {
      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it('assigns positions for single table', () => {
    const tables = simpleTables(1);
    const result = computeLayout(tables, 'radial');
    expect(result.size).toBe(1);
  });
});
