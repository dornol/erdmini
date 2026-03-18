<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { fkDragStore } from '$lib/store/fk-drag.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import type { ForeignKey, Table } from '$lib/types/erd';
  import { HEADER_H, ROW_H, COMMENT_H } from '$lib/constants/layout';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { routeFKLines, computeOrthogonalLine, computeRoundedOrthogonalLine, computeSelfRefLoop, type AABB, type FKLineInput } from '$lib/utils/fk-routing';
  import { getFilteredColumns as getFilteredCols } from '$lib/utils/column-filter';
  import * as m from '$lib/paraglide/messages';

  let { visibleTables, oneditfk }: { visibleTables?: Table[]; oneditfk?: (tableId: string, fkId: string) => void } = $props();

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
    return getFilteredCols(table, canvasState.columnDisplayMode);
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
        } else if (lineType === 'rounded') {
          routes.set(input.id, computeRoundedOrthogonalLine(input.x1, input.y1, input.x2, input.y2, input.fromRight, input.toLeft));
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

      // Parent side markers ("one" side, y2 end)
      const pDir = toLeft ? -1 : 1;
      const pTickX = x2 + pDir * 7;
      const parentTick = `M ${pTickX} ${y2 - 7} L ${pTickX} ${y2 + 7}`;
      let parentParticipation: string | null = null;
      const parentCircleCx = x2 + pDir * 15;
      if (!isNullable) {
        parentParticipation = `M ${parentCircleCx} ${y2 - 7} L ${parentCircleCx} ${y2 + 7}`;
      }

      // Child side markers ("many" or "one" side, y1 end)
      const cDir = fromRight ? 1 : -1;
      let childMarker: string;
      if (isUnique) {
        const cTickX = x1 + cDir * 7;
        childMarker = `M ${cTickX} ${y1 - 7} L ${cTickX} ${y1 + 7}`;
      } else {
        // Crow's foot: prongs toward table, vertex toward line
        const baseX = x1 + cDir * 5;
        const tipX = x1 + cDir * 14;
        const spread = 8;
        childMarker = `M ${baseX} ${y1 - spread} L ${tipX} ${y1} L ${baseX} ${y1 + spread}`;
      }
      const childCircleCx = x1 + cDir * 20;

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
  let fkPopover = $state<{ line: FKLine; x: number; y: number } | null>(null);

  let isReadOnly = $derived(permissionStore.isReadOnly);

  function onLabelDblClick(line: FKLine, e: MouseEvent) {
    e.stopPropagation();
    if (isReadOnly) return;
    fkPopover = null;
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

  function handleLineClick(line: FKLine, e: MouseEvent) {
    e.stopPropagation();
    // Open popover at click position (world coords)
    const svg = (e.target as SVGElement).closest('svg');
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const worldPt = pt.matrixTransform(ctm.inverse());
    fkPopover = { line, x: worldPt.x, y: worldPt.y };
    // Close on next click anywhere
    requestAnimationFrame(() => {
      window.addEventListener('pointerdown', handlePopoverOutsideClick);
    });
  }

  function handlePopoverOutsideClick(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest?.('.fk-popover')) return;
    closeFkPopover();
  }

  function closeFkPopover() {
    fkPopover = null;
    window.removeEventListener('pointerdown', handlePopoverOutsideClick);
  }

  function popoverEditLabel() {
    if (!fkPopover) return;
    const line = fkPopover.line;
    editingLabel = {
      tableId: line.tableId,
      fkId: line.fk.id,
      x: line.labelX,
      y: line.labelY,
      value: line.fkLabel,
    };
    fkPopover = null;
  }

  function popoverEditFk() {
    if (!fkPopover) return;
    const { tableId } = fkPopover.line;
    const fkId = fkPopover.line.fk.id;
    fkPopover = null;
    oneditfk?.(tableId, fkId);
  }

  async function popoverDeleteFk() {
    if (!fkPopover) return;
    const line = fkPopover.line;
    fkPopover = null;
    const srcTable = erdStore.schema.tables.find((t) => t.id === line.tableId);
    const refTable = erdStore.schema.tables.find((t) => t.id === line.fk.referencedTableId);
    const srcColNames = line.fk.columnIds.map((id) => srcTable?.columns.find((c) => c.id === id)?.name ?? '?');
    const refColNames = line.fk.referencedColumnIds.map((id) => refTable?.columns.find((c) => c.id === id)?.name ?? '?');
    const msg = `FK (${srcColNames.join(', ')}) → ${refTable?.name ?? '?'}.(${refColNames.join(', ')}) ${m.fk_delete()}?`;
    const ok = await dialogStore.confirm(msg, {
      title: m.fk_delete(),
      confirmText: m.action_delete(),
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
        aria-label="FK line"
        style="pointer-events:stroke; cursor:pointer; outline:none"
        onmouseenter={() => onLineEnter(line)}
        onmouseleave={onLineLeave}
        onclick={(e) => handleLineClick(line, e)}
        ondblclick={(e) => onLabelDblClick(line, e)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { fkPopover = { line, x: line.labelX, y: line.labelY }; } }}
      />
      <path d={line.path} fill="none" stroke={color} stroke-width="1.6"
        stroke-dasharray={line.isNullable ? '6 3' : lineColors.dash || 'none'} stroke-linecap="round" />
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
      <path d={line.parentTick} stroke={color} stroke-width="1.8" fill="none" stroke-linecap="round" />
      {#if line.parentParticipation}
        <path d={line.parentParticipation} stroke={color} stroke-width="1.8" fill="none" stroke-linecap="round" />
      {:else}
        <circle cx={line.parentCircleCx} cy={line.y2} r={4.5} stroke={color} stroke-width="1.6" fill={lineColors.bg} />
      {/if}
      <path d={line.childMarker} stroke={color} stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={line.childCircleCx} cy={line.y1} r={4.5} stroke={color} stroke-width="1.6" fill={lineColors.bg} />
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
        aria-label="FK line"
        style="pointer-events:stroke; cursor:pointer; outline:none"
        onmouseenter={() => onLineEnter(line)}
        onmouseleave={onLineLeave}
        onclick={(e) => handleLineClick(line, e)}
        ondblclick={(e) => onLabelDblClick(line, e)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { fkPopover = { line, x: line.labelX, y: line.labelY }; } }}
      />
      <path d={line.path} fill="none" stroke={color} stroke-width="2.4"
        stroke-dasharray={line.isNullable ? '6 3' : lineColors.dash || 'none'} stroke-linecap="round" />
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
      <path d={line.parentTick} stroke={color} stroke-width="1.8" fill="none" stroke-linecap="round" />
      {#if line.parentParticipation}
        <path d={line.parentParticipation} stroke={color} stroke-width="1.8" fill="none" stroke-linecap="round" />
      {:else}
        <circle cx={line.parentCircleCx} cy={line.y2} r={4.5} stroke={color} stroke-width="1.6" fill={lineColors.bg} />
      {/if}
      <path d={line.childMarker} stroke={color} stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={line.childCircleCx} cy={line.y1} r={4.5} stroke={color} stroke-width="1.6" fill={lineColors.bg} />
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

{#if fkPopover}
  {@const pop = fkPopover}
  {@const srcTable = erdStore.schema.tables.find((t) => t.id === pop.line.tableId)}
  {@const refTable = erdStore.schema.tables.find((t) => t.id === pop.line.fk.referencedTableId)}
  {@const srcColNames = pop.line.fk.columnIds.map((id) => srcTable?.columns.find((c) => c.id === id)?.name ?? '?')}
  {@const refColNames = pop.line.fk.referencedColumnIds.map((id) => refTable?.columns.find((c) => c.id === id)?.name ?? '?')}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fk-popover"
    style="left:{pop.x}px; top:{pop.y}px"
    onkeydown={(e) => { if (e.key === 'Escape') closeFkPopover(); }}
  >
    <div class="fk-popover-info">
      <span class="fk-popover-col">{srcTable?.name}.{srcColNames.join(', ')}</span>
      <span class="fk-popover-arrow">→</span>
      <span class="fk-popover-col">{refTable?.name}.{refColNames.join(', ')}</span>
    </div>
    {#if pop.line.fkLabel}
      <div class="fk-popover-label">"{pop.line.fkLabel}"</div>
    {/if}
    {#if !isReadOnly}
      <div class="fk-popover-actions">
        <button onclick={popoverEditLabel}>✏️ {m.fk_label()}</button>
        <button onclick={popoverEditFk}>⚙️ {m.action_edit()}</button>
        <button class="danger" onclick={popoverDeleteFk}>🗑 {m.action_delete()}</button>
      </div>
    {/if}
  </div>
{/if}

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
  .fk-popover {
    position: absolute;
    transform: translate(-50%, 8px);
    z-index: 10;
    background: var(--app-popup-bg, #1e293b);
    border: 1px solid var(--app-border, #334155);
    border-radius: 8px;
    padding: 8px;
    min-width: 180px;
    box-shadow: var(--app-popup-shadow, 0 8px 30px rgba(0,0,0,0.3));
  }
  .fk-popover-info {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--app-text-secondary, #cbd5e1);
    padding: 2px 4px;
    flex-wrap: wrap;
  }
  .fk-popover-col {
    font-weight: 600;
    color: var(--app-text, #f1f5f9);
    font-family: monospace;
    font-size: 11px;
  }
  .fk-popover-arrow {
    color: var(--app-text-muted, #94a3b8);
  }
  .fk-popover-label {
    font-size: 11px;
    font-style: italic;
    color: var(--app-text-muted, #94a3b8);
    padding: 0 4px 2px;
  }
  .fk-popover-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
    border-top: 1px solid var(--app-border, #334155);
    padding-top: 4px;
  }
  .fk-popover-actions button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--app-text-secondary, #cbd5e1);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .fk-popover-actions button:hover {
    background: var(--app-hover-bg, #334155);
    color: var(--app-text, #f1f5f9);
  }
  .fk-popover-actions button.danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }
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
