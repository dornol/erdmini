<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { COLUMN_TYPES } from '$lib/types/erd';
  import type { ColumnDomain, ColumnType } from '$lib/types/erd';
  import { exportDomainsToXlsx, exportDomainTemplate, importDomainsFromXlsx } from '$lib/utils/domain-xlsx';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';

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

  // Form fields for inline editing
  let formName = $state('');
  let formGroup = $state('');
  let formType = $state<ColumnType>('VARCHAR');
  let formLength = $state<number | undefined>(255);
  let formNullable = $state(false);
  let formPrimaryKey = $state(false);
  let formUnique = $state(false);
  let formAutoIncrement = $state(false);
  let formScale = $state<number | undefined>(undefined);
  let formCheck = $state('');
  let formEnumValues = $state('');
  let formDefaultValue = $state('');
  let formComment = $state('');

  // Upload result message
  let uploadMessage = $state('');
  let uploadMessageTimer: ReturnType<typeof setTimeout> | undefined;

  // File input ref
  let fileInput: HTMLInputElement | undefined = $state();

  // Collapsed groups
  let collapsedGroups = $state(new Set<string>());

  let hasLength = $derived(
    formType === 'VARCHAR' || formType === 'CHAR' || formType === 'DECIMAL',
  );
  let hasScale = $derived(formType === 'DECIMAL');
  let hasEnum = $derived(formType === 'ENUM');

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
        (d.group ?? '').toLowerCase().includes(q)
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

  function resetForm() {
    formName = '';
    formGroup = '';
    formType = 'VARCHAR';
    formLength = 255;
    formScale = undefined;
    formCheck = '';
    formEnumValues = '';
    formNullable = false;
    formPrimaryKey = false;
    formUnique = false;
    formAutoIncrement = false;
    formDefaultValue = '';
    formComment = '';
    editingId = null;
    addingNew = false;
  }

  function startEdit(domain: ColumnDomain) {
    editingId = domain.id;
    addingNew = false;
    formName = domain.name;
    formGroup = domain.group ?? '';
    formType = domain.type;
    formLength = domain.length;
    formScale = domain.scale;
    formCheck = domain.check ?? '';
    formEnumValues = domain.enumValues?.join(', ') ?? '';
    formNullable = domain.nullable;
    formPrimaryKey = domain.primaryKey;
    formUnique = domain.unique;
    formAutoIncrement = domain.autoIncrement;
    formDefaultValue = domain.defaultValue ?? '';
    formComment = domain.comment ?? '';
  }

  function startAdd() {
    resetForm();
    addingNew = true;
  }

  function parseEnumValues(raw: string): string[] | undefined {
    const vals = raw.split(',').map(v => v.trim()).filter(Boolean);
    return vals.length > 0 ? vals : undefined;
  }

  function saveEdit() {
    if (!formName.trim()) return;
    const fields = {
      name: formName.trim(),
      group: formGroup.trim() || undefined,
      type: formType,
      length: hasLength ? formLength : undefined,
      scale: hasScale ? formScale : undefined,
      check: formCheck.trim() || undefined,
      enumValues: hasEnum ? parseEnumValues(formEnumValues) : undefined,
      nullable: formNullable,
      primaryKey: formPrimaryKey,
      unique: formUnique,
      autoIncrement: formAutoIncrement,
      defaultValue: formDefaultValue || undefined,
      comment: formComment || undefined,
    };
    if (editingId) {
      erdStore.updateDomain(editingId, fields);
    } else if (addingNew) {
      erdStore.addDomain(fields);
    }
    resetForm();
  }

  function cancelEdit() {
    resetForm();
  }

  function handleRowKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  function handleRowClick(domain: ColumnDomain) {
    if (editingId === domain.id) return;
    // If we're already editing something else, save it first
    if (editingId || addingNew) {
      saveEdit();
    }
    startEdit(domain);
  }

  // Click outside to save
  function handleTableClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Check if click is on the modal but outside any editing row or display row
    if (
      (editingId || addingNew) &&
      !target.closest('.editing-row') &&
      !target.closest('.add-row') &&
      !target.closest('.display-row') &&
      !target.closest('.group-header-row')
    ) {
      saveEdit();
    }
  }

  // Excel
  function handleDownload() {
    exportDomainsToXlsx(erdStore.schema.domains);
  }

  async function handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const items = await importDomainsFromXlsx(file);
      const result = erdStore.upsertDomains(items);
      uploadMessage = m.domain_upload_result({
        added: String(result.added),
        updated: String(result.updated),
      });
      if (uploadMessageTimer) clearTimeout(uploadMessageTimer);
      uploadMessageTimer = setTimeout(() => {
        uploadMessage = '';
      }, 4000);
    } catch {
      uploadMessage = 'Error reading file';
      if (uploadMessageTimer) clearTimeout(uploadMessageTimer);
      uploadMessageTimer = setTimeout(() => {
        uploadMessage = '';
      }, 4000);
    }
    // Reset file input
    input.value = '';
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !editingId && !addingNew) onclose();
  }

  // Propagation field indicators
  const PROPAGATE_FIELDS = new Set([
    'type',
    'length',
    'scale',
    'nullable',
    'primaryKey',
    'unique',
    'autoIncrement',
    'defaultValue',
    'check',
    'enumValues',
  ]);

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
    <div class="sheet-handle"><span></span></div>
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
        <button
          class="header-icon-btn"
          onclick={handleDownload}
          title={m.domain_download_xlsx()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="header-icon-btn"
          onclick={() => fileInput?.click()}
          title={m.domain_upload_xlsx()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 10V2m0 0L5 5m3-3l3 3M3 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="template-link" onclick={exportDomainTemplate}>
          {m.domain_download_template()}
        </button>
        <input
          bind:this={fileInput}
          type="file"
          accept=".xlsx,.xls"
          class="hidden-input"
          onchange={handleUpload}
        />
        <button class="close-btn" onclick={onclose} aria-label={m.action_close()}>&#x2715;</button>
      </div>
    </div>

    {#if uploadMessage}
      <div class="upload-message">{uploadMessage}</div>
    {/if}

    <div class="modal-body">
      <div class="table-wrapper">
        <table class="domain-table">
          <thead>
            <tr>
              <th class="th-local" title={m.domain_local_hint()}>
                {m.domain_group()}
              </th>
              <th class="th-local" title={m.domain_local_hint()}>
                {m.column_name()}
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">{m.column_type()}</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">{m.column_length()}</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">NULL</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">PK</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">UQ</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">AI</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">{m.column_default()}</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">Scale</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">{m.column_check()}</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-propagate" title={m.domain_propagate_hint()}>
                <span class="th-label">ENUM</span>
                <span class="propagate-icon">&harr;</span>
              </th>
              <th class="th-local" title={m.domain_local_hint()}>
                {m.column_description()}
              </th>
              <th>{m.domain_actions()}</th>
            </tr>
          </thead>
          <tbody>
            {#if filteredDomains.length === 0}
              <tr>
                <td colspan={TABLE_COLSPAN} class="empty-cell">{m.domain_empty()}</td>
              </tr>
            {:else}
              {#each [...groupedDomains] as [groupKey, domains] (groupKey)}
                {#if hasMultipleGroups}
                  <!-- Group header row -->
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <tr class="group-header-row" onclick={() => toggleGroup(groupKey)}>
                    <td colspan={TABLE_COLSPAN}>
                      <span class="group-toggle">{collapsedGroups.has(groupKey) ? '▶' : '▼'}</span>
                      <span class="group-name">{groupKey === UNGROUPED_KEY ? m.domain_ungrouped() : groupKey}</span>
                      <span class="group-count">{domains.length}</span>
                    </td>
                  </tr>
                {/if}
                {#if !hasMultipleGroups || !collapsedGroups.has(groupKey)}
                  {#each domains as domain (domain.id)}
                    {@const usageCount = domainUsageMap.get(domain.id) ?? 0}
                    {#if editingId === domain.id}
                      <!-- Editing row -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <tr class="editing-row" onkeydown={handleRowKeydown}>
                        <td>
                          <input class="cell-input cell-group" type="text" bind:value={formGroup} placeholder={m.domain_group_placeholder()} list="domain-groups-list" />
                        </td>
                        <td><input class="cell-input" type="text" bind:value={formName} placeholder={m.domain_name_placeholder()} /></td>
                        <td class="td-type-cell">
                          <SearchableSelect
                            options={COLUMN_TYPES.map((t) => ({ value: t, label: t }))}
                            value={formType}
                            onchange={(v) => (formType = v as ColumnType)}
                            size="sm"
                          />
                        </td>
                        <td>
                          {#if hasLength}
                            <input class="cell-input cell-num" type="number" bind:value={formLength} min="1" max="65535" />
                          {:else}
                            <span class="td-mono">&mdash;</span>
                          {/if}
                        </td>
                        <td class="td-check"><input type="checkbox" bind:checked={formNullable} /></td>
                        <td class="td-check"><input type="checkbox" bind:checked={formPrimaryKey} /></td>
                        <td class="td-check"><input type="checkbox" bind:checked={formUnique} /></td>
                        <td class="td-check"><input type="checkbox" bind:checked={formAutoIncrement} /></td>
                        <td><input class="cell-input" type="text" bind:value={formDefaultValue} placeholder={m.optional()} /></td>
                        <td>
                          {#if hasScale}
                            <input class="cell-input cell-num" type="number" bind:value={formScale} min="0" max="30" />
                          {:else}
                            <span class="td-mono">&mdash;</span>
                          {/if}
                        </td>
                        <td><input class="cell-input" type="text" bind:value={formCheck} placeholder={m.column_check_placeholder()} /></td>
                        <td>
                          {#if hasEnum}
                            <input class="cell-input" type="text" bind:value={formEnumValues} placeholder="a, b, c" />
                          {:else}
                            <span class="td-mono">&mdash;</span>
                          {/if}
                        </td>
                        <td><input class="cell-input" type="text" bind:value={formComment} placeholder={m.optional()} /></td>
                        <td class="td-actions">
                          <button class="icon-btn save" onclick={saveEdit} disabled={!formName.trim()}>&#x2713;</button>
                          <button class="icon-btn" onclick={cancelEdit}>&#x2715;</button>
                        </td>
                      </tr>
                    {:else}
                      <!-- Display row -->
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <tr class="display-row" class:unused={usageCount === 0} onclick={() => handleRowClick(domain)}>
                        <td class="td-group">{domain.group ?? ''}</td>
                        <td class="td-name">
                          {domain.name}
                          {#if usageCount > 0}
                            <span class="usage-badge">{m.domain_usage_count({ count: String(usageCount) })}</span>
                          {:else}
                            <span class="usage-badge unused-badge">{m.domain_unused()}</span>
                          {/if}
                        </td>
                        <td class="td-mono">{domain.type}</td>
                        <td class="td-mono">{domain.length ?? '—'}</td>
                        <td class="td-null">{domain.nullable ? 'NULL' : 'NOT NULL'}</td>
                        <td class="td-badge">{#if domain.primaryKey}<span class="badge pk">PK</span>{/if}</td>
                        <td class="td-badge">{#if domain.unique}<span class="badge uq">UQ</span>{/if}</td>
                        <td class="td-badge">{#if domain.autoIncrement}<span class="badge ai">AI</span>{/if}</td>
                        <td class="td-mono td-optional">{domain.defaultValue ?? '—'}</td>
                        <td class="td-mono">{domain.scale != null ? domain.scale : '—'}</td>
                        <td class="td-mono td-optional">{domain.check ?? '—'}</td>
                        <td class="td-mono td-optional">{domain.enumValues?.join(', ') ?? '—'}</td>
                        <td class="td-comment">{domain.comment ?? '—'}</td>
                        <td class="td-actions">
                          <button
                            class="icon-btn del"
                            onclick={async (e) => {
                              e.stopPropagation();
                              const linkedCount = domainUsageMap.get(domain.id) ?? 0;
                              if (linkedCount > 0) {
                                const ok = await dialogStore.confirm(
                                  m.domain_delete_confirm({ name: domain.name, count: linkedCount }),
                                  { title: m.domain_delete(), confirmText: m.action_delete(), variant: 'danger' }
                                );
                                if (!ok) return;
                              }
                              erdStore.deleteDomain(domain.id);
                            }}
                            aria-label={m.domain_delete()}
                          >&#x2715;</button>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                {/if}
              {/each}
            {/if}

            <!-- Add new row -->
            {#if addingNew}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <tr class="editing-row add-row" onkeydown={handleRowKeydown}>
                <td>
                  <input class="cell-input cell-group" type="text" bind:value={formGroup} placeholder={m.domain_group_placeholder()} list="domain-groups-list" />
                </td>
                <td><input class="cell-input" type="text" bind:value={formName} placeholder={m.domain_name_placeholder()} /></td>
                <td class="td-type-cell">
                  <SearchableSelect
                    options={COLUMN_TYPES.map((t) => ({ value: t, label: t }))}
                    value={formType}
                    onchange={(v) => (formType = v as ColumnType)}
                    size="sm"
                  />
                </td>
                <td>
                  {#if hasLength}
                    <input class="cell-input cell-num" type="number" bind:value={formLength} min="1" max="65535" />
                  {:else}
                    <span class="td-mono">&mdash;</span>
                  {/if}
                </td>
                <td class="td-check"><input type="checkbox" bind:checked={formNullable} /></td>
                <td class="td-check"><input type="checkbox" bind:checked={formPrimaryKey} /></td>
                <td class="td-check"><input type="checkbox" bind:checked={formUnique} /></td>
                <td class="td-check"><input type="checkbox" bind:checked={formAutoIncrement} /></td>
                <td><input class="cell-input" type="text" bind:value={formDefaultValue} placeholder={m.optional()} /></td>
                <td>
                  {#if hasScale}
                    <input class="cell-input cell-num" type="number" bind:value={formScale} min="0" max="30" />
                  {:else}
                    <span class="td-mono">&mdash;</span>
                  {/if}
                </td>
                <td><input class="cell-input" type="text" bind:value={formCheck} placeholder={m.column_check_placeholder()} /></td>
                <td>
                  {#if hasEnum}
                    <input class="cell-input" type="text" bind:value={formEnumValues} placeholder="a, b, c" />
                  {:else}
                    <span class="td-mono">&mdash;</span>
                  {/if}
                </td>
                <td><input class="cell-input" type="text" bind:value={formComment} placeholder={m.optional()} /></td>
                <td class="td-actions">
                  <button class="icon-btn save" onclick={saveEdit} disabled={!formName.trim()}>&#x2713;</button>
                  <button class="icon-btn" onclick={cancelEdit}>&#x2715;</button>
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Datalist for group autocomplete -->
      <datalist id="domain-groups-list">
        {#each existingGroups as g}
          <option value={g}></option>
        {/each}
      </datalist>

    </div>
    {#if !addingNew}
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

  .sheet-handle {
    text-align: center;
    padding: 8px 0 0;
    flex-shrink: 0;
  }

  .sheet-handle span {
    display: inline-block;
    width: 36px;
    height: 4px;
    background: #cbd5e1;
    border-radius: 2px;
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

  .header-icon-btn {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 9px;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .header-icon-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
    border-color: #cbd5e1;
  }

  .template-link {
    background: none;
    border: none;
    font-size: 12px;
    color: #94a3b8;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }

  .template-link:hover {
    color: #3b82f6;
  }

  .hidden-input {
    display: none;
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
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .modal-body::-webkit-scrollbar {
    width: 6px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .modal-body::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  /* ── Domain table ── */
  .table-wrapper {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .table-wrapper::-webkit-scrollbar {
    height: 5px;
  }

  .table-wrapper::-webkit-scrollbar-track {
    background: transparent;
  }

  .table-wrapper::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .table-wrapper::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  .domain-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .domain-table thead th {
    background: #f1f5f9;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
    position: relative;
  }

  /* Propagation column headers */
  .th-propagate {
    border-bottom: 2px solid #3b82f6 !important;
  }

  .th-propagate .th-label {
    margin-right: 2px;
  }

  .propagate-icon {
    font-size: 9px;
    color: #3b82f6;
    vertical-align: middle;
  }

  .th-local {
    border-bottom: 1px solid #e2e8f0;
  }

  .domain-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
  }

  .domain-table tbody tr.display-row:hover {
    background: #f1f5f9;
    cursor: pointer;
  }

  .domain-table tbody tr.display-row.unused {
    opacity: 0.55;
  }

  .domain-table tbody tr.display-row.unused:hover {
    opacity: 0.85;
  }

  .domain-table tbody tr.editing-row {
    background: #eff6ff;
    outline: 2px solid #3b82f6;
    outline-offset: -1px;
  }

  .domain-table td {
    padding: 7px 10px;
    color: #1e293b;
    vertical-align: middle;
  }

  /* ── Group header row ── */
  .group-header-row {
    background: #f8fafc;
    cursor: pointer;
    user-select: none;
  }

  .group-header-row:hover {
    background: #f1f5f9;
  }

  .group-header-row td {
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
  }

  .group-toggle {
    font-size: 9px;
    margin-right: 6px;
    color: #94a3b8;
  }

  .group-name {
    letter-spacing: 0.02em;
  }

  .group-count {
    margin-left: 6px;
    background: #e2e8f0;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;
    padding: 0 5px;
    border-radius: 8px;
    line-height: 1.6;
    display: inline-block;
    min-width: 16px;
    text-align: center;
  }

  .td-group {
    color: #94a3b8;
    font-size: 11px;
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .td-name {
    font-weight: 600;
    white-space: nowrap;
  }

  .usage-badge {
    font-size: 9px;
    font-weight: 500;
    padding: 0 4px;
    border-radius: 3px;
    margin-left: 4px;
    background: #dbeafe;
    color: #1d4ed8;
    vertical-align: middle;
  }

  .unused-badge {
    background: #f1f5f9;
    color: #94a3b8;
  }

  .td-mono {
    font-family: monospace;
    color: #475569;
    white-space: nowrap;
  }

  .td-null {
    white-space: nowrap;
    color: #64748b;
    font-size: 11px;
  }

  .td-badge {
    text-align: center;
    width: 32px;
  }

  .td-check {
    text-align: center;
    width: 32px;
  }

  .td-optional {
    color: #94a3b8;
  }

  .td-comment {
    color: #64748b;
    font-style: italic;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .td-actions {
    display: flex;
    gap: 4px;
    white-space: nowrap;
  }

  /* Inline cell inputs */
  .cell-input {
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    padding: 5px 8px;
    font-size: 12px;
    color: #1e293b;
    outline: none;
    width: 100%;
    min-width: 50px;
    box-sizing: border-box;
    background: white;
  }

  .cell-input:focus {
    border-color: #3b82f6;
  }

  .cell-num {
    width: 85px;
  }

  .cell-group {
    width: 110px;
    min-width: 80px;
  }

  .td-type-cell {
    min-width: 130px;
  }

  .badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  .badge.pk {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
  }

  .badge.uq {
    background: #ede9fe;
    color: #6d28d9;
    border: 1px solid #c4b5fd;
  }

  .badge.ai {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }

  .empty-cell {
    text-align: center;
    padding: 20px;
    color: #94a3b8;
    font-size: 12px;
    font-style: italic;
  }

  .icon-btn {
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    color: #64748b;
    cursor: pointer;
  }

  .icon-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  .icon-btn.save {
    color: #16a34a;
    border-color: #bbf7d0;
  }

  .icon-btn.save:hover {
    background: #dcfce7;
    color: #15803d;
  }

  .icon-btn.save:disabled {
    color: #94a3b8;
    border-color: #e2e8f0;
    cursor: not-allowed;
  }

  .icon-btn.del:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
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
