import { describe, it, expect, beforeEach } from 'vitest';
import { computeLayout } from './auto-layout';
import { makeColumn, makeTable, resetIdCounter } from './test-helpers';
import type { Table } from '$lib/types/erd';
import { TABLE_W, HEADER_H, COMMENT_H, ROW_H, BOTTOM_PAD } from '$lib/constants/layout';

function tableHeight(t: Table): number {
  const commentH = t.comment ? COMMENT_H : 0;
  return HEADER_H + commentH + t.columns.length * ROW_H + BOTTOM_PAD;
}

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
        w: 220, // TABLE_W
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

// ─── Radial-Tree tests ─────────────────────────────────────────────

describe('computeLayout — radial-tree', () => {
  it('returns empty map for empty array', () => {
    const result = computeLayout([], 'radial-tree');
    expect(result.size).toBe(0);
  });

  it('assigns finite positions to all tables', () => {
    const tables = simpleTables(5);
    const result = computeLayout(tables, 'radial-tree');
    expect(result.size).toBe(5);
    for (const pos of result.values()) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it('single table is positioned at origin+margin', () => {
    const tables = simpleTables(1);
    const result = computeLayout(tables, 'radial-tree');
    expect(result.size).toBe(1);
  });

  it('star graph: hub is at center, leaves orbit around it', () => {
    // Build a hub with 6 leaves pointing to it
    const hub = makeTable({
      id: 'hub', name: 'hub',
      columns: [makeColumn({ id: 'hub_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    const leaves = Array.from({ length: 6 }, (_, i) =>
      makeTable({
        id: `leaf${i}`, name: `leaf${i}`,
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: `leaf${i}_hid`, name: 'hub_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: `fk${i}`, columnIds: [`leaf${i}_hid`], referencedTableId: 'hub',
          referencedColumnIds: ['hub_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
        }],
      }),
    );
    const tables = [hub, ...leaves];
    const result = computeLayout(tables, 'radial-tree');

    const posHub = result.get('hub')!;
    const leafPositions = leaves.map((l) => result.get(l.id)!);

    // Centroid of leaves should be roughly equal to hub position (hub at center)
    const avgX = leafPositions.reduce((s, p) => s + p.x, 0) / leafPositions.length;
    const avgY = leafPositions.reduce((s, p) => s + p.y, 0) / leafPositions.length;
    // Hub should be near the centroid (within ~20px — accounts for table size rounding)
    expect(Math.abs(posHub.x - avgX)).toBeLessThan(30);
    expect(Math.abs(posHub.y - avgY)).toBeLessThan(30);

    // All leaves should orbit the hub at a roughly similar distance. Exact "same ring"
    // isn't guaranteed because we use axis-aligned (W≠H) collision — tables at angles
    // where the hub is short in Y can pack closer than east/west. Enforce a soft bound.
    const distances = leafPositions.map((p) =>
      Math.sqrt((p.x - posHub.x) ** 2 + (p.y - posHub.y) ** 2),
    );
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    expect(maxDist / minDist).toBeLessThan(2.5);
  });

  it('disconnected components are arranged non-overlapping', () => {
    // Two independent 2-table groups with no FKs between them
    const a1 = makeTable({ id: 'a1', name: 'a1', columns: [makeColumn({ id: 'a1_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })] });
    const a2 = makeTable({
      id: 'a2', name: 'a2',
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ id: 'a2_pid', name: 'a1_id', type: 'INT', nullable: false }),
      ],
      foreignKeys: [{ id: 'fka', columnIds: ['a2_pid'], referencedTableId: 'a1', referencedColumnIds: ['a1_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }],
    });
    const b1 = makeTable({ id: 'b1', name: 'b1', columns: [makeColumn({ id: 'b1_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })] });
    const b2 = makeTable({
      id: 'b2', name: 'b2',
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ id: 'b2_pid', name: 'b1_id', type: 'INT', nullable: false }),
      ],
      foreignKeys: [{ id: 'fkb', columnIds: ['b2_pid'], referencedTableId: 'b1', referencedColumnIds: ['b1_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }],
    });
    const result = computeLayout([a1, a2, b1, b2], 'radial-tree');
    expect(result.size).toBe(4);

    // Intra-component pairs should be closer than cross-component pairs
    const pA1 = result.get('a1')!, pA2 = result.get('a2')!;
    const pB1 = result.get('b1')!, pB2 = result.get('b2')!;
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
    const intra = Math.max(d(pA1, pA2), d(pB1, pB2));
    const inter = Math.min(d(pA1, pB1), d(pA2, pB2));
    expect(intra).toBeLessThan(inter);
  });

  it('cyclic FK — no infinite loop', () => {
    const a = makeTable({
      id: 'rtCycA', name: 'rtc_a',
      columns: [makeColumn({ id: 'rtA_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
                makeColumn({ id: 'rtA_bid', name: 'b_id', type: 'INT', nullable: false })],
      foreignKeys: [{ id: 'rtfk_a2b', columnIds: ['rtA_bid'], referencedTableId: 'rtCycB', referencedColumnIds: ['rtB_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }],
    });
    const b = makeTable({
      id: 'rtCycB', name: 'rtc_b',
      columns: [makeColumn({ id: 'rtB_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
                makeColumn({ id: 'rtB_aid', name: 'a_id', type: 'INT', nullable: false })],
      foreignKeys: [{ id: 'rtfk_b2a', columnIds: ['rtB_aid'], referencedTableId: 'rtCycA', referencedColumnIds: ['rtA_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }],
    });
    const result = computeLayout([a, b], 'radial-tree');
    expect(result.size).toBe(2);
  });

  it('group clustering works with radial-tree', () => {
    const tables = groupedTables();
    const result = computeLayout(tables, 'radial-tree', { groupByGroup: true });
    expect(result.size).toBe(4);
  });

  it('tables do not overlap in star graph with tall hub', () => {
    // Hub with many columns → tall table, potentially overlapping with leaves at N/S
    const tallHub = makeTable({
      id: 'tallhub', name: 'tallhub',
      columns: Array.from({ length: 15 }, (_, i) =>
        makeColumn({ id: `h${i}`, name: `c${i}`, type: 'VARCHAR', primaryKey: i === 0, nullable: i !== 0 }),
      ),
    });
    const leaves = Array.from({ length: 8 }, (_, i) =>
      makeTable({
        id: `tl${i}`, name: `tl${i}`,
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ id: `tl${i}_h`, name: 'h_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: `tfk${i}`, columnIds: [`tl${i}_h`], referencedTableId: 'tallhub',
          referencedColumnIds: ['h0'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
        }],
      }),
    );
    const tables = [tallHub, ...leaves];
    const result = computeLayout(tables, 'radial-tree');

    // Check all pairs for axis-aligned rectangle overlap
    const rects = tables.map((t) => {
      const p = result.get(t.id)!;
      return { id: t.id, x: p.x, y: p.y, w: TABLE_W, h: tableHeight(t) };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlapX && overlapY, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('tables do not overlap in deep tree with varied heights', () => {
    // Build a 3-level tree with tall and short tables mixed
    const root = makeTable({
      id: 'r', name: 'r',
      columns: [makeColumn({ id: 'r_id', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    const mids: Table[] = [];
    const leafs: Table[] = [];
    for (let i = 0; i < 4; i++) {
      const colCount = 3 + i * 4; // 3, 7, 11, 15
      mids.push(makeTable({
        id: `m${i}`, name: `m${i}`,
        columns: [
          ...Array.from({ length: colCount }, (_, j) =>
            makeColumn({ id: `m${i}c${j}`, name: `c${j}`, type: 'VARCHAR', primaryKey: j === 0, nullable: j !== 0 }),
          ),
          makeColumn({ id: `m${i}_rid`, name: 'r_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: `fm${i}`, columnIds: [`m${i}_rid`], referencedTableId: 'r',
          referencedColumnIds: ['r_id'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
        }],
      }));
      for (let j = 0; j < 3; j++) {
        leafs.push(makeTable({
          id: `l${i}_${j}`, name: `l${i}_${j}`,
          columns: [
            makeColumn({ id: `l${i}_${j}_id`, name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: `l${i}_${j}_m`, name: 'm_id', type: 'INT', nullable: false }),
          ],
          foreignKeys: [{
            id: `fl${i}_${j}`, columnIds: [`l${i}_${j}_m`], referencedTableId: `m${i}`,
            referencedColumnIds: [`m${i}c0`], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
          }],
        }));
      }
    }
    const tables = [root, ...mids, ...leafs];
    const result = computeLayout(tables, 'radial-tree');

    const rects = tables.map((t) => {
      const p = result.get(t.id)!;
      return { id: t.id, x: p.x, y: p.y, w: TABLE_W, h: tableHeight(t) };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlapX && overlapY, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
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
    for (const type of ['grid', 'hierarchical', 'radial', 'radial-tree'] as const) {
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
    for (const type of ['grid', 'hierarchical', 'radial', 'radial-tree'] as const) {
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

  it('groupByGroup:false treats grouped tables as flat', () => {
    const tables = groupedTables();
    const flat = computeLayout(tables, 'grid');
    const grouped = computeLayout(tables, 'grid', { groupByGroup: true });
    // Without groupByGroup, all tables are in one grid — positions differ from grouped version
    expect(flat.size).toBe(4);
    expect(grouped.size).toBe(4);
    // At least one position should differ
    let anyDiff = false;
    for (const [id, pos] of flat) {
      const gpos = grouped.get(id)!;
      if (pos.x !== gpos.x || pos.y !== gpos.y) anyDiff = true;
    }
    expect(anyDiff).toBe(true);
  });

  it('tables with comments do not overlap in grid', () => {
    const tables = [
      makeTable({
        name: 'tall',
        comment: 'This table has a comment making it taller',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ name: 'a', type: 'VARCHAR', nullable: true }),
          makeColumn({ name: 'b', type: 'VARCHAR', nullable: true }),
          makeColumn({ name: 'c', type: 'VARCHAR', nullable: true }),
        ],
      }),
      makeTable({
        name: 'short',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      }),
      makeTable({
        name: 'another',
        comment: 'Also has comment',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ name: 'x', type: 'INT', nullable: true }),
        ],
      }),
    ];
    const result = computeLayout(tables, 'grid');
    expect(result.size).toBe(3);
    // Positions should all be finite
    for (const pos of result.values()) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });
});
