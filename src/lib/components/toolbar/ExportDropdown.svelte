<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import { exportSvg } from '$lib/utils/svg-export';
  import { exportPdf } from '$lib/utils/pdf-export';
  import { exportCanvasImage } from '$lib/utils/image-export';
  import { sanitizeFilename } from '$lib/utils/common';
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
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'schema')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSvgFile() {
    const svg = exportSvg(erdStore.schema, themeStore.current, canvasState.lineType);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
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
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
