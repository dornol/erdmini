<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { diffSchemas, type SchemaDiff } from '$lib/utils/schema-diff';
  import type { ERDSchema } from '$lib/types/erd';
  import * as m from '$lib/paraglide/messages';

  let { onclose }: { onclose: () => void } = $props();

  type SourceMode = 'history' | 'file';
  let sourceMode = $state<SourceMode>('history');
  let selectedHistoryIdx = $state<number>(-1);
  let uploadedSchema = $state<ERDSchema | null>(null);
  let uploadError = $state('');
  let diffResult = $state<SchemaDiff | null>(null);
  let expandedTables = $state<Set<string>>(new Set());

  let historyEntries = $derived(erdStore.historyEntries);

  function toggleTable(id: string) {
    const next = new Set(expandedTables);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedTables = next;
  }

  function doDiff() {
    let prevSchema: ERDSchema | null = null;

    if (sourceMode === 'history' && selectedHistoryIdx >= 0 && selectedHistoryIdx < historyEntries.length) {
      prevSchema = JSON.parse(historyEntries[selectedHistoryIdx].snap);
    } else if (sourceMode === 'file' && uploadedSchema) {
      prevSchema = uploadedSchema;
    }

    if (!prevSchema) return;

    const curr = JSON.parse(JSON.stringify($state.snapshot(erdStore.schema)));
    diffResult = diffSchemas(prevSchema, curr);
    // Expand all modified tables by default
    expandedTables = new Set(diffResult.modifiedTables.map((t) => t.tableId));
  }

  function handleFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (!data.tables) throw new Error('Invalid schema');
          uploadedSchema = data;
          uploadError = '';
        } catch {
          uploadError = 'Invalid JSON schema file';
          uploadedSchema = null;
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function historyLabel(entry: { label: string; detail: string; time: number }): string {
    const d = new Date(entry.time);
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return `${time} — ${entry.detail || entry.label}`;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={handleBackdrop}>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <span class="modal-title">{m.diff_title()}</span>
      <button class="close-btn" onclick={onclose}>✕</button>
    </div>

    <div class="modal-body">
      <!-- Source selection -->
      <div class="source-section">
        <div class="source-tabs">
          <button
            class="source-tab"
            class:active={sourceMode === 'history'}
            onclick={() => (sourceMode = 'history')}
          >{m.diff_from_history()}</button>
          <button
            class="source-tab"
            class:active={sourceMode === 'file'}
            onclick={() => (sourceMode = 'file')}
          >{m.diff_from_file()}</button>
        </div>

        {#if sourceMode === 'history'}
          <div class="source-body">
            {#if historyEntries.length === 0}
              <div class="source-empty">{m.history_empty()}</div>
            {:else}
              <select class="history-select" bind:value={selectedHistoryIdx}>
                <option value={-1}>{m.diff_select_history()}</option>
                {#each historyEntries.slice().reverse() as entry, ri}
                  {@const i = historyEntries.length - 1 - ri}
                  <option value={i}>{historyLabel(entry)}</option>
                {/each}
              </select>
            {/if}
          </div>
        {:else}
          <div class="source-body">
            <button class="btn-upload" onclick={handleFileUpload}>
              {uploadedSchema ? '✓ ' : ''}{m.diff_from_file()}
            </button>
            {#if uploadError}
              <span class="upload-error">{uploadError}</span>
            {/if}
          </div>
        {/if}

        <div class="source-target">
          → {m.diff_target()}
        </div>

        <button
          class="btn-compare"
          onclick={doDiff}
          disabled={(sourceMode === 'history' && selectedHistoryIdx < 0) || (sourceMode === 'file' && !uploadedSchema)}
        >
          {m.diff_compare()}
        </button>
      </div>

      <!-- Diff result -->
      {#if diffResult}
        <div class="diff-summary">
          {m.diff_summary({
            added: diffResult.summary.added,
            removed: diffResult.summary.removed,
            modified: diffResult.summary.modified,
          })}
        </div>

        <div class="diff-results">
          {#if diffResult.addedTables.length === 0 && diffResult.removedTables.length === 0 && diffResult.modifiedTables.length === 0}
            <div class="diff-no-changes">{m.diff_no_changes()}</div>
          {/if}

          {#each diffResult.addedTables as table}
            <div class="diff-table diff-added">
              <div class="diff-table-header">
                <span class="diff-badge added">+</span>
                <span class="diff-table-name">{table.name}</span>
                <span class="diff-tag added">{m.diff_added()}</span>
              </div>
            </div>
          {/each}

          {#each diffResult.removedTables as table}
            <div class="diff-table diff-removed">
              <div class="diff-table-header">
                <span class="diff-badge removed">-</span>
                <span class="diff-table-name">{table.name}</span>
                <span class="diff-tag removed">{m.diff_removed()}</span>
              </div>
            </div>
          {/each}

          {#each diffResult.modifiedTables as td}
            <div class="diff-table diff-modified">
              <button class="diff-table-header" onclick={() => toggleTable(td.tableId)}>
                <span class="diff-badge modified">~</span>
                <span class="diff-table-name">
                  {td.prevName ? `${td.prevName} → ` : ''}{td.tableName}
                </span>
                <span class="diff-tag modified">{m.diff_modified()}</span>
                <span class="diff-chevron">{expandedTables.has(td.tableId) ? '▾' : '▸'}</span>
              </button>

              {#if expandedTables.has(td.tableId)}
                <div class="diff-table-body">
                  {#if td.propertyChanges.length > 0}
                    {#each td.propertyChanges as change}
                      <div class="diff-change-row modified">{change}</div>
                    {/each}
                  {/if}

                  {#if td.addedColumns.length > 0 || td.removedColumns.length > 0 || td.modifiedColumns.length > 0}
                    <div class="diff-section-label">{m.diff_columns()}</div>
                    {#each td.addedColumns as col}
                      <div class="diff-change-row added">+ {col.name} ({col.type})</div>
                    {/each}
                    {#each td.removedColumns as col}
                      <div class="diff-change-row removed">- {col.name} ({col.type})</div>
                    {/each}
                    {#each td.modifiedColumns as cd}
                      <div class="diff-change-row modified">
                        ~ {cd.columnName}: {cd.changes.join(', ')}
                      </div>
                    {/each}
                  {/if}

                  {#if td.addedFKs.length > 0 || td.removedFKs.length > 0}
                    <div class="diff-section-label">FK</div>
                    {#each td.addedFKs as fk}
                      <div class="diff-change-row added">+ FK {fk.id.slice(0, 6)}</div>
                    {/each}
                    {#each td.removedFKs as fk}
                      <div class="diff-change-row removed">- FK {fk.id.slice(0, 6)}</div>
                    {/each}
                  {/if}

                  {#if td.addedIndexes.length > 0 || td.removedIndexes.length > 0}
                    <div class="diff-section-label">Index</div>
                    {#each td.addedIndexes as idx}
                      <div class="diff-change-row added">+ {idx.name || 'index'}</div>
                    {/each}
                    {#each td.removedIndexes as idx}
                      <div class="diff-change-row removed">- {idx.name || 'index'}</div>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--app-popup-bg, white);
    border-radius: 10px;
    box-shadow: var(--app-popup-shadow, 0 20px 60px rgba(0, 0, 0, 0.3));
    width: 600px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--app-text, #1e293b);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: var(--app-text-faint, #94a3b8);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--app-hover-bg, #f1f5f9);
    color: var(--app-text, #1e293b);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .source-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .source-tabs {
    display: flex;
    gap: 1px;
    background: var(--app-badge-bg, #f1f5f9);
    border-radius: 5px;
    padding: 2px;
    width: fit-content;
  }

  .source-tab {
    padding: 5px 12px;
    border: none;
    background: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
  }

  .source-tab.active {
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .source-body {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .source-empty {
    font-size: 12px;
    color: var(--app-text-muted, #64748b);
    font-style: italic;
  }

  .history-select {
    flex: 1;
    font-size: 12px;
    padding: 6px 8px;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 6px;
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
    outline: none;
  }

  .btn-upload {
    font-size: 12px;
    padding: 6px 14px;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 6px;
    background: none;
    color: var(--app-text-secondary, #475569);
    cursor: pointer;
  }

  .btn-upload:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .upload-error {
    font-size: 11px;
    color: #dc2626;
  }

  .source-target {
    font-size: 12px;
    color: var(--app-text-muted, #64748b);
    padding-left: 4px;
  }

  .btn-compare {
    align-self: flex-start;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-compare:hover {
    background: #2563eb;
  }

  .btn-compare:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .diff-summary {
    font-size: 13px;
    font-weight: 500;
    color: var(--app-text, #1e293b);
    padding: 8px 12px;
    background: var(--app-badge-bg, #f1f5f9);
    border-radius: 6px;
    border: 1px solid var(--app-border, #e2e8f0);
  }

  .diff-results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .diff-no-changes {
    font-size: 13px;
    color: var(--app-text-muted, #64748b);
    text-align: center;
    padding: 20px;
  }

  .diff-table {
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    overflow: hidden;
  }

  .diff-table-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  }

  .diff-table-header:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .diff-badge {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .diff-badge.added { background: #dcfce7; color: #16a34a; }
  .diff-badge.removed { background: #fee2e2; color: #dc2626; }
  .diff-badge.modified { background: #fef9c3; color: #ca8a04; }

  .diff-table-name {
    flex: 1;
    font-weight: 600;
    color: var(--app-text, #1e293b);
  }

  .diff-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .diff-tag.added { background: #dcfce7; color: #16a34a; }
  .diff-tag.removed { background: #fee2e2; color: #dc2626; }
  .diff-tag.modified { background: #fef9c3; color: #ca8a04; }

  .diff-chevron {
    font-size: 11px;
    color: var(--app-text-muted, #64748b);
    flex-shrink: 0;
  }

  .diff-table-body {
    padding: 4px 12px 8px;
    border-top: 1px solid var(--app-border, #e2e8f0);
  }

  .diff-section-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 0 2px;
  }

  .diff-change-row {
    font-size: 12px;
    padding: 3px 0;
    font-family: 'Menlo', monospace;
  }

  .diff-change-row.added { color: #16a34a; }
  .diff-change-row.removed { color: #dc2626; }
  .diff-change-row.modified { color: #ca8a04; }
</style>
