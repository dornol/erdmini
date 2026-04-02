<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import type { ColumnDomain } from '$lib/types/erd';
  import { buildDomainTree, type DomainTreeNode } from '$lib/utils/domain-hierarchy';
  import * as m from '$lib/paraglide/messages';
  import DomainCoverageDashboard from './DomainCoverageDashboard.svelte';
  import DomainEditForm from './DomainEditForm.svelte';
  import DomainListView from './domain/DomainListView.svelte';
  import DomainImportExport from './domain/DomainImportExport.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // Search & filter
  let searchQuery = $state('');
  let showUnusedOnly = $state(false);

  // Inline editing
  let editingId = $state<string | null>(null);
  let addingNew = $state(false);

  // Expanded detail row
  let expandedId = $state<string | null>(null);

  // Edit form ref
  let editFormRef = $state<ReturnType<typeof DomainEditForm> | null>(null);

  // Upload result message
  let uploadMessage = $state('');

  // Collapsed groups
  let collapsedGroups = $state(new Set<string>());

  // Usage count map: domainId -> number of linked columns
  let domainUsageMap = $derived.by(() => {
    const map = new Map<string, number>();
    for (const table of erdStore.schema.tables) {
      for (const col of table.columns) {
        if (col.domainId) {
          map.set(col.domainId, (map.get(col.domainId) ?? 0) + 1);
        }
      }
    }
    return map;
  });

  // Existing group names for autocomplete
  let existingGroups = $derived.by(() => {
    const groups = new Set<string>();
    for (const d of erdStore.schema.domains) {
      if (d.group) groups.add(d.group);
    }
    return [...groups].sort();
  });

  let filteredDomains = $derived.by(() => {
    let domains = erdStore.schema.domains;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      domains = domains.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        (d.comment ?? '').toLowerCase().includes(q) ||
        (d.group ?? '').toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        (d.alias ?? '').toLowerCase().includes(q) ||
        (d.owner ?? '').toLowerCase().includes(q) ||
        (d.tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Unused filter
    if (showUnusedOnly) {
      domains = domains.filter((d) => !domainUsageMap.has(d.id));
    }

    return domains;
  });

  // Group domains: Map<groupKey, ColumnDomain[]>, sorted by group name, ungrouped last
  const UNGROUPED_KEY = '__ungrouped__';

  let groupedDomains = $derived.by(() => {
    const groups = new Map<string, ColumnDomain[]>();
    for (const d of filteredDomains) {
      const key = d.group || UNGROUPED_KEY;
      const list = groups.get(key);
      if (list) {
        list.push(d);
      } else {
        groups.set(key, [d]);
      }
    }
    // Sort: named groups alphabetically, ungrouped last
    const sorted = new Map<string, ColumnDomain[]>();
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === UNGROUPED_KEY) return 1;
      if (b === UNGROUPED_KEY) return -1;
      return a.localeCompare(b);
    });
    for (const k of keys) {
      sorted.set(k, groups.get(k)!);
    }
    return sorted;
  });

  let hasMultipleGroups = $derived(groupedDomains.size > 1 || (groupedDomains.size === 1 && !groupedDomains.has(UNGROUPED_KEY)));

  function toggleGroup(key: string) {
    const next = new Set(collapsedGroups);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedGroups = next;
  }

  function startEdit(domain: ColumnDomain) {
    if (permissionStore.isReadOnly) return;
    editingId = domain.id;
    addingNew = false;
    editFormRef?.loadDomain(domain);
  }

  function startAdd() {
    if (permissionStore.isReadOnly) return;
    editFormRef?.resetForm();
    editingId = null;
    addingNew = true;
  }

  function handleFormReset() {
    editingId = null;
    addingNew = false;
  }

  function handleRowClick(domain: ColumnDomain) {
    if (editingId === domain.id) return;
    if (editingId || addingNew) {
      editFormRef?.saveEdit();
    }
    startEdit(domain);
  }

  function handleTableClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      (editingId || addingNew) &&
      !target.closest('.editing-row') &&
      !target.closest('.add-row') &&
      !target.closest('.display-row') &&
      !target.closest('.group-header-row')
    ) {
      editFormRef?.saveEdit();
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !editingId && !addingNew) onclose();
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  // Domain tree for hierarchy display
  let domainTree = $derived(buildDomainTree(filteredDomains));

  // Flatten the tree to get display order with depth info
  function flattenTree(nodes: DomainTreeNode[]): { domain: ColumnDomain; depth: number; effective: ColumnDomain }[] {
    const result: { domain: ColumnDomain; depth: number; effective: ColumnDomain }[] = [];
    function walk(nodes: DomainTreeNode[]) {
      for (const node of nodes) {
        result.push({ domain: node.domain, depth: node.depth, effective: node.effectiveDomain });
        walk(node.children);
      }
    }
    walk(nodes);
    return result;
  }

  let flatDomains = $derived(flattenTree(domainTree));

  // Map from domain ID to depth for indent
  let depthMap = $derived.by(() => {
    const map = new Map<string, number>();
    for (const item of flatDomains) {
      map.set(item.domain.id, item.depth);
    }
    return map;
  });

  const TABLE_COLSPAN = 14;
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="backdrop"
  role="dialog"
  aria-modal="true"
  aria-label={m.domain_modal_title()}
  tabindex="-1"
  onclick={onBackdropClick}
  onkeydown={(e) => {
    if (e.key === 'Escape' && !editingId && !addingNew) onclose();
  }}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal" onclick={handleTableClick} onkeydown={() => {}}>
    <div class="modal-header">
      <span class="modal-title">{m.domain_modal_title()}</span>
      <div class="header-controls">
        <input
          class="search-input"
          type="text"
          placeholder={m.domain_search_placeholder()}
          bind:value={searchQuery}
        />
        <button
          class="unused-toggle"
          class:active={showUnusedOnly}
          onclick={() => showUnusedOnly = !showUnusedOnly}
          title={m.domain_show_unused_only()}
        >
          {m.domain_show_unused_only()}
        </button>
        <DomainImportExport
          {uploadMessage}
          onUploadMessageChange={(msg) => uploadMessage = msg}
        />
        <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>&#x2715;</button>
      </div>
    </div>

    {#if uploadMessage}
      <div class="upload-message">{uploadMessage}</div>
    {/if}

    <div class="modal-body thin-scrollbar">
      <!-- Coverage dashboard -->
      <DomainCoverageDashboard />

      <DomainListView
        {filteredDomains}
        {groupedDomains}
        {hasMultipleGroups}
        {domainUsageMap}
        {depthMap}
        {existingGroups}
        {collapsedGroups}
        {editingId}
        {addingNew}
        {expandedId}
        tableColspan={TABLE_COLSPAN}
        bind:editFormRef
        onToggleGroup={toggleGroup}
        onRowClick={handleRowClick}
        onToggleExpanded={toggleExpanded}
        onFormReset={handleFormReset}
      />
    </div>
    {#if !addingNew && !permissionStore.isReadOnly}
      <div class="modal-footer">
        <button class="add-btn" onclick={startAdd}>{m.domain_add_btn()}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .modal {
    background: white;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.15);
    width: 100%;
    height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
    gap: 12px;
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
    white-space: nowrap;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    justify-content: flex-end;
  }

  .search-input {
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 12px;
    font-size: 13px;
    color: #1e293b;
    outline: none;
    width: 240px;
    background: #f8fafc;
  }

  .search-input:focus {
    border-color: #3b82f6;
    background: white;
  }

  .unused-toggle {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 5px 10px;
    font-size: 12px;
    color: #94a3b8;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .unused-toggle:hover {
    border-color: #cbd5e1;
    color: #64748b;
  }

  .unused-toggle.active {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 16px;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #ef4444;
    background: #fee2e2;
  }

  .upload-message {
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 12px;
    padding: 6px 18px;
    border-bottom: 1px solid #dbeafe;
  }

  .modal-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .modal-footer {
    padding: 10px 18px;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
  }

  .add-btn {
    background: none;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    padding: 10px;
    font-size: 13px;
    color: #64748b;
    cursor: pointer;
    width: 100%;
    transition: border-color 0.15s, color 0.15s;
  }

  .add-btn:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
</style>
