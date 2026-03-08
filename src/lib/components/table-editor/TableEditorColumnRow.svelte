<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import type { Column, ForeignKey } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';

  let {
    col,
    idx,
    tableId,
    foreignKeys,
    dragOverIdx,
    dragColId,
    ondragstart,
    ondragover,
    ondrop,
    ondragend,
    onopenPopup,
  }: {
    col: Column;
    idx: number;
    tableId: string;
    foreignKeys: ForeignKey[];
    dragOverIdx: number | null;
    dragColId: string | null;
    ondragstart: (e: DragEvent, colId: string) => void;
    ondragover: (e: DragEvent, idx: number) => void;
    ondrop: (e: DragEvent, toIdx: number) => void;
    ondragend: () => void;
    onopenPopup: (colId: string, e: MouseEvent) => void;
  } = $props();

  let isFK = $derived(foreignKeys.some((fk) => fk.columnIds.includes(col.id)));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="option"
  tabindex="0"
  aria-selected="false"
  class="col-row"
  class:drag-over={dragOverIdx === idx}
  class:dragging={dragColId === col.id}
  draggable="true"
  ondragstart={(e) => ondragstart(e, col.id)}
  ondragover={(e) => ondragover(e, idx)}
  ondrop={(e) => ondrop(e, idx)}
  ondragend={ondragend}
  onclick={(e) => {
    // Don't open popup if clicking drag handle or delete button
    const target = e.target as HTMLElement;
    if (target.closest('.drag-handle') || target.closest('.col-del-btn')) return;
    onopenPopup(col.id, e);
  }}
>
  <span class="drag-handle" title={m.editor_drag_hint()}>⠿</span>
  {#if col.primaryKey}
    <span class="col-badge col-badge-pk">PK</span>
  {:else if isFK}
    <span class="col-badge col-badge-fk">FK</span>
  {/if}
  <span class="col-name">{col.name}</span>
  <span class="col-type-badge">{col.type}{col.length ? `(${col.length}${col.scale != null ? `,${col.scale}` : ''})` : ''}</span>
  <button
    class="col-del-btn"
    title={m.action_delete()}
    onclick={async (e) => {
      e.stopPropagation();
      // Count FKs in this table that use this column
      let fkCount = foreignKeys.filter((fk) => fk.columnIds.includes(col.id)).length;
      // Count FKs in other tables that reference this column
      fkCount += erdStore.schema.tables
        .filter((t) => t.id !== tableId)
        .reduce((sum, t) => sum + t.foreignKeys.filter(
          (fk) => fk.referencedTableId === tableId && fk.referencedColumnIds.includes(col.id)
        ).length, 0);
      if (fkCount > 0) {
        const ok = await dialogStore.confirm(
          m.column_delete_fk_confirm({ count: fkCount }),
          { title: m.action_delete(), confirmText: m.action_delete(), variant: 'danger' }
        );
        if (!ok) return;
      }
      erdStore.deleteColumn(tableId, col.id);
    }}
  >✕</button>
</div>

<style>
  /* Compact column row */
  .col-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 6px;
    background: var(--app-panel-bg, #f8fafc);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.15s;
    user-select: none;
  }

  .col-row:hover {
    background: var(--app-hover-bg, #f1f5f9);
    border-color: var(--app-border, #e2e8f0);
  }

  .col-row.dragging {
    opacity: 0.4;
  }

  .col-row.drag-over {
    border-color: #3b82f6;
    border-top: 2px solid #3b82f6;
  }

  .drag-handle {
    cursor: grab;
    color: var(--app-text-faint, #94a3b8);
    font-size: 12px;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }

  .drag-handle:hover {
    color: var(--app-text-secondary, #475569);
  }

  .col-badge {
    font-size: 9px;
    font-weight: 700;
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
    line-height: 1.2;
  }

  .col-badge-pk {
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fcd34d;
  }

  .col-badge-fk {
    color: #1d4ed8;
    background: #dbeafe;
    border: 1px solid #93c5fd;
  }

  .col-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--app-text, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-type-badge {
    font-size: 10px;
    color: var(--app-text-muted, #64748b);
    background: var(--app-card-bg, white);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 3px;
    padding: 1px 5px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .col-del-btn {
    display: none;
    background: none;
    border: none;
    font-size: 10px;
    color: var(--app-text-faint, #94a3b8);
    cursor: pointer;
    padding: 0 3px;
    line-height: 1;
    flex-shrink: 0;
  }

  .col-row:hover .col-del-btn {
    display: block;
  }

  .col-del-btn:hover {
    color: #ef4444;
  }
</style>
