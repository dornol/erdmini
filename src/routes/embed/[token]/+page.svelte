<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import MemoCard from '$lib/components/MemoCard.svelte';
  import SchemaTabBar from '$lib/components/SchemaTabBar.svelte';
  import DdlModal from '$lib/components/DdlModal.svelte';
  import { exportCanvasImage } from '$lib/utils/image-export';
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { filterBySchema } from '$lib/utils/canvas-grid';

  type ViewState = 'loading' | 'password' | 'ready' | 'error';

  let viewState = $state<ViewState>('loading');
  let errorMessage = $state('');
  let projectName = $state('');
  let passwordInput = $state('');
  let passwordError = $state('');

  const token = $derived($page.params.token);
  let showDdlModal = $state(false);

  const visibleTables = $derived(filterBySchema(erdStore.schema.tables, canvasState.activeSchema));
  const visibleMemos = $derived(filterBySchema(erdStore.schema.memos, canvasState.activeSchema));

  async function loadEmbed(password?: string) {
    try {
      const url = password
        ? `/api/embed/view/${token}?password=${encodeURIComponent(password)}`
        : `/api/embed/view/${token}`;
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 401 && data.requiresPassword) {
        if (password) {
          passwordError = m.embed_password_wrong();
        }
        viewState = 'password';
        return;
      }

      if (!res.ok) {
        viewState = 'error';
        errorMessage = res.status === 403 ? m.embed_expired() : m.embed_not_found();
        return;
      }

      projectName = data.projectName;

      // Set read-only
      permissionStore.set('viewer');

      // Load schema
      erdStore.loadSchema(data.schema);

      // Apply canvas state
      if (data.canvasState) {
        if (data.canvasState.x != null) canvasState.x = data.canvasState.x;
        if (data.canvasState.y != null) canvasState.y = data.canvasState.y;
        if (data.canvasState.scale != null) canvasState.scale = data.canvasState.scale;
        if (data.canvasState.lineType) canvasState.lineType = data.canvasState.lineType;
        if (data.canvasState.columnDisplayMode) canvasState.columnDisplayMode = data.canvasState.columnDisplayMode;
        if (data.canvasState.showGrid != null) canvasState.showGrid = data.canvasState.showGrid;
        if (data.canvasState.activeSchema) canvasState.activeSchema = data.canvasState.activeSchema;
      }

      viewState = 'ready';
    } catch {
      viewState = 'error';
      errorMessage = m.embed_not_found();
    }
  }

  function handlePasswordSubmit(e: Event) {
    e.preventDefault();
    passwordError = '';
    loadEmbed(passwordInput);
  }

  onMount(() => {
    loadEmbed();
  });
</script>

{#if viewState === 'loading'}
  <div class="embed-loading">
    <div class="loading-spinner"></div>
  </div>
{:else if viewState === 'password'}
  <div class="embed-password">
    <div class="password-card">
      <h2>{m.embed_password_required()}</h2>
      <form onsubmit={handlePasswordSubmit}>
        <input
          type="password"
          bind:value={passwordInput}
          placeholder={m.embed_password_required()}
          autofocus
        />
        {#if passwordError}
          <p class="error-text">{passwordError}</p>
        {/if}
        <button type="submit">{m.embed_password_submit()}</button>
      </form>
    </div>
  </div>
{:else if viewState === 'error'}
  <div class="embed-error">
    <div class="error-card">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/>
        <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
        <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>{errorMessage}</p>
    </div>
  </div>
{:else if viewState === 'ready'}
  <div class="embed-app" data-dark={themeStore.darkMode || undefined}>
    <!-- Minimal header -->
    <div class="embed-header">
      <span class="embed-project-name">{projectName}</span>
      <span class="embed-badge">{m.embed_view_only()}</span>
      <button class="embed-export-btn" onclick={() => (showDdlModal = true)}>
        {m.toolbar_export()}
      </button>
      <button class="embed-export-btn" onclick={() => exportCanvasImage(projectName)}>
        {m.toolbar_image_export()}
      </button>
      <a class="embed-open-link" href="/" target="_blank" rel="noopener">
        {m.embed_open_in_app()} ↗
      </a>
      <a class="embed-github" href="https://github.com/dornol/erdmini" target="_blank" rel="noopener noreferrer" title="GitHub">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span>v{__APP_VERSION__}</span>
      </a>
    </div>

    <SchemaTabBar />

    <div class="embed-canvas-wrap">
      <Canvas>
        <RelationLines {visibleTables} />
        {#each visibleMemos.filter((mm) => !mm.attachedTableId) as memo (memo.id)}
          <MemoCard {memo} />
        {/each}
        {#each visibleTables as table (table.id)}
          <TableCard {table} />
        {/each}
      </Canvas>
    </div>

    {#if showDdlModal}
      <DdlModal mode="export" exportOnly={true} projectName={projectName} onclose={() => (showDdlModal = false)} />
    {/if}
  </div>
{/if}

<style>
  .embed-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0f172a;
  }
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #334155;
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .embed-password {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0f172a;
  }
  .password-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 32px;
    text-align: center;
    max-width: 360px;
    width: 90%;
  }
  .password-card h2 {
    color: #f1f5f9;
    font-size: 16px;
    margin: 0 0 16px;
  }
  .password-card input {
    width: 100%;
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #475569;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }
  .password-card input:focus {
    border-color: #3b82f6;
  }
  .password-card button {
    margin-top: 12px;
    padding: 8px 24px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }
  .password-card button:hover {
    background: #2563eb;
  }
  .error-text {
    color: #ef4444;
    font-size: 13px;
    margin: 8px 0 0;
  }

  .embed-error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0f172a;
  }
  .error-card {
    text-align: center;
    color: #94a3b8;
    font-size: 15px;
  }
  .error-card p {
    margin-top: 12px;
  }

  .embed-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0f172a;

    /* Dark mode CSS variables for shared components (SchemaTabBar, etc.) */
    --app-panel-bg: #1e293b;
    --app-card-bg: #1e293b;
    --app-border: #334155;
    --app-border-light: #1e293b;
    --app-text: #f1f5f9;
    --app-text-secondary: #cbd5e1;
    --app-text-muted: #94a3b8;
    --app-text-faint: #64748b;
    --app-input-bg: #0f172a;
    --app-input-border: #475569;
    --app-hover-bg: #334155;
    --app-active-bg: #1e3a5f;
    --app-popup-bg: #1e293b;
    --app-popup-shadow: 0 8px 30px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3);
    --app-badge-bg: #334155;
    --app-badge-border: #475569;
    --app-scrollbar: #475569;
  }
  .embed-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    min-height: 36px;
    flex-shrink: 0;
  }
  .embed-project-name {
    color: #f1f5f9;
    font-size: 14px;
    font-weight: 600;
  }
  .embed-badge {
    background: #334155;
    color: #94a3b8;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .embed-export-btn {
    background: none;
    border: 1px solid #475569;
    border-radius: 4px;
    color: #94a3b8;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .embed-export-btn:hover {
    color: #e2e8f0;
    border-color: #60a5fa;
  }
  .embed-open-link {
    margin-left: auto;
    color: #60a5fa;
    font-size: 12px;
    text-decoration: none;
  }
  .embed-open-link:hover {
    text-decoration: underline;
  }
  .embed-github {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #64748b;
    font-size: 11px;
    text-decoration: none;
    margin-left: 8px;
  }
  .embed-github:hover {
    color: #94a3b8;
  }
  .embed-canvas-wrap {
    flex: 1;
    display: flex;
    position: relative;
    overflow: hidden;
  }
</style>
