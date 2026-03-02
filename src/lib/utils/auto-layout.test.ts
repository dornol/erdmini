import { describe, it, expect, beforeEach } from 'vitest';
import { computeLayout } from './auto-layout';
import { makeColumn, makeTable, resetIdCounter } from './test-helpers';
import type { Table } from '$lib/types/erd';

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

/** Create a chain of tables: A → B → C (A refs B, B refs C) */
function chainTables(): Table[] {
  const c = makeTable({
    id: 'tC',
    name: 'table_C',
    columns: [makeColumn({ id: 'c_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
  });
  const b = makeTable({
    id: 'tB',
    name: 'table_B',
    columns: [
      makeColumn({ id: 'b_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
      makeColumn({ id: 'b_cid', name: 'c_id', type: 'INT', nullable: false }),
    ],
    foreignKeys: [{
      id: 'fk_bc', columnIds: ['b_cid'], referencedTableId: 'tC',
      referencedColumnIds: ['c_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
    }],
  });
  const a = makeTable({
    id: 'tA',
    name: 'table_A',
    columns: [
      makeColumn({ id: 'a_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
      makeColumn({ id: 'a_bid', name: 'b_id', type: 'INT', nullable: false }),
    ],
    foreignKeys: [{
      id: 'fk_ab', columnIds: ['a_bid'], referencedTableId: 'tB',
      referencedColumnIds: ['b_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
    }],
  });
  return [a, b, c]; // intentionally not in chain order
}

/** Two parents each with their own child */
function twoParentChildPairs(): Table[] {
  const parent1 = makeTable({
    id: 'p1', name: 'parent1',
    columns: [makeColumn({ id: 'p1_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
  });
  const parent2 = makeTable({
    id: 'p2', name: 'parent2',
    columns: [makeColumn({ id: 'p2_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
  });
  const child1 = makeTable({
    id: 'c1', name: 'child1',
    columns: [
      makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
      makeColumn({ id: 'c1_pid', name: 'parent_id', type: 'INT', nullable: false }),
    ],
    foreignKeys: [{
      id: 'fk_c1', columnIds: ['c1_pid'], referencedTableId: 'p1',
      referencedColumnIds: ['p1_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
    }],
  });
  const child2 = makeTable({
    id: 'c2', name: 'child2',
    columns: [
      makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
      makeColumn({ id: 'c2_pid', name: 'parent_id', type: 'INT', nullable: false }),
    ],
    foreignKeys: [{
      id: 'fk_c2', columnIds: ['c2_pid'], referencedTableId: 'p2',
      referencedColumnIds: ['p2_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
    }],
  });
  return [parent1, parent2, child1, child2];
}

function groupedTables(): Table[] {
  return [
    makeTable({
      name: 'users', group: 'auth',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    }),
    makeTable({
      name: 'roles', group: 'auth',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    }),
    makeTable({
      name: 'orders', group: 'sales',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    }),
    makeTable({
      name: 'products', group: 'sales',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    }),
  ];
}

// ─── Original tests ─────────────────────────────────────────────────

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

// ─── New tests: FK ordering ────────────────────────────────────────

describe('grid — FK ordering', () => {
  it('FK-connected chain tables are placed adjacently in grid', () => {
    const tables = chainTables();
    const result = computeLayout(tables, 'grid');
    expect(result.size).toBe(3);

    // All three are in a chain (A→B→C), so they should be adjacent
    const posA = result.get('tA')!;
    const posB = result.get('tB')!;
    const posC = result.get('tC')!;

    // Check that connected tables are closer than if they were scattered
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    // C is root (no outgoing FK), B refs C, A refs B
    // BFS should start from C → B → A, so they should be in a single row or adjacent cells
    const distCB = dist(posC, posB);
    const distBA = dist(posB, posA);
    const distCA = dist(posC, posA);

    // At least C-B and B-A should be close (within 2 cell spacings)
    const maxNeighborDist = (200 + 60) * 2; // 2 cells max
    expect(distCB).toBeLessThan(maxNeighborDist);
    expect(distBA).toBeLessThan(maxNeighborDist);
  });
});

describe('hierarchical — barycenter ordering', () => {
  it('child is placed near its parent horizontally', () => {
    const tables = twoParentChildPairs();
    const result = computeLayout(tables, 'hierarchical');
    expect(result.size).toBe(4);

    const p1 = result.get('p1')!;
    const p2 = result.get('p2')!;
    const c1 = result.get('c1')!;
    const c2 = result.get('c2')!;

    // child1→parent1, child2→parent2
    // child1's x should be closer to parent1's x than to parent2's x
    const c1_to_p1 = Math.abs(c1.x - p1.x);
    const c1_to_p2 = Math.abs(c1.x - p2.x);
    expect(c1_to_p1).toBeLessThanOrEqual(c1_to_p2);

    // child2's x should be closer to parent2's x
    const c2_to_p2 = Math.abs(c2.x - p2.x);
    const c2_to_p1 = Math.abs(c2.x - p1.x);
    expect(c2_to_p2).toBeLessThanOrEqual(c2_to_p1);
  });
});

// ─── New tests: Group clustering ───────────────────────────────────

function avgDist(positions: Map<string, { x: number; y: number }>, ids: string[]): number {
  let sum = 0, count = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions.get(ids[i])!;
      const b = positions.get(ids[j])!;
      sum += Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

describe('grid — group clustering', () => {
  it('same-group tables are closer than cross-group tables', () => {
    const tables = groupedTables();
    const result = computeLayout(tables, 'grid', { groupByGroup: true });
    expect(result.size).toBe(4);

    const authIds = tables.filter((t) => t.group === 'auth').map((t) => t.id);
    const salesIds = tables.filter((t) => t.group === 'sales').map((t) => t.id);

    const intraAuth = avgDist(result, authIds);
    const intraSales = avgDist(result, salesIds);

    // Cross-group distance
    const crossIds = [authIds[0], salesIds[0]];
    const crossDist = avgDist(result, crossIds);

    // Intra-group distances should be less than cross-group
    expect(intraAuth).toBeLessThan(crossDist);
    expect(intraSales).toBeLessThan(crossDist);
  });
});

describe('hierarchical — group clustering', () => {
  it('assigns positions to all grouped tables', () => {
    const tables = groupedTables();
    const result = computeLayout(tables, 'hierarchical', { groupByGroup: true });
    expect(result.size).toBe(4);
    for (const pos of result.values()) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });
});

describe('radial — group clustering', () => {
  it('same-group tables are closer than cross-group tables', () => {
    const tables = [
      makeTable({ name: 'u1', group: 'auth', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'u2', group: 'auth', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'u3', group: 'auth', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'o1', group: 'sales', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'o2', group: 'sales', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'o3', group: 'sales', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
    ];
    const result = computeLayout(tables, 'radial', { groupByGroup: true });
    expect(result.size).toBe(6);

    const authIds = tables.filter((t) => t.group === 'auth').map((t) => t.id);
    const salesIds = tables.filter((t) => t.group === 'sales').map((t) => t.id);

    const intraAuth = avgDist(result, authIds);
    const intraSales = avgDist(result, salesIds);
    const crossDist = avgDist(result, [...authIds, ...salesIds]);

    expect(intraAuth).toBeLessThan(crossDist);
    expect(intraSales).toBeLessThan(crossDist);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('edge cases', () => {
  it('single group — all tables in same group', () => {
    const tables = [
      makeTable({ name: 'a', group: 'only', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'b', group: 'only', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'c', group: 'only', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
    ];
    for (const type of ['grid', 'hierarchical', 'radial'] as const) {
      const result = computeLayout(tables, type, { groupByGroup: true });
      expect(result.size).toBe(3);
    }
  });

  it('cyclic FK — no infinite loop', () => {
    const a = makeTable({
      id: 'cyA', name: 'cyc_a',
      columns: [makeColumn({ id: 'cyA_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
                makeColumn({ id: 'cyA_bid', name: 'b_id', type: 'INT', nullable: false })],
      foreignKeys: [{
        id: 'fk_a2b', columnIds: ['cyA_bid'], referencedTableId: 'cyB',
        referencedColumnIds: ['cyB_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
      }],
    });
    const b = makeTable({
      id: 'cyB', name: 'cyc_b',
      columns: [makeColumn({ id: 'cyB_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
                makeColumn({ id: 'cyB_aid', name: 'a_id', type: 'INT', nullable: false })],
      foreignKeys: [{
        id: 'fk_b2a', columnIds: ['cyB_aid'], referencedTableId: 'cyA',
        referencedColumnIds: ['cyA_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
      }],
    });
    for (const type of ['grid', 'hierarchical', 'radial'] as const) {
      const result = computeLayout([a, b], type);
      expect(result.size).toBe(2);
    }
  });

  it('groups with no FK — hierarchical handles gracefully', () => {
    const tables = [
      makeTable({ name: 'x', group: 'g1', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'y', group: 'g2', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
      makeTable({ name: 'z', group: 'g1', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
    ];
    const result = computeLayout(tables, 'hierarchical', { groupByGroup: true });
    expect(result.size).toBe(3);
    // g1 tables (x, z) in separate sub-layout from g2 (y) — should be closer to each other
    const posX = result.get(tables[0].id)!;
    const posZ = result.get(tables[2].id)!;
    const posY = result.get(tables[1].id)!;
    const distXZ = Math.abs(posX.x - posZ.x);
    const distXY = Math.abs(posX.x - posY.x);
    expect(distXZ).toBeLessThanOrEqual(distXY);
  });
});
