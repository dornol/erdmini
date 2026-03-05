<script lang="ts">
  import Canvas from '$lib/components/Canvas.svelte';
  import RelationLines from '$lib/components/RelationLines.svelte';
  import TableCard from '$lib/components/TableCard.svelte';
  import MemoCard from '$lib/components/MemoCard.svelte';
  import SchemaTabBar from '$lib/components/SchemaTabBar.svelte';
  import { erdStore, canvasState } from '$lib/store/erd.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';

  type ViewState = 'loading' | 'password' | 'ready' | 'error';

  let viewState = $state<ViewState>('loading');
  let errorMessage = $state('');
  let projectName = $state('');
  let passwordInput = $state('');
  let passwordError = $state('');

  const token = $derived($page.params.token);

  const visibleTables = $derived(
    canvasState.activeSchema === '(all)'
      ? erdStore.schema.tables
      : erdStore.schema.tables.filter((t) => (t.schema ?? '') === canvasState.activeSchema)
  );
  const visibleMemos = $derived(
    canvasState.activeSchema === '(all)'
      ? erdStore.schema.memos
      : erdStore.schema.memos.filter((mm) => (mm.schema ?? '') === canvasState.activeSchema)
  );

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
      <a class="embed-open-link" href="/" target="_blank" rel="noopener">
        {m.embed_open_in_app()} ↗
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
  .embed-open-link {
    margin-left: auto;
    color: #60a5fa;
    font-size: 12px;
    text-decoration: none;
  }
  .embed-open-link:hover {
    text-decoration: underline;
  }
  .embed-canvas-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
</style>
