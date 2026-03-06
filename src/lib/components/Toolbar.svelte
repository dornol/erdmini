<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import { projectStore } from '$lib/store/project.svelte';
  import { themeStore } from '$lib/store/theme.svelte';
  import { schemaToShareString, buildShareUrl } from '$lib/utils/url-share';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import DdlModal from './DdlModal.svelte';
  import DomainModal from './DomainModal.svelte';
  import LintPanel from './LintPanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import SchemaDiffModal from './SchemaDiffModal.svelte';
  import SnapshotPanel from './SnapshotPanel.svelte';
  import ShareProjectModal from './ShareProjectModal.svelte';
  import ApiKeysModal from './ApiKeysModal.svelte';
  import EmbedModal from './EmbedModal.svelte';
  import SqlPlaygroundModal from './SqlPlaygroundModal.svelte';
  import ChangePasswordModal from './ChangePasswordModal.svelte';
  import * as m from '$lib/paraglide/messages';
  import { authStore } from '$lib/store/auth.svelte';
  import { permissionStore } from '$lib/store/permission.svelte';
  import CollabIndicator from './CollabIndicator.svelte';
  import { collabStore } from '$lib/store/collab.svelte';
  import { page } from '$app/state';

  import ProjectDropdown from './toolbar/ProjectDropdown.svelte';
  import ImportDropdown from './toolbar/ImportDropdown.svelte';
  import ExportDropdown from './toolbar/ExportDropdown.svelte';
  import ToolsDropdown from './toolbar/ToolsDropdown.svelte';
  import SettingsDropdown from './toolbar/SettingsDropdown.svelte';
  import ShortcutsDropdown from './toolbar/ShortcutsDropdown.svelte';
  import UserMenu from './toolbar/UserMenu.svelte';

  let { onfullscreen }: { onfullscreen?: () => void } = $props();

  const siteSettings = $derived((page.data as any)?.siteSettings as { site_name: string; logo_url: string } | null);

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

  function addMemo() {
    erdStore.addMemo(viewportWidth, viewportHeight);
  }

  // Dropdown state — only one open at a time
  type DropdownId = 'project' | 'import' | 'export' | 'tools' | 'settings' | 'shortcuts' | 'userMenu';
  let activeDropdown = $state<DropdownId | null>(null);
  function toggleDropdown(id: DropdownId) { activeDropdown = activeDropdown === id ? null : id; }
  function closeDropdown() { activeDropdown = null; }

  // Modal state
  let modalMode = $state<'import' | 'export' | null>(null);
  let showDomainModal = $state(false);
  let showLintPanel = $state(false);
  let showHistoryPanel = $state(false);
  let showDiffModal = $state(false);
  let showSnapshotPanel = $state(false);
  let showSqlPlayground = $state(false);
  let showChangePassword = $state(false);
  let showApiKeysModal = $state(false);
  let showShareModal = $state(false);
  let showEmbedModal = $state(false);

  // Share link
  let shareStatus = $state<'idle' | 'copied'>('idle');

  function copyToClipboardFallback(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      document.body.removeChild(textarea);
      return false;
    }
  }

  async function shareLink() {
    try {
      const encoded = await schemaToShareString(erdStore.schema, projectStore.activeProject?.name ?? 'Untitled');
      const url = buildShareUrl(encoded);
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch { /* non-secure context */ }
      }
      if (!copied) {
        copied = copyToClipboardFallback(url);
      }
      if (copied) {
        shareStatus = 'copied';
        setTimeout(() => (shareStatus = 'idle'), 2000);
      } else {
        dialogStore.alert(m.share_copy_failed());
      }
    } catch {
      dialogStore.alert(m.share_copy_failed());
    }
  }

  function handleToolsAction(action: 'domains' | 'lint' | 'history' | 'diff' | 'snapshots' | 'sql-playground' | 'embed') {
    switch (action) {
      case 'domains': showDomainModal = true; break;
      case 'lint': showLintPanel = !showLintPanel; break;
      case 'history': showHistoryPanel = !showHistoryPanel; break;
      case 'diff': showDiffModal = !showDiffModal; break;
      case 'snapshots': showSnapshotPanel = !showSnapshotPanel; break;
      case 'sql-playground': showSqlPlayground = true; break;
      case 'embed': showEmbedModal = true; break;
    }
  }

  function handleUserMenuAction(action: 'change-password' | 'api-keys') {
    switch (action) {
      case 'change-password': showChangePassword = true; break;
      case 'api-keys': showApiKeysModal = true; break;
    }
  }
</script>

<header class="toolbar">
  <div class="logo">
    {#if siteSettings?.logo_url}
      <img class="logo-icon" src={siteSettings.logo_url} alt="Logo" />
    {:else}
      <svg class="logo-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="7" fill="#1e293b"/>
        <path d="M16 5 L25 10.5 L25 21.5 L16 27 L7 21.5 L7 10.5 Z" fill="none" stroke="url(#logo-grad)" stroke-width="2" stroke-linejoin="round"/>
        <line x1="16" y1="5" x2="16" y2="27" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
        <line x1="7" y1="10.5" x2="25" y2="21.5" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
        <line x1="25" y1="10.5" x2="7" y2="21.5" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
        <circle cx="16" cy="5" r="2.2" fill="#60a5fa"/>
        <circle cx="25" cy="10.5" r="2.2" fill="#60a5fa"/>
        <circle cx="25" cy="21.5" r="2.2" fill="#60a5fa"/>
        <circle cx="16" cy="27" r="2.2" fill="#60a5fa"/>
        <circle cx="7" cy="21.5" r="2.2" fill="#60a5fa"/>
        <circle cx="7" cy="10.5" r="2.2" fill="#60a5fa"/>
        <circle cx="16" cy="16" r="2.8" fill="#60a5fa"/>
        <defs><linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>
      </svg>
    {/if}
    <span class="logo-text">{siteSettings?.site_name || 'erdmini'}</span>
  </div>

  <ProjectDropdown
    open={activeDropdown === 'project'}
    ontoggle={() => toggleDropdown('project')}
    onclose={closeDropdown}
  />

  <span class="separator"></span>

  <div class="actions">
    {#if collabStore.connected || collabStore.reconnecting}
      <CollabIndicator />
    {/if}
    {#if permissionStore.isReadOnly}
      <span class="readonly-badge">Read Only</span>
    {/if}
    <button class="btn-primary" onclick={addTable} disabled={permissionStore.isReadOnly}>
      {m.toolbar_add_table()}
    </button>
    <button class="btn-memo" onclick={addMemo} disabled={permissionStore.isReadOnly}>
      {m.toolbar_add_memo()}
    </button>

    <span class="separator"></span>

    <ImportDropdown
      open={activeDropdown === 'import'}
      ontoggle={() => toggleDropdown('import')}
      onclose={closeDropdown}
      onopenddl={() => (modalMode = 'import')}
    />

    <ExportDropdown
      open={activeDropdown === 'export'}
      ontoggle={() => toggleDropdown('export')}
      onclose={closeDropdown}
      onopenddl={() => (modalMode = 'export')}
    />

    <ToolsDropdown
      open={activeDropdown === 'tools'}
      ontoggle={() => toggleDropdown('tools')}
      onclose={closeDropdown}
      onaction={handleToolsAction}
    />

    <span class="separator"></span>

    <button
      class="btn-secondary btn-share"
      class:copied={shareStatus === 'copied'}
      onclick={shareLink}
    >
      {shareStatus === 'copied' ? m.share_copied() : m.share_link()}
    </button>

    {#if authStore.isLoggedIn && (permissionStore.current === 'owner' || permissionStore.current === 'editor')}
      <button
        class="btn-secondary"
        onclick={() => (showShareModal = true)}
      >
        Share
      </button>
    {/if}
  </div>

  <div class="toolbar-right">
    <button
      class="btn-icon"
      onclick={() => onfullscreen?.()}
      title={m.toolbar_fullscreen()}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polyline points="1,5 1,1 5,1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="11,1 15,1 15,5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="15,11 15,15 11,15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="5,15 1,15 1,11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

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

    <SettingsDropdown
      open={activeDropdown === 'settings'}
      ontoggle={() => toggleDropdown('settings')}
      onclose={closeDropdown}
    />

    <ShortcutsDropdown
      open={activeDropdown === 'shortcuts'}
      ontoggle={() => toggleDropdown('shortcuts')}
      onclose={closeDropdown}
    />

    <UserMenu
      open={activeDropdown === 'userMenu'}
      ontoggle={() => toggleDropdown('userMenu')}
      onclose={closeDropdown}
      onaction={handleUserMenuAction}
    />
  </div>
</header>

{#if modalMode}
  <DdlModal mode={modalMode} onclose={() => (modalMode = null)} />
{/if}

{#if showDomainModal}
  <DomainModal onclose={() => (showDomainModal = false)} />
{/if}

{#if showShareModal && projectStore.activeProject}
  <ShareProjectModal
    projectId={projectStore.activeProject.id}
    isOwner={permissionStore.current === 'owner'}
    onclose={() => (showShareModal = false)}
  />
{/if}

{#if showLintPanel}
  <LintPanel onclose={() => (showLintPanel = false)} />
{/if}

{#if showHistoryPanel}
  <HistoryPanel onclose={() => (showHistoryPanel = false)} />
{/if}

{#if showDiffModal}
  <SchemaDiffModal onclose={() => (showDiffModal = false)} />
{/if}

{#if showSnapshotPanel}
  <SnapshotPanel
    onclose={() => (showSnapshotPanel = false)}
    ondiff={(snapshotId) => { showSnapshotPanel = false; showDiffModal = true; }}
  />
{/if}

{#if showApiKeysModal}
  <ApiKeysModal onclose={() => (showApiKeysModal = false)} />
{/if}

{#if showEmbedModal}
  <EmbedModal onclose={() => (showEmbedModal = false)} />
{/if}

{#if showSqlPlayground}
  <SqlPlaygroundModal onclose={() => (showSqlPlayground = false)} />
{/if}

{#if showChangePassword}
  <ChangePasswordModal onclose={() => (showChangePassword = false)} />
{/if}

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 6px 16px;
    min-height: 48px;
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
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    object-fit: contain;
    border-radius: 4px;
  }

  .logo-text {
    color: white;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.5px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .toolbar-right {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .readonly-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    background: #7c3aed20;
    border: 1px solid #7c3aed;
    border-radius: 4px;
    color: #a78bfa;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    white-space: nowrap;
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

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-memo {
    background: #f59e0b;
    color: #1e293b;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .btn-memo:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-memo:hover {
    background: #d97706;
  }

  .btn-share.copied {
    background: #166534;
    color: #4ade80;
    border-color: #22c55e;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: #475569;
    flex-shrink: 0;
    margin: 0 2px;
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

  /* Shared dropdown styles (cascaded to child components via :global) */
  .toolbar :global(.btn-secondary) {
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

  .toolbar :global(.btn-secondary:hover) {
    background: #334155;
    color: white;
  }

  .toolbar :global(.btn-icon) {
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

  .toolbar :global(.btn-icon:hover) {
    background: #334155;
    color: white;
  }

  .toolbar :global(.dropdown-wrap) {
    position: relative;
    flex-shrink: 0;
  }

  .toolbar :global(.dropdown-menu) {
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

  .toolbar :global(.dropdown-right) {
    left: auto;
    right: 0;
  }

  .toolbar :global(.dropdown-item) {
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
    white-space: nowrap;
  }

  .toolbar :global(.dropdown-item:hover) {
    background: #334155;
    color: white;
  }

  .toolbar :global(.dropdown-sep) {
    height: 1px;
    background: #334155;
    margin: 4px 0;
  }

  .toolbar :global(.dropdown-section-label) {
    padding: 6px 14px 2px;
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .toolbar :global(.theme-item) {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar :global(.theme-item.active) {
    color: white;
    background: #334155;
  }

  .toolbar :global(.theme-dot) {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .toolbar :global(.settings-dropdown) {
    min-width: 150px;
  }

  .toolbar :global(.btn-help) {
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

  .toolbar :global(.btn-help:hover) {
    background: #334155;
    color: white;
  }

  .toolbar :global(.shortcuts-panel) {
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

  .toolbar :global(.shortcuts-header) {
    padding: 0 14px 8px;
    font-size: 13px;
    font-weight: 600;
    color: white;
    border-bottom: 1px solid #334155;
    margin-bottom: 4px;
  }

  .toolbar :global(.shortcuts-group) {
    padding: 6px 14px;
  }

  .toolbar :global(.shortcuts-group-title) {
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  .toolbar :global(.shortcut-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 12px;
    color: #cbd5e1;
  }

  .toolbar :global(.shortcut-row kbd) {
    background: #334155;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    font-family: inherit;
    white-space: nowrap;
  }

  .toolbar :global(.shortcuts-links) {
    border-top: 1px solid #334155;
    margin-top: 4px;
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .toolbar :global(.shortcuts-link) {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 12px;
    transition: color 0.15s;
  }

  .toolbar :global(.shortcuts-link:hover) {
    color: #e2e8f0;
  }

  .toolbar :global(.shortcuts-version) {
    color: #64748b;
    font-size: 11px;
    margin-top: 2px;
  }

  .toolbar :global(.btn-user) {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .toolbar :global(.btn-user:hover) {
    background: #475569;
    color: #f1f5f9;
  }

  .toolbar :global(.dropdown-user-info) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid #475569;
  }

  .toolbar :global(.dropdown-user-name) {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .toolbar :global(.dropdown-user-role) {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .toolbar :global(.dropdown-item-danger) {
    color: #f87171 !important;
  }

  .toolbar :global(.dropdown-item-danger:hover) {
    background: rgba(248, 113, 113, 0.1) !important;
    color: #fca5a5 !important;
  }

  .toolbar :global(.btn-tools) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .toolbar :global(.btn-tools.tools-active) {
    background: #1e3a5f;
    border-color: #3b82f6;
    color: #93c5fd;
  }

  .toolbar :global(.lint-badge) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #f59e0b;
    color: #1e293b;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }

  /* Project dropdown */
  .toolbar :global(.project-wrap) {
    flex-shrink: 1;
    min-width: 0;
  }

  .toolbar :global(.btn-project) {
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

  .toolbar :global(.btn-project:hover) {
    background: #334155;
    border-color: #60a5fa;
  }

  .toolbar :global(.project-name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar :global(.project-chevron) {
    color: #94a3b8;
    font-size: 11px;
    flex-shrink: 0;
  }

  .toolbar :global(.project-dropdown) {
    min-width: 240px;
    max-height: 320px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
    scrollbar-width: thin;
    scrollbar-color: #475569 transparent;
  }

  .toolbar :global(.project-dropdown::-webkit-scrollbar) {
    width: 6px;
  }

  .toolbar :global(.project-dropdown::-webkit-scrollbar-track) {
    background: transparent;
  }

  .toolbar :global(.project-dropdown::-webkit-scrollbar-thumb) {
    background: #475569;
    border-radius: 3px;
  }

  .toolbar :global(.project-dropdown::-webkit-scrollbar-thumb:hover) {
    background: #64748b;
  }

  .toolbar :global(.project-item) {
    display: flex;
    align-items: center;
    padding: 0 4px 0 0;
    transition: background 0.1s;
  }

  .toolbar :global(.project-item:hover) {
    background: #334155;
  }

  .toolbar :global(.project-item.active) {
    background: #1e3a5f;
  }

  .toolbar :global(.project-item-name) {
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

  .toolbar :global(.project-item-label) {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar :global(.project-item-meta) {
    display: block;
    font-size: 10px;
    color: #64748b;
    font-weight: 400;
    margin-top: 1px;
  }

  .toolbar :global(.project-item.active .project-item-name) {
    color: #60a5fa;
    font-weight: 600;
  }

  .toolbar :global(.project-item.active .project-item-meta) {
    color: #93c5fd;
  }

  .toolbar :global(.id-copy-btn) {
    font-family: monospace;
    font-size: 9px;
    background: rgba(100, 116, 139, 0.15);
    border: none;
    border-radius: 2px;
    padding: 0 3px;
    color: inherit;
    cursor: pointer;
    vertical-align: baseline;
  }

  .toolbar :global(.id-copy-btn:hover) {
    background: rgba(100, 116, 139, 0.3);
  }

  .toolbar :global(.project-item-actions) {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .toolbar :global(.project-item:hover .project-item-actions) {
    opacity: 1;
  }

  .toolbar :global(.project-action-btn) {
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

  .toolbar :global(.project-action-btn:hover) {
    background: #475569;
    color: white;
  }

  .toolbar :global(.project-action-delete:hover) {
    background: #dc2626;
    color: white;
  }

  .toolbar :global(.project-rename-input) {
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

  .toolbar :global(.project-divider) {
    height: 1px;
    background: #334155;
    margin: 4px 0;
  }

  .toolbar :global(.project-new-btn) {
    color: #60a5fa !important;
    font-weight: 500;
  }

  .toolbar :global(.project-new-row) {
    display: flex;
    padding: 4px 8px;
    align-items: center;
    gap: 6px;
  }

  .toolbar :global(.project-new-row .project-rename-input) {
    margin: 0;
  }

  .toolbar :global(.project-new-confirm) {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: #3b82f6;
    color: white;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar :global(.project-new-confirm:hover) {
    background: #2563eb;
  }

  .toolbar :global(.project-shared-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .toolbar :global(.project-shared-loading),
  .toolbar :global(.project-shared-empty) {
    padding: 8px 12px;
    font-size: 12px;
    color: #64748b;
  }

  .toolbar :global(.shared-project-item) {
    padding-left: 12px;
  }
</style>
