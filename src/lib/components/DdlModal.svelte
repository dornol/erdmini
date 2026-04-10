<script lang="ts">
  import { untrack } from 'svelte';
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { toastStore } from '$lib/store/toast.svelte';
  import type { Dialect } from '$lib/types/erd';
  import { exportDDL, getDefaultQuoteStyle, type DDLExportOptions } from '$lib/utils/ddl-export';
  import { DIALECT_OPTIONS, loadDdlOptions, saveDdlOptions } from '$lib/utils/ddl-options';
  import { copyToClipboard as clipCopy } from '$lib/utils/clipboard';
  import { exportMermaid, exportPlantUML } from '$lib/utils/diagram-export';
  import { downloadBlob } from '$lib/utils/blob-download';
  import { exportPrisma } from '$lib/utils/prisma-export';
  import { exportDBML } from '$lib/utils/dbml-export';
  import { importDDL, type DDLImportMessages } from '$lib/utils/ddl-import';
  import { importPrisma } from '$lib/utils/prisma-import';
  import { importDBML } from '$lib/utils/dbml-import';
  import { computeLayout } from '$lib/utils/auto-layout';
  import { sanitizeFilename, now } from '$lib/utils/common';
  import * as m from '$lib/paraglide/messages';
  import SearchableSelect from './SearchableSelect.svelte';
  import { detectDialect } from '$lib/utils/detect-dialect';

  let {
    mode = 'export',
    onclose,
    exportOnly = false,
    projectName,
  }: {
    mode: 'import' | 'export';
    onclose: () => void;
    exportOnly?: boolean;
    projectName?: string;
  } = $props();

  let activeTab = $state<'import' | 'export'>(untrack(() => exportOnly ? 'export' : mode));

  type ExportFormat = 'ddl' | 'mermaid' | 'plantuml' | 'prisma' | 'dbml';
  type ImportFormat = 'ddl' | 'prisma' | 'dbml';

  const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
    { value: 'ddl', label: 'DDL' },
    { value: 'mermaid', label: 'Mermaid' },
    { value: 'plantuml', label: 'PlantUML' },
    { value: 'prisma', label: 'Prisma' },
    { value: 'dbml', label: 'DBML' },
  ];

  // Export state
  let exportFormat = $state<ExportFormat>('ddl');
  let exportDialect = $state<Dialect>(erdStore.schema.dialect ?? 'mysql');
  let showDdlOptions = $state(false);

  let ddlOptions = $state<DDLExportOptions>(loadDdlOptions());

  // Local DB object export selection — initialized from objects' includeInDdl, not persisted back
  let dboExportIds = $state<Set<string>>(new Set(
    (erdStore.schema.dbObjects ?? []).filter(o => o.includeInDdl).map(o => o.id)
  ));

  // Save DDL options when changed
  $effect(() => {
    saveDdlOptions(ddlOptions);
  });

  let exportText = $derived.by(() => {
    if (exportFormat === 'mermaid') return exportMermaid(erdStore.schema);
    if (exportFormat === 'plantuml') return exportPlantUML(erdStore.schema);
    if (exportFormat === 'prisma') return exportPrisma(erdStore.schema);
    if (exportFormat === 'dbml') return exportDBML(erdStore.schema);
    return exportDDL(erdStore.schema, exportDialect, { ...ddlOptions, quoteStyle: ddlOptions.quoteStyle === 'none' ? 'none' : ddlOptions.quoteStyle || getDefaultQuoteStyle(exportDialect), dbObjectIds: dboExportIds.size > 0 ? [...dboExportIds] : undefined });
  });
  let copyLabel = $state<'copy' | 'copied'>('copy');

  // Import state
  let importFormat = $state<ImportFormat>('ddl');
  let importDialect = $state<Dialect>(erdStore.schema.dialect ?? 'mysql');
  let importText = $state('');
  let importDialectAutoDetected = $state(false);
  let importDialectManual = $state(false);

  // Auto-detect dialect when import text changes (skip if user manually selected)
  $effect(() => {
    const text = importText;
    const fmt = importFormat;
    untrack(() => {
      if (text.length === 0) { importDialectManual = false; importDialectAutoDetected = false; return; }
      if (importDialectManual) return;
      if (fmt === 'ddl' && text.length > 10) {
        const detected = detectDialect(text);
        if (detected) {
          importDialect = detected;
          importDialectAutoDetected = true;
        } else {
          importDialectAutoDetected = false;
        }
      } else {
        importDialectAutoDetected = false;
      }
    });
  });

  let importErrors = $state<string[]>([]);
  let importWarnings = $state<string[]>([]);
  let importSuccess = $state<string | null>(null);
  let importing = $state(false);

  async function copyToClipboard() {
    await clipCopy(exportText);
    copyLabel = 'copied';
    setTimeout(() => (copyLabel = 'copy'), 1500);
  }

  function downloadFile() {
    const projName = sanitizeFilename(projectName ?? projectStore.activeProject?.name ?? 'schema');
    const extMap: Record<string, string> = { mermaid: '.mmd', plantuml: '.puml', prisma: '.prisma', dbml: '.dbml' };
    const ext = extMap[exportFormat] ?? `_${exportDialect}.sql`;
    downloadBlob(exportText, `erdmini_${projName}${ext}`, 'text/plain');
  }

  function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = importFormat === 'prisma' ? '.prisma,.txt' : importFormat === 'dbml' ? '.dbml,.txt' : '.sql,.txt';
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
      let result;
      if (importFormat === 'dbml') {
        result = importDBML(importText, {
          noTables: () => m.dbml_import_no_tables(),
          noPkWarning: (p) => m.dbml_no_pk_warning(p),
          fkResolveFailed: (p) => m.ddl_import_fk_resolve_failed(p),
        });
      } else if (importFormat === 'prisma') {
        result = importPrisma(importText, {
          noModels: () => m.prisma_import_no_models(),
          implicitM2m: (p) => m.prisma_import_implicit_m2m(p),
          noPkWarning: (p) => m.prisma_no_pk_warning(p),
          fkResolveFailed: (p) => m.ddl_import_fk_resolve_failed(p),
        });
      } else {
        const importMessages: DDLImportMessages = {
          noCreateTable: () => m.ddl_import_no_create_table(),
          tableParseError: (p) => m.ddl_import_table_parse_error(p),
          fkResolveFailed: (p) => m.ddl_import_fk_resolve_failed(p),
        };
        result = await importDDL(importText, importDialect, importMessages);
      }
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

        // Assign current active schema to imported tables (if a specific schema is selected)
        const activeSchema = canvasState.activeSchema;
        if (activeSchema && activeSchema !== '(all)') {
          for (const t of result.tables) {
            if (!t.schema) t.schema = activeSchema;
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

        // Auto-set dialect from import if not yet set
        if (!erdStore.schema.dialect && importFormat === 'ddl') {
          erdStore.setDialect(importDialect);
        }
        erdStore.schema.updatedAt = now();
        // Auto-layout imported tables using hierarchical layout (FK-aware)
        const layoutType = result.tables.some((t) => t.foreignKeys.length > 0) ? 'hierarchical' : 'grid';
        const positions = computeLayout(erdStore.schema.tables, layoutType);
        erdStore.applyLayout(positions);
        importSuccess = importFormat === 'prisma'
          ? m.prisma_import_success({ count: result.tables.length })
          : importFormat === 'dbml'
            ? m.dbml_import_success({ count: result.tables.length })
            : m.ddl_import_success({ count: result.tables.length });
        toastStore.success(importSuccess);
      }
    } catch (e) {
      importErrors = [`Import error: ${e instanceof Error ? e.message : e}`];
    } finally {
      importing = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={handleBackdrop}>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal-header">
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === 'export'}
          onclick={() => (activeTab = 'export')}
        >{m.ddl_tab_export()}</button>
        {#if !exportOnly}
          <button
            class="tab"
            class:active={activeTab === 'import'}
            onclick={() => (activeTab = 'import')}
          >{m.ddl_tab_import()}</button>
        {/if}
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
            <button class="btn-secondary btn-options" class:options-active={showDdlOptions} onclick={() => (showDdlOptions = !showDdlOptions)} aria-label="DDL options">
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
            {exportFormat === 'mermaid' ? '.mmd' : exportFormat === 'plantuml' ? '.puml' : exportFormat === 'prisma' ? m.prisma_download() : exportFormat === 'dbml' ? m.dbml_download() : m.ddl_download()}
          </button>
        </div>
        {#if exportFormat === 'ddl' && showDdlOptions}
          <div class="ddl-options">
            <div class="opt-row">
              <span class="opt-label">{m.ddl_options_indent()}</span>
              <select class="opt-select" bind:value={ddlOptions.indent}>
                <option value="2spaces">{m.ddl_indent_2spaces()}</option>
                <option value="4spaces">{m.ddl_indent_4spaces()}</option>
                <option value="tab">{m.ddl_indent_tab()}</option>
              </select>
            </div>
            <div class="opt-row">
              <span class="opt-label">{m.ddl_options_quote()}</span>
              <select class="opt-select" bind:value={ddlOptions.quoteStyle}>
                <option value="backtick">{m.ddl_quote_backtick()}</option>
                <option value="double">{m.ddl_quote_double()}</option>
                <option value="bracket">{m.ddl_quote_bracket()}</option>
                <option value="none">{m.ddl_quote_none()}</option>
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
            <label class="opt-check">
              <input type="checkbox" bind:checked={ddlOptions.includeDomains} />
              {m.ddl_options_domains()}
            </label>
          {#if (erdStore.schema.dbObjects ?? []).length > 0}
            <div class="dbo-export-section">
            <div class="dbo-export-header">
              <span class="opt-label">{m.sidebar_tab_objects()}</span>
              <label class="dbo-toggle-all">
                <input
                  type="checkbox"
                  checked={(erdStore.schema.dbObjects ?? []).length > 0 && (erdStore.schema.dbObjects ?? []).every(o => dboExportIds.has(o.id))}
                  onchange={() => {
                    const objs = erdStore.schema.dbObjects ?? [];
                    const allChecked = objs.every(o => dboExportIds.has(o.id));
                    dboExportIds = new Set(allChecked ? [] : objs.map(o => o.id));
                  }}
                />
                {m.db_object_include_ddl()}
              </label>
            </div>
            <div class="dbo-export-list thin-scrollbar">
              {#each erdStore.schema.dbObjectCategories ?? [] as cat}
                {@const catObjs = (erdStore.schema.dbObjects ?? []).filter(o => o.category === cat)}
                {#if catObjs.length > 0}
                  <div class="dbo-cat-name">{cat}</div>
                  {#each catObjs as obj (obj.id)}
                    <label class="dbo-item">
                      <input
                        type="checkbox"
                        checked={dboExportIds.has(obj.id)}
                        onchange={(e) => {
                          const next = new Set(dboExportIds);
                          if ((e.target as HTMLInputElement).checked) next.add(obj.id); else next.delete(obj.id);
                          dboExportIds = next;
                        }}
                      />
                      <span class="dbo-item-name">{obj.name}</span>
                    </label>
                  {/each}
                {/if}
              {/each}
            </div>
            </div>
          {/if}
          </div>
        {/if}
        <textarea class="code-area" readonly value={exportText} spellcheck="false"></textarea>
      {:else}
        <div class="import-controls">
          <div class="format-tabs">
            <button class="format-tab" class:active={importFormat === 'ddl'} onclick={() => importFormat = 'ddl'}>DDL</button>
            <button class="format-tab" class:active={importFormat === 'prisma'} onclick={() => importFormat = 'prisma'}>Prisma</button>
            <button class="format-tab" class:active={importFormat === 'dbml'} onclick={() => importFormat = 'dbml'}>DBML</button>
          </div>
          {#if importFormat === 'ddl'}
            <div class="dialect-select-wrap">
              <SearchableSelect
                options={DIALECT_OPTIONS.map(o => ({
                  value: o.value,
                  label: importDialectAutoDetected && o.value === importDialect
                    ? `${o.label} (auto)`
                    : o.label,
                }))}
                value={importDialect}
                onchange={(v) => { importDialect = v as Dialect; importDialectAutoDetected = false; importDialectManual = true; }}
                size="md"
              />
            </div>
          {/if}
          <button class="btn-secondary" onclick={openFile}>{m.action_open_file()}</button>
          <div class="spacer"></div>
          <button class="btn-primary" onclick={doImport} disabled={importing}>
            {importing ? m.ddl_importing() : m.ddl_import_action()}
          </button>
        </div>
        <textarea
          class="code-area"
          bind:value={importText}
          placeholder={importFormat === 'prisma' ? m.prisma_paste_placeholder() : importFormat === 'dbml' ? m.dbml_paste_placeholder() : m.ddl_paste_placeholder()}
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
    width: 900px;
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
    width: 160px;
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

  .dbo-export-section {
    width: 100%;
    border-top: 1px solid var(--app-border, #e2e8f0);
    padding-top: 8px;
    margin-top: 4px;
  }

  .dbo-export-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .dbo-toggle-all {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--app-text-secondary, #475569);
    cursor: pointer;
  }

  .dbo-toggle-all input {
    accent-color: #3b82f6;
    margin: 0;
  }

  .dbo-export-list {
    max-height: 120px;
    overflow-y: auto;
  }

  .dbo-cat-name {
    font-size: 10px;
    font-weight: 600;
    color: var(--app-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 4px 0 2px;
  }

  .dbo-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--app-text, #334155);
    cursor: pointer;
    padding: 2px 0 2px 8px;
  }

  .dbo-item input {
    margin: 0;
    accent-color: #3b82f6;
  }

  .dbo-item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
