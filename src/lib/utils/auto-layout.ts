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

/**
 * Radial: most-connected table at center, others in concentric rings.
 * Ring radius is sized so tables don't overlap even for tall tables.
 */
function radialLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  // Compute total FK degree (in + out) for each table
  const degree = new Map<string, number>();
  for (const t of tables) degree.set(t.id, 0);
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      degree.set(table.id, (degree.get(table.id) ?? 0) + 1);
      if (degree.has(fk.referencedTableId)) {
        degree.set(fk.referencedTableId, (degree.get(fk.referencedTableId) ?? 0) + 1);
      }
    }
  }

  const sorted = [...tables].sort((a, b) => {
    const diff = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const centerTable = sorted[0];
  const cx = 600;
  const cy = 500;

  // Center table positioned at canvas center
  result.set(centerTable.id, {
    x: cx - TABLE_W / 2,
    y: cy - tableHeight(centerTable) / 2,
  });

  // Fill concentric rings. Each ring's radius is sized so tables fit without overlap.
  // Minimum slot width = TABLE_W + GAP_X, minimum slot height = avg table height + GAP_Y.
  const avgH = tables.reduce((sum, t) => sum + tableHeight(t), 0) / tables.length;
  const slotDiag = Math.sqrt((TABLE_W + GAP_X) ** 2 + (avgH + GAP_Y) ** 2);

  let ringStart = 1;
  let ring = 0;
  while (ringStart < sorted.length) {
    // Radius: ensure adjacent tables on ring don't overlap
    // arc length between 2 adjacent slots >= slotDiag  →  radius >= slotDiag * capacity / (2π)
    // We grow radius per ring to always fit the tables comfortably.
    const radius = slotDiag * (ring + 1) * 0.6 + 150;
    const circumference = 2 * Math.PI * radius;
    const capacity = Math.max(1, Math.floor(circumference / slotDiag));
    const ringEnd = Math.min(ringStart + capacity, sorted.length);
    const count = ringEnd - ringStart;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      const t = sorted[ringStart + i];
      result.set(t.id, {
        x: Math.round(cx + radius * Math.cos(angle) - TABLE_W / 2),
        y: Math.round(cy + radius * Math.sin(angle) - tableHeight(t) / 2),
      });
    }
    ringStart = ringEnd;
    ring++;
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
