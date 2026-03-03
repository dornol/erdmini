<script lang="ts">
  import { untrack } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import type { Dialect } from '$lib/types/erd';
  import { exportDDL, DEFAULT_DDL_OPTIONS, getDefaultQuoteStyle, type DDLExportOptions } from '$lib/utils/ddl-export';
  import { exportMermaid, exportPlantUML } from '$lib/utils/diagram-export';
  import { importDDL, type DDLImportMessages } from '$lib/utils/ddl-import';
  import { computeLayout } from '$lib/utils/auto-layout';
  import { sanitizeFilename, now } from '$lib/utils/common';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';

  let {
    mode = 'export',
    onclose,
  }: {
    mode: 'import' | 'export';
    onclose: () => void;
  } = $props();

  let activeTab = $state<'import' | 'export'>(untrack(() => mode));

  type ExportFormat = 'ddl' | 'mermaid' | 'plantuml';

  const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
    { value: 'ddl', label: 'DDL' },
    { value: 'mermaid', label: 'Mermaid' },
    { value: 'plantuml', label: 'PlantUML' },
  ];

  const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
    { value: 'mysql', label: 'MySQL' },
    { value: 'postgresql', label: 'PostgreSQL' },
    { value: 'mariadb', label: 'MariaDB' },
    { value: 'mssql', label: 'MSSQL' },
  ];

  // Export state
  let exportFormat = $state<ExportFormat>('ddl');
  let exportDialect = $state<Dialect>('mysql');
  let showDdlOptions = $state(false);

  // Load saved DDL options from localStorage
  function loadDdlOptions(): DDLExportOptions {
    try {
      const saved = localStorage.getItem('erdmini_ddl_options');
      if (saved) return { ...DEFAULT_DDL_OPTIONS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return { ...DEFAULT_DDL_OPTIONS };
  }
  let ddlOptions = $state<DDLExportOptions>(loadDdlOptions());

  // Save DDL options when changed
  $effect(() => {
    localStorage.setItem('erdmini_ddl_options', JSON.stringify(ddlOptions));
  });

  let exportText = $derived.by(() => {
    if (exportFormat === 'mermaid') return exportMermaid(erdStore.schema);
    if (exportFormat === 'plantuml') return exportPlantUML(erdStore.schema);
    return exportDDL(erdStore.schema, exportDialect, { ...ddlOptions, quoteStyle: ddlOptions.quoteStyle === 'none' ? 'none' : ddlOptions.quoteStyle || getDefaultQuoteStyle(exportDialect) });
  });
  let copyLabel = $state<'copy' | 'copied'>('copy');

  // Import state
  let importDialect = $state<Dialect>('mysql');
  let importText = $state('');
  let importErrors = $state<string[]>([]);
  let importWarnings = $state<string[]>([]);
  let importSuccess = $state<string | null>(null);
  let importing = $state(false);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(exportText);
    copyLabel = 'copied';
    setTimeout(() => (copyLabel = 'copy'), 1500);
  }

  function downloadFile() {
    const projName = sanitizeFilename(projectStore.activeProject?.name ?? 'schema');
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    if (exportFormat === 'mermaid') {
      a.download = `erdmini_${projName}.mmd`;
    } else if (exportFormat === 'plantuml') {
      a.download = `erdmini_${projName}.puml`;
    } else {
      a.download = `erdmini_${projName}_${exportDialect}.sql`;
    }
    a.click();
    URL.revokeObjectURL(url);
  }

  function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        importText = (e.target?.result as string) ?? '';
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function doImport() {
    importErrors = [];
    importWarnings = [];
    importSuccess = null;
    importing = true;

    try {
      const importMessages: DDLImportMessages = {
        noCreateTable: () => m.ddl_import_no_create_table(),
        tableParseError: (p) => m.ddl_import_table_parse_error(p),
        fkResolveFailed: (p) => m.ddl_import_fk_resolve_failed(p),
      };
      const result = await importDDL(importText, importDialect, importMessages);
      if (result.errors.length > 0) {
        importErrors = result.errors;
      }
      if (result.warnings.length > 0) {
        importWarnings = result.warnings;
      }
      if (result.tables.length > 0) {
        // Build name→existing table id map
        const nameToExistingId = new Map<string, string>();
        for (const t of erdStore.schema.tables) {
          nameToExistingId.set(t.name, t.id);
        }

        // Find duplicates
        const duplicateNames = result.tables
          .filter((t) => nameToExistingId.has(t.name))
          .map((t) => t.name);

        let action: string | null = null;
        if (duplicateNames.length > 0) {
          action = await dialogStore.choice(
            m.import_duplicate_message({ count: duplicateNames.length, names: duplicateNames.join(', ') }),
            {
              title: m.import_duplicate_title(),
              choices: [
                { key: 'overwrite', label: m.import_overwrite(), variant: 'danger' },
                { key: 'skip', label: m.import_skip(), variant: 'default' },
              ],
            },
          );
          if (action === null) {
            // User cancelled
            importing = false;
            return;
          }
        }

        const duplicateSet = new Set(duplicateNames);
        // Build name→new id map for imported tables
        const nameToNewId = new Map<string, string>();
        for (const t of result.tables) {
          nameToNewId.set(t.name, t.id);
        }

        if (action === 'overwrite') {
          // Remove existing duplicate tables and add all imported tables
          const oldIdsToRemove = new Set(
            duplicateNames.map((n) => nameToExistingId.get(n)!),
          );
          // Build old→new id mapping for FK re-linking
          const oldToNewId = new Map<string, string>();
          for (const name of duplicateNames) {
            oldToNewId.set(nameToExistingId.get(name)!, nameToNewId.get(name)!);
          }

          // Remove old duplicates and re-link FKs in remaining existing tables
          erdStore.schema.tables = erdStore.schema.tables
            .filter((t) => !oldIdsToRemove.has(t.id))
            .map((t) => ({
              ...t,
              foreignKeys: t.foreignKeys.map((fk) =>
                oldToNewId.has(fk.referencedTableId)
                  ? { ...fk, referencedTableId: oldToNewId.get(fk.referencedTableId)! }
                  : fk,
              ),
            }));

          // Add all imported tables
          for (const t of result.tables) {
            erdStore.schema.tables = [...erdStore.schema.tables, t];
          }
        } else if (action === 'skip') {
          // Only add non-duplicate tables; re-link their FKs to existing table ids
          for (const t of result.tables) {
            if (duplicateSet.has(t.name)) continue;
            // Re-link FKs: if referencing a skipped table, point to existing id
            t.foreignKeys = t.foreignKeys.map((fk) => {
              // Find if referenced table was skipped
              for (const [name, newId] of nameToNewId) {
                if (fk.referencedTableId === newId && duplicateSet.has(name)) {
                  return { ...fk, referencedTableId: nameToExistingId.get(name)! };
                }
              }
              return fk;
            });
            erdStore.schema.tables = [...erdStore.schema.tables, t];
          }
        } else {
          // No duplicates — add all
          for (const t of result.tables) {
            erdStore.schema.tables = [...erdStore.schema.tables, t];
          }
        }

        erdStore.schema.updatedAt = now();
        // Auto-layout imported tables using hierarchical layout (FK-aware)
        const layoutType = result.tables.some((t) => t.foreignKeys.length > 0) ? 'hierarchical' : 'grid';
        const positions = computeLayout(erdStore.schema.tables, layoutType);
        erdStore.applyLayout(positions);
        importSuccess = m.ddl_import_success({ count: result.tables.length });
      }
    } catch (e) {
      importErrors = [`Import error: ${e instanceof Error ? e.message : e}`];
    } finally {
      importing = false;
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={handleBackdrop}>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'export'}
          onclick={() => (activeTab = 'export')}
        >Export DDL</button>
        <button
          class="tab"
          class:active={activeTab === 'import'}
          onclick={() => (activeTab = 'import')}
        >Import DDL</button>
      </div>
      <button class="close-btn" onclick={onclose}>✕</button>
    </div>

    <div class="modal-body">
      {#if activeTab === 'export'}
        <div class="export-controls">
          <div class="format-tabs">
            {#each FORMAT_OPTIONS as opt}
              <button
                class="format-tab"
                class:active={exportFormat === opt.value}
                onclick={() => exportFormat = opt.value}
              >{opt.label}</button>
            {/each}
          </div>
          {#if exportFormat === 'ddl'}
            <div class="dialect-select-wrap">
              <SearchableSelect
                options={DIALECT_OPTIONS}
                value={exportDialect}
                onchange={(v) => (exportDialect = v as Dialect)}
                size="md"
              />
            </div>
          {/if}
          <div class="spacer"></div>
          {#if exportFormat === 'ddl'}
            <button class="btn-secondary btn-options" class:options-active={showDdlOptions} onclick={() => (showDdlOptions = !showDdlOptions)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 1h3l.4 2.3a5.5 5.5 0 011.3.7l2.2-.9 1.5 2.6-1.8 1.4a5.6 5.6 0 010 1.8l1.8 1.4-1.5 2.6-2.2-.9a5.5 5.5 0 01-1.3.7L9.5 15h-3l-.4-2.3a5.5 5.5 0 01-1.3-.7l-2.2.9-1.5-2.6 1.8-1.4a5.6 5.6 0 010-1.8L1.1 5.7l1.5-2.6 2.2.9a5.5 5.5 0 011.3-.7z" stroke="currentColor" stroke-width="1.3"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              </svg>
            </button>
          {/if}
          <button class="btn-secondary" onclick={copyToClipboard}>
            {copyLabel === 'copy' ? m.ddl_copy() : m.ddl_copied()}
          </button>
          <button class="btn-secondary" onclick={downloadFile}>
            {exportFormat === 'mermaid' ? '.mmd' : exportFormat === 'plantuml' ? '.puml' : m.ddl_download()}
          </button>
        </div>
        {#if exportFormat === 'ddl' && showDdlOptions}
          <div class="ddl-options">
            <div class="opt-row">
              <span class="opt-label">{m.ddl_options_indent()}</span>
              <select class="opt-select" bind:value={ddlOptions.indent}>
                <option value="2spaces">2 spaces</option>
                <option value="4spaces">4 spaces</option>
                <option value="tab">Tab</option>
              </select>
            </div>
            <div class="opt-row">
              <span class="opt-label">{m.ddl_options_quote()}</span>
              <select class="opt-select" bind:value={ddlOptions.quoteStyle}>
                <option value="backtick">`backtick`</option>
                <option value="double">"double"</option>
                <option value="bracket">[bracket]</option>
                <option value="none">none</option>
              </select>
            </div>
            <label class="opt-check">
              <input type="checkbox" bind:checked={ddlOptions.upperCaseKeywords} />
              {m.ddl_options_uppercase()}
            </label>
            <label class="opt-check">
              <input type="checkbox" bind:checked={ddlOptions.includeComments} />
              {m.ddl_options_comments()}
            </label>
            <label class="opt-check">
              <input type="checkbox" bind:checked={ddlOptions.includeIndexes} />
              {m.ddl_options_indexes()}
            </label>
            <label class="opt-check">
              <input type="checkbox" bind:checked={ddlOptions.includeForeignKeys} />
              {m.ddl_options_fk()}
            </label>
          </div>
        {/if}
        <textarea class="code-area" readonly value={exportText} spellcheck="false"></textarea>
      {:else}
        <div class="import-controls">
          <span class="label">Dialect:</span>
          <div class="dialect-select-wrap">
            <SearchableSelect
              options={DIALECT_OPTIONS}
              value={importDialect}
              onchange={(v) => (importDialect = v as Dialect)}
              size="md"
            />
          </div>
          <button class="btn-secondary" onclick={openFile}>{m.action_open_file()}</button>
          <div class="spacer"></div>
          <button class="btn-primary" onclick={doImport} disabled={importing}>
            {importing ? m.ddl_importing() : m.ddl_import_action()}
          </button>
        </div>
        <textarea
          class="code-area"
          bind:value={importText}
          placeholder={m.ddl_paste_placeholder()}
          spellcheck="false"
        ></textarea>
        {#if importSuccess}
          <div class="msg-success">{importSuccess}</div>
        {/if}
        {#if importWarnings.length > 0}
          <div class="msg-warnings">
            {#each importWarnings as warn}
              <div>{warn}</div>
            {/each}
          </div>
        {/if}
        {#if importErrors.length > 0}
          <div class="msg-errors">
            {#each importErrors as err}
              <div>{err}</div>
            {/each}
          </div>
        {/if}
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
    box-shadow: var(--app-popup-shadow, 0 20px 60px rgba(0,0,0,0.3));
    width: 680px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--app-border, #e2e8f0);
    padding: 0 12px;
  }

  .tabs {
    display: flex;
    gap: 0;
    flex: 1;
  }

  .tab {
    padding: 12px 18px;
    background: none;
    border: none;
    font-size: 13px;
    font-weight: 500;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }

  .tab:hover:not(.active) {
    color: var(--app-text, #1e293b);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: var(--app-text-faint, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--app-hover-bg, #f1f5f9);
    color: var(--app-text, #1e293b);
  }

  .modal-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 10px;
  }

  .export-controls,
  .import-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .label {
    font-size: 12px;
    color: var(--app-text-muted, #64748b);
    font-weight: 600;
  }

  .format-tabs {
    display: flex;
    background: var(--app-badge-bg, #f1f5f9);
    border-radius: 5px;
    padding: 2px;
    gap: 1px;
    flex-shrink: 0;
  }

  .format-tab {
    padding: 4px 10px;
    border: none;
    background: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--app-text-muted, #64748b);
    cursor: pointer;
    transition: all 0.12s;
  }

  .format-tab.active {
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .format-tab:hover:not(.active) {
    color: var(--app-text, #1e293b);
  }

  .dialect-select-wrap {
    width: 140px;
    flex-shrink: 0;
  }

  .spacer {
    flex: 1;
  }

  .code-area {
    flex: 1;
    min-height: 360px;
    font-family: 'Menlo', 'Monaco', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.6;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 6px;
    padding: 12px;
    resize: none;
    outline: none;
    color: var(--app-text, #1e293b);
    background: var(--app-panel-bg, #f8fafc);
  }

  .code-area:focus {
    border-color: #3b82f6;
    background: var(--app-input-bg, white);
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: none;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--app-text-secondary, #475569);
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-secondary:hover {
    background: var(--app-hover-bg, #f1f5f9);
  }

  .msg-success {
    font-size: 13px;
    color: #16a34a;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 8px 12px;
  }

  .msg-warnings {
    font-size: 12px;
    color: #a16207;
    background: #fefce8;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 100px;
    overflow-y: auto;
  }

  .msg-errors {
    font-size: 12px;
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .btn-options {
    display: inline-flex;
    align-items: center;
    padding: 5px 8px;
  }

  .btn-options.options-active {
    background: var(--app-active-bg, #eff6ff);
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .ddl-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 8px 10px;
    background: var(--app-badge-bg, #f1f5f9);
    border: 1px solid var(--app-border, #e2e8f0);
    border-radius: 6px;
    align-items: center;
  }

  .opt-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .opt-label {
    font-size: 11px;
    color: var(--app-text-muted, #64748b);
    font-weight: 500;
    white-space: nowrap;
  }

  .opt-select {
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid var(--app-input-border, #e2e8f0);
    border-radius: 4px;
    background: var(--app-input-bg, white);
    color: var(--app-text, #1e293b);
    outline: none;
  }

  .opt-check {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--app-text-secondary, #475569);
    cursor: pointer;
    white-space: nowrap;
  }

  .opt-check input {
    margin: 0;
    accent-color: #3b82f6;
  }
</style>
