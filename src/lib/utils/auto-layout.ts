import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { Table } from '$lib/types/erd';
import { TABLE_W, HEADER_H, COMMENT_H, ROW_H, BOTTOM_PAD } from '$lib/constants/layout';

export type LayoutType = 'grid' | 'hierarchical' | 'radial' | 'radial-tree';

const GAP_X  = 60;
const GAP_Y  = 60;
const MARGIN = 40;
const GROUP_GAP = 80;
const RING_GAP = 8;
const ARC_PAD = 4;

type Pos = { x: number; y: number };
type SubLayout = { positions: Map<string, Pos>; width: number; height: number };

function tableHeight(table: Table): number {
  const commentH = table.comment ? COMMENT_H : 0;
  return HEADER_H + commentH + table.columns.length * ROW_H + BOTTOM_PAD;
}

// ─── Helper functions ───────────────────────────────────────────────

function buildAdjacency(tables: Table[]): Map<string, Set<string>> {
  const tableIds = new Set(tables.map((t) => t.id));
  const adj = new Map<string, Set<string>>();
  for (const t of tables) adj.set(t.id, new Set());
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      if (!tableIds.has(fk.referencedTableId)) continue;
      adj.get(t.id)!.add(fk.referencedTableId);
      adj.get(fk.referencedTableId)!.add(t.id);
    }
  }
  return adj;
}

function bfsOrder(tables: Table[]): Table[] {
  if (tables.length === 0) return [];
  const adj = buildAdjacency(tables);
  const byId = new Map(tables.map((t) => [t.id, t]));

  const incomingCount = new Map<string, number>();
  for (const t of tables) incomingCount.set(t.id, 0);
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      if (incomingCount.has(fk.referencedTableId)) {
        incomingCount.set(fk.referencedTableId, (incomingCount.get(fk.referencedTableId) ?? 0) + 1);
      }
    }
  }

  const candidates = [...tables].sort((a, b) => {
    const aOut = a.foreignKeys.filter((fk) => byId.has(fk.referencedTableId)).length;
    const bOut = b.foreignKeys.filter((fk) => byId.has(fk.referencedTableId)).length;
    if (aOut !== bOut) return aOut - bOut;
    const aIn = incomingCount.get(a.id) ?? 0;
    const bIn = incomingCount.get(b.id) ?? 0;
    if (aIn !== bIn) return bIn - aIn;
    return a.name.localeCompare(b.name);
  });

  const visited = new Set<string>();
  const result: Table[] = [];

  for (const start of candidates) {
    if (visited.has(start.id)) continue;
    const queue = [start.id];
    visited.add(start.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(byId.get(id)!);
      const neighbors = [...(adj.get(id) ?? [])].sort((a, b) =>
        (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''),
      );
      for (const nid of neighbors) {
        if (!visited.has(nid)) {
          visited.add(nid);
          queue.push(nid);
        }
      }
    }
  }

  return result;
}

function partitionByGroup(tables: Table[]): Map<string, Table[]> {
  const groups = new Map<string, Table[]>();
  for (const t of tables) {
    const g = t.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }
  return groups;
}

function hasGroups(tables: Table[]): boolean {
  return tables.some((t) => t.group && t.group.length > 0);
}

/** Sort group names: named groups alphabetically, ungrouped ('') last */
function sortedGroupNames(groups: Map<string, Table[]>): string[] {
  return [...groups.keys()].sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (a !== '' && b === '') return -1;
    return a.localeCompare(b);
  });
}

/** Arrange sub-layouts in a meta-grid with GROUP_GAP spacing, apply MARGIN */
function arrangeSubLayouts(subLayouts: SubLayout[]): Map<string, Pos> {
  const result = new Map<string, Pos>();
  if (subLayouts.length === 1) {
    for (const [id, pos] of subLayouts[0].positions) {
      result.set(id, { x: pos.x + MARGIN, y: pos.y + MARGIN });
    }
    return result;
  }

  const metaCols = Math.ceil(Math.sqrt(subLayouts.length));
  const metaRows = Math.ceil(subLayouts.length / metaCols);

  const metaColW = new Array<number>(metaCols).fill(0);
  const metaRowH = new Array<number>(metaRows).fill(0);
  subLayouts.forEach((sl, i) => {
    const mc = i % metaCols;
    const mr = Math.floor(i / metaCols);
    metaColW[mc] = Math.max(metaColW[mc], sl.width);
    metaRowH[mr] = Math.max(metaRowH[mr], sl.height);
  });

  const metaX = new Array<number>(metaCols).fill(MARGIN);
  for (let c = 1; c < metaCols; c++) {
    metaX[c] = metaX[c - 1] + metaColW[c - 1] + GAP_X + GROUP_GAP;
  }
  const metaY = new Array<number>(metaRows).fill(MARGIN);
  for (let r = 1; r < metaRows; r++) {
    metaY[r] = metaY[r - 1] + metaRowH[r - 1] + GAP_Y + GROUP_GAP;
  }

  subLayouts.forEach((sl, i) => {
    const mc = i % metaCols;
    const mr = Math.floor(i / metaCols);
    const ox = metaX[mc];
    const oy = metaY[mr];
    for (const [id, pos] of sl.positions) {
      result.set(id, { x: pos.x + ox, y: pos.y + oy });
    }
  });

  return result;
}

/** Generic grouped layout: partition → run layoutFn per group → meta-grid */
function withGroupClustering(
  tables: Table[],
  layoutFn: (groupTables: Table[]) => SubLayout,
): Map<string, Pos> {
  const groups = partitionByGroup(tables);
  const groupNames = sortedGroupNames(groups);
  const subLayouts: SubLayout[] = groupNames.map((name) => layoutFn(groups.get(name)!));
  return arrangeSubLayouts(subLayouts);
}

// ─── Grid Layout ────────────────────────────────────────────────────

function gridLayoutSingle(sorted: Table[]): SubLayout {
  const positions = new Map<string, Pos>();
  if (sorted.length === 0) return { positions, width: 0, height: 0 };

  const cols = Math.ceil(Math.sqrt(sorted.length));
  const rows = Math.ceil(sorted.length / cols);

  const rowH = new Array<number>(rows).fill(0);
  sorted.forEach((table, i) => {
    const row = Math.floor(i / cols);
    rowH[row] = Math.max(rowH[row], tableHeight(table));
  });

  const rowY = new Array<number>(rows).fill(0);
  for (let r = 1; r < rows; r++) {
    rowY[r] = rowY[r - 1] + rowH[r - 1] + GAP_Y;
  }

  sorted.forEach((table, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(table.id, {
      x: col * (TABLE_W + GAP_X),
      y: rowY[row],
    });
  });

  const actualCols = Math.min(sorted.length, cols);
  const width = actualCols * TABLE_W + (actualCols - 1) * GAP_X;
  const height = rowY[rows - 1] + rowH[rows - 1];

  return { positions, width, height };
}

function gridLayoutFlat(tables: Table[]): Map<string, Pos> {
  if (tables.length === 0) return new Map();
  const sl = gridLayoutSingle(bfsOrder(tables));
  const result = new Map<string, Pos>();
  for (const [id, pos] of sl.positions) {
    result.set(id, { x: pos.x + MARGIN, y: pos.y + MARGIN });
  }
  return result;
}

// ─── Hierarchical Layout ────────────────────────────────────────────

function hierarchicalLayoutSingle(tables: Table[]): SubLayout {
  const positions = new Map<string, Pos>();
  if (tables.length === 0) return { positions, width: 0, height: 0 };

  const byId = new Map(tables.map((t) => [t.id, t]));
  const tableIds = new Set(tables.map((t) => t.id));

  // Level assignment
  const levels = new Map<string, number>();
  for (const t of tables) levels.set(t.id, 0);

  for (let iter = 0; iter < tables.length; iter++) {
    let changed = false;
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        if (!tableIds.has(fk.referencedTableId)) continue;
        const srcLevel = levels.get(table.id) ?? 0;
        const refLevel = levels.get(fk.referencedTableId) ?? 0;
        if (srcLevel <= refLevel) {
          levels.set(table.id, refLevel + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  }

  // Incoming FK count for level-0 sorting
  const incomingCount = new Map<string, number>();
  for (const t of tables) incomingCount.set(t.id, 0);
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      if (incomingCount.has(fk.referencedTableId)) {
        incomingCount.set(fk.referencedTableId, (incomingCount.get(fk.referencedTableId) ?? 0) + 1);
      }
    }
  }

  const levelNums = [...levelGroups.keys()].sort((a, b) => a - b);

  // Track X index per table for barycenter
  const xIndex = new Map<string, number>();

  for (const level of levelNums) {
    const ids = levelGroups.get(level)!;

    if (level === 0) {
      ids.sort((a, b) => {
        const aIn = incomingCount.get(a) ?? 0;
        const bIn = incomingCount.get(b) ?? 0;
        if (aIn !== bIn) return bIn - aIn;
        return (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '');
      });
    } else {
      const barycenter = new Map<string, number>();
      for (const id of ids) {
        const table = byId.get(id)!;
        const parentIndices: number[] = [];
        for (const fk of table.foreignKeys) {
          if (xIndex.has(fk.referencedTableId)) {
            parentIndices.push(xIndex.get(fk.referencedTableId)!);
          }
        }
        barycenter.set(
          id,
          parentIndices.length > 0
            ? parentIndices.reduce((s, v) => s + v, 0) / parentIndices.length
            : Infinity,
        );
      }
      ids.sort((a, b) => {
        const ba = barycenter.get(a) ?? Infinity;
        const bb = barycenter.get(b) ?? Infinity;
        if (ba !== bb) return ba - bb;
        return (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '');
      });
    }

    ids.forEach((id, i) => xIndex.set(id, i));
  }

  // Max height per level
  const levelH = new Map<number, number>();
  for (const [level, ids] of levelGroups) {
    const max = Math.max(...ids.map((id) => {
      const t = byId.get(id);
      return t ? tableHeight(t) : HEADER_H;
    }));
    levelH.set(level, max);
  }

  // Cumulative Y per level
  const levelY = new Map<number, number>();
  let y = 0;
  for (const level of levelNums) {
    levelY.set(level, y);
    y += (levelH.get(level) ?? HEADER_H) + GAP_Y;
  }

  const maxCount = Math.max(...[...levelGroups.values()].map((ids) => ids.length));
  const totalWidth = maxCount * TABLE_W + (maxCount - 1) * GAP_X;

  for (const [level, ids] of levelGroups) {
    const rowWidth = ids.length * TABLE_W + (ids.length - 1) * GAP_X;
    const offsetX = (totalWidth - rowWidth) / 2;
    ids.forEach((id, i) => {
      positions.set(id, {
        x: offsetX + i * (TABLE_W + GAP_X),
        y: levelY.get(level) ?? 0,
      });
    });
  }

  const height = y > 0 ? y - GAP_Y : 0;
  return { positions, width: totalWidth, height };
}

function hierarchicalLayoutFlat(tables: Table[]): Map<string, Pos> {
  if (tables.length === 0) return new Map();
  const sl = hierarchicalLayoutSingle(tables);
  const result = new Map<string, Pos>();
  for (const [id, pos] of sl.positions) {
    result.set(id, { x: pos.x + MARGIN, y: pos.y + MARGIN });
  }
  return result;
}

// ─── Radial Layout ──────────────────────────────────────────────────

interface RNode extends SimulationNodeDatum {
  id: string;
  h: number;
}

function radialLayoutSingle(tables: Table[]): SubLayout {
  const positions = new Map<string, Pos>();
  if (tables.length === 0) return { positions, width: 0, height: 0 };

  const n = tables.length;
  const cx = 0, cy = 0;

  const initR = Math.max(120, (n * (TABLE_W + GAP_X)) / (2 * Math.PI) * 0.45);
  const nodes: RNode[] = tables.map((t, i) => ({
    id: t.id,
    h: tableHeight(t),
    x: cx + Math.cos((2 * Math.PI * i) / n) * initR,
    y: cy + Math.sin((2 * Math.PI * i) / n) * initR,
  }));

  const idToIdx = new Map(nodes.map((nd, i) => [nd.id, i]));

  const links = tables.flatMap((t) =>
    t.foreignKeys
      .filter((fk) => idToIdx.has(fk.referencedTableId))
      .map((fk) => ({ source: idToIdx.get(t.id)!, target: idToIdx.get(fk.referencedTableId)! })),
  );

  const sim = forceSimulation<RNode>(nodes)
    .force('link', forceLink(links).distance(TABLE_W + 30).strength(0.5))
    .force('charge', forceManyBody<RNode>().strength(-350))
    .force('x', forceX(cx).strength(0.08))
    .force('y', forceY(cy).strength(0.08))
    .force('collision', forceCollide<RNode>((d) => Math.hypot(TABLE_W / 2 + 10, d.h / 2 + 10)).strength(1))
    .stop();

  sim.tick(300);

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const nd of nodes) {
    const nx = (nd.x ?? 0) - TABLE_W / 2;
    const ny = (nd.y ?? 0) - nd.h / 2;
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx + TABLE_W);
    maxY = Math.max(maxY, ny + nd.h);
  }

  // Normalize to origin (0,0)
  for (const nd of nodes) {
    positions.set(nd.id, {
      x: Math.round((nd.x ?? 0) - TABLE_W / 2 - minX),
      y: Math.round((nd.y ?? 0) - nd.h / 2 - minY),
    });
  }

  return { positions, width: maxX - minX, height: maxY - minY };
}

function radialLayoutFlat(tables: Table[]): Map<string, Pos> {
  if (tables.length === 0) return new Map();
  const sl = radialLayoutSingle(tables);
  const result = new Map<string, Pos>();
  for (const [id, pos] of sl.positions) {
    result.set(id, { x: pos.x + MARGIN, y: pos.y + MARGIN });
  }
  return result;
}

// ─── Radial-Tree Layout (IntelliJ-style radial-circular) ────────────

/**
 * Arrange sub-layouts in a meta-grid WITHOUT the outer MARGIN.
 * Used to combine multiple connected components inside a single "Single" layout.
 */
function combineSubLayouts(subLayouts: SubLayout[]): SubLayout {
  if (subLayouts.length === 0) return { positions: new Map(), width: 0, height: 0 };
  if (subLayouts.length === 1) return subLayouts[0];

  const cols = Math.ceil(Math.sqrt(subLayouts.length));
  const rows = Math.ceil(subLayouts.length / cols);

  const colW = new Array<number>(cols).fill(0);
  const rowH = new Array<number>(rows).fill(0);
  subLayouts.forEach((sl, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c], sl.width);
    rowH[r] = Math.max(rowH[r], sl.height);
  });

  const colX = new Array<number>(cols).fill(0);
  for (let c = 1; c < cols; c++) colX[c] = colX[c - 1] + colW[c - 1] + GROUP_GAP;
  const rowY = new Array<number>(rows).fill(0);
  for (let r = 1; r < rows; r++) rowY[r] = rowY[r - 1] + rowH[r - 1] + GROUP_GAP;

  const positions = new Map<string, Pos>();
  subLayouts.forEach((sl, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    for (const [id, p] of sl.positions) {
      positions.set(id, { x: p.x + colX[c], y: p.y + rowY[r] });
    }
  });

  const totalW = colX[cols - 1] + colW[cols - 1];
  const totalH = rowY[rows - 1] + rowH[rows - 1];
  return { positions, width: totalW, height: totalH };
}

/** Lay out a single connected component as a radial tree rooted at the given node. */
function layoutRadialTreeComponent(
  compIds: string[],
  rootId: string,
  byId: Map<string, Table>,
  adj: Map<string, Set<string>>,
): SubLayout {
  if (compIds.length === 1) {
    const t = byId.get(compIds[0])!;
    const positions = new Map<string, Pos>();
    positions.set(t.id, { x: 0, y: 0 });
    return { positions, width: TABLE_W, height: tableHeight(t) };
  }

  const compSet = new Set(compIds);

  // BFS from root → assign level, parent, children
  const level = new Map<string, number>();
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const id of compIds) children.set(id, []);
  level.set(rootId, 0);
  const bfsOrder: string[] = [];
  const visited = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    bfsOrder.push(id);
    const neighbors = [...(adj.get(id) ?? [])]
      .filter((n) => compSet.has(n) && !visited.has(n))
      .sort((a, b) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''));
    for (const nb of neighbors) {
      visited.add(nb);
      level.set(nb, (level.get(id) ?? 0) + 1);
      parent.set(nb, id);
      children.get(id)!.push(nb);
      queue.push(nb);
    }
  }

  // Subtree leaf count (for angular allocation) — reverse BFS
  const leafCount = new Map<string, number>();
  for (let i = bfsOrder.length - 1; i >= 0; i--) {
    const id = bfsOrder[i];
    const ch = children.get(id) ?? [];
    if (ch.length === 0) {
      leafCount.set(id, 1);
    } else {
      let sum = 0;
      for (const c of ch) sum += leafCount.get(c) ?? 1;
      leafCount.set(id, sum);
    }
  }

  const totalLeaves = leafCount.get(rootId) ?? 1;

  // Assign global angular arcs via subdivision (children arcs sum to parent's arc)
  const arcStart = new Map<string, number>();
  const arcEnd = new Map<string, number>();
  const theta = new Map<string, number>();
  arcStart.set(rootId, 0);
  arcEnd.set(rootId, 2 * Math.PI);
  theta.set(rootId, 0);
  for (const id of bfsOrder) {
    const ch = children.get(id) ?? [];
    if (ch.length === 0) continue;
    const a0 = arcStart.get(id)!;
    const a1 = arcEnd.get(id)!;
    const myLeaves = leafCount.get(id) ?? 1;
    let cursor = a0;
    for (const c of ch) {
      const cLeaves = leafCount.get(c) ?? 1;
      const arc = (a1 - a0) * (cLeaves / myLeaves);
      arcStart.set(c, cursor);
      arcEnd.set(c, cursor + arc);
      theta.set(c, cursor + arc / 2);
      cursor += arc;
    }
  }

  // Per-node radius: each node has its OWN r_c computed greedily. We process in BFS
  // order; for each node c we find the minimum r_c along its ray (direction φ_c from
  // origin) such that:
  //   - c's box doesn't overlap with ANY already-placed node's box (axis-aligned SAT)
  // This breaks the rigid concentric-ring constraint: siblings at different angular
  // offsets from their parent end up at different distances (close to parent on the
  // side, far from parent directly outward), filling space more organically.
  const EPS_TRIG = 1e-9;

  function boxExitT(
    phi: number,
    X_p: number,
    Y_p: number,
    W_sum_half: number,  // (W_self + W_other) / 2
    H_sum_half: number,  // (H_self + H_other) / 2
  ): number {
    // Minimum t ≥ 0 such that (t·cos φ, t·sin φ) is OUTSIDE the rectangle
    // centered at (X_p, Y_p) with half-width W_sum_half and half-height H_sum_half.
    // Returns 0 if ray doesn't pass through the box.
    const cc = Math.cos(phi);
    const sc = Math.sin(phi);
    let tXlo = -Infinity, tXhi = Infinity;
    if (Math.abs(cc) > EPS_TRIG) {
      const a = (X_p - W_sum_half) / cc;
      const b = (X_p + W_sum_half) / cc;
      tXlo = Math.min(a, b);
      tXhi = Math.max(a, b);
    } else if (Math.abs(X_p) > W_sum_half) {
      return 0;  // X-separated regardless of t
    }
    let tYlo = -Infinity, tYhi = Infinity;
    if (Math.abs(sc) > EPS_TRIG) {
      const a = (Y_p - H_sum_half) / sc;
      const b = (Y_p + H_sum_half) / sc;
      tYlo = Math.min(a, b);
      tYhi = Math.max(a, b);
    } else if (Math.abs(Y_p) > H_sum_half) {
      return 0;
    }
    const tLo = Math.max(tXlo, tYlo);
    const tHi = Math.min(tXhi, tYhi);
    if (tLo > tHi || tHi <= 0) return 0;
    return tHi;
  }

  // Place nodes in BFS order. Root at origin; each subsequent node found by box-exit
  // from parent, then bumped outward to avoid any other already-placed node.
  const centers = new Map<string, { x: number; y: number; h: number }>();
  const positions = new Map<string, Pos>();
  const rootH = tableHeight(byId.get(rootId)!);
  centers.set(rootId, { x: 0, y: 0, h: rootH });
  positions.set(rootId, { x: -TABLE_W / 2, y: -rootH / 2 });

  // Process parent-by-parent so we can flatten each sibling group to a common radius
  // (preserves rotational symmetry for star-like subtrees, while different parents
  // still get different radii — overall non-concentric, space-adaptive).
  for (const parentId of bfsOrder) {
    const siblings = children.get(parentId) ?? [];
    if (siblings.length === 0) continue;
    const pCenter = centers.get(parentId)!;

    // 1) Initial per-sibling r: just box-exit from parent (no cousin checks yet).
    const initialRs = siblings.map((c) => {
      const phi_c = theta.get(c) ?? 0;
      const h_c = tableHeight(byId.get(c)!);
      return boxExitT(phi_c, pCenter.x, pCenter.y, TABLE_W, (pCenter.h + h_c) / 2) + RING_GAP;
    });

    // 2) Intra-sibling arcFit: for each adjacent pair on the group's shared ring r,
    //    non-overlap requires 2r·sin(Δθ/2)·|sin φ_mid| ≥ W  OR  (H_a+H_b)/2 via Y.
    let arcFit = 0;
    if (siblings.length >= 2) {
      const sorted = [...siblings].sort(
        (a, b) => (theta.get(a) ?? 0) - (theta.get(b) ?? 0),
      );
      const N = sorted.length;
      for (let i = 0; i < N; i++) {
        const a = sorted[i];
        const b = sorted[(i + 1) % N];
        const tA = theta.get(a) ?? 0;
        let tB = theta.get(b) ?? 0;
        if (i === N - 1) tB += 2 * Math.PI;
        const angSep = tB - tA;
        if (angSep <= 0) continue;
        const phi_mid = (tA + tB) / 2;
        const s2 = Math.sin(angSep / 2);
        if (s2 <= EPS_TRIG) continue;
        const sm = Math.abs(Math.sin(phi_mid));
        const cm = Math.abs(Math.cos(phi_mid));
        const h_a = tableHeight(byId.get(a)!);
        const h_b = tableHeight(byId.get(b)!);
        const H_half_sum = (h_a + h_b) / 2;
        const fromX = sm > EPS_TRIG ? TABLE_W / (2 * s2 * sm) : Infinity;
        const fromY = cm > EPS_TRIG ? H_half_sum / (2 * s2 * cm) : Infinity;
        const required = Math.min(fromX, fromY) + ARC_PAD;
        if (required > arcFit) arcFit = required;
      }
    }

    // 3) Flatten: rGroup = max of (box-exit floors, intra-sibling arcFit). Then iteratively
    //    bump against non-sibling non-parent already-placed nodes. Group-wide bump
    //    preserves rotational symmetry within the group.
    let rGroup = Math.max(Math.max(...initialRs), arcFit);
    const siblingSet = new Set(siblings);
    for (let pass = 0; pass < 16; pass++) {
      let needMore = rGroup;
      for (const c of siblings) {
        const phi_c = theta.get(c) ?? 0;
        const h_c = tableHeight(byId.get(c)!);
        for (const [otherId, o] of centers) {
          if (otherId === parentId || siblingSet.has(otherId)) continue;
          const exit = boxExitT(phi_c, o.x, o.y, TABLE_W, (o.h + h_c) / 2);
          if (exit > 0 && needMore < exit + RING_GAP) needMore = exit + RING_GAP;
        }
      }
      if (needMore <= rGroup) break;
      rGroup = needMore;
    }

    // 3) Commit positions for this sibling group
    for (let i = 0; i < siblings.length; i++) {
      const c = siblings[i];
      const phi_c = theta.get(c) ?? 0;
      const h_c = tableHeight(byId.get(c)!);
      const cx = rGroup * Math.cos(phi_c);
      const cy = rGroup * Math.sin(phi_c);
      centers.set(c, { x: cx, y: cy, h: h_c });
      positions.set(c, { x: cx - TABLE_W / 2, y: cy - h_c / 2 });
    }
  }

  // ── Post-processing compaction ──────────────────────────────────────
  // For each non-root node, try to move it toward its parent along the parent-child
  // ray, but keep a minimum breathing gap (COMPACT_PAD) between any two tables so the
  // result doesn't look cramped. Limited iterations so tables don't drift too far.
  const COMPACT_PAD = 100;
  function rectOverlaps(
    ax: number, ay: number, ah: number,
    bx: number, by: number, bh: number,
  ): boolean {
    return (
      Math.abs(ax - bx) < TABLE_W + COMPACT_PAD &&
      Math.abs(ay - by) < (ah + bh) / 2 + COMPACT_PAD
    );
  }

  for (let iter = 0; iter < 2; iter++) {
    const sorted = [...compIds]
      .filter((id) => id !== rootId)
      .sort((a, b) => (level.get(b) ?? 0) - (level.get(a) ?? 0));
    let anyMoved = false;
    for (const id of sorted) {
      const c = centers.get(id)!;
      const p = centers.get(parent.get(id)!)!;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      const ux = dx / dist;
      const uy = dy / dist;
      // Find max shift toward parent (0 ≤ shift ≤ dist) without overlap
      let lo = 0;
      let hi = dist;
      const EPS_SHIFT = 1;
      while (hi - lo > EPS_SHIFT) {
        const mid = (lo + hi) / 2;
        const nx = c.x + ux * mid;
        const ny = c.y + uy * mid;
        let ok = true;
        for (const [oid, o] of centers) {
          if (oid === id) continue;
          if (rectOverlaps(nx, ny, c.h, o.x, o.y, o.h)) { ok = false; break; }
        }
        if (ok) lo = mid;
        else hi = mid;
      }
      if (lo > EPS_SHIFT) {
        c.x += ux * lo;
        c.y += uy * lo;
        positions.set(id, { x: c.x - TABLE_W / 2, y: c.y - c.h / 2 });
        anyMoved = true;
      }
    }
    if (!anyMoved) break;
  }

  // Normalize to origin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of compIds) {
    const p = positions.get(id)!;
    const h = tableHeight(byId.get(id)!);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + TABLE_W > maxX) maxX = p.x + TABLE_W;
    if (p.y + h > maxY) maxY = p.y + h;
  }

  const normalized = new Map<string, Pos>();
  for (const [id, p] of positions) {
    normalized.set(id, { x: Math.round(p.x - minX), y: Math.round(p.y - minY) });
  }

  return { positions: normalized, width: maxX - minX, height: maxY - minY };
}

function radialTreeLayoutSingle(tables: Table[]): SubLayout {
  if (tables.length === 0) return { positions: new Map(), width: 0, height: 0 };

  const byId = new Map(tables.map((t) => [t.id, t]));
  const adj = buildAdjacency(tables);
  const degree = new Map<string, number>();
  for (const [id, nbs] of adj) degree.set(id, nbs.size);

  // Split into connected components
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const t of tables) {
    if (visited.has(t.id)) continue;
    const comp: string[] = [];
    const q = [t.id];
    visited.add(t.id);
    while (q.length > 0) {
      const id = q.shift()!;
      comp.push(id);
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          q.push(nb);
        }
      }
    }
    components.push(comp);
  }

  // Sort: largest component first
  components.sort((a, b) => b.length - a.length);

  // Layout each component (root = highest-degree node, ties broken by name)
  const layouts: SubLayout[] = components.map((compIds) => {
    let rootId = compIds[0];
    let rootDeg = degree.get(rootId) ?? 0;
    for (const id of compIds) {
      const d = degree.get(id) ?? 0;
      const name = byId.get(id)?.name ?? '';
      const rootName = byId.get(rootId)?.name ?? '';
      if (d > rootDeg || (d === rootDeg && name < rootName)) {
        rootDeg = d;
        rootId = id;
      }
    }
    return layoutRadialTreeComponent(compIds, rootId, byId, adj);
  });

  return combineSubLayouts(layouts);
}

function radialTreeLayoutFlat(tables: Table[]): Map<string, Pos> {
  if (tables.length === 0) return new Map();
  const sl = radialTreeLayoutSingle(tables);
  const result = new Map<string, Pos>();
  for (const [id, pos] of sl.positions) {
    result.set(id, { x: pos.x + MARGIN, y: pos.y + MARGIN });
  }
  return result;
}

// ─── Public API ─────────────────────────────────────────────────────

export interface LayoutOptions {
  groupByGroup?: boolean;
}

export function computeLayout(
  tables: Table[],
  type: LayoutType,
  options?: LayoutOptions,
): Map<string, Pos> {
  const grouped = options?.groupByGroup && hasGroups(tables);

  switch (type) {
    case 'grid':
      return grouped
        ? withGroupClustering(tables, (g) => gridLayoutSingle(bfsOrder(g)))
        : gridLayoutFlat(tables);
    case 'hierarchical':
      return grouped
        ? withGroupClustering(tables, hierarchicalLayoutSingle)
        : hierarchicalLayoutFlat(tables);
    case 'radial':
      return grouped
        ? withGroupClustering(tables, radialLayoutSingle)
        : radialLayoutFlat(tables);
    case 'radial-tree':
      return grouped
        ? withGroupClustering(tables, radialTreeLayoutSingle)
        : radialTreeLayoutFlat(tables);
  }
}
