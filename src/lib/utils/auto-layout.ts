import type { Table } from '$lib/types/erd';

export type LayoutType = 'grid' | 'hierarchical' | 'radial';

const GAP_X = 270;  // TABLE_WIDTH(200) + 70 margin
const GAP_Y = 220;  // estimated table height + margin
const MARGIN = 40;
const TABLE_W = 200;

/** Grid: alphabetical order, square-ish arrangement */
function gridLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name));
  const cols = Math.ceil(Math.sqrt(sorted.length));

  sorted.forEach((table, i) => {
    result.set(table.id, {
      x: MARGIN + (i % cols) * GAP_X,
      y: MARGIN + Math.floor(i / cols) * GAP_Y,
    });
  });
  return result;
}

/**
 * Hierarchical: referenced (parent) tables at top, referencing (child) tables below.
 * Uses iterative level assignment to handle any graph shape including cycles.
 */
function hierarchicalLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  // Start all tables at level 0, then push FK-source tables below their targets
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

  // Sort within each level alphabetically
  const nameOf = (id: string) => tables.find((t) => t.id === id)?.name ?? '';
  for (const ids of levelGroups.values()) {
    ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }

  // Center each level row horizontally based on the widest level
  const maxCount = Math.max(...[...levelGroups.values()].map((ids) => ids.length));

  for (const [level, ids] of levelGroups) {
    const rowWidth = ids.length * GAP_X;
    const offsetX = ((maxCount * GAP_X) - rowWidth) / 2;
    ids.forEach((id, i) => {
      result.set(id, {
        x: MARGIN + offsetX + i * GAP_X,
        y: MARGIN + level * GAP_Y,
      });
    });
  }
  return result;
}

/**
 * Radial: most-connected table at center, others in concentric rings.
 */
function radialLayout(tables: Table[]): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (tables.length === 0) return result;

  const cx = 500;
  const cy = 400;
  const RING_RADIUS = 300;

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

  // Center table
  result.set(sorted[0].id, { x: cx - TABLE_W / 2, y: cy - 50 });

  // Fill concentric rings
  let ringStart = 1;
  let ring = 0;
  while (ringStart < sorted.length) {
    const radius = RING_RADIUS * (ring + 1);
    const circumference = 2 * Math.PI * radius;
    const capacity = Math.max(4, Math.floor(circumference / (TABLE_W + 60)));
    const ringEnd = Math.min(ringStart + capacity, sorted.length);
    const count = ringEnd - ringStart;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      result.set(sorted[ringStart + i].id, {
        x: Math.round(cx + radius * Math.cos(angle) - TABLE_W / 2),
        y: Math.round(cy + radius * Math.sin(angle) - 50),
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
