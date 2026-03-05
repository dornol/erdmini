<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { TABLE_COLORS } from '$lib/constants/table-colors';
  import * as m from '$lib/paraglide/messages';
  import type { GroupData } from '$lib/utils/sidebar-rows';
  import type { TableColorId } from '$lib/constants/table-colors';

  interface Props {
    group: GroupData;
    collapsed: boolean;
    dragTarget: boolean;
    editing: boolean;
    editingName: string;
    ontoggle: () => void;
    ondragover: (e: DragEvent) => void;
    ondragleave: () => void;
    ondrop: (e: DragEvent) => void;
    oncolorclick: (e: MouseEvent) => void;
    oneditstart: (e: MouseEvent) => void;
    oneditconfirm: () => void;
    oneditcancel: () => void;
    oneditchange: (value: string) => void;
  }

  let {
    group, collapsed, dragTarget, editing, editingName,
    ontoggle, ondragover, ondragleave, ondrop,
    oncolorclick, oneditstart, oneditconfirm, oneditcancel, oneditchange,
  }: Props = $props();

  function getGroupColorDot(groupName: string): string | null {
    const colorId = erdStore.schema.groupColors?.[groupName];
    if (!colorId) return null;
    const entry = TABLE_COLORS[colorId as TableColorId];
    return entry?.dot ?? null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group-header"
  class:drag-target={dragTarget}
  onclick={ontoggle}
  ondragover={(e) => ondragover(e)}
  {ondragleave}
  ondrop={(e) => ondrop(e)}
>
  <span class="group-chevron" class:collapsed>▸</span>
  {#if group.name}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="group-color-dot"
      style="background:{getGroupColorDot(group.name) ?? 'transparent'};{getGroupColorDot(group.name) ? '' : 'border:1.5px dashed #94a3b8'}"
      onclick={oncolorclick}
      title={m.table_color()}
    ></span>
  {/if}
  {#if editing && group.name}
    <input
      class="group-edit-input"
      type="text"
      value={editingName}
      oninput={(e) => oneditchange(e.currentTarget.value)}
      onkeydown={(e) => { if (e.key === 'Enter') oneditconfirm(); if (e.key === 'Escape') oneditcancel(); }}
      onblur={oneditconfirm}
      onclick={(e) => e.stopPropagation()}
      autofocus
    />
  {:else}
    <span class="group-label">{group.label}</span>
    {#if group.name && !permissionStore.isReadOnly}
      <button
        class="group-edit-btn"
        title={m.sidebar_rename_group()}
        onclick={oneditstart}
      >✎</button>
    {/if}
  {/if}
  <span class="group-count">{group.tables.length}</span>
</div>
