<script lang="ts">
  import { onMount } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { exportDDL } from '$lib/utils/ddl-export';
  import { generateDummyData } from '$lib/utils/dummy-data';
  import * as m from '$lib/paraglide/messages';
  import type { Database } from 'sql.js';
  import SqlEditor from './SqlEditor.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let db = $state<Database | null>(null);
  let loading = $state(true);
  let loadError = $state('');
  let schemaStatus = $state('');
  let schemaError = $state('');
  let query = $state('');
  let executing = $state(false);
  let resultColumns = $state<string[]>([]);
  let resultRows = $state<any[][]>([]);
  let resultMessage = $state('');
  let errorMessage = $state('');
  let executionTime = $state<number | null>(null);
  let rowsPerTable = $state(10);
  let showHistory = $state(false);
  let history = $state<string[]>(loadHistory());

  const HISTORY_KEY = 'erdmini_sql_history';
  const MAX_HISTORY = 20;

  function loadHistory(): string[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    history = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* quota */ }
  }

  function applySchema(database: Database) {
    const ddl = exportDDL(erdStore.schema, 'sqlite', { includeComments: false, includeForeignKeys: false });
    try {
      database.exec(ddl);
      schemaStatus = m.sql_playground_schema_synced({ count: String(erdStore.schema.tables.length) });
      schemaError = '';
    } catch (e: any) {
      schemaError = m.sql_playground_schema_error({ error: e.message ?? String(e) });
      schemaStatus = '';
    }
  }

  onMount(() => {
    let closed = false;

    (async () => {
      try {
        const SQL = await import('sql.js');
        const initFn = SQL.default;
        const sqlPromise = initFn({
          locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
        });
        const sqlInstance = await sqlPromise;
        if (closed) return;
        db = new sqlInstance.Database();
        loading = false;
        applySchema(db);
      } catch (e: any) {
        if (closed) return;
        loading = false;
        loadError = m.sql_playground_load_error({ error: e.message ?? String(e) });
      }
    })();

    return () => {
      closed = true;
      if (db) {
        try { db.close(); } catch {}
        db = null;
      }
    };
  });

  function executeQuery() {
    if (!db || !query.trim()) return;

    executing = true;
    resultColumns = [];
    resultRows = [];
    resultMessage = '';
    errorMessage = '';
    executionTime = null;

    const start = performance.now();
    try {
      const trimmedQuery = query.trim().replace(/;+$/, '');
      const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(trimmedQuery);

      if (isSelect) {
        // Use prepare/step to get column info even for 0-row results
        const stmt = db.prepare(trimmedQuery);
        const columns = stmt.getColumnNames();
        const rows: any[][] = [];
        while (stmt.step()) {
          rows.push(stmt.get());
        }
        stmt.free();
        executionTime = Math.round(performance.now() - start);
        resultColumns = columns;
        resultRows = rows;
        resultMessage = m.sql_playground_rows_returned({ count: String(rows.length) });
      } else {
        db.run(trimmedQuery);
        executionTime = Math.round(performance.now() - start);
        const modified = db.getRowsModified();
        if (modified > 0) {
          resultMessage = m.sql_playground_rows_affected({ count: String(modified) });
        } else {
          resultMessage = m.sql_playground_no_results();
        }
      }

      saveHistory(query);
    } catch (e: any) {
      executionTime = Math.round(performance.now() - start);
      errorMessage = m.sql_playground_error({ error: e.message ?? String(e) });
    }
    executing = false;
  }

  async function resetDb() {
    if (!db) return;
    const ok = await dialogStore.confirm(m.sql_playground_reset_confirm());
    if (!ok) return;

    try { db.close(); } catch {}
    const SQL = await import('sql.js');
    const initFn = SQL.default;
    const sqlInstance = await initFn({
      locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
    });
    db = new sqlInstance.Database();
    applySchema(db);
    resultColumns = [];
    resultRows = [];
    resultMessage = '';
    errorMessage = '';
    executionTime = null;
  }

  function generateData() {
    if (!db) return;
    // Clear existing data before inserting
    for (const table of erdStore.schema.tables) {
      try { db.exec(`DELETE FROM "${table.name}";`); } catch {}
    }
    const { sql, tableCount } = generateDummyData(erdStore.schema, rowsPerTable);
    if (!sql) return;
    try {
      db.exec(sql);
      resultMessage = m.sql_playground_generated({ count: String(tableCount) });
      resultColumns = [];
      resultRows = [];
      errorMessage = '';
    } catch (e: any) {
      errorMessage = m.sql_playground_error({ error: e.message ?? String(e) });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      executeQuery();
    }
  }

  function selectHistory(h: string) {
    query = h;
    showHistory = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sp-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) onclose(); }} onkeydown={handleKeydown}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sp-panel" onmousedown={(e) => e.stopPropagation()}>
    <!-- Header -->
    <div class="sp-header">
      <h2>{m.sql_playground_title()}</h2>
      <button class="close-btn" onclick={onclose}>&times;</button>
    </div>

    {#if loading}
      <div class="sp-loading">{m.sql_playground_loading()}</div>
    {:else if loadError}
      <div class="sp-error-banner">{loadError}</div>
    {:else}
      <!-- Status bar -->
      <div class="sp-statusbar">
        <div class="sp-status-left">
          {#if schemaStatus}
            <span class="sp-badge sp-badge-ok">{schemaStatus}</span>
          {/if}
          {#if schemaError}
            <span class="sp-badge sp-badge-err">{schemaError}</span>
          {/if}
        </div>
        <div class="sp-status-right">
          <button class="sp-btn sp-btn-secondary" onclick={resetDb}>{m.sql_playground_reset()}</button>
          <span class="sp-rows-label">{m.sql_playground_rows_per_table()}</span>
          <input type="number" class="sp-rows-input" bind:value={rowsPerTable} min="1" max="100" />
          <button class="sp-btn sp-btn-secondary" onclick={generateData}>{m.sql_playground_generate()}</button>
        </div>
      </div>

      <!-- Editor -->
      <div class="sp-editor">
        <SqlEditor
          value={query}
          onchange={(v) => { query = v; }}
          height="150px"
          extraKeys={[{ key: 'Mod-Enter', run: () => { executeQuery(); return true; } }]}
        />
      </div>

      <!-- Action bar -->
      <div class="sp-actionbar">
        <div class="sp-action-left">
          <button class="sp-btn sp-btn-primary" onclick={executeQuery} disabled={executing || !query.trim()}>
            {m.sql_playground_execute()}
            <span class="sp-hint">{m.sql_playground_execute_hint()}</span>
          </button>
          <button class="sp-btn sp-btn-secondary" onclick={() => { query = ''; resultColumns = []; resultRows = []; resultMessage = ''; errorMessage = ''; }}>
            {m.sql_playground_clear()}
          </button>
          <div class="sp-history-wrap">
            <button class="sp-btn sp-btn-secondary" onclick={() => (showHistory = !showHistory)}>
              {m.sql_playground_history()} ▾
            </button>
            {#if showHistory}
              <div class="sp-history-dropdown">
                {#if history.length === 0}
                  <div class="sp-history-empty">{m.sql_playground_no_history()}</div>
                {:else}
                  {#each history as h}
                    <button class="sp-history-item" onclick={() => selectHistory(h)}>
                      {h.length > 80 ? h.slice(0, 80) + '...' : h}
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        </div>
        {#if executionTime !== null}
          <span class="sp-time">{m.sql_playground_execution_time({ ms: String(executionTime) })}</span>
        {/if}
      </div>

      <!-- Results -->
      <div class="sp-results">
        {#if errorMessage}
          <div class="sp-result-error">{errorMessage}</div>
        {:else if resultMessage}
          <div class="sp-result-msg">{resultMessage}</div>
        {/if}

        {#if resultColumns.length > 0}
          <div class="sp-table-wrap">
            <table class="sp-table">
              <thead>
                <tr>
                  {#each resultColumns as col}
                    <th>{col}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each resultRows as row}
                  <tr>
                    {#each row as cell}
                      <td>{cell === null ? 'NULL' : cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .sp-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
  .sp-panel {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 900px;
    max-width: 95vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #334155;
  }
  .sp-header h2 {
    color: #f1f5f9;
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }
  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
  }
  .close-btn:hover { color: #f1f5f9; }

  .sp-loading, .sp-error-banner {
    padding: 32px 20px;
    text-align: center;
    color: #94a3b8;
    font-size: 14px;
  }
  .sp-error-banner { color: #f87171; }

  .sp-statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid #1e293b;
    background: #0f172a;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sp-status-left { display: flex; gap: 8px; align-items: center; }
  .sp-status-right { display: flex; gap: 6px; align-items: center; }
  .sp-badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .sp-badge-ok { background: #065f46; color: #6ee7b7; }
  .sp-badge-err { background: #7f1d1d; color: #fca5a5; }
  .sp-rows-label { color: #94a3b8; font-size: 12px; }
  .sp-rows-input {
    width: 52px;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 4px;
    color: #e2e8f0;
    font-size: 12px;
    padding: 2px 4px;
    text-align: center;
  }

  .sp-editor {
    padding: 12px 16px 0;
  }
  .sp-textarea {
    width: 100%;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #e2e8f0;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    padding: 10px 12px;
    resize: vertical;
    line-height: 1.5;
    box-sizing: border-box;
  }
  .sp-textarea:focus {
    outline: none;
    border-color: #3b82f6;
  }
  .sp-textarea::placeholder { color: #475569; }

  .sp-actionbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    gap: 8px;
  }
  .sp-action-left { display: flex; gap: 6px; align-items: center; }
  .sp-time { color: #94a3b8; font-size: 12px; }

  .sp-btn {
    padding: 5px 12px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .sp-btn:disabled { opacity: 0.5; cursor: default; }
  .sp-btn-primary {
    background: #3b82f6;
    color: #fff;
  }
  .sp-btn-primary:hover:not(:disabled) { background: #2563eb; }
  .sp-btn-secondary {
    background: #334155;
    color: #e2e8f0;
  }
  .sp-btn-secondary:hover:not(:disabled) { background: #475569; }
  .sp-hint {
    font-size: 10px;
    opacity: 0.7;
    margin-left: 4px;
  }

  .sp-history-wrap { position: relative; }
  .sp-history-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 6px;
    width: 320px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
  }
  .sp-history-empty {
    padding: 12px;
    color: #64748b;
    font-size: 12px;
    text-align: center;
  }
  .sp-history-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    border: none;
    background: none;
    color: #cbd5e1;
    font-size: 12px;
    font-family: 'SF Mono', monospace;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sp-history-item:hover { background: #334155; }

  .sp-results {
    flex: 1;
    overflow: auto;
    padding: 0 16px 16px;
    min-height: 60px;
  }
  .sp-result-msg {
    color: #94a3b8;
    font-size: 13px;
    padding: 8px 0;
  }
  .sp-result-error {
    color: #f87171;
    font-size: 13px;
    padding: 8px 0;
    font-family: 'SF Mono', monospace;
  }

  .sp-table-wrap {
    overflow: auto;
    border: 1px solid #334155;
    border-radius: 6px;
    margin-top: 4px;
    max-height: 340px;
  }
  .sp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .sp-table th {
    background: #0f172a;
    color: #94a3b8;
    font-weight: 600;
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid #334155;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .sp-table td {
    color: #e2e8f0;
    padding: 5px 10px;
    border-bottom: 1px solid #1e293b;
    white-space: nowrap;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'SF Mono', monospace;
  }
  .sp-table tr:hover td { background: #1e293b; }
</style>
