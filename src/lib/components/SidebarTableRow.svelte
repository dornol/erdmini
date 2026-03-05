<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { TABLE_COLORS } from '$lib/constants/table-colors';
  import { getEffectiveColor } from '$lib/utils/table-color';
  import * as m from '$lib/paraglide/messages';
  import type { Table } from '$lib/types/erd';

  interface Props {
    table: Table;
    grouped: boolean;
    groupName: string;
    active: boolean;
    dragging: boolean;
    onclick: (e: MouseEvent) => void;
    ondragstart: (e: DragEvent) => void;
    ondragend: () => void;
    ondragover?: (e: DragEvent) => void;
    ondrop?: (e: DragEvent) => void;
    onmouseenter: (e: MouseEvent) => void;
    onmouseleave: () => void;
  }

  let {
    table, grouped, groupName, active, dragging,
    onclick, ondragstart, ondragend, ondragover, ondrop,
    onmouseenter, onmouseleave,
  }: Props = $props();

  function getColorDot(t: Table): string | null {
    const colorId = getEffectiveColor(t, erdStore.schema);
    if (!colorId) return null;
    const entry = TABLE_COLORS[colorId];
    return entry?.dot ?? null;
  }

  function duplicateTable(e: MouseEvent) {
    e.stopPropagation();
    erdStore.duplicateTable(table.id);
  }

  async function deleteTable(e: MouseEvent) {
    e.stopPropagation();
    const ok = await dialogStore.confirm(m.dialog_delete_table_confirm({ name: table.name }), {
      title: m.dialog_delete_table_title(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) erdStore.deleteTable(table.id);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="table-item"
  class:table-item-grouped={grouped}
  class:active
  class:dragging
  draggable={grouped && !permissionStore.isReadOnly}
  {onclick}
  ondragstart={(e) => ondragstart(e)}
  ondragend={() => ondragend()}
  ondragover={grouped ? ondragover : undefined}
  ondrop={grouped ? ondrop : undefined}
  onmouseenter={(e) => onmouseenter(e)}
  onmouseleave={() => onmouseleave()}
>
  <div class="item-info">
    <div class="item-name-row">
      {#if getColorDot(table)}
        <span class="item-color-dot" style="background:{getColorDot(table)}"></span>
      {/if}
      <span class="item-name">{table.name}</span>
      {#if table.locked}<span class="item-lock" title="Locked">🔒</span>{/if}
      <span class="badge badge-cols">{table.columns.length}</span>
    </div>
    {#if table.comment}
      <span class="item-comment">{table.comment}</span>
    {/if}
  </div>
  <div class="item-actions">
    <button
      class="item-action-btn"
      title={m.action_duplicate()}
      onclick={duplicateTable}
    >⧉</button>
    <button
      class="item-action-btn item-delete"
      title={m.action_delete()}
      onclick={deleteTable}
    >✕</button>
  </div>
</div>
