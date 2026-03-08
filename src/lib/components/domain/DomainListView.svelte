<script lang="ts">
  import type { ColumnDomain } from '$lib/types/erd';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import DomainEditForm from '../DomainEditForm.svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    filteredDomains: ColumnDomain[];
    groupedDomains: Map<string, ColumnDomain[]>;
    hasMultipleGroups: boolean;
    domainUsageMap: Map<string, number>;
    depthMap: Map<string, number>;
    existingGroups: string[];
    collapsedGroups: Set<string>;
    editingId: string | null;
    addingNew: boolean;
    expandedId: string | null;
    tableColspan: number;
    editFormRef: ReturnType<typeof DomainEditForm> | null;
    onToggleGroup: (key: string) => void;
    onRowClick: (domain: ColumnDomain) => void;
    onToggleExpanded: (id: string) => void;
    onFormReset: () => void;
  }

  let {
    filteredDomains,
    groupedDomains,
    hasMultipleGroups,
    domainUsageMap,
    depthMap,
    existingGroups,
    collapsedGroups,
    editingId,
    addingNew,
    expandedId,
    tableColspan,
    editFormRef = $bindable(),
    onToggleGroup,
    onRowClick,
    onToggleExpanded,
    onFormReset,
  }: Props = $props();

  const UNGROUPED_KEY = '__ungrouped__';

  function hasDocs(d: ColumnDomain): boolean {
    return !!(d.description || d.alias || d.dataStandard || d.example || d.validRange || d.owner || (d.tags && d.tags.length > 0));
  }
</script>

<div class="table-wrapper thin-scrollbar">
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
          <td colspan={tableColspan} class="empty-cell">{m.domain_empty()}</td>
        </tr>
      {:else}
        {#each [...groupedDomains] as [groupKey, domains] (groupKey)}
          {#if hasMultipleGroups}
            <!-- Group header row -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <tr class="group-header-row" onclick={() => onToggleGroup(groupKey)}>
              <td colspan={tableColspan}>
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
                <DomainEditForm
                  bind:this={editFormRef}
                  {editingId}
                  {addingNew}
                  {existingGroups}
                  tableColspan={tableColspan}
                  onreset={onFormReset}
                />
              {:else}
                <!-- Display row -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <tr class="display-row" class:unused={usageCount === 0} onclick={() => onRowClick(domain)}>
                  <td class="td-group">{domain.group ?? ''}</td>
                  <td class="td-name" style="padding-left: {10 + (depthMap.get(domain.id) ?? 0) * 20}px">
                    {#if domain.parentId}
                      <span class="hierarchy-indent">↳</span>
                    {/if}
                    {domain.name}
                    {#if usageCount > 0}
                      <span class="usage-badge">{m.domain_usage_count({ count: String(usageCount) })}</span>
                    {:else}
                      <span class="usage-badge unused-badge">{m.domain_unused()}</span>
                    {/if}
                    {#if hasDocs(domain)}
                      <button class="doc-icon" title={m.domain_has_docs()} onclick={(e) => { e.stopPropagation(); onToggleExpanded(domain.id); }}>&#x1F4CB;</button>
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
                    {#if !permissionStore.isReadOnly}<button
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
                    >&#x2715;</button>{/if}
                  </td>
                </tr>
                {#if expandedId === domain.id}
                  <tr class="detail-row">
                    <td colspan={tableColspan}>
                      <div class="detail-grid">
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_description()}</span>
                          <span class="detail-value">{domain.description || '—'}</span>
                        </div>
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_alias()}</span>
                          <span class="detail-value">{domain.alias || '—'}</span>
                        </div>
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_data_standard()}</span>
                          <span class="detail-value">{domain.dataStandard || '—'}</span>
                        </div>
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_example()}</span>
                          <span class="detail-value">{domain.example || '—'}</span>
                        </div>
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_valid_range()}</span>
                          <span class="detail-value">{domain.validRange || '—'}</span>
                        </div>
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_owner()}</span>
                          <span class="detail-value">{domain.owner || '—'}</span>
                        </div>
                        <div class="detail-field">
                          <span class="detail-label">{m.domain_tags()}</span>
                          <span class="detail-value">{domain.tags?.join(', ') || '—'}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                {/if}
              {/if}
            {/each}
          {/if}
        {/each}
      {/if}

      <!-- Add new row -->
      {#if addingNew}
        <DomainEditForm
          bind:this={editFormRef}
          {editingId}
          {addingNew}
          {existingGroups}
          tableColspan={tableColspan}
          onreset={onFormReset}
        />
      {/if}
    </tbody>
  </table>
</div>

<style>
  /* ── Domain table ── */
  .table-wrapper {
    overflow-x: auto;
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

  .domain-table tbody :global(tr.editing-row) {
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

  .domain-table :global(.td-check) {
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
  .domain-table :global(.cell-input) {
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

  .domain-table :global(.cell-input:focus) {
    border-color: #3b82f6;
  }

  .domain-table :global(.cell-num) {
    width: 85px;
  }

  .domain-table :global(.cell-group) {
    width: 110px;
    min-width: 80px;
  }

  .domain-table :global(.td-type-cell) {
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

  .domain-table :global(.icon-btn.save) {
    color: #16a34a;
    border-color: #bbf7d0;
  }

  .domain-table :global(.icon-btn.save:hover) {
    background: #dcfce7;
    color: #15803d;
  }

  .domain-table :global(.icon-btn.save:disabled) {
    color: #94a3b8;
    border-color: #e2e8f0;
    cursor: not-allowed;
  }

  .icon-btn.del:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
  }

  /* Documentation detail row */
  .detail-row {
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .detail-row td {
    padding: 10px 14px !important;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
  }

  .domain-table :global(.detail-grid.editing) {
    gap: 6px 12px;
  }

  .detail-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .domain-table :global(.detail-field.wide) {
    grid-column: 1 / -1;
  }

  .domain-table :global(.detail-field label),
  .detail-field .detail-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .detail-value {
    font-size: 12px;
    color: #475569;
    word-break: break-word;
  }

  .domain-table :global(.detail-edit-row) {
    outline: none !important;
    border-top: none;
  }

  .domain-table :global(.detail-edit-row td) {
    padding-top: 0 !important;
  }

  .domain-table :global(.cell-textarea) {
    resize: vertical;
    font-family: inherit;
    min-height: 36px;
  }

  .doc-icon {
    background: none;
    border: none;
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
    vertical-align: middle;
    opacity: 0.6;
    line-height: 1;
  }

  .doc-icon:hover {
    opacity: 1;
  }

  .hierarchy-indent {
    color: #94a3b8;
    font-size: 11px;
    margin-right: 2px;
  }
</style>
