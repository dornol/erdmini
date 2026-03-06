<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { fkDragStore } from '$lib/store/fk-drag.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import type { ForeignKey, Table } from '$lib/types/erd';
  import { HEADER_H, ROW_H, COMMENT_H } from '$lib/constants/layout';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { routeFKLines, computeStraightLine, computeOrthogonalLine, computeSelfRefLoop, type AABB, type FKLineInput } from '$lib/utils/fk-routing';

  let { visibleTables }: { visibleTables?: Table[] } = $props();

  function autoFocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  const THEME_COLORS: Record<string, { normal: string; hover: string; bg: string; dash: string }> = {
    modern:    { normal: '#94a3b8', hover: '#3b82f6', bg: '#f8fafc', dash: '' },
    classic:   { normal: '#b0a08a', hover: '#b8860b', bg: '#f5f0e4', dash: '' },
    blueprint: { normal: '#3a7ac0', hover: '#60a5fa', bg: '#0c1a30', dash: '6,4' },
    minimal:   { normal: '#d4d4d4', hover: '#737373', bg: '#fafafa', dash: '2,3' },
  };

  let lineColors = $derived(THEME_COLORS[themeStore.current] ?? THEME_COLORS.modern);

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
    fkLabel: string;
    parentTick: string;
    parentParticipation: string | null;  // null = circle
    parentCircleCx: number;
    childMarker: string;
    childCircleCx: number;
  }

  function getFilteredColumns(table: Table) {
    const mode = canvasState.columnDisplayMode;
    if (mode === 'all' || mode === 'names-only') return table.columns;
    // pk-fk-only
    const fkColIds = new Set(table.foreignKeys.flatMap((fk) => fk.columnIds));
    return table.columns.filter((c) => c.primaryKey || fkColIds.has(c.id));
  }

  function getColIndex(table: Table, columnId: string): number {
    return getFilteredColumns(table).findIndex((c) => c.id === columnId);
  }

  function colY(table: Table, colIdx: number): number {
    const commentH = table.comment ? COMMENT_H : 0;
    return table.position.y + HEADER_H + commentH + colIdx * ROW_H + ROW_H / 2;
  }

  function cardHeight(table: Table): number {
    const cols = getFilteredColumns(table);
    const colH = Math.max(cols.length, 1) * ROW_H;
    const commentH = table.comment ? COMMENT_H : 0;
    return HEADER_H + commentH + colH + 8;
  }

  let lines = $derived.by((): FKLine[] => {
    // Step 1: Collect FKLineInputs and AABBs
    const inputs: (FKLineInput & { _tableId: string; _fk: ForeignKey; _isUnique: boolean; _isNullable: boolean })[] = [];
    const aabbs: AABB[] = [];

    const tablesToRender = visibleTables ?? erdStore.schema.tables;
    const visibleIds = new Set(tablesToRender.map((t) => t.id));

    // Build AABBs for visible tables
    for (const table of tablesToRender) {
      aabbs.push({
        id: table.id,
        x: table.position.x,
        y: table.position.y,
        w: canvasState.getTableW(table.id),
        h: cardHeight(table),
      });
    }

    for (const table of tablesToRender) {
      const srcW = canvasState.getTableW(table.id);
      for (const fk of table.foreignKeys) {
        // Only render FK lines where both tables are visible
        if (!visibleIds.has(fk.referencedTableId)) continue;
        const refTable = erdStore.schema.tables.find((t) => t.id === fk.referencedTableId);
        if (!refTable) continue;
        const refW = canvasState.getTableW(refTable.id);

        for (let i = 0; i < fk.columnIds.length; i++) {
          const srcColIdx = getColIndex(table, fk.columnIds[i]);
          const refColIdx = getColIndex(refTable, fk.referencedColumnIds[i]);
          if (srcColIdx < 0 || refColIdx < 0) continue;

          const srcCenterX = table.position.x + srcW / 2;
          const refCenterX = refTable.position.x + refW / 2;

          const overlapAmount = Math.min(table.position.x + srcW, refTable.position.x + refW)
            - Math.max(table.position.x, refTable.position.x);
          const minW = Math.min(srcW, refW);
          const overlapsX = overlapAmount > minW * 0.3;

          let fromRight: boolean;
          let toLeft: boolean;
          if (overlapsX) {
            fromRight = true;
            toLeft = false;
          } else {
            fromRight = srcCenterX <= refCenterX;
            toLeft = fromRight;
          }

          const x1 = fromRight ? table.position.x + srcW : table.position.x;
          const y1 = colY(table, srcColIdx);
          const x2 = toLeft ? refTable.position.x : refTable.position.x + refW;
          const y2 = colY(refTable, refColIdx);

          const srcCol = table.columns[srcColIdx];
          const isUnique = srcCol?.unique ?? false;
          const isNullable = srcCol?.nullable ?? false;

          inputs.push({
            id: `${fk.id}:${i}`,
            sourceTableId: table.id,
            targetTableId: fk.referencedTableId,
            x1, y1, x2, y2,
            fromRight, toLeft,
            _tableId: table.id,
            _fk: fk,
            _isUnique: isUnique,
            _isNullable: isNullable,
          });
        }
      }
    }

    // Step 2: Route all lines
    const lineType = canvasState.lineType;
    let routes: Map<string, import('$lib/utils/fk-routing').FKLineRoute>;

    if (lineType === 'bezier') {
      routes = routeFKLines(inputs, aabbs);
    } else {
      routes = new Map();
      // Self-ref groups for loop index tracking
      const selfRefGroups = new Map<string, (typeof inputs[number])[]>();
      for (const input of inputs) {
        if (input.sourceTableId === input.targetTableId) {
          const group = selfRefGroups.get(input.sourceTableId) ?? [];
          group.push(input);
          selfRefGroups.set(input.sourceTableId, group);
        }
      }
      // Assign loop indices
      const selfRefLoopIndex = new Map<string, number>();
      for (const [, group] of selfRefGroups) {
        group.forEach((inp, i) => selfRefLoopIndex.set(inp.id, i));
      }

      for (const input of inputs) {
        if (input.sourceTableId === input.targetTableId) {
          // Always use loop for self-ref regardless of line type
          const loopIdx = selfRefLoopIndex.get(input.id) ?? 0;
          routes.set(input.id, computeSelfRefLoop(input.x1, input.y1, input.x2, input.y2, loopIdx));
        } else if (lineType === 'straight') {
          routes.set(input.id, computeStraightLine(input.x1, input.y1, input.x2, input.y2));
        } else {
          routes.set(input.id, computeOrthogonalLine(input.x1, input.y1, input.x2, input.y2, input.fromRight, input.toLeft));
        }
      }
    }

    // Step 3: Map routes back to FKLine objects
    const result: FKLine[] = [];
    for (const input of inputs) {
      const route = routes.get(input.id);
      if (!route) continue;

      const { x1, y1, x2, y2, fromRight, toLeft, _fk: fk, _tableId: tableId, _isUnique: isUnique, _isNullable: isNullable } = input;
      const labelText = isUnique ? '1:1' : '1:N';

      // Parent side markers (y2 already spread)
      const pDir = toLeft ? -1 : 1;
      const pTickX = x2 + pDir * 6;
      const parentTick = `M ${pTickX} ${y2 - 6} L ${pTickX} ${y2 + 6}`;
      let parentParticipation: string | null = null;
      const parentCircleCx = x2 + pDir * 14;
      if (!isNullable) {
        parentParticipation = `M ${parentCircleCx} ${y2 - 6} L ${parentCircleCx} ${y2 + 6}`;
      }

      // Child side markers (y1 already spread)
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
        fk, tableId, x1, y1, x2, y2, fromRight, toLeft, isUnique, isNullable,
        path: route.path, labelX: route.labelX, labelY: route.labelY, labelText,
        fkLabel: fk.label ?? '',
        parentTick, parentParticipation, parentCircleCx,
        childMarker, childCircleCx,
      });
    }

    return result;
  });

  let hoveredId = $state<string | null>(null);
  let editingLabel = $state<{ tableId: string; fkId: string; x: number; y: number; value: string } | null>(null);

  let isReadOnly = $derived(permissionStore.isReadOnly);

  function onLabelDblClick(line: FKLine, e: MouseEvent) {
    e.stopPropagation();
    clearTimeout(clickTimer);
    if (isReadOnly) return;
    editingLabel = {
      tableId: line.tableId,
      fkId: line.fk.id,
      x: line.labelX,
      y: line.labelY,
      value: line.fkLabel,
    };
  }

  function commitLabel() {
    if (!editingLabel) return;
    erdStore.updateFkLabel(editingLabel.tableId, editingLabel.fkId, editingLabel.value.trim());
    editingLabel = null;
  }

  function cancelLabel() {
    editingLabel = null;
  }

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

  let clickTimer: ReturnType<typeof setTimeout> | undefined;

  function handleLineClick(line: FKLine) {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      doDeleteFk(line);
    }, 250);
  }

  async function doDeleteFk(line: FKLine) {
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
  style="position:absolute; top:0; left:0; pointer-events:none; z-index:0"
>
  <!-- Non-hovered lines first (back) -->
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
    {#if !isHovered}
      {@const color = lineColors.normal}
      <!-- Hit area -->
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
        ondblclick={(e) => onLabelDblClick(line, e)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLineClick(line); }}
      />
      <path d={line.path} fill="none" stroke={color} stroke-width="2"
        stroke-dasharray={line.isNullable ? '6 3' : lineColors.dash || 'none'} />
      <rect x={line.labelX - 11} y={line.labelY - 8} width="22" height="16" rx="4"
        fill={lineColors.bg} stroke={color} stroke-width="0.8" opacity="0.85" />
      <text x={line.labelX} y={line.labelY + 4} text-anchor="middle" fill={color}
        font-size="9" font-weight="700" font-family="system-ui, sans-serif"
        style="pointer-events:none">{line.labelText}</text>
      {#if line.fkLabel}
        <text x={line.labelX} y={line.labelY + 18} text-anchor="middle" fill={color}
          font-size="10" font-style="italic" font-family="system-ui, sans-serif"
          style="pointer-events:none">{line.fkLabel}</text>
      {/if}
      <path d={line.parentTick} stroke={color} stroke-width="2" fill="none" />
      {#if line.parentParticipation}
        <path d={line.parentParticipation} stroke={color} stroke-width="2" fill="none" />
      {:else}
        <circle cx={line.parentCircleCx} cy={line.y2} r={5} stroke={color} stroke-width="2" fill={lineColors.bg} />
      {/if}
      <path d={line.childMarker} stroke={color} stroke-width="2" fill="none" />
      <circle cx={line.childCircleCx} cy={line.y1} r={5} stroke={color} stroke-width="2" fill={lineColors.bg} />
    {/if}
  {/each}

  <!-- Hovered lines on top (front) -->
  {#each lines as line, idx (line.fk.id + '-h-' + idx)}
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
    {#if isHovered}
      {@const color = lineColors.hover}
      <!-- Hit area -->
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
        ondblclick={(e) => onLabelDblClick(line, e)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLineClick(line); }}
      />
      <path d={line.path} fill="none" stroke={color} stroke-width="3"
        stroke-dasharray={line.isNullable ? '6 3' : lineColors.dash || 'none'} />
      <rect x={line.labelX - 11} y={line.labelY - 8} width="22" height="16" rx="4"
        fill={lineColors.bg} stroke={color} stroke-width="0.8" />
      <text x={line.labelX} y={line.labelY + 4} text-anchor="middle" fill={color}
        font-size="9" font-weight="700" font-family="system-ui, sans-serif"
        style="pointer-events:none">{line.labelText}</text>
      {#if line.fkLabel}
        <text x={line.labelX} y={line.labelY + 18} text-anchor="middle" fill={color}
          font-size="10" font-style="italic" font-family="system-ui, sans-serif"
          style="pointer-events:none">{line.fkLabel}</text>
      {/if}
      <path d={line.parentTick} stroke={color} stroke-width="2" fill="none" />
      {#if line.parentParticipation}
        <path d={line.parentParticipation} stroke={color} stroke-width="2" fill="none" />
      {:else}
        <circle cx={line.parentCircleCx} cy={line.y2} r={5} stroke={color} stroke-width="2" fill={lineColors.bg} />
      {/if}
      <path d={line.childMarker} stroke={color} stroke-width="2" fill="none" />
      <circle cx={line.childCircleCx} cy={line.y1} r={5} stroke={color} stroke-width="2" fill={lineColors.bg} />
    {/if}
  {/each}

  <!-- FK drag preview line -->
  {#if fkDragStore.active}
    {@const dragColor = lineColors.hover}
    <line
      x1={fkDragStore.startX}
      y1={fkDragStore.startY}
      x2={fkDragStore.currentX}
      y2={fkDragStore.currentY}
      stroke={dragColor}
      stroke-width="2"
      stroke-dasharray="6 4"
    />
    <circle
      cx={fkDragStore.startX}
      cy={fkDragStore.startY}
      r="4"
      fill={dragColor}
    />
    {#if fkDragStore.targetTableId && fkDragStore.targetColumnId}
      {@const tgtTable = erdStore.schema.tables.find((t) => t.id === fkDragStore.targetTableId)}
      {#if tgtTable}
        {@const tgtColIdx = tgtTable.columns.findIndex((c) => c.id === fkDragStore.targetColumnId)}
        {#if tgtColIdx >= 0}
          {@const commentH = tgtTable.comment ? 26 : 0}
          {@const snapX = tgtTable.position.x}
          {@const snapY = tgtTable.position.y + HEADER_H + commentH + tgtColIdx * ROW_H + ROW_H / 2}
          <circle
            cx={snapX}
            cy={snapY}
            r="5"
            fill="none"
            stroke={dragColor}
            stroke-width="2"
          />
        {/if}
      {/if}
    {/if}
  {/if}
</svg>

{#if editingLabel}
  <div
    class="fk-label-editor"
    style="left:{editingLabel.x}px; top:{editingLabel.y + 22}px"
  >
    <input
      type="text"
      bind:value={editingLabel.value}
      placeholder="Label..."
      onkeydown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') cancelLabel(); }}
      onblur={commitLabel}
      use:autoFocus
    />
  </div>
{/if}

<style>
  .fk-label-editor {
    position: absolute;
    transform: translateX(-50%);
    z-index: 10;
  }
  .fk-label-editor input {
    width: 120px;
    padding: 2px 6px;
    font-size: 11px;
    font-style: italic;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    outline: none;
    background: white;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
</style>
