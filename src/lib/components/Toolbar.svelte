<script lang="ts">
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { languageStore, LOCALE_LABELS, type Locale } from '$lib/store/language.svelte';
  import { themeStore, type ThemeId } from '$lib/store/theme.svelte';
  import { computeLayout } from '$lib/utils/auto-layout';
  import type { LayoutType } from '$lib/utils/auto-layout';
  import { schemaToShareString, buildShareUrl } from '$lib/utils/url-share';
  import { exportSvg } from '$lib/utils/svg-export';
  import { sanitizeFilename, now } from '$lib/utils/common';
  import { TABLE_W } from '$lib/constants/layout';
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

  // Project dropdown state
  let projectOpen = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let newProjectName = $state('');
  let showNewProjectInput = $state(false);

  function startRename(id: string, currentName: string) {
    renamingId = id;
    renameValue = currentName;
  }

  function finishRename() {
    if (renamingId && renameValue.trim()) {
      projectStore.renameProject(renamingId, renameValue.trim());
    }
    renamingId = null;
    renameValue = '';
  }

  async function handleDeleteProject(id: string, name: string) {
    if (projectStore.index.projects.length <= 1) return;
    const ok = await dialogStore.confirm(m.project_delete_confirm({ name }), {
      title: m.project_delete_title(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (ok) projectStore.deleteProject(id);
  }

  function handleNewProject() {
    const name = newProjectName.trim() || m.project_default_name();
    projectStore.createProject(name);
    newProjectName = '';
    showNewProjectInput = false;
    projectOpen = false;
  }

  // Auto-arrange
  function applyLayout(type: LayoutType) {
    const positions = computeLayout(erdStore.schema.tables, type);
    erdStore.applyLayout(positions);
  }

  // Align / distribute selected tables
  function getSelectedTables() {
    return erdStore.schema.tables.filter((t) => erdStore.selectedTableIds.has(t.id));
  }

  function alignTables(dir: 'left' | 'right' | 'top' | 'bottom') {
    const tables = getSelectedTables();
    if (tables.length < 2) return;
    let target: number;
    switch (dir) {
      case 'left': target = Math.min(...tables.map((t) => t.position.x)); break;
      case 'right': target = Math.max(...tables.map((t) => t.position.x + TABLE_W)); break;
      case 'top': target = Math.min(...tables.map((t) => t.position.y)); break;
      case 'bottom': target = Math.max(...tables.map((t) => t.position.y)); break;
    }
    for (const t of tables) {
      switch (dir) {
        case 'left': erdStore.moveTable(t.id, target, t.position.y); break;
        case 'right': erdStore.moveTable(t.id, target - TABLE_W, t.position.y); break;
        case 'top': erdStore.moveTable(t.id, t.position.x, target); break;
        case 'bottom': erdStore.moveTable(t.id, t.position.x, target); break;
      }
    }
    erdStore.schema.updatedAt = now();
  }

  function distributeTables(axis: 'h' | 'v') {
    const tables = getSelectedTables();
    if (tables.length < 3) return;
    if (axis === 'h') {
      const sorted = [...tables].sort((a, b) => a.position.x - b.position.x);
      const min = sorted[0].position.x;
      const max = sorted[sorted.length - 1].position.x;
      const step = (max - min) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        erdStore.moveTable(sorted[i].id, min + step * i, sorted[i].position.y);
      }
    } else {
      const sorted = [...tables].sort((a, b) => a.position.y - b.position.y);
      const min = sorted[0].position.y;
      const max = sorted[sorted.length - 1].position.y;
      const step = (max - min) / (sorted.length - 1);
      for (let i = 1; i < sorted.length - 1; i++) {
        erdStore.moveTable(sorted[i].id, sorted[i].position.x, min + step * i);
      }
    }
    erdStore.schema.updatedAt = now();
  }

  let alignOpen = $state(false);

  // JSON export
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

          erdStore.schema.updatedAt = now();
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

  // Full backup export
  function exportBackup() {
    const json = projectStore.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Full backup import
  function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = projectStore.importAll(reader.result as string);
        if (result.ok) {
          dialogStore.alert(m.backup_restore_success());
        } else {
          dialogStore.alert(result.error ?? '', { title: m.backup_restore_failed() });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // SVG export
  function exportSvgFile() {
    const svg = exportSvg(erdStore.schema, themeStore.current);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Share
  let shareStatus = $state<'idle' | 'copied'>('idle');
  async function shareLink() {
    try {
      const encoded = await schemaToShareString(erdStore.schema, projectStore.activeProject?.name ?? 'Untitled');
      const url = buildShareUrl(encoded);
      await navigator.clipboard.writeText(url);
      shareStatus = 'copied';
      setTimeout(() => (shareStatus = 'idle'), 2000);
    } catch {
      dialogStore.alert(m.share_copy_failed());
    }
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  }

  function getProjectTableCount(projId: string): number {
    if (projId === projectStore.index.activeProjectId) {
      return erdStore.schema.tables.length;
    }
    try {
      const raw = window.localStorage.getItem(`erdmini_schema_${projId}`);
      if (raw) {
        const schema = JSON.parse(raw);
        return schema.tables?.length ?? 0;
      }
    } catch { /* ignore */ }
    return 0;
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
      a.download = `erdmini_${sanitizeFilename(projectStore.activeProject?.name ?? 'diagram')}.png`;
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

  <!-- Project dropdown -->
  <div class="dropdown-wrap project-wrap">
    <button
      class="btn-project"
      onclick={() => (projectOpen = !projectOpen)}
      aria-expanded={projectOpen}
      aria-haspopup="menu"
    >
      <span class="project-name">{projectStore.activeProject?.name ?? 'Project'}</span>
      <span class="project-chevron">▾</span>
    </button>
    {#if projectOpen}
      <div
        class="dropdown-menu project-dropdown"
        role="menu"
        tabindex="-1"
        onmouseleave={() => { if (!renamingId && !showNewProjectInput) projectOpen = false; }}
      >
        {#each projectStore.index.projects as proj (proj.id)}
          <div
            class="project-item"
            class:active={proj.id === projectStore.index.activeProjectId}
          >
            {#if renamingId === proj.id}
              <input
                class="project-rename-input"
                type="text"
                bind:value={renameValue}
                onkeydown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { renamingId = null; } }}
                onblur={finishRename}
                autofocus
              />
            {:else}
              <button
                class="project-item-name"
                onclick={() => { projectStore.switchProject(proj.id); projectOpen = false; }}
              >
                <span class="project-item-label">{proj.name}</span>
                <span class="project-item-meta">{formatDate(proj.updatedAt)} · {getProjectTableCount(proj.id)} tables</span>
              </button>
              <div class="project-item-actions">
                <button
                  class="project-action-btn"
                  title={m.project_rename()}
                  onclick={(e) => { e.stopPropagation(); startRename(proj.id, proj.name); }}
                >✎</button>
                <button
                  class="project-action-btn"
                  title={m.project_duplicate()}
                  onclick={(e) => { e.stopPropagation(); projectStore.duplicateProject(proj.id); projectOpen = false; }}
                >⧉</button>
                {#if projectStore.index.projects.length > 1}
                  <button
                    class="project-action-btn project-action-delete"
                    title={m.project_delete()}
                    onclick={(e) => { e.stopPropagation(); handleDeleteProject(proj.id, proj.name); }}
                  >✕</button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        <div class="project-divider"></div>
        {#if showNewProjectInput}
          <div class="project-new-row">
            <input
              class="project-rename-input"
              type="text"
              placeholder={m.project_new_placeholder()}
              bind:value={newProjectName}
              onkeydown={(e) => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') { showNewProjectInput = false; newProjectName = ''; } }}
              onblur={() => { if (!newProjectName.trim()) showNewProjectInput = false; }}
              autofocus
            />
          </div>
        {:else}
          <button
            class="dropdown-item project-new-btn"
            role="menuitem"
            onclick={() => (showNewProjectInput = true)}
          >
            {m.project_new()}
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <span class="separator"></span>

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

    <!-- Snap to grid toggle -->
    <button
      class="btn-secondary btn-snap"
      class:snap-active={canvasState.snapToGrid}
      onclick={() => (canvasState.snapToGrid = !canvasState.snapToGrid)}
      title={canvasState.snapToGrid ? 'Snap: ON' : 'Snap: OFF'}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <rect x="9" y="1" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <rect x="1" y="9" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <rect x="9" y="9" width="6" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg>
    </button>

    <!-- Align/Distribute (visible when 2+ selected) -->
    {#if erdStore.selectedTableIds.size >= 2}
      <div class="dropdown-wrap">
        <button
          class="btn-secondary btn-align"
          onclick={() => (alignOpen = !alignOpen)}
          title="Align / Distribute"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <line x1="2" y1="1" x2="2" y2="15" stroke="currentColor" stroke-width="1.5"/>
            <rect x="5" y="3" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.6"/>
            <rect x="5" y="10" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.6"/>
          </svg>
        </button>
        {#if alignOpen}
          <div class="dropdown-menu align-menu" role="menu" tabindex="-1" onmouseleave={() => (alignOpen = false)}>
            <button class="dropdown-item" role="menuitem" onclick={() => { alignTables('left'); alignOpen = false; }}>Align Left</button>
            <button class="dropdown-item" role="menuitem" onclick={() => { alignTables('right'); alignOpen = false; }}>Align Right</button>
            <button class="dropdown-item" role="menuitem" onclick={() => { alignTables('top'); alignOpen = false; }}>Align Top</button>
            <button class="dropdown-item" role="menuitem" onclick={() => { alignTables('bottom'); alignOpen = false; }}>Align Bottom</button>
            {#if erdStore.selectedTableIds.size >= 3}
              <div class="dropdown-sep"></div>
              <button class="dropdown-item" role="menuitem" onclick={() => { distributeTables('h'); alignOpen = false; }}>Distribute H</button>
              <button class="dropdown-item" role="menuitem" onclick={() => { distributeTables('v'); alignOpen = false; }}>Distribute V</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

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
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" role="menuitem" onclick={() => { importBackup(); importOpen = false; }}>
            {m.toolbar_restore_all()}
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
            {m.toolbar_image_export()} (PNG)
          </button>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportSvgFile(); exportOpen = false; }}>
            SVG
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" role="menuitem" onclick={() => { exportBackup(); exportOpen = false; }}>
            {m.toolbar_backup_all()}
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
    <!-- Dark mode toggle -->
    <button
      class="btn-dark-toggle"
      onclick={() => themeStore.toggleDark()}
      title={themeStore.darkMode ? 'Light Mode' : 'Dark Mode'}
    >
      {#if themeStore.darkMode}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/>
          <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M14 9.5A6.5 6.5 0 016.5 2 5.5 5.5 0 108 14a5.5 5.5 0 006-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </button>

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

    <!-- Bug report -->
    <a
      class="btn-icon"
      href="https://github.com/dornol/erdmini/issues"
      target="_blank"
      rel="noopener noreferrer"
      title={m.toolbar_bug_report()}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="8" cy="11" r="0.8" fill="currentColor"/>
      </svg>
    </a>

    <!-- GitHub -->
    <a
      class="btn-icon"
      href="https://github.com/dornol/erdmini"
      target="_blank"
      rel="noopener noreferrer"
      title="GitHub"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    </a>
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

  .btn-snap {
    padding: 5px 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-snap.snap-active {
    background: #1e40af;
    border-color: #3b82f6;
    color: #93c5fd;
  }

  .btn-align {
    padding: 5px 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .align-menu {
    min-width: 120px;
  }

  .dropdown-sep {
    height: 1px;
    background: #475569;
    margin: 4px 0;
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

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: #94a3b8;
    border: 1px solid #475569;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    text-decoration: none;
  }

  .btn-icon:hover {
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

  /* Project dropdown */
  .project-wrap {
    flex-shrink: 1;
    min-width: 0;
  }

  .btn-project {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    max-width: 180px;
    flex-shrink: 0;
  }

  .btn-project:hover {
    background: #334155;
    border-color: #60a5fa;
  }

  .project-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-chevron {
    color: #94a3b8;
    font-size: 11px;
    flex-shrink: 0;
  }

  .project-dropdown {
    min-width: 240px;
    max-height: 320px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .project-item {
    display: flex;
    align-items: center;
    padding: 0 4px 0 0;
    transition: background 0.1s;
  }

  .project-item:hover {
    background: #334155;
  }

  .project-item.active {
    background: #1e3a5f;
  }

  .project-item-name {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 12px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .project-item-label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-item-meta {
    display: block;
    font-size: 10px;
    color: #64748b;
    font-weight: 400;
    margin-top: 1px;
  }

  .project-item.active .project-item-name {
    color: #60a5fa;
    font-weight: 600;
  }

  .project-item.active .project-item-meta {
    color: #93c5fd;
  }

  .project-item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .project-item:hover .project-item-actions {
    opacity: 1;
  }

  .project-action-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
    transition: background 0.1s, color 0.1s;
    line-height: 1;
  }

  .project-action-btn:hover {
    background: #475569;
    color: white;
  }

  .project-action-delete:hover {
    background: #dc2626;
    color: white;
  }

  .project-rename-input {
    flex: 1;
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #60a5fa;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 13px;
    outline: none;
    margin: 4px 8px;
    min-width: 0;
  }

  .project-divider {
    height: 1px;
    background: #334155;
    margin: 4px 0;
  }

  .project-new-btn {
    color: #60a5fa !important;
    font-weight: 500;
  }

  .project-new-row {
    display: flex;
    padding: 0;
  }

  .btn-dark-toggle {
    background: transparent;
    color: #fbbf24;
    border: 1px solid #475569;
    border-radius: 50%;
    width: 26px;
    height: 26px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .btn-dark-toggle:hover {
    background: #334155;
    color: #fcd34d;
  }

</style>
