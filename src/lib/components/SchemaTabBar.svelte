<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import * as m from '$lib/paraglide/messages';

  let addingSchema = $state(false);
  let newSchemaName = $state('');
  let inputEl = $state<HTMLInputElement | undefined>();

  let renamingSchema = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputEl = $state<HTMLInputElement | undefined>();

  function switchSchema(name: string) {
    canvasState.schemaViewports[canvasState.activeSchema] = {
      x: canvasState.x,
      y: canvasState.y,
      scale: canvasState.scale,
    };
    canvasState.activeSchema = name;
    const saved = canvasState.schemaViewports[name];
    if (saved) {
      canvasState.x = saved.x;
      canvasState.y = saved.y;
      canvasState.scale = saved.scale;
    }
    // 선택 해제
    erdStore.selectedTableId = null;
    erdStore.selectedTableIds = new Set();
    erdStore.selectedMemoId = null;
    erdStore.selectedMemoIds = new Set();
  }

  async function startAdd() {
    addingSchema = true;
    newSchemaName = '';
    await Promise.resolve();
    setTimeout(() => inputEl?.focus(), 0);
  }

  function commitAdd() {
    const name = newSchemaName.trim();
    if (name && !permissionStore.isReadOnly) {
      erdStore.addSchema(name);
      switchSchema(name);
    }
    addingSchema = false;
    newSchemaName = '';
  }

  function cancelAdd() {
    addingSchema = false;
    newSchemaName = '';
  }

  function onAddKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelAdd(); }
  }

  async function startRename(name: string, e: MouseEvent) {
    e.stopPropagation();
    if (permissionStore.isReadOnly) return;
    renamingSchema = name;
    renameValue = name;
    await Promise.resolve();
    setTimeout(() => renameInputEl?.select(), 0);
  }

  function commitRename() {
    const newName = renameValue.trim();
    if (newName && renamingSchema) {
      const old = renamingSchema;
      erdStore.renameSchema(old, newName);
      if (canvasState.activeSchema === old) canvasState.activeSchema = newName;
    }
    renamingSchema = null;
  }

  function cancelRename() {
    renamingSchema = null;
  }

  function onRenameKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
  }

  async function deleteSchema(name: string, e: MouseEvent) {
    e.stopPropagation();
    if (permissionStore.isReadOnly) return;
    erdStore.deleteSchema(name);
    if (canvasState.activeSchema === name) {
      switchSchema('(all)');
    }
  }
</script>

<div class="schema-tab-bar">
  <button
    class="schema-tab"
    class:active={canvasState.activeSchema === '(all)'}
    onclick={() => switchSchema('(all)')}
  >
    {m.schema_tab_all()}
  </button>

  {#each (erdStore.schema.schemas ?? []) as schemaName (schemaName)}
    <div class="schema-tab-wrapper">
      {#if renamingSchema === schemaName}
        <input
          bind:this={renameInputEl}
          class="schema-tab-input"
          bind:value={renameValue}
          onblur={commitRename}
          onkeydown={onRenameKeyDown}
          onclick={(e) => e.stopPropagation()}
        />
      {:else}
        <button
          class="schema-tab"
          class:active={canvasState.activeSchema === schemaName}
          onclick={() => switchSchema(schemaName)}
          ondblclick={(e) => startRename(schemaName, e)}
        >
          {schemaName}
        </button>
        {#if !permissionStore.isReadOnly}
          <button
            class="schema-tab-delete"
            title={m.schema_delete()}
            onclick={(e) => deleteSchema(schemaName, e)}
          >×</button>
        {/if}
      {/if}
    </div>
  {/each}

  {#if addingSchema}
    <input
      bind:this={inputEl}
      class="schema-tab-input"
      bind:value={newSchemaName}
      placeholder={m.schema_name_placeholder()}
      onblur={commitAdd}
      onkeydown={onAddKeyDown}
    />
  {:else if !permissionStore.isReadOnly}
    <button class="schema-tab-add" onclick={startAdd} title={m.schema_add()}>+</button>
  {/if}
</div>

<style>
  .schema-tab-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 12px;
    height: 32px;
    background: var(--app-panel-bg);
    border-bottom: 1px solid var(--app-border);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .schema-tab-bar::-webkit-scrollbar {
    display: none;
  }

  .schema-tab-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .schema-tab {
    height: 26px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
    background: transparent;
    color: var(--app-text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
    border-bottom: none;
    margin-bottom: -1px;
  }

  .schema-tab:hover {
    color: var(--app-text);
    background: var(--app-hover-bg);
  }

  .schema-tab.active {
    color: var(--app-text);
    background: var(--app-card-bg, white);
    border-color: var(--app-border);
    border-bottom-color: var(--app-card-bg, white);
    font-weight: 600;
  }

  .schema-tab-delete {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    background: none;
    border: none;
    color: var(--app-text-muted);
    font-size: 12px;
    cursor: pointer;
    opacity: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    padding: 0;
    line-height: 1;
    transition: opacity 0.12s;
  }

  .schema-tab-wrapper:hover .schema-tab-delete {
    opacity: 0.6;
  }

  .schema-tab-wrapper:hover .schema-tab {
    padding-right: 20px;
  }

  .schema-tab-delete:hover {
    opacity: 1 !important;
    color: #ef4444;
    background: rgba(239,68,68,0.1);
  }

  .schema-tab-add {
    height: 26px;
    width: 26px;
    border: 1px dashed var(--app-border);
    border-radius: 4px;
    background: transparent;
    color: var(--app-text-muted);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
    margin-left: 4px;
    flex-shrink: 0;
  }

  .schema-tab-add:hover {
    color: var(--app-text);
    border-color: var(--app-text-muted);
    background: var(--app-hover-bg);
  }

  .schema-tab-input {
    height: 26px;
    padding: 0 8px;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    background: var(--app-input-bg);
    color: var(--app-text);
    font-size: 12px;
    outline: none;
    min-width: 80px;
    max-width: 120px;
    margin-left: 4px;
  }
</style>
