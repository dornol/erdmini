<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import type { ForeignKey, Table } from '$lib/types/erd';

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

        const srcColIdx = getColIndex(table, fk.columnId);
        const refColIdx = getColIndex(refTable, fk.referencedColumnId);
        if (srcColIdx < 0 || refColIdx < 0) continue;

        const srcCenterX = table.position.x + TABLE_WIDTH / 2;
        const refCenterX = refTable.position.x + TABLE_WIDTH / 2;

        const fromRight = srcCenterX <= refCenterX;
        const toLeft = fromRight;

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
    return result;
  });

  function bezierPath(line: FKLine): string {
    const { x1, y1, x2, y2 } = line;
    const dx = Math.abs(x2 - x1);
    const offset = Math.max(40, Math.min(150, dx * 0.4));
    const cx1 = x1 + (line.fromRight ? offset : -offset);
    const cx2 = x2 + (line.toLeft ? -offset : offset);
    return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  }

  // Crow's foot marker at the "many" end (target side)
  // Points outward from the target table edge
  function crowsFoot(line: FKLine): string {
    const { x2, y2, toLeft } = line;
    // dir points away from the table (outward from the edge)
    const dir = toLeft ? -1 : 1;
    const len = 10;
    const spread = 8;
    const tip = x2 + dir * len;
    return [
      `M ${x2} ${y2} L ${tip} ${y2}`,
      `M ${x2} ${y2} L ${tip} ${y2 - spread}`,
      `M ${x2} ${y2} L ${tip} ${y2 + spread}`,
    ].join(' ');
  }

  // One tick at the source side (the "one" end)
  function oneTick(line: FKLine): string {
    const { x1, y1, fromRight } = line;
    // dir points away from the table edge
    const dir = fromRight ? 1 : -1;
    const tickX = x1 + dir * 8;
    return `M ${tickX} ${y1 - 6} L ${tickX} ${y1 + 6}`;
  }

  // One tick at the target side (for 1:1 unique FK)
  function oneTickTarget(line: FKLine): string {
    const { x2, y2, toLeft } = line;
    const dir = toLeft ? -1 : 1;
    const tickX = x2 + dir * 8;
    return `M ${tickX} ${y2 - 6} L ${tickX} ${y2 + 6}`;
  }

  let hoveredId = $state<string | null>(null);

  function onLineEnter(line: FKLine) {
    hoveredId = line.fk.id;
    erdStore.hoveredFkInfo = {
      sourceTableId: line.tableId,
      sourceColumnId: line.fk.columnId,
      refTableId: line.fk.referencedTableId,
      refColumnId: line.fk.referencedColumnId,
    };
  }

  function onLineLeave() {
    hoveredId = null;
    erdStore.hoveredFkInfo = null;
  }

  async function handleLineClick(line: FKLine) {
    const colName = erdStore.schema.tables
      .find((t) => t.id === line.tableId)
      ?.columns.find((c) => c.id === line.fk.columnId)?.name ?? line.fk.columnId;
    const refTable = erdStore.schema.tables.find((t) => t.id === line.fk.referencedTableId);
    const refCol = refTable?.columns.find((c) => c.id === line.fk.referencedColumnId);
    const msg = `FK "${colName}" → "${refTable?.name ?? '?'}.${refCol?.name ?? '?'}" 을(를) 삭제하시겠습니까?`;
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
  <defs>
    <marker id="circle-start" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <circle cx="3" cy="3" r="2" fill="#94a3b8" />
    </marker>
  </defs>

  {#each lines as line (line.fk.id)}
    {@const hc = erdStore.hoveredColumnInfo}
    {@const isColumnHovered = hc !== null && (
      (hc.tableId === line.tableId && hc.columnId === line.fk.columnId) ||
      (hc.tableId === line.fk.referencedTableId && hc.columnId === line.fk.referencedColumnId)
    )}
    {@const isHovered = hoveredId === line.fk.id || isColumnHovered}
    {@const color = isHovered ? '#3b82f6' : '#94a3b8'}

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

    <!-- Source side: one tick -->
    <path d={oneTick(line)} stroke={color} stroke-width="2" fill="none" />

    <!-- Target side: crow's foot (N) or one tick (1:1 unique) -->
    {#if line.isUnique}
      <path d={oneTickTarget(line)} stroke={color} stroke-width="2" fill="none" />
    {:else}
      <path d={crowsFoot(line)} stroke={color} stroke-width="2" fill="none" />
    {/if}
  {/each}
</svg>
