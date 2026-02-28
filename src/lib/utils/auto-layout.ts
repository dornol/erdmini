import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum } from 'd3-force';
import type { Table } from '$lib/types/erd';

export type LayoutType = 'grid' | 'hierarchical' | 'radial';

// Must match TableCard.svelte measurements
const TABLE_W    = 200;
const HEADER_H   = 37;   // header padding(8*2) + font(~13) + border
const COMMENT_H  = 26;   // comment row: padding(4*2) + font(~11) + border(1) + slack
const ROW_H      = 26;   // column row: padding(3*2) + font(12) + line-height slack
const BOTTOM_PAD = 8;    // .column-list padding (4px top + 4px bottom)

const GAP_X  = 60;   // horizontal gap between table right edge and next table left edge
const GAP_Y  = 60;   // vertical gap between table bottom and next table top
const MARGIN = 40;

function tableHeight(table: Table): number {
  const commentH = table.comment ? COMMENT_H : 0;
  return HEADER_H + commentH + table.columns.length * ROW_H + BOTTOM_PAD;
}

/** Grid: alphabetical order, square-ish arrangement with actual heights per row */
function gridLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name));
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const rows = Math.ceil(sorted.length / cols);

  // Max height per row (tallest table in that row)
  const rowH = new Array<number>(rows).fill(0);
  sorted.forEach((table, i) => {
    const row = Math.floor(i / cols);
    rowH[row] = Math.max(rowH[row], tableHeight(table));
  });

  // Cumulative Y start for each row
  const rowY = new Array<number>(rows).fill(MARGIN);
  for (let r = 1; r < rows; r++) {
    rowY[r] = rowY[r - 1] + rowH[r - 1] + GAP_Y;
  }

  sorted.forEach((table, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    result.set(table.id, {
      x: MARGIN + col * (TABLE_W + GAP_X),
      y: rowY[row],
    });
  });
  return result;
}

/**
 * Hierarchical: referenced (parent) tables at top, referencing (child) tables below.
 * Uses iterative level assignment to handle any graph shape including cycles.
 * Row height is determined by the tallest table at that level.
 */
function hierarchicalLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  // Level assignment
  const levels = new Map<string, number>();
  for (const t of tables) levels.set(t.id, 0);

  for (let iter = 0; iter < tables.length; iter++) {
    let changed = false;
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
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

  // Sort alphabetically within each level
  const nameOf = (id: string) => tables.find((t) => t.id === id)?.name ?? '';
  for (const ids of levelGroups.values()) {
    ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }

  const levelNums = [...levelGroups.keys()].sort((a, b) => a - b);
  const maxCount = Math.max(...[...levelGroups.values()].map((ids) => ids.length));

  // Max height per level
  const levelH = new Map<number, number>();
  for (const [level, ids] of levelGroups) {
    const max = Math.max(...ids.map((id) => {
      const t = tables.find((tb) => tb.id === id);
      return t ? tableHeight(t) : HEADER_H;
    }));
    levelH.set(level, max);
  }

  // Cumulative Y per level
  const levelY = new Map<number, number>();
  let y = MARGIN;
  for (const level of levelNums) {
    levelY.set(level, y);
    y += (levelH.get(level) ?? HEADER_H) + GAP_Y;
  }

  // Total canvas width based on widest level, for centering
  const totalWidth = maxCount * TABLE_W + (maxCount - 1) * GAP_X;

  for (const [level, ids] of levelGroups) {
    const rowWidth = ids.length * TABLE_W + (ids.length - 1) * GAP_X;
    const offsetX = MARGIN + (totalWidth - rowWidth) / 2;
    ids.forEach((id, i) => {
      result.set(id, {
        x: offsetX + i * (TABLE_W + GAP_X),
        y: levelY.get(level) ?? MARGIN,
      });
    });
  }
  return result;
}

interface RNode extends SimulationNodeDatum {
  id: string;
  h: number;
}

/**
 * Radial: force-directed layout using d3-force.
 * - forceCollide prevents overlap (uses actual table bounding box)
 * - forceLink pulls FK-connected tables close together
 * - forceManyBody repels unconnected tables
 * Result: compact, organic arrangement where related tables cluster naturally.
 */
function radialLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  const cx = 600, cy = 500;
  const n = tables.length;

  // Spread tables evenly on a circle as starting positions
  const initR = Math.max(120, (n * (TABLE_W + GAP_X)) / (2 * Math.PI) * 0.45);
  const nodes: RNode[] = tables.map((t, i) => ({
    id: t.id,
    h: tableHeight(t),
    x: cx + Math.cos((2 * Math.PI * i) / n) * initR,
    y: cy + Math.sin((2 * Math.PI * i) / n) * initR,
  }));

  const idToIdx = new Map(nodes.map((nd, i) => [nd.id, i]));

  // FK edges as index pairs
  const links = tables.flatMap((t) =>
    t.foreignKeys
      .filter((fk) => idToIdx.has(fk.referencedTableId))
      .map((fk) => ({ source: idToIdx.get(t.id)!, target: idToIdx.get(fk.referencedTableId)! })),
  );

  const sim = forceSimulation<RNode>(nodes)
    // FK links attract connected tables; distance ≈ table width + small gap
    .force('link', forceLink(links).distance(TABLE_W + 30).strength(0.5))
    // Global repulsion to spread tables apart
    .force('charge', forceManyBody<RNode>().strength(-350))
    // Per-node gravity toward canvas center — keeps disconnected tables from drifting away
    .force('x', forceX(cx).strength(0.08))
    .force('y', forceY(cy).strength(0.08))
    // Collision: half-diagonal of bounding box + padding → no overlap
    .force('collision', forceCollide<RNode>((d) => Math.hypot(TABLE_W / 2 + 10, d.h / 2 + 10)).strength(1))
    .stop();

  sim.tick(300);

  for (const nd of nodes) {
    result.set(nd.id, {
      x: Math.round((nd.x ?? cx) - TABLE_W / 2),
      y: Math.round((nd.y ?? cy) - nd.h / 2),
    });
  }

  return result;
}

export function computeLayout(
  tables: Table[],
  type: LayoutType,
): Map<string, { x: number; y: number }> {
  switch (type) {
    case 'grid': return gridLayout(tables);
    case 'hierarchical': return hierarchicalLayout(tables);
    case 'radial': return radialLayout(tables);
  }
}
