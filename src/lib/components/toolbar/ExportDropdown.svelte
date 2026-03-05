<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import { exportSvg } from '$lib/utils/svg-export';
  import { exportPdf } from '$lib/utils/pdf-export';
  import { exportCanvasImage } from '$lib/utils/image-export';
  import { sanitizeFilename } from '$lib/utils/common';
  import { downloadBlob } from '$lib/utils/blob-download';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
    onopenddl: () => void;
  }

  let { open, ontoggle, onclose, onopenddl }: Props = $props();

  function exportJson() {
    const json = JSON.stringify(erdStore.schema, null, 2);
    downloadBlob(json, `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'schema')}.json`, 'application/json');
  }

  function exportSvgFile() {
    const svg = exportSvg(erdStore.schema, themeStore.current, canvasState.lineType);
    if (!svg) return;
    downloadBlob(svg, `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}.svg`, 'image/svg+xml');
  }

  async function exportPdfFile() {
    if (erdStore.schema.tables.length === 0) return;
    await exportPdf(
      erdStore.schema,
      themeStore.current,
      `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}`,
    );
  }

  async function exportImage() {
    if (erdStore.schema.tables.length === 0) return;
    await exportCanvasImage(projectStore.activeProject?.name ?? 'diagram');
  }

  async function exportBackup() {
    const json = await projectStore.exportAll();
    downloadBlob(json, `erdmini_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  }
</script>

<div class="dropdown-wrap">
  <button
    class="btn-secondary"
    onclick={ontoggle}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    {m.toolbar_export()} ▾
  </button>
  {#if open}
    <div
      class="dropdown-menu"
      role="menu"
      tabindex="-1"
      onmouseleave={onclose}
    >
      <button class="dropdown-item" role="menuitem" onclick={() => { onopenddl(); onclose(); }}>
        DDL
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { exportJson(); onclose(); }}>
        JSON
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { exportImage(); onclose(); }}>
        {m.toolbar_image_export()} (PNG)
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { exportSvgFile(); onclose(); }}>
        SVG
      </button>
      <button class="dropdown-item" role="menuitem" onclick={() => { exportPdfFile(); onclose(); }}>
        {m.toolbar_pdf_export()}
      </button>
      <div class="dropdown-sep"></div>
      <button class="dropdown-item" role="menuitem" onclick={() => { exportBackup(); onclose(); }}>
        {m.toolbar_backup_all()}
      </button>
    </div>
  {/if}
</div>
