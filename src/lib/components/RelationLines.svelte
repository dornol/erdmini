<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import type { ForeignKey, Table } from '$lib/types/erd';

  const THEME_COLORS: Record<string, { normal: string; hover: string; bg: string }> = {
    modern:    { normal: '#94a3b8', hover: '#3b82f6', bg: '#f8fafc' },
    classic:   { normal: '#b0a08a', hover: '#b8860b', bg: '#f5f0e4' },
    blueprint: { normal: '#3a7ac0', hover: '#60a5fa', bg: '#0c1a30' },
    minimal:   { normal: '#d4d4d4', hover: '#737373', bg: '#fafafa' },
  };

  let lineColors = $derived(THEME_COLORS[themeStore.current] ?? THEME_COLORS.modern);

  const TABLE_WIDTH = 200;
  const HEADER_HEIGHT = 37;
  const ROW_HEIGHT = 26;

  interface FKLine {
    fk: ForeignKey;
    tableId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    fromRight: boolean;
    toLeft: boolean;
    isUnique: boolean;
    isNullable: boolean;
  }

  function getColIndex(table: Table, columnId: string): number {
    return table.columns.findIndex((c) => c.id === columnId);
  }

  function colY(table: Table, colIdx: number): number {
    return table.position.y + HEADER_HEIGHT + colIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  let lines = $derived.by((): FKLine[] => {
    const result: FKLine[] = [];
    for (const table of erdStore.schema.tables) {
      for (const fk of table.foreignKeys) {
        const refTable = erdStore.schema.tables.find((t) => t.id === fk.referencedTableId);
        if (!refTable) continue;

        // Generate one line per column pair in composite FK
        for (let i = 0; i < fk.columnIds.length; i++) {
          const srcColIdx = getColIndex(table, fk.columnIds[i]);
          const refColIdx = getColIndex(refTable, fk.referencedColumnIds[i]);
          if (srcColIdx < 0 || refColIdx < 0) continue;

          const srcCenterX = table.position.x + TABLE_WIDTH / 2;
          const refCenterX = refTable.position.x + TABLE_WIDTH / 2;

          // Detect horizontal overlap (vertically stacked tables)
          const overlapAmount = Math.min(table.position.x + TABLE_WIDTH, refTable.position.x + TABLE_WIDTH)
            - Math.max(table.position.x, refTable.position.x);
          const overlapsX = overlapAmount > TABLE_WIDTH * 0.3;

          let fromRight: boolean;
          let toLeft: boolean;
          if (overlapsX) {
            fromRight = true;
            toLeft = false;
          } else {
            fromRight = srcCenterX <= refCenterX;
            toLeft = fromRight;
          }

          const x1 = fromRight ? table.position.x + TABLE_WIDTH : table.position.x;
          const y1 = colY(table, srcColIdx);
          const x2 = toLeft ? refTable.position.x : refTable.position.x + TABLE_WIDTH;
          const y2 = colY(refTable, refColIdx);

          const srcCol = table.columns[srcColIdx];
          const isUnique = srcCol?.unique ?? false;
          const isNullable = srcCol?.nullable ?? false;

          result.push({ fk, tableId: table.id, x1, y1, x2, y2, fromRight, toLeft, isUnique, isNullable });
        }
      }
    }
    return result;
  });

  function bezierPath(line: FKLine): string {
    const { x1, y1, x2, y2, fromRight, toLeft } = line;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    // Straight horizontal segment at each end so markers sit on a flat portion
    const straight = Math.min(20, Math.max(8, dx * 0.25));
    const dirS = fromRight ? 1 : -1;
    const dirT = toLeft ? -1 : 1;
    const sx1 = x1 + dirS * straight;
    const sx2 = x2 + dirT * straight;
    const curveDx = Math.abs(sx2 - sx1);
    // Use dy to ensure enough curve width for vertically stacked tables
    const offset = Math.max(40, Math.min(150, Math.max(curveDx * 0.4, dy * 0.4)));
    const cx1 = sx1 + dirS * offset;
    const cx2 = sx2 + dirT * offset;
    return `M ${x1} ${y1} L ${sx1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${sx2} ${y2} L ${x2} ${y2}`;
  }

  // === Parent (referenced/PK) side — always "one" ===
  // Order from table: cardinality (6px) → participation (14px) → line

  // Cardinality: always one tick (FK references PK/unique) — closest to table
  function parentOneTick(line: FKLine): string {
    const { x2, y2, toLeft } = line;
    const dir = toLeft ? -1 : 1;
    const tickX = x2 + dir * 6;
    return `M ${tickX} ${y2 - 6} L ${tickX} ${y2 + 6}`;
  }

  // Participation: mandatory tick (|) when FK column is NOT NULL — further from table
  function parentMandatoryTick(line: FKLine): string {
    const { x2, y2, toLeft } = line;
    const dir = toLeft ? -1 : 1;
    const tickX = x2 + dir * 14;
    return `M ${tickX} ${y2 - 6} L ${tickX} ${y2 + 6}`;
  }

  // === Child (source, FK holder) side ===
  // Order from table: cardinality (4–12px) → participation (18px) → line

  // Cardinality: one tick (1:1 when FK column is unique) — closest to table
  function childOneTick(line: FKLine): string {
    const { x1, y1, fromRight } = line;
    const dir = fromRight ? 1 : -1;
    const tickX = x1 + dir * 6;
    return `M ${tickX} ${y1 - 6} L ${tickX} ${y1 + 6}`;
  }

  // Cardinality: crow's foot (1:N when FK column is not unique) — closest to table
  function childCrowsFoot(line: FKLine): string {
    const { x1, y1, fromRight } = line;
    const dir = fromRight ? 1 : -1;
    const tipX = x1 + dir * 12;  // convergence (further from table)
    const baseX = x1 + dir * 4;  // prong tips (closer to table)
    const spread = 7;
    return [
      `M ${tipX} ${y1} L ${baseX} ${y1}`,
      `M ${tipX} ${y1} L ${baseX} ${y1 - spread}`,
      `M ${tipX} ${y1} L ${baseX} ${y1 + spread}`,
    ].join(' ');
  }

  let hoveredId = $state<string | null>(null);

  function onLineEnter(line: FKLine) {
    hoveredId = line.fk.id;
    erdStore.hoveredFkInfo = [{
      sourceTableId: line.tableId,
      sourceColumnIds: line.fk.columnIds,
      refTableId: line.fk.referencedTableId,
      refColumnIds: line.fk.referencedColumnIds,
    }];
  }

  function onLineLeave() {
    hoveredId = null;
    erdStore.hoveredFkInfo = [];
  }

  async function handleLineClick(line: FKLine) {
    const srcTable = erdStore.schema.tables.find((t) => t.id === line.tableId);
    const refTable = erdStore.schema.tables.find((t) => t.id === line.fk.referencedTableId);
    const srcColNames = line.fk.columnIds.map((id) => srcTable?.columns.find((c) => c.id === id)?.name ?? '?');
    const refColNames = line.fk.referencedColumnIds.map((id) => refTable?.columns.find((c) => c.id === id)?.name ?? '?');
    const msg = `FK (${srcColNames.join(', ')}) → ${refTable?.name ?? '?'}.(${refColNames.join(', ')}) 을(를) 삭제하시겠습니까?`;
    const ok = await dialogStore.confirm(msg, {
      title: 'FK 삭제',
      confirmText: '삭제',
      variant: 'danger',
    });
    if (ok) erdStore.deleteForeignKey(line.tableId, line.fk.id);
  }
</script>

<svg
  width="1"
  height="1"
  overflow="visible"
  style="position:absolute; top:0; left:0; pointer-events:none"
>
  {#each lines as line, idx (line.fk.id + '-' + idx)}
    {@const hc = erdStore.hoveredColumnInfo}
    {@const isColumnHovered = hc !== null && (
      (hc.tableId === line.tableId && line.fk.columnIds.includes(hc.columnId)) ||
      (hc.tableId === line.fk.referencedTableId && line.fk.referencedColumnIds.includes(hc.columnId))
    )}
    {@const isHovered = hoveredId === line.fk.id || isColumnHovered}
    {@const color = isHovered ? lineColors.hover : lineColors.normal}

    <!-- Invisible wide hit area -->
    <path
      d={bezierPath(line)}
      fill="none"
      stroke="transparent"
      stroke-width="14"
      role="button"
      tabindex="0"
      aria-label="FK 관계선 삭제"
      style="pointer-events:stroke; cursor:pointer"
      onmouseenter={() => onLineEnter(line)}
      onmouseleave={onLineLeave}
      onclick={() => handleLineClick(line)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLineClick(line); }}
    />

    <!-- Visible bezier line (dashed if nullable FK column) -->
    <path
      d={bezierPath(line)}
      fill="none"
      stroke={color}
      stroke-width={isHovered ? 3 : 2}
      stroke-dasharray={line.isNullable ? '6 3' : 'none'}
    />

    <!-- Parent (referenced/PK) side: cardinality (6px) + participation (14px) -->
    <path d={parentOneTick(line)} stroke={color} stroke-width="2" fill="none" />
    {#if line.isNullable}
      <circle
        cx={line.x2 + (line.toLeft ? -1 : 1) * 14}
        cy={line.y2}
        r={5}
        stroke={color}
        stroke-width="2"
        fill={lineColors.bg}
      />
    {:else}
      <path d={parentMandatoryTick(line)} stroke={color} stroke-width="2" fill="none" />
    {/if}

    <!-- Child (source/FK) side: cardinality (4–12px) + participation (18px) -->
    {#if line.isUnique}
      <path d={childOneTick(line)} stroke={color} stroke-width="2" fill="none" />
    {:else}
      <path d={childCrowsFoot(line)} stroke={color} stroke-width="2" fill="none" />
    {/if}
    <circle
      cx={line.x1 + (line.fromRight ? 1 : -1) * 18}
      cy={line.y1}
      r={5}
      stroke={color}
      stroke-width="2"
      fill={lineColors.bg}
    />
  {/each}
</svg>
