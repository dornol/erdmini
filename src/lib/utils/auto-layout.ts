import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { Table } from '$lib/types/erd';
import { TABLE_W, HEADER_H, COMMENT_H, ROW_H, BOTTOM_PAD } from '$lib/constants/layout';

export type LayoutType = 'grid' | 'hierarchical' | 'radial';

const GAP_X  = 60;
const GAP_Y  = 60;
const MARGIN = 40;
const GROUP_GAP = 80;

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
  }
}
