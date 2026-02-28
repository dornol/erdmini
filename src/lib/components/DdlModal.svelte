<script lang="ts">
  import { untrack } from 'svelte';
  import { erdStore } from '$lib/store/erd.svelte';
  import type { Dialect } from '$lib/types/erd';
  import { exportDDL } from '$lib/utils/ddl-export';
  import { importDDL } from '$lib/utils/ddl-import';

  let {
    mode = 'export',
    onclose,
  }: {
    mode: 'import' | 'export';
    onclose: () => void;
  } = $props();

  let activeTab = $state<'import' | 'export'>(untrack(() => mode));

  const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
    { value: 'mysql', label: 'MySQL' },
    { value: 'postgresql', label: 'PostgreSQL' },
    { value: 'mariadb', label: 'MariaDB' },
    { value: 'mssql', label: 'MSSQL' },
  ];

  // Export state
  let exportDialect = $state<Dialect>('mysql');
  let exportText = $derived(exportDDL(erdStore.schema, exportDialect));
  let copyLabel = $state('복사');

  // Import state
  let importDialect = $state<Dialect>('mysql');
  let importText = $state('');
  let importErrors = $state<string[]>([]);
  let importSuccess = $state<string | null>(null);
  let importing = $state(false);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(exportText);
    copyLabel = '복사됨!';
    setTimeout(() => (copyLabel = '복사'), 1500);
  }

  function downloadSql() {
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_${exportDialect}.sql`;
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
    importSuccess = null;
    importing = true;

    try {
      const result = await importDDL(importText, importDialect);
      if (result.errors.length > 0) {
        importErrors = result.errors;
      }
      if (result.tables.length > 0) {
        const existingNames = new Set(erdStore.schema.tables.map((t) => t.name));
        const offsetX = erdStore.schema.tables.length * 30;
        for (const t of result.tables) {
          if (existingNames.has(t.name)) {
            t.position.x += offsetX;
          }
          erdStore.schema.tables = [...erdStore.schema.tables, t];
        }
        erdStore.schema.updatedAt = new Date().toISOString();
        importSuccess = `${result.tables.length}개 테이블을 가져왔습니다.`;
      }
    } catch (e) {
      importErrors = [`Import 오류: ${e instanceof Error ? e.message : e}`];
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
          <span class="label">Dialect:</span>
          <select class="dialect-select" bind:value={exportDialect}>
            {#each DIALECT_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <div class="spacer"></div>
          <button class="btn-secondary" onclick={copyToClipboard}>{copyLabel}</button>
          <button class="btn-secondary" onclick={downloadSql}>다운로드 .sql</button>
        </div>
        <textarea class="code-area" readonly value={exportText} spellcheck="false"></textarea>
      {:else}
        <div class="import-controls">
          <span class="label">Dialect:</span>
          <select class="dialect-select" bind:value={importDialect}>
            {#each DIALECT_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <button class="btn-secondary" onclick={openFile}>파일 열기</button>
          <div class="spacer"></div>
          <button class="btn-primary" onclick={doImport} disabled={importing}>
            {importing ? '가져오는 중...' : '가져오기'}
          </button>
        </div>
        <textarea
          class="code-area"
          bind:value={importText}
          placeholder="SQL DDL을 붙여넣거나 파일을 여세요..."
          spellcheck="false"
        ></textarea>
        {#if importSuccess}
          <div class="msg-success">{importSuccess}</div>
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
    background: white;
    border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
    border-bottom: 1px solid #e2e8f0;
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
    color: #64748b;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }

  .tab:hover:not(.active) {
    color: #1e293b;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #94a3b8;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
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
    color: #64748b;
    font-weight: 600;
  }

  .dialect-select {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 13px;
    color: #1e293b;
    background: white;
    outline: none;
    cursor: pointer;
  }

  .dialect-select:focus {
    border-color: #93c5fd;
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
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    resize: none;
    outline: none;
    color: #1e293b;
    background: #f8fafc;
  }

  .code-area:focus {
    border-color: #3b82f6;
    background: white;
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
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: #475569;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-secondary:hover {
    background: #f1f5f9;
  }

  .msg-success {
    font-size: 13px;
    color: #16a34a;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 8px 12px;
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
</style>
