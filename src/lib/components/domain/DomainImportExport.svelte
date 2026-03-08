<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { exportDomainsToXlsx, exportDomainTemplate, importDomainsFromXlsx } from '$lib/utils/domain-xlsx';
  import { exportDictionaryMarkdown, exportDictionaryHtml } from '$lib/utils/domain-dictionary';
  import { downloadBlob } from '$lib/utils/blob-download';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    uploadMessage: string;
    onUploadMessageChange: (msg: string) => void;
  }

  let { uploadMessage, onUploadMessageChange }: Props = $props();

  let showDictDropdown = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let uploadMessageTimer: ReturnType<typeof setTimeout> | undefined;

  function handleDictExport(format: 'html' | 'markdown' | 'xlsx') {
    showDictDropdown = false;
    const ctx = { schema: erdStore.schema, projectName: 'ERD Project' };
    if (format === 'markdown') {
      downloadBlob(exportDictionaryMarkdown(ctx), 'domain-dictionary.md', 'text/markdown');
    } else if (format === 'html') {
      downloadBlob(exportDictionaryHtml(ctx), 'domain-dictionary.html', 'text/html');
    } else {
      import('$lib/utils/domain-dictionary').then(mod => {
        if ('exportDictionaryXlsx' in mod) {
          (mod as any).exportDictionaryXlsx(ctx);
        }
      });
    }
  }

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
      onUploadMessageChange(m.domain_upload_result({
        added: String(result.added),
        updated: String(result.updated),
      }));
      if (uploadMessageTimer) clearTimeout(uploadMessageTimer);
      uploadMessageTimer = setTimeout(() => {
        onUploadMessageChange('');
      }, 4000);
    } catch {
      onUploadMessageChange('Error reading file');
      if (uploadMessageTimer) clearTimeout(uploadMessageTimer);
      uploadMessageTimer = setTimeout(() => {
        onUploadMessageChange('');
      }, 4000);
    }
    input.value = '';
  }
</script>

<div class="import-export-controls">
  <button
    class="header-icon-btn"
    onclick={handleDownload}
    title={m.domain_download_xlsx()}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
  {#if !permissionStore.isReadOnly}
    <button
      class="header-icon-btn"
      onclick={() => fileInput?.click()}
      title={m.domain_upload_xlsx()}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 10V2m0 0L5 5m3-3l3 3M3 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  {/if}
  <div class="dict-dropdown-wrapper">
    <button class="header-icon-btn dict-btn" onclick={() => showDictDropdown = !showDictDropdown} title={m.domain_dict_export()}>
      {m.domain_dict_export()} ▾
    </button>
    {#if showDictDropdown}
      <div class="dict-dropdown">
        <button onclick={() => handleDictExport('html')}>HTML</button>
        <button onclick={() => handleDictExport('markdown')}>Markdown</button>
      </div>
    {/if}
  </div>
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
</div>

<style>
  .import-export-controls {
    display: flex;
    align-items: center;
    gap: 10px;
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

  .dict-dropdown-wrapper {
    position: relative;
  }

  .dict-btn {
    font-size: 12px;
    white-space: nowrap;
  }

  .dict-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 10;
    min-width: 120px;
  }

  .dict-dropdown button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    border: none;
    background: none;
    font-size: 12px;
    color: #1e293b;
    cursor: pointer;
  }

  .dict-dropdown button:hover {
    background: #f1f5f9;
  }

  .dict-dropdown button:first-child {
    border-radius: 6px 6px 0 0;
  }

  .dict-dropdown button:last-child {
    border-radius: 0 0 6px 6px;
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
</style>
