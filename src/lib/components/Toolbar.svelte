<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { languageStore, LOCALE_LABELS, type Locale } from '$lib/store/language.svelte';
  import { themeStore, type ThemeId } from '$lib/store/theme.svelte';
  import { computeLayout } from '$lib/utils/auto-layout';
  import type { LayoutType } from '$lib/utils/auto-layout';
  import { schemaToShareString, buildShareUrl } from '$lib/utils/url-share';
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
      reader.onload = async () => {
        try {
          const schema = JSON.parse(reader.result as string);
          if (!schema.tables) schema.tables = [];
          if (!schema.domains) schema.domains = [];

          // If current schema is empty, just load directly
          if (erdStore.schema.tables.length === 0) {
            erdStore.loadSchema(schema);
            return;
          }

          // Ask merge or replace
          const mode = await dialogStore.choice(
            m.import_merge_or_replace_message(),
            {
              title: m.import_merge_or_replace_title(),
              choices: [
                { key: 'merge', label: m.import_merge(), variant: 'primary' },
                { key: 'replace', label: m.import_replace(), variant: 'danger' },
              ],
            },
          );
          if (mode === null) return; // cancelled

          if (mode === 'replace') {
            erdStore.loadSchema(schema);
            return;
          }

          // --- Merge mode ---
          const nameToExistingId = new Map<string, string>();
          for (const t of erdStore.schema.tables) {
            nameToExistingId.set(t.name, t.id);
          }

          const duplicateNames = schema.tables
            .filter((t: { name: string }) => nameToExistingId.has(t.name))
            .map((t: { name: string }) => t.name);

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
            if (action === null) return; // cancelled
          }

          const duplicateSet = new Set(duplicateNames);
          const nameToNewId = new Map<string, string>();
          for (const t of schema.tables) {
            nameToNewId.set(t.name, t.id);
          }

          if (action === 'overwrite') {
            const oldIdsToRemove = new Set(
              duplicateNames.map((n: string) => nameToExistingId.get(n)!),
            );
            const oldToNewId = new Map<string, string>();
            for (const name of duplicateNames) {
              oldToNewId.set(nameToExistingId.get(name)!, nameToNewId.get(name)!);
            }

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

            for (const t of schema.tables) {
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          } else if (action === 'skip') {
            for (const t of schema.tables) {
              if (duplicateSet.has(t.name)) continue;
              t.foreignKeys = (t.foreignKeys ?? []).map((fk: { referencedTableId: string }) => {
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
            // No duplicates — add all new tables
            for (const t of schema.tables) {
              erdStore.schema.tables = [...erdStore.schema.tables, t];
            }
          }

          // Merge domains by name
          const existingDomainNames = new Set(erdStore.schema.domains.map((d) => d.name));
          if (action === 'overwrite') {
            const newDomainMap = new Map(schema.domains.map((d: { name: string }) => [d.name, d]));
            erdStore.schema.domains = erdStore.schema.domains.map((d) =>
              newDomainMap.has(d.name) ? newDomainMap.get(d.name)! : d,
            );
            for (const d of schema.domains) {
              if (!existingDomainNames.has(d.name)) {
                erdStore.schema.domains = [...erdStore.schema.domains, d];
              }
            }
          } else {
            for (const d of schema.domains) {
              if (!existingDomainNames.has(d.name)) {
                erdStore.schema.domains = [...erdStore.schema.domains, d];
              }
            }
          }

          erdStore.schema.updatedAt = new Date().toISOString();
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

  // Share
  let shareStatus = $state<'idle' | 'copied'>('idle');
  async function shareLink() {
    try {
      const encoded = await schemaToShareString(erdStore.schema);
      const url = buildShareUrl(encoded);
      await navigator.clipboard.writeText(url);
      shareStatus = 'copied';
      setTimeout(() => (shareStatus = 'idle'), 2000);
    } catch {
      dialogStore.alert(m.share_copy_failed());
    }
  }

  let layoutOpen = $state(false);
  let importOpen = $state(false);
  let exportOpen = $state(false);
  let themeOpen = $state(false);
  let langOpen = $state(false);
  let shortcutsOpen = $state(false);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  const THEMES: { id: ThemeId; label: () => string; dot: string }[] = [
    { id: 'modern',    label: () => m.theme_modern(),    dot: '#1e293b' },
    { id: 'classic',   label: () => m.theme_classic(),   dot: '#6b4c2a' },
    { id: 'blueprint', label: () => m.theme_blueprint(), dot: '#1e4a7a' },
    { id: 'minimal',   label: () => m.theme_minimal(),   dot: '#f0f0f0' },
  ];

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
        backgroundColor: getComputedStyle(document.querySelector('.canvas-viewport')!).getPropertyValue('--erd-canvas-bg').trim() || '#f8fafc',
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

    <span class="separator"></span>

    <!-- Import dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (importOpen = !importOpen)}
        aria-expanded={importOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_import()} ▾
      </button>
      {#if importOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (importOpen = false)}
        >
          <button class="dropdown-item" role="menuitem" onclick={() => { modalMode = 'import'; importOpen = false; }}>
            DDL
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { importJson(); importOpen = false; }}>
            JSON
          </button>
        </div>
      {/if}
    </div>

    <!-- Export dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (exportOpen = !exportOpen)}
        aria-expanded={exportOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_export()} ▾
      </button>
      {#if exportOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (exportOpen = false)}
        >
          <button class="dropdown-item" role="menuitem" onclick={() => { modalMode = 'export'; exportOpen = false; }}>
            DDL
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportJson(); exportOpen = false; }}>
            JSON
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportImage(); exportOpen = false; }}>
            {m.toolbar_image_export()}
          </button>
        </div>
      {/if}
    </div>

    <span class="separator"></span>

    <button class="btn-secondary" onclick={() => (showDomainModal = true)}>
      {m.toolbar_domains()}
    </button>

    <span class="separator"></span>

    <button
      class="btn-secondary btn-share"
      class:copied={shareStatus === 'copied'}
      onclick={shareLink}
    >
      {shareStatus === 'copied' ? m.share_copied() : m.share_link()}
    </button>
  </div>

  <div class="toolbar-right">
    <!-- Theme dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (themeOpen = !themeOpen)}
        aria-expanded={themeOpen}
        aria-haspopup="menu"
      >
        {m.toolbar_theme()} ▾
      </button>
      {#if themeOpen}
        <div
          class="dropdown-menu dropdown-right"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (themeOpen = false)}
        >
          {#each THEMES as t}
            <button
              class="dropdown-item theme-item"
              class:active={themeStore.current === t.id}
              role="menuitem"
              onclick={() => { themeStore.set(t.id); themeOpen = false; }}
            >
              <span class="theme-dot" style="background:{t.dot}"></span>
              {t.label()}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Language dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-lang"
        onclick={() => (langOpen = !langOpen)}
        aria-expanded={langOpen}
        aria-haspopup="menu"
      >
        {languageStore.current.toUpperCase()} ▾
      </button>
      {#if langOpen}
        <div
          class="dropdown-menu dropdown-right"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (langOpen = false)}
        >
          {#each Object.entries(LOCALE_LABELS) as [locale, label]}
            <button
              class="dropdown-item"
              class:active={languageStore.current === locale}
              role="menuitem"
              onclick={() => { languageStore.set(locale as Locale); langOpen = false; }}
            >
              {label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Shortcuts help -->
    <div class="dropdown-wrap">
      <button
        class="btn-help"
        onclick={() => (shortcutsOpen = !shortcutsOpen)}
        aria-expanded={shortcutsOpen}
        aria-haspopup="dialog"
        title={m.shortcuts_title()}
      >
        ?
      </button>
      {#if shortcutsOpen}
        <div
          class="shortcuts-panel"
          role="dialog"
          tabindex="-1"
          onmouseleave={() => (shortcutsOpen = false)}
        >
          <div class="shortcuts-header">{m.shortcuts_title()}</div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_general()}</div>
            <div class="shortcut-row"><kbd>{mod}+Z</kbd><span>{m.shortcuts_undo()}</span></div>
            <div class="shortcut-row"><kbd>{mod}+Shift+Z</kbd><span>{m.shortcuts_redo()}</span></div>
            <div class="shortcut-row"><kbd>Delete / Backspace</kbd><span>{m.shortcuts_delete()}</span></div>
            <div class="shortcut-row"><kbd>Esc</kbd><span>{m.shortcuts_deselect()}</span></div>
            <div class="shortcut-row"><kbd>{mod}+K</kbd><span>{m.cmd_palette_open()}</span></div>
          </div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_canvas()}</div>
            <div class="shortcut-row"><kbd>Scroll</kbd><span>{m.shortcuts_zoom()}</span></div>
            <div class="shortcut-row"><kbd>Drag</kbd><span>{m.shortcuts_pan()}</span></div>
          </div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_selection()}</div>
            <div class="shortcut-row"><kbd>{mod}+Click</kbd><span>{m.shortcuts_multi_select()}</span></div>
          </div>

          <div class="shortcuts-group">
            <div class="shortcuts-group-title">{m.shortcuts_editing()}</div>
            <div class="shortcut-row"><kbd>Double-click header</kbd><span>{m.shortcuts_rename_table()}</span></div>
            <div class="shortcut-row"><kbd>Double-click column</kbd><span>{m.shortcuts_edit_column()}</span></div>
          </div>
        </div>
      {/if}
    </div>
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
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .toolbar-right {
    margin-left: auto;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
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

  .btn-share.copied {
    background: #166534;
    color: #4ade80;
    border-color: #22c55e;
  }

  .btn-lang:hover {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: #475569;
    flex-shrink: 0;
    margin: 0 2px;
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

  .dropdown-right {
    left: auto;
    right: 0;
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

  .theme-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-item.active {
    color: white;
    background: #334155;
  }

  .theme-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .btn-help {
    background: transparent;
    color: #94a3b8;
    border: 1px solid #475569;
    border-radius: 50%;
    width: 26px;
    height: 26px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .btn-help:hover {
    background: #334155;
    color: white;
  }

  .shortcuts-panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 8px;
    z-index: 200;
    min-width: 260px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    padding: 12px 0;
  }

  .shortcuts-header {
    padding: 0 14px 8px;
    font-size: 13px;
    font-weight: 600;
    color: white;
    border-bottom: 1px solid #334155;
    margin-bottom: 4px;
  }

  .shortcuts-group {
    padding: 6px 14px;
  }

  .shortcuts-group-title {
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 12px;
    color: #cbd5e1;
  }

  .shortcut-row kbd {
    background: #334155;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    font-family: inherit;
    white-space: nowrap;
  }

</style>
