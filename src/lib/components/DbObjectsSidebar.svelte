<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import * as m from '$lib/paraglide/messages';

  let collapsedCategories = $state<Set<string>>(new Set());
  let addingCategory = $state(false);
  let newCategoryName = $state('');
  let renamingCategory = $state<string | null>(null);
  let renameCategoryValue = $state('');
  let searchQuery = $state('');

  let categories = $derived(erdStore.schema.dbObjectCategories ?? []);
  let allObjects = $derived(erdStore.schema.dbObjects ?? []);

  function filteredObjects(category: string) {
    const objs = allObjects.filter((o) => o.category === category);
    const sorted = objs.sort((a, b) => a.name.localeCompare(b.name));
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((o) => o.name.toLowerCase().includes(q) || o.comment?.toLowerCase().includes(q));
  }

  function toggleCategory(cat: string) {
    const next = new Set(collapsedCategories);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    collapsedCategories = next;
  }

  function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    erdStore.addDbObjectCategory(name);
    newCategoryName = '';
    addingCategory = false;
  }

  function startRenameCategory(cat: string) {
    renamingCategory = cat;
    renameCategoryValue = cat;
  }

  function finishRenameCategory() {
    if (renamingCategory && renameCategoryValue.trim() && renameCategoryValue.trim() !== renamingCategory) {
      erdStore.renameDbObjectCategory(renamingCategory, renameCategoryValue.trim());
    }
    renamingCategory = null;
  }

  async function handleDeleteCategory(cat: string) {
    const ok = await dialogStore.confirm(m.db_object_category_delete_confirm({ name: cat }), {
      title: m.db_object_category_delete(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) erdStore.deleteDbObjectCategory(cat);
  }

  function addObject(category: string) {
    const obj = erdStore.addDbObject(category);
    erdStore.selectedTableId = null;
    erdStore.selectedTableIds = new Set();
    erdStore.selectedMemoId = null;
    erdStore.selectedDbObjectId = obj.id;
  }

  async function handleDeleteObject(objectId: string, name: string) {
    const ok = await dialogStore.confirm(m.db_object_delete_confirm({ name }), {
      title: m.db_object_delete(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) erdStore.deleteDbObject(objectId);
  }

  function selectObject(objectId: string) {
    erdStore.selectedTableId = null;
    erdStore.selectedTableIds = new Set();
    erdStore.selectedMemoId = null;
    erdStore.selectedDbObjectId = erdStore.selectedDbObjectId === objectId ? null : objectId;
  }


</script>

<div class="db-objects-sidebar">
  <div class="object-list thin-scrollbar">
  <!-- Search -->
  <div class="search-row">
    <input
      class="search-input"
      type="text"
      placeholder={m.search_placeholder()}
      bind:value={searchQuery}
    />
  </div>

  <!-- Categories -->
  {#each categories as cat (cat)}
    {@const objs = filteredObjects(cat)}
    <div class="category-group">
      <div class="category-header">
        <button class="category-toggle" onclick={() => toggleCategory(cat)}>
          <span class="chevron" class:collapsed={collapsedCategories.has(cat)}>▾</span>
          {#if renamingCategory === cat}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="category-rename-input"
              type="text"
              bind:value={renameCategoryValue}
              onkeydown={(e) => { if (e.key === 'Enter') finishRenameCategory(); if (e.key === 'Escape') renamingCategory = null; }}
              onblur={finishRenameCategory}
              onclick={(e) => e.stopPropagation()}
              autofocus
            />
          {:else}
            <span class="category-name">{cat}</span>
            <span class="category-count">{objs.length}</span>
          {/if}
        </button>
        {#if !permissionStore.isReadOnly && renamingCategory !== cat}
          <button class="cat-add-btn" title={m.db_object_add()} onclick={() => addObject(cat)}>+</button>
          <div class="category-actions">
            <button class="cat-action-btn" title={m.db_object_category_rename()} onclick={() => startRenameCategory(cat)}>✎</button>
            <button class="cat-action-btn cat-action-delete" title={m.db_object_category_delete()} onclick={() => handleDeleteCategory(cat)}>✕</button>
          </div>
        {/if}
      </div>

      {#if !collapsedCategories.has(cat)}
        {#if objs.length === 0}
          <div class="empty-hint">{m.db_object_no_items()}</div>
        {:else}
          {#each objs as obj (obj.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="object-item"
              class:active={erdStore.selectedDbObjectId === obj.id}
              onclick={() => selectObject(obj.id)}
            >
              <span class="object-name">{obj.name}</span>
              {#if obj.includeInDdl}
                <span class="ddl-badge" title={m.db_object_include_ddl()}>DDL</span>
              {/if}
              {#if !permissionStore.isReadOnly}
                <button
                  class="object-delete-btn"
                  title={m.db_object_delete()}
                  onclick={(e) => { e.stopPropagation(); handleDeleteObject(obj.id, obj.name); }}
                >✕</button>
              {/if}
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  {/each}

  {#if categories.length === 0 && !addingCategory}
    <div class="empty-state">{m.db_object_no_items()}</div>
  {/if}

  <!-- Add category -->
  {#if !permissionStore.isReadOnly}
    {#if addingCategory}
      <div class="add-category-row">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="category-input"
          type="text"
          placeholder={m.db_object_category_placeholder()}
          bind:value={newCategoryName}
          onkeydown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { addingCategory = false; newCategoryName = ''; } }}
          autofocus
        />
        <button class="add-confirm-btn" onclick={handleAddCategory}>✓</button>
      </div>
    {:else}
      <button class="add-category-btn" onclick={() => (addingCategory = true)}>
        + {m.db_object_category_add()}
      </button>
    {/if}
  {/if}

  </div><!-- /object-list -->
</div>

<style>
  .db-objects-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .object-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    min-height: 60px;
  }

  .search-row {
    padding: 0 10px 8px;
  }

  .search-input {
    width: 100%;
    padding: 5px 8px;
    background: var(--app-card-bg, white);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 5px;
    color: var(--app-text, #334155);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: #3b82f6;
  }

  .category-group {
    margin-bottom: 2px;
  }

  .category-header {
    display: flex;
    align-items: center;
    padding: 4px 10px;
  }

  .category-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--app-text-muted, #64748b);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 0;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .chevron {
    font-size: 10px;
    transition: transform 0.15s;
    width: 12px;
    text-align: center;
  }

  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .category-count {
    color: var(--app-text-faint, #94a3b8);
    font-size: 10px;
    font-weight: 400;
    margin-left: 4px;
  }

  .cat-add-btn {
    background: none;
    border: 1px solid var(--app-border, #e2e8f0);
    color: var(--app-text-muted, #64748b);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    padding: 0 5px;
    border-radius: 4px;
    line-height: 1;
    flex-shrink: 0;
  }

  .cat-add-btn:hover {
    color: #3b82f6;
    border-color: #3b82f6;
  }

  .category-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .category-header:hover .category-actions {
    opacity: 1;
  }

  .cat-action-btn {
    background: none;
    border: none;
    color: var(--app-text-faint, #94a3b8);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .cat-action-btn:hover {
    color: var(--app-text, #334155);
    background: var(--app-hover-bg, #f1f5f9);
  }

  .cat-action-delete:hover {
    color: #f87171;
  }

  .category-rename-input {
    flex: 1;
    background: var(--app-card-bg, white);
    border: 1px solid #3b82f6;
    border-radius: 3px;
    color: var(--app-text, #334155);
    font-size: 12px;
    padding: 1px 4px;
    outline: none;
  }

  .object-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 10px 4px 28px;
    background: none;
    border: none;
    color: var(--app-text, #334155);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .object-item:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .object-item.active {
    background: var(--app-active-bg, #eff6ff);
    color: #60a5fa;
  }

  .object-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ddl-badge {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 3px;
    background: #1e3a5f;
    color: #60a5fa;
    font-weight: 600;
    flex-shrink: 0;
  }

  .object-delete-btn {
    display: none;
    background: none;
    border: none;
    color: #64748b;
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .object-item:hover .object-delete-btn {
    display: block;
  }

  .object-delete-btn:hover {
    color: #f87171;
  }

  .empty-hint {
    padding: 4px 28px;
    font-size: 11px;
    color: var(--app-text-faint, #94a3b8);
  }

  .empty-state {
    padding: 20px 10px;
    text-align: center;
    font-size: 12px;
    color: var(--app-text-faint, #94a3b8);
  }

  .add-category-btn {
    margin: 8px 10px;
    padding: 5px 8px;
    background: none;
    border: 1px dashed var(--app-border, #e2e8f0);
    border-radius: 5px;
    color: var(--app-text-faint, #94a3b8);
    font-size: 12px;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
  }

  .add-category-btn:hover {
    border-color: #3b82f6;
    color: #60a5fa;
  }

  .add-category-row {
    display: flex;
    gap: 4px;
    padding: 4px 10px;
  }

  .category-input {
    flex: 1;
    padding: 4px 8px;
    background: var(--app-card-bg, white);
    border: 1px solid #3b82f6;
    border-radius: 5px;
    color: var(--app-text, #334155);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .add-confirm-btn {
    background: #3b82f6;
    border: none;
    color: white;
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .add-confirm-btn:hover {
    background: #2563eb;
  }

</style>
