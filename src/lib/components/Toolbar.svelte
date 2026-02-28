<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { languageStore } from '$lib/store/language.svelte';
  import { computeLayout } from '$lib/utils/auto-layout';
  import type { LayoutType } from '$lib/utils/auto-layout';
  import DdlModal from './DdlModal.svelte';
  import DomainModal from './DomainModal.svelte';
  import * as m from '$lib/paraglide/messages';

  let viewportWidth = $state(800);
  let viewportHeight = $state(600);

  $effect(() => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;

    function onResize() {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function addTable() {
    erdStore.addTable(viewportWidth, viewportHeight);
  }

  let modalMode = $state<'import' | 'export' | null>(null);
  let showDomainModal = $state(false);

  // Auto-arrange
  function applyLayout(type: LayoutType) {
    const positions = computeLayout(erdStore.schema.tables, type);
    erdStore.applyLayout(positions);
  }

  // JSON export
  function exportJson() {
    const json = JSON.stringify(erdStore.schema, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erdmini_schema.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // JSON import
  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const schema = JSON.parse(reader.result as string);
          erdStore.loadSchema(schema);
        } catch {
          dialogStore.alert(m.json_parse_error(), {
            title: m.json_import_failed(),
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  let layoutOpen = $state(false);

  const LAYOUT_LABELS: Record<LayoutType, () => string> = {
    grid: () => m.layout_grid(),
    hierarchical: () => m.layout_hierarchical(),
    radial: () => m.layout_radial(),
  };

  // Image export
  async function exportImage() {
    const worldEl = document.querySelector('.canvas-world') as HTMLElement | null;
    if (!worldEl) return;

    if (erdStore.schema.tables.length === 0) return;

    const { toPng } = await import('html-to-image');
    const PAD = 40;

    // Save originals
    const origTransform = worldEl.style.transform;
    const origWidth = worldEl.style.width;
    const origHeight = worldEl.style.height;

    // Reset to identity so getBoundingClientRect reflects actual world coords at scale=1
    worldEl.style.transform = 'translate(0px, 0px) scale(1)';
    void worldEl.getBoundingClientRect(); // force layout

    const worldRect = worldEl.getBoundingClientRect();
    const cards = Array.from(worldEl.querySelectorAll<HTMLElement>('.table-card'));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const x = rect.left - worldRect.left;
      const y = rect.top - worldRect.top;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + rect.width);
      maxY = Math.max(maxY, y + rect.height);
    }

    if (!isFinite(minX)) {
      worldEl.style.transform = origTransform;
      return;
    }

    const w = Math.ceil(maxX - minX + PAD * 2);
    const h = Math.ceil(maxY - minY + PAD * 2);

    // Shift so all tables start at (PAD, PAD) and give worldEl explicit dimensions
    worldEl.style.transform = `translate(${-minX + PAD}px, ${-minY + PAD}px) scale(1)`;
    worldEl.style.width = `${w}px`;
    worldEl.style.height = `${h}px`;

    // Temporarily allow overflow so capture sees full content
    const viewportEl = worldEl.parentElement;
    const origOverflow = viewportEl?.style.overflow ?? '';
    if (viewportEl) viewportEl.style.overflow = 'visible';

    try {
      const dataUrl = await toPng(worldEl, {
        width: w,
        height: h,
        pixelRatio: 2,
        backgroundColor: '#f8fafc',
        filter: (node: HTMLElement) => {
          // Exclude hover tooltips from export
          return !node.classList?.contains('col-tooltip');
        },
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'erdmini_diagram.png';
      a.click();
    } finally {
      worldEl.style.transform = origTransform;
      worldEl.style.width = origWidth;
      worldEl.style.height = origHeight;
      if (viewportEl) viewportEl.style.overflow = origOverflow;
    }
  }
</script>

<header class="toolbar">
  <div class="logo">
    <span class="logo-icon">◈</span>
    <span class="logo-text">erdmini</span>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick={addTable}>
      {m.toolbar_add_table()}
    </button>

    <!-- Auto-arrange dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (layoutOpen = !layoutOpen)}
        aria-expanded={layoutOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_auto_layout()}
      </button>
      {#if layoutOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (layoutOpen = false)}
        >
          {#each Object.entries(LAYOUT_LABELS) as [type, label]}
            <button
              class="dropdown-item"
              role="menuitem"
              onclick={() => { applyLayout(type as LayoutType); layoutOpen = false; }}
            >
              {label()}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button class="btn-secondary" onclick={() => (modalMode = 'import')}>
      Import DDL
    </button>
    <button class="btn-secondary" onclick={() => (modalMode = 'export')}>
      Export DDL
    </button>
    <button class="btn-secondary" onclick={importJson}>
      {m.toolbar_json_import()}
    </button>
    <button class="btn-secondary" onclick={exportJson}>
      {m.toolbar_json_export()}
    </button>
    <button class="btn-secondary" onclick={() => (showDomainModal = true)}>
      {m.toolbar_domains()}
    </button>
    <button class="btn-secondary" onclick={exportImage}>
      {m.toolbar_image_export()}
    </button>

    <!-- Language toggle -->
    <button class="btn-lang" onclick={() => languageStore.toggle()}>
      {languageStore.current === 'ko' ? 'EN' : 'KO'}
    </button>
  </div>

  <div class="zoom-display">
    {Math.round(canvasState.scale * 100)}%
  </div>
</header>

{#if modalMode}
  <DdlModal mode={modalMode} onclose={() => (modalMode = null)} />
{/if}

{#if showDomainModal}
  <DomainModal onclose={() => (showDomainModal = false)} />
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 48px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .logo-icon {
    color: #60a5fa;
    font-size: 18px;
  }

  .logo-text {
    color: white;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.5px;
  }

  .actions {
    flex: 1;
    display: flex;
    gap: 6px;
    align-items: center;
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
    flex-shrink: 0;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-secondary {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-secondary:hover {
    background: #334155;
    color: white;
  }

  .btn-lang {
    background: #334155;
    color: #60a5fa;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    letter-spacing: 0.05em;
  }

  .btn-lang:hover {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .dropdown-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 6px;
    overflow: hidden;
    z-index: 200;
    min-width: 110px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 14px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
    transition: background 0.1s;
  }

  .dropdown-item:hover {
    background: #334155;
    color: white;
  }

  .zoom-display {
    color: #94a3b8;
    font-size: 12px;
    min-width: 40px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
