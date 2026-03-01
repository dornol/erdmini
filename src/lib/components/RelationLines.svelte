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
    // Precomputed
    path: string;
    labelX: number;
    labelY: number;
    labelText: string;
    parentTick: string;
    parentParticipation: string | null;  // null = circle
    parentCircleCx: number;
    childMarker: string;
    childCircleCx: number;
  }

  function getColIndex(table: Table, columnId: string): number {
    return table.columns.findIndex((c) => c.id === columnId);
  }

  function colY(table: Table, colIdx: number): number {
    return table.position.y + HEADER_HEIGHT + colIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  function computeBezier(x1: number, y1: number, x2: number, y2: number, fromRight: boolean, toLeft: boolean) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const straight = Math.min(20, Math.max(8, dx * 0.25));
    const dirS = fromRight ? 1 : -1;
    const dirT = toLeft ? -1 : 1;
    const sx1 = x1 + dirS * straight;
    const sx2 = x2 + dirT * straight;
    const curveDx = Math.abs(sx2 - sx1);
    const offset = Math.max(40, Math.min(150, Math.max(curveDx * 0.4, dy * 0.4)));
    const cx1 = sx1 + dirS * offset;
    const cx2 = sx2 + dirT * offset;
    const path = `M ${x1} ${y1} L ${sx1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${sx2} ${y2} L ${x2} ${y2}`;
    // Midpoint of cubic bezier at t=0.5
    const labelX = (sx1 + 3 * cx1 + 3 * cx2 + sx2) / 8;
    const labelY = (y1 + y2) / 2;
    return { path, labelX, labelY };
  }

  let lines = $derived.by((): FKLine[] => {
    const result: FKLine[] = [];
    for (const table of erdStore.schema.tables) {
      for (const fk of table.foreignKeys) {
        const refTable = erdStore.schema.tables.find((t) => t.id === fk.referencedTableId);
        if (!refTable) continue;

        for (let i = 0; i < fk.columnIds.length; i++) {
          const srcColIdx = getColIndex(table, fk.columnIds[i]);
          const refColIdx = getColIndex(refTable, fk.referencedColumnIds[i]);
          if (srcColIdx < 0 || refColIdx < 0) continue;

          const srcCenterX = table.position.x + TABLE_WIDTH / 2;
          const refCenterX = refTable.position.x + TABLE_WIDTH / 2;

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

          // Precompute bezier path + label midpoint
          const { path, labelX, labelY } = computeBezier(x1, y1, x2, y2, fromRight, toLeft);
          const labelText = isUnique ? '1:1' : '1:N';

          // Precompute parent side markers
          const pDir = toLeft ? -1 : 1;
          const pTickX = x2 + pDir * 6;
          const parentTick = `M ${pTickX} ${y2 - 6} L ${pTickX} ${y2 + 6}`;
          let parentParticipation: string | null = null;
          const parentCircleCx = x2 + pDir * 14;
          if (!isNullable) {
            parentParticipation = `M ${parentCircleCx} ${y2 - 6} L ${parentCircleCx} ${y2 + 6}`;
          }

          // Precompute child side markers
          const cDir = fromRight ? 1 : -1;
          let childMarker: string;
          if (isUnique) {
            const cTickX = x1 + cDir * 6;
            childMarker = `M ${cTickX} ${y1 - 6} L ${cTickX} ${y1 + 6}`;
          } else {
            const tipX = x1 + cDir * 12;
            const baseX = x1 + cDir * 4;
            const spread = 7;
            childMarker = `M ${tipX} ${y1} L ${baseX} ${y1} M ${tipX} ${y1} L ${baseX} ${y1 - spread} M ${tipX} ${y1} L ${baseX} ${y1 + spread}`;
          }
          const childCircleCx = x1 + cDir * 18;

          result.push({
            fk, tableId: table.id, x1, y1, x2, y2, fromRight, toLeft, isUnique, isNullable,
            path, labelX, labelY, labelText,
            parentTick, parentParticipation, parentCircleCx,
            childMarker, childCircleCx,
          });
        }
      }
    }
    return result;
  });

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
    {@const isEditorFkHovered = erdStore.hoveredFkInfo.some((hfk) =>
      hfk.sourceTableId === line.tableId &&
      hfk.sourceColumnIds.every((id) => line.fk.columnIds.includes(id)) &&
      hfk.refTableId === line.fk.referencedTableId
    )}
    {@const isHovered = hoveredId === line.fk.id || isColumnHovered || isEditorFkHovered}
    {@const color = isHovered ? lineColors.hover : lineColors.normal}

    <!-- Invisible wide hit area -->
    <path
      d={line.path}
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

    <!-- Visible bezier line -->
    <path
      d={line.path}
      fill="none"
      stroke={color}
      stroke-width={isHovered ? 3 : 2}
      stroke-dasharray={line.isNullable ? '6 3' : 'none'}
    />

    <!-- Cardinality label at midpoint -->
    <rect
      x={line.labelX - 11}
      y={line.labelY - 8}
      width="22"
      height="16"
      rx="4"
      fill={lineColors.bg}
      stroke={color}
      stroke-width="0.8"
      opacity={isHovered ? 1 : 0.85}
    />
    <text
      x={line.labelX}
      y={line.labelY + 4}
      text-anchor="middle"
      fill={color}
      font-size="9"
      font-weight="700"
      font-family="system-ui, sans-serif"
      style="pointer-events:none"
    >{line.labelText}</text>

    <!-- Parent (referenced/PK) side markers -->
    <path d={line.parentTick} stroke={color} stroke-width="2" fill="none" />
    {#if line.parentParticipation}
      <path d={line.parentParticipation} stroke={color} stroke-width="2" fill="none" />
    {:else}
      <circle
        cx={line.parentCircleCx}
        cy={line.y2}
        r={5}
        stroke={color}
        stroke-width="2"
        fill={lineColors.bg}
      />
    {/if}

    <!-- Child (source/FK) side markers -->
    <path d={line.childMarker} stroke={color} stroke-width="2" fill="none" />
    <circle
      cx={line.childCircleCx}
      cy={line.y1}
      r={5}
      stroke={color}
      stroke-width="2"
      fill={lineColors.bg}
    />
  {/each}
</svg>
