import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { Table } from '$lib/types/erd';
import { TABLE_W, HEADER_H, COMMENT_H, ROW_H, BOTTOM_PAD } from '$lib/constants/layout';

export type LayoutType = 'grid' | 'hierarchical' | 'radial' | 'radial-tree' | 'smart';

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

// ─── Smart Layout ───────────────────────────────────────────────────
// FK-aware spread layout that ignores `group` field. Produces a layout
// where FK lines have room to breathe (no spider web at hubs) by giving
// each FK edge a long target distance and using strong charge repulsion.

interface SmartNode extends SimulationNodeDatum {
  id: string;
  w: number;
  h: number;
}

/**
 * Test if line segments AB and CD intersect (proper intersection — not just collinear touch).
 */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const ccw = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = ccw(cx, cy, dx, dy, ax, ay);
  const d2 = ccw(cx, cy, dx, dy, bx, by);
  const d3 = ccw(ax, ay, bx, by, cx, cy);
  const d4 = ccw(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Reduce FK-line crossings for leaf tables (degree=1) AND bias them toward outward
 * positions ("corners" of the layout) when crossings are equal.
 *
 * Selection criterion (lex order, lower=better):
 *  1. Fewer crossings of the leaf-parent line with other FK edges
 *  2. Higher outwardness (dot product of leaf-from-parent vector with outward
 *     direction = parent-from-centroid)
 *  3. Closer to the original position (only if both above are tied)
 *
 * This gives the natural "leaves spread to corners" pattern while still
 * prioritizing crossing-free placement.
 */
function reduceLeafCrossings(
  nodes: SmartNode[],
  edgePairs: Array<[number, number]>,
  iterations: number = 1,
): void {
  // Compute degree per node from edgePairs
  const degree = new Array<number>(nodes.length).fill(0);
  for (const [s, t] of edgePairs) {
    degree[s]++;
    degree[t]++;
  }

  // Map each leaf node to its sole edge index
  const leafEdgeIdx = new Map<number, number>();
  for (let i = 0; i < nodes.length; i++) {
    if (degree[i] !== 1) continue;
    const idx = edgePairs.findIndex(([s, t]) => s === i || t === i);
    if (idx >= 0) leafEdgeIdx.set(i, idx);
  }

  if (leafEdgeIdx.size === 0) return;

  // Layout centroid (used for "outward" direction)
  let cxSum = 0, cySum = 0;
  for (const nd of nodes) {
    cxSum += nd.x ?? 0;
    cySum += nd.y ?? 0;
  }
  const cx = cxSum / nodes.length;
  const cy = cySum / nodes.length;

  function countCrossings(leafIdx: number, parentIdx: number, lx: number, ly: number): number {
    const px = nodes[parentIdx].x ?? 0;
    const py = nodes[parentIdx].y ?? 0;
    let count = 0;
    for (const [s, t] of edgePairs) {
      if (s === leafIdx || t === leafIdx) continue;
      const ax = nodes[s].x ?? 0;
      const ay = nodes[s].y ?? 0;
      const bx = nodes[t].x ?? 0;
      const by = nodes[t].y ?? 0;
      if (segmentsIntersect(lx, ly, px, py, ax, ay, bx, by)) count++;
    }
    return count;
  }

  function hasNodeOverlap(leafIdx: number, lx: number, ly: number): boolean {
    const leaf = nodes[leafIdx];
    const PAD = 30;
    for (let i = 0; i < nodes.length; i++) {
      if (i === leafIdx) continue;
      const o = nodes[i];
      const minDx = (leaf.w + o.w) / 2 + PAD;
      const minDy = (leaf.h + o.h) / 2 + PAD;
      const dx = Math.abs(lx - (o.x ?? 0));
      const dy = Math.abs(ly - (o.y ?? 0));
      if (dx < minDx && dy < minDy) return true;
    }
    return false;
  }

  for (let iter = 0; iter < iterations; iter++) {
    let anyMoved = false;

    for (const [leafIdx, edgeIdx] of leafEdgeIdx) {
      const [s, t] = edgePairs[edgeIdx];
      const parentIdx = s === leafIdx ? t : s;
      const leaf = nodes[leafIdx];
      const parent = nodes[parentIdx];
      const px = parent.x ?? 0;
      const py = parent.y ?? 0;

      // Outward unit direction from layout centroid through parent.
      // Used as "preferred direction" for the leaf relative to its parent.
      const odx = px - cx;
      const ody = py - cy;
      const olen = Math.hypot(odx, ody);
      const oux = olen > 1 ? odx / olen : 0;
      const ouy = olen > 1 ? ody / olen : 0;

      // Outwardness = dot product of (leaf - parent) with outward unit direction.
      // Positive = leaf is on the outer side of parent. Higher = further outward.
      const outwardness = (lx: number, ly: number) =>
        (lx - px) * oux + (ly - py) * ouy;

      const origX = leaf.x ?? 0;
      const origY = leaf.y ?? 0;

      // Initialize best with current position
      let bestCrossings = countCrossings(leafIdx, parentIdx, origX, origY);
      let bestOutwardness = outwardness(origX, origY);
      let bestDist = 0;
      let bestX = origX;
      let bestY = origY;

      // Search 24 angles × 3 radii = 72 candidate positions.
      // Bounded radius range prevents leaves from drifting too far from main layout.
      const radii = [TABLE_W * 2.0, TABLE_W * 2.5, TABLE_W * 3.0];
      const ANGULAR_STEPS = 24;
      for (const r of radii) {
        for (let k = 0; k < ANGULAR_STEPS; k++) {
          const angle = (k / ANGULAR_STEPS) * 2 * Math.PI;
          const nx = px + r * Math.cos(angle);
          const ny = py + r * Math.sin(angle);

          if (hasNodeOverlap(leafIdx, nx, ny)) continue;

          const crossings = countCrossings(leafIdx, parentIdx, nx, ny);
          const out = outwardness(nx, ny);
          const dist = Math.hypot(nx - origX, ny - origY);

          // Lex order: minimize crossings, prefer slightly more outward,
          // minimize disruption (distance from original).
          // Threshold of 30px on outward gain prevents tiny outward improvements
          // from kicking leaves further than necessary.
          let better = false;
          if (crossings < bestCrossings) {
            better = true;
          } else if (crossings === bestCrossings) {
            if (out > bestOutwardness + 30) {
              // Notably more outward → prefer
              better = true;
            } else if (Math.abs(out - bestOutwardness) <= 30 && dist < bestDist) {
              // Similar outwardness, closer to original
              better = true;
            }
          }

          if (better) {
            bestCrossings = crossings;
            bestOutwardness = out;
            bestDist = dist;
            bestX = nx;
            bestY = ny;
          }
        }
      }

      if (bestX !== origX || bestY !== origY) {
        leaf.x = bestX;
        leaf.y = bestY;
        anyMoved = true;
      }
    }

    if (!anyMoved) break;
  }
}

/**
 * Resolve node-node overlaps by axis-aligned separation along smaller-axis-first.
 * Used after pushTablesOffEdges may have caused new overlaps.
 */
function resolveNodeOverlaps(nodes: SmartNode[], pad: number, passes: number): void {
  for (let p = 0; p < passes; p++) {
    let anyOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const ax = a.x ?? 0, ay = a.y ?? 0;
        const bx = b.x ?? 0, by = b.y ?? 0;
        const minDx = (a.w + b.w) / 2 + pad;
        const minDy = (a.h + b.h) / 2 + pad;
        const dx = bx - ax;
        const dy = by - ay;
        const ovX = minDx - Math.abs(dx);
        const ovY = minDy - Math.abs(dy);
        if (ovX > 0 && ovY > 0) {
          anyOverlap = true;
          // Push along the smaller-overlap axis to disturb less
          if (ovX < ovY) {
            const half = ovX / 2 + 0.5;
            const sign = dx >= 0 ? 1 : -1;
            a.x = ax - sign * half;
            b.x = bx + sign * half;
          } else {
            const half = ovY / 2 + 0.5;
            const sign = dy >= 0 ? 1 : -1;
            a.y = ay - sign * half;
            b.y = by + sign * half;
          }
        }
      }
    }
    if (!anyOverlap) break;
  }
}

/**
 * Push tables sitting on FK lines they don't belong to.
 *
 * Algorithm: for each table, scan all non-incident FK edges. If the edge segment
 * passes through the table's expanded bounding box, project the table center onto
 * the segment and push perpendicular until the box clears the line. Limited per-
 * iteration push size avoids wild jumps. Node-node overlap is re-resolved after
 * each pass.
 *
 * Skips projections too close to edge endpoints (t < 0.05 or > 0.95) since those
 * are at the connected tables' own positions and shouldn't trigger pushing.
 */
function pushTablesOffEdges(
  nodes: SmartNode[],
  links: Array<{ source: number; target: number }>,
  idToIdx: Map<string, number>,
  iterations: number,
): void {
  // After d3-force ran, link.source/target are now node references, not indices.
  // Build a clean list of [sourceIdx, targetIdx] pairs.
  const edgePairs: Array<[number, number]> = [];
  for (const link of links) {
    const src = link.source;
    const tgt = link.target;
    const srcId = typeof src === 'object' && src !== null ? (src as SmartNode).id : nodes[src as number]?.id;
    const tgtId = typeof tgt === 'object' && tgt !== null ? (tgt as SmartNode).id : nodes[tgt as number]?.id;
    if (!srcId || !tgtId) continue;
    const sIdx = idToIdx.get(srcId);
    const tIdx = idToIdx.get(tgtId);
    if (sIdx === undefined || tIdx === undefined || sIdx === tIdx) continue;
    edgePairs.push([sIdx, tIdx]);
  }

  const EDGE_CLEAR_PAD = 50; // additional padding around table to keep edges away
  const MAX_PUSH_PER_PASS = 100;
  const COLLISION_PAD = 30;

  for (let iter = 0; iter < iterations; iter++) {
    let anyMoved = false;

    for (let nodeIdx = 0; nodeIdx < nodes.length; nodeIdx++) {
      const node = nodes[nodeIdx];
      const halfW = node.w / 2 + EDGE_CLEAR_PAD;
      const halfH = node.h / 2 + EDGE_CLEAR_PAD;

      for (const [sIdx, tIdx] of edgePairs) {
        if (sIdx === nodeIdx || tIdx === nodeIdx) continue;
        const a = nodes[sIdx];
        const b = nodes[tIdx];
        const ax = a.x ?? 0, ay = a.y ?? 0;
        const bx = b.x ?? 0, by = b.y ?? 0;
        const nx = node.x ?? 0;
        const ny = node.y ?? 0;

        // Project node center onto segment ab
        const ex = bx - ax;
        const ey = by - ay;
        const lenSq = ex * ex + ey * ey;
        if (lenSq < 1) continue;
        let t = ((nx - ax) * ex + (ny - ay) * ey) / lenSq;
        if (t < 0.05 || t > 0.95) continue;

        const projX = ax + t * ex;
        const projY = ay + t * ey;
        const dxN = nx - projX;
        const dyN = ny - projY;

        // Edge passes through expanded box if both axes are within half-extents
        const absDx = Math.abs(dxN);
        const absDy = Math.abs(dyN);
        if (absDx >= halfW || absDy >= halfH) continue;

        // Need to push. Choose perpendicular direction (away from edge).
        // If center is exactly on the edge, pick perpendicular axis arbitrarily.
        const dist = Math.hypot(dxN, dyN);
        let ux: number, uy: number;
        if (dist < 1e-6) {
          // Edge passes exactly through center — pick edge-perpendicular direction
          const edgeLen = Math.sqrt(lenSq);
          ux = -ey / edgeLen;
          uy = ex / edgeLen;
        } else {
          ux = dxN / dist;
          uy = dyN / dist;
        }

        // Push amount: distance needed to exit the expanded box along (ux, uy)
        const exitX = ux !== 0 ? halfW / Math.abs(ux) : Infinity;
        const exitY = uy !== 0 ? halfH / Math.abs(uy) : Infinity;
        const requiredExit = Math.min(exitX, exitY);
        const pushAmt = Math.min(MAX_PUSH_PER_PASS, requiredExit - dist + 2);
        if (pushAmt <= 0) continue;

        node.x = nx + ux * pushAmt;
        node.y = ny + uy * pushAmt;
        anyMoved = true;
        break; // re-evaluate this node's edges on next pass
      }
    }

    // Re-resolve any new overlaps
    resolveNodeOverlaps(nodes, COLLISION_PAD, 4);

    if (!anyMoved) break;
  }
}

/**
 * Identify orphan tables — those with no FK out and no incoming FK.
 * Self-references are ignored (an isolated table that only refers to itself is still an orphan).
 */
function findOrphans(tables: Table[]): Set<string> {
  const tableIds = new Set(tables.map((t) => t.id));
  const hasOutgoing = new Set<string>();
  const hasIncoming = new Set<string>();
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      if (!tableIds.has(fk.referencedTableId)) continue;
      if (fk.referencedTableId === t.id) continue; // self-ref doesn't count
      hasOutgoing.add(t.id);
      hasIncoming.add(fk.referencedTableId);
    }
  }
  const orphans = new Set<string>();
  for (const t of tables) {
    if (!hasOutgoing.has(t.id) && !hasIncoming.has(t.id)) orphans.add(t.id);
  }
  return orphans;
}

/**
 * Lay out orphan tables as a compact vertical strip.
 * Returns positions (top-left corner) in a coordinate space starting at (0, 0).
 */
function orphanStripLayout(orphans: Table[]): { positions: Map<string, Pos>; width: number; height: number } {
  if (orphans.length === 0) return { positions: new Map(), width: 0, height: 0 };

  // Sort by name for stable ordering
  const sorted = [...orphans].sort((a, b) => a.name.localeCompare(b.name));

  // Choose column count: keep strip narrow (≤ 3 cols) so it visually reads as "side panel"
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(sorted.length / 2))));
  const rows = Math.ceil(sorted.length / cols);

  const rowH = new Array<number>(rows).fill(0);
  sorted.forEach((t, i) => {
    const r = Math.floor(i / cols);
    rowH[r] = Math.max(rowH[r], tableHeight(t));
  });

  const rowY = new Array<number>(rows).fill(0);
  for (let r = 1; r < rows; r++) rowY[r] = rowY[r - 1] + rowH[r - 1] + GAP_Y;

  const positions = new Map<string, Pos>();
  sorted.forEach((t, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    positions.set(t.id, { x: c * (TABLE_W + GAP_X), y: rowY[r] });
  });

  const width = cols * TABLE_W + (cols - 1) * GAP_X;
  const height = rowY[rows - 1] + rowH[rows - 1];
  return { positions, width, height };
}

/**
 * Compute in-degree only (FK references TO this table, self-refs excluded).
 * High in-degree = "hub" candidate.
 */
function computeInDegree(tables: Table[]): Map<string, number> {
  const tableIds = new Set(tables.map((t) => t.id));
  const inDeg = new Map<string, number>();
  for (const t of tables) inDeg.set(t.id, 0);
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      if (fk.referencedTableId === t.id) continue;
      if (!tableIds.has(fk.referencedTableId)) continue;
      inDeg.set(fk.referencedTableId, (inDeg.get(fk.referencedTableId) ?? 0) + 1);
    }
  }
  return inDeg;
}

/**
 * Place hub tables at well-separated positions.
 * - 1 hub: at origin
 * - 2 hubs: horizontal pair
 * - 3+ hubs: on a ring with chord-spacing ≥ HUB_SPACING
 */
function placeHubsSpaced(hubs: Table[]): Map<string, { x: number; y: number }> {
  const N = hubs.length;
  const HUB_SPACING = TABLE_W * 9; // ~1980px between hub centers

  const result = new Map<string, { x: number; y: number }>();
  if (N === 0) return result;
  if (N === 1) {
    result.set(hubs[0].id, { x: 0, y: 0 });
    return result;
  }
  if (N === 2) {
    result.set(hubs[0].id, { x: -HUB_SPACING / 2, y: 0 });
    result.set(hubs[1].id, { x: HUB_SPACING / 2, y: 0 });
    return result;
  }

  // N >= 3: place on a ring. Chord between adjacent hubs = 2R sin(π/N)
  // Solve for R such that chord ≥ HUB_SPACING.
  const R = Math.max(
    HUB_SPACING / (2 * Math.sin(Math.PI / N)),
    HUB_SPACING * 0.8,
  );
  hubs.forEach((h, i) => {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2; // start from top
    result.set(h.id, {
      x: R * Math.cos(angle),
      y: R * Math.sin(angle),
    });
  });
  return result;
}

/** Hub-aware SmartNode: extends with anchor info for hubs */
interface AnchoredNode extends SmartNode {
  isHub: boolean;
  targetX: number;
  targetY: number;
}

/**
 * Deterministic pseudo-random in [-0.5, 0.5] based on integer index + salt.
 * Used to seed initial node positions reproducibly so layout output is the same
 * across runs for the same input.
 */
function detSeed(i: number, salt: number): number {
  const x = Math.sin(i * 73.8513 + salt * 91.4392) * 10000;
  return (x - Math.floor(x)) - 0.5;
}

/**
 * FK-aware spread layout — group-independent.
 *
 * Strategy (v8 — Hub anchoring):
 *  1. Orphans (no FK in/out)            → side strip on the right
 *  2. Hubs (in-degree ≥ threshold)      → placed at well-separated fixed positions
 *  3. Everything else                   → force-directed, with hubs pinned via forceX/Y
 *  4. Edge avoidance post-process       → push tables off non-incident FK lines
 *
 * Why hub-anchoring works better than v7's leaf-fan:
 *  - Hubs explicitly far apart (≥ TABLE_W × 6) → no clustering of multiple hubs together
 *  - Force simulation handles all spacing/overlap via collide+charge → no manual fan math
 *  - Bridge tables (FKs to multiple hubs) naturally settle BETWEEN their hub anchors
 *  - Single hub case: degenerates to centered radial layout
 *
 * Ignores `group` field; relies only on FK graph structure.
 */
function smartLayoutFlat(
  tables: Table[],
  tableWidths?: Map<string, number>,
): Map<string, Pos> {
  if (tables.length === 0) return new Map();
  if (tables.length === 1) {
    const t = tables[0];
    return new Map([[t.id, { x: MARGIN, y: MARGIN }]]);
  }

  // Resolve actual rendered width per table (fallback to TABLE_W if unknown)
  const widthOf = (id: string): number => tableWidths?.get(id) ?? TABLE_W;

  // 1. Orphans
  const orphanIds = findOrphans(tables);
  const connected = tables.filter((t) => !orphanIds.has(t.id));
  const orphans = tables.filter((t) => orphanIds.has(t.id));

  if (connected.length === 0) {
    const sl = orphanStripLayout(orphans);
    const result = new Map<string, Pos>();
    for (const [id, pos] of sl.positions) {
      result.set(id, { x: pos.x + MARGIN, y: pos.y + MARGIN });
    }
    return result;
  }

  // 2. Identify hubs by in-degree
  const inDeg = computeInDegree(connected);
  const HUB_MIN_INDEG = Math.max(3, Math.ceil(connected.length * 0.05));
  const hubs = connected
    .filter((t) => (inDeg.get(t.id) ?? 0) >= HUB_MIN_INDEG)
    .sort((a, b) => (inDeg.get(b.id) ?? 0) - (inDeg.get(a.id) ?? 0));

  const hubPositions = placeHubsSpaced(hubs);
  const hubIdSet = new Set(hubs.map((h) => h.id));

  // 3. Build nodes with hub anchor info AND actual rendered widths
  const nodes: AnchoredNode[] = connected.map((t) => {
    const isHub = hubIdSet.has(t.id);
    const target = hubPositions.get(t.id);
    return {
      id: t.id,
      w: widthOf(t.id),
      h: tableHeight(t),
      isHub,
      targetX: target?.x ?? 0,
      targetY: target?.y ?? 0,
    };
  });
  const idToIdx = new Map(nodes.map((nd, i) => [nd.id, i]));

  // 4. Initial seed (DETERMINISTIC — same input → same layout):
  //  - Hubs at their assigned positions (will be pinned via forceX/Y)
  //  - Non-hubs near a likely hub (FK target), with index-seeded offset
  nodes.forEach((nd, i) => {
    if (nd.isHub) {
      nd.x = nd.targetX;
      nd.y = nd.targetY;
      return;
    }
    const t = connected.find((c) => c.id === nd.id)!;
    const hubFkTarget = t.foreignKeys
      .map((fk) => fk.referencedTableId)
      .find((id) => hubIdSet.has(id));
    if (hubFkTarget) {
      const hp = hubPositions.get(hubFkTarget)!;
      nd.x = hp.x + detSeed(i, 1) * TABLE_W * 2;
      nd.y = hp.y + detSeed(i, 2) * TABLE_W * 2;
    } else {
      // No hub FK target → start near origin with deterministic offset
      nd.x = detSeed(i, 1) * 800;
      nd.y = detSeed(i, 2) * 800;
    }
  });

  // 5. Build links (skip self-refs and broken refs)
  const links: { source: number; target: number }[] = [];
  for (const t of connected) {
    for (const fk of t.foreignKeys) {
      if (fk.referencedTableId === t.id) continue;
      const s = idToIdx.get(t.id);
      const tgt = idToIdx.get(fk.referencedTableId);
      if (s === undefined || tgt === undefined) continue;
      links.push({ source: s, target: tgt });
    }
  }

  // 6. Force simulation with hub pinning
  const EDGE_LEN = TABLE_W * 3.2;
  const COLLIDE_PAD = 90; // generous pad for clear separation
  const HUB_PIN_STRENGTH = 0.6;

  forceSimulation<AnchoredNode>(nodes)
    .force(
      'link',
      forceLink<AnchoredNode, { source: number; target: number }>(links)
        .distance(EDGE_LEN)
        .strength(0.35),
    )
    .force('charge', forceManyBody<AnchoredNode>().strength(-2500).distanceMax(1800))
    .force(
      'collide',
      forceCollide<AnchoredNode>((d) => Math.hypot(d.w / 2, d.h / 2) + COLLIDE_PAD)
        .strength(1)
        .iterations(4),
    )
    // Pin hubs to their assigned positions
    .force(
      'hubX',
      forceX<AnchoredNode>((d) => d.targetX).strength((d) => (d.isHub ? HUB_PIN_STRENGTH : 0)),
    )
    .force(
      'hubY',
      forceY<AnchoredNode>((d) => d.targetY).strength((d) => (d.isHub ? HUB_PIN_STRENGTH : 0)),
    )
    .stop()
    .tick(1200);

  // 7. Edge-avoidance post-process: push tables off FK lines they don't belong to.
  // Run with more iterations to ensure full convergence on intermediate (non-leaf)
  // nodes that might be sitting on lines.
  pushTablesOffEdges(nodes, links, idToIdx, 80);

  // 7b. Reduce leaf-line crossings + bias leaves toward outward positions.
  // Build edgePairs (using node indices) for the crossing checker.
  const finalEdgePairs: Array<[number, number]> = [];
  for (const link of links) {
    const src = link.source;
    const tgt = link.target;
    const sId = typeof src === 'object' && src !== null ? (src as SmartNode).id : nodes[src as number]?.id;
    const tId = typeof tgt === 'object' && tgt !== null ? (tgt as SmartNode).id : nodes[tgt as number]?.id;
    if (!sId || !tId) continue;
    const sIdx = idToIdx.get(sId);
    const tIdx = idToIdx.get(tId);
    if (sIdx === undefined || tIdx === undefined || sIdx === tIdx) continue;
    finalEdgePairs.push([sIdx, tIdx]);
  }
  reduceLeafCrossings(nodes, finalEdgePairs, 3);

  // 7c. Re-run edge-avoidance: after moving leaves outward, intermediate tables
  // might end up sitting on the new (relocated) leaf-parent edges. One more pass
  // with reduced iterations cleans this up.
  pushTablesOffEdges(nodes, links, idToIdx, 30);

  // 8. Convert to top-left positions, find bbox
  const connectedPositions = new Map<string, Pos>();
  let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
  nodes.forEach((nd) => {
    const x = (nd.x ?? 0) - nd.w / 2;
    const y = (nd.y ?? 0) - nd.h / 2;
    connectedPositions.set(nd.id, { x, y });
    if (x < cMinX) cMinX = x;
    if (y < cMinY) cMinY = y;
    if (x + nd.w > cMaxX) cMaxX = x + nd.w;
    if (y + nd.h > cMaxY) cMaxY = y + nd.h;
  });

  // 9. Shift to MARGIN, then orphan strip on the right
  const result = new Map<string, Pos>();
  const shiftX = MARGIN - cMinX;
  const shiftY = MARGIN - cMinY;
  for (const [id, pos] of connectedPositions) {
    result.set(id, { x: Math.round(pos.x + shiftX), y: Math.round(pos.y + shiftY) });
  }

  if (orphans.length > 0) {
    const connectedW = cMaxX - cMinX;
    const orphanLayout = orphanStripLayout(orphans);
    const orphanX = MARGIN + connectedW + GROUP_GAP * 2;
    for (const [id, pos] of orphanLayout.positions) {
      result.set(id, { x: Math.round(pos.x + orphanX), y: Math.round(pos.y + MARGIN) });
    }
  }

  return result;
}

// ─── Public API ─────────────────────────────────────────────────────

export interface LayoutOptions {
  groupByGroup?: boolean;
  /**
   * Optional per-table actual rendered widths (from canvasState.tableWidths).
   * Used by Smart Layout for collision detection so tables with long names
   * don't overlap their neighbors. Falls back to TABLE_W when not provided.
   */
  tableWidths?: Map<string, number>;
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
    case 'smart':
      // Smart layout: ignores groupByGroup but uses tableWidths for accurate collision
      return smartLayoutFlat(tables, options?.tableWidths);
  }
}
