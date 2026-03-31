<script lang="ts">
  import { onMount } from 'svelte';
  import type { OIDCProviderRow, LdapProviderRow } from '$lib/types/auth';
  import * as m from '$lib/paraglide/messages';
  import AdminUsersTab from './_components/AdminUsersTab.svelte';
  import AdminOidcTab from './_components/AdminOidcTab.svelte';
  import AdminLdapTab from './_components/AdminLdapTab.svelte';
  import AdminApiKeysTab from './_components/AdminApiKeysTab.svelte';
  import AdminProjectsTab from './_components/AdminProjectsTab.svelte';
  import AdminBackupTab from './_components/AdminBackupTab.svelte';
  import AdminAuditTab from './_components/AdminAuditTab.svelte';
  import AdminGroupsTab from './_components/AdminGroupsTab.svelte';
  import AdminBrandingTab from './_components/AdminBrandingTab.svelte';
  import AdminEmbedTab from './_components/AdminEmbedTab.svelte';
  import AdminDictionaryTab from './_components/AdminDictionaryTab.svelte';
  import type { UserInfo } from './_components/AdminUsersTab.svelte';
  import type { ApiKeyInfo } from './_components/AdminApiKeysTab.svelte';

  let users = $state<UserInfo[]>([]);
  let providers = $state<OIDCProviderRow[]>([]);
  let ldapProviders = $state<LdapProviderRow[]>([]);
  let apiKeys = $state<ApiKeyInfo[]>([]);
  let groups = $state<any[]>([]);
  let embedCount = $state(0);
  let projectCount = $state(0);
  let activeTab = $state<'users' | 'groups' | 'oidc' | 'ldap' | 'api-keys' | 'embeds' | 'dictionary' | 'projects' | 'branding' | 'backup' | 'audit-log'>('users');

  let pendingCount = $derived(users.filter(u => u.status === 'pending').length);

  onMount(async () => {
    await Promise.all([loadUsers(), loadProviders(), loadLdapProviders(), loadApiKeys(), loadGroups(), loadCounts()]);
  });

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) users = await res.json();
  }

  async function loadProviders() {
    const res = await fetch('/api/admin/oidc-providers');
    if (res.ok) providers = await res.json();
  }

  async function loadLdapProviders() {
    const res = await fetch('/api/admin/ldap-providers');
    if (res.ok) ldapProviders = await res.json();
  }

  async function loadApiKeys() {
    const res = await fetch('/api/admin/api-keys');
    if (res.ok) apiKeys = await res.json();
  }

  async function loadGroups() {
    const res = await fetch('/api/admin/groups');
    if (res.ok) groups = await res.json();
  }

  async function loadCounts() {
    const [embedRes, projectRes] = await Promise.all([
      fetch('/api/admin/embed-tokens'),
      fetch('/api/admin/projects'),
    ]);
    if (embedRes.ok) { const data = await embedRes.json(); embedCount = data.length; }
    if (projectRes.ok) { const data = await projectRes.json(); projectCount = data.length; }
  }
</script>

<div class="admin-page">
  <header class="admin-header">
    <a href="/" class="back-link">← Back</a>
    <h1>Admin</h1>
  </header>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'users'} onclick={() => (activeTab = 'users')}>
      {m.admin_tab_users()} ({users.length})
      {#if pendingCount > 0}
        <span class="tab-badge">{pendingCount}</span>
      {/if}
    </button>
    <button class="tab" class:active={activeTab === 'groups'} onclick={() => (activeTab = 'groups')}>
      {m.admin_tab_groups()} ({groups.length})
    </button>
    <button class="tab" class:active={activeTab === 'oidc'} onclick={() => (activeTab = 'oidc')}>
      {m.admin_tab_oidc()} ({providers.length})
    </button>
    <button class="tab" class:active={activeTab === 'ldap'} onclick={() => (activeTab = 'ldap')}>
      {m.admin_tab_ldap()} ({ldapProviders.length})
    </button>
    <button class="tab" class:active={activeTab === 'api-keys'} onclick={() => (activeTab = 'api-keys')}>
      {m.admin_tab_api_keys()} ({apiKeys.length})
    </button>
    <button class="tab" class:active={activeTab === 'embeds'} onclick={() => (activeTab = 'embeds')}>
      {m.admin_tab_embeds()} ({embedCount})
    </button>
    <button class="tab" class:active={activeTab === 'dictionary'} onclick={() => (activeTab = 'dictionary')}>
      {m.admin_tab_dictionary()}
    </button>
    <button class="tab" class:active={activeTab === 'projects'} onclick={() => (activeTab = 'projects')}>
      {m.admin_tab_projects()} ({projectCount})
    </button>
    <button class="tab" class:active={activeTab === 'branding'} onclick={() => (activeTab = 'branding')}>
      {m.admin_tab_branding()}
    </button>
    <button class="tab" class:active={activeTab === 'backup'} onclick={() => (activeTab = 'backup')}>
      {m.admin_tab_backup()}
    </button>
    <button class="tab" class:active={activeTab === 'audit-log'} onclick={() => (activeTab = 'audit-log')}>
      {m.admin_tab_audit_log()}
    </button>
  </div>

  {#if activeTab === 'users'}
    <AdminUsersTab {users} onreload={loadUsers} />
  {:else if activeTab === 'groups'}
    <AdminGroupsTab {groups} onreload={loadGroups} />
  {:else if activeTab === 'oidc'}
    <AdminOidcTab {providers} onreload={loadProviders} />
  {:else if activeTab === 'ldap'}
    <AdminLdapTab providers={ldapProviders} onreload={loadLdapProviders} />
  {:else if activeTab === 'api-keys'}
    <AdminApiKeysTab {apiKeys} {users} onreload={loadApiKeys} />
  {:else if activeTab === 'embeds'}
    <AdminEmbedTab />
  {:else if activeTab === 'dictionary'}
    <AdminDictionaryTab />
  {:else if activeTab === 'projects'}
    <AdminProjectsTab {users} />
  {:else if activeTab === 'branding'}
    <AdminBrandingTab />
  {:else if activeTab === 'backup'}
    <AdminBackupTab />
  {:else if activeTab === 'audit-log'}
    <AdminAuditTab />
  {/if}
</div>

<style>
  .admin-page {
    min-height: 100vh;
    background: var(--app-bg);
    color: var(--app-text);
    padding: 24px 40px;
  }

  .admin-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .admin-header h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
  }

  .back-link {
    color: var(--app-accent);
    text-decoration: none;
    font-size: 14px;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 24px;
    border-bottom: 1px solid var(--app-border);
    padding-bottom: 0;
  }

  .tab {
    padding: 10px 20px;
    background: none;
    border: none;
    color: var(--app-text-muted);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 0.15s;
  }

  .tab.active {
    color: var(--app-accent);
    border-bottom-color: var(--app-accent);
  }

  .tab:hover:not(.active) {
    color: var(--app-text-secondary);
  }

  .tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--app-warning-text, #f59e0b);
    color: #1e293b;
    font-size: 11px;
    font-weight: 700;
    margin-left: 6px;
  }

  /* Shared styles for child tab components (cascaded via :global) */
  .admin-page :global(.section h2) {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px;
  }

  .admin-page :global(.data-table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 13px;
  }

  .admin-page :global(.data-table th) {
    text-align: left;
    padding: 8px 12px;
    color: var(--app-text-muted);
    font-weight: 500;
    border-bottom: 1px solid var(--app-border);
  }

  .admin-page :global(.data-table td) {
    padding: 8px 12px;
    border-bottom: 1px solid var(--app-border-light);
  }

  .admin-page :global(.badge) {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: var(--app-badge-bg);
    color: var(--app-text-muted);
  }

  .admin-page :global(.badge-admin) {
    background: #1e3a5f;
    color: #60a5fa;
  }

  .admin-page :global(.badge-warn) {
    background: #713f12;
    color: #fbbf24;
    margin-left: 4px;
  }

  .admin-page :global(.badge-on) {
    background: #14532d;
    color: #4ade80;
  }

  .admin-page :global(.badge-active) {
    background: #14532d;
    color: #4ade80;
  }

  .admin-page :global(.badge-pending) {
    background: #713f12;
    color: #fbbf24;
  }

  .admin-page :global(.badge-perm) {
    background: #1e3a5f;
    color: #7dd3fc;
    font-size: 10px;
  }

  .admin-page :global(.perm-badges) {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .admin-page :global(.perm-checks) {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .admin-page :global(.perm-check) {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--app-text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .admin-page :global(.btn-approve) {
    background: var(--app-success);
    color: white;
  }

  .admin-page :global(.btn-approve:hover) {
    background: var(--app-success-hover);
  }

  .admin-page :global(.form-section) {
    background: var(--app-card-bg);
    border: 1px solid var(--app-border);
    border-radius: 8px;
    padding: 20px;
    margin-top: 16px;
  }

  .admin-page :global(.form-section h3) {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--app-text);
  }

  .admin-page :global(.form-grid) {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .admin-page :global(.form-grid input[type="text"]),
  .admin-page :global(.form-grid input[type="email"]),
  .admin-page :global(.form-grid input[type="password"]),
  .admin-page :global(.form-grid input:not([type])),
  .admin-page :global(.form-grid select) {
    padding: 8px 12px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 6px;
    color: var(--app-text);
    font-size: 13px;
    min-width: 160px;
    flex: 1;
  }

  .admin-page :global(.form-grid input:focus),
  .admin-page :global(.form-grid select:focus) {
    outline: none;
    border-color: var(--app-accent);
  }

  .admin-page :global(.checkbox-label) {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--app-text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .admin-page :global(.btn-primary) {
    padding: 8px 16px;
    background: var(--app-accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .admin-page :global(.btn-primary:hover) {
    background: var(--app-accent-hover);
  }

  .admin-page :global(.btn-cancel) {
    padding: 8px 16px;
    background: var(--app-cancel-bg);
    color: var(--app-cancel-text);
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .admin-page :global(.btn-cancel:hover) {
    background: var(--app-cancel-hover);
  }

  .admin-page :global(.btn-row) {
    display: flex;
    gap: 8px;
  }

  .admin-page :global(.btn-sm) {
    padding: 4px 10px;
    background: var(--app-badge-bg);
    color: var(--app-text-secondary);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .admin-page :global(.btn-sm:hover) {
    background: var(--app-hover-bg);
  }

  .admin-page :global(.btn-danger) {
    color: var(--app-danger);
  }

  .admin-page :global(.btn-danger:hover:not(:disabled)) {
    background: rgba(248, 113, 113, 0.1);
  }

  .admin-page :global(.btn-danger:disabled) {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .admin-page :global(.btn-save) {
    background: var(--app-success);
    color: white;
  }

  .admin-page :global(.btn-save:hover) {
    background: var(--app-success-hover);
  }

  .admin-page :global(.inline-input) {
    padding: 4px 8px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 4px;
    color: var(--app-text);
    font-size: 12px;
    width: 100%;
    min-width: 80px;
  }

  .admin-page :global(.inline-input:focus) {
    outline: none;
    border-color: var(--app-accent);
  }

  .admin-page :global(.inline-select) {
    padding: 4px 8px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 4px;
    color: var(--app-text);
    font-size: 12px;
  }

  .admin-page :global(.inline-select:focus) {
    outline: none;
    border-color: var(--app-accent);
  }

  .admin-page :global(.msg-error) {
    margin-top: 8px;
    font-size: 13px;
    color: var(--app-danger);
  }

  .admin-page :global(.msg-success) {
    margin-top: 8px;
    font-size: 13px;
    color: var(--app-success);
  }

  .admin-page :global(.section-desc) {
    font-size: 13px;
    color: var(--app-text-muted);
    margin: 0 0 16px;
  }

  .admin-page :global(.btn-secondary) {
    padding: 8px 16px;
    background: var(--app-cancel-bg);
    color: var(--app-cancel-text);
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .admin-page :global(.btn-secondary:hover) {
    background: var(--app-cancel-hover);
  }

  .admin-page :global(.clickable-row) {
    cursor: pointer;
  }

  .admin-page :global(.clickable-row:hover) {
    background: rgba(96, 165, 250, 0.05);
  }

  .admin-page :global(.empty-msg) {
    font-size: 14px;
    color: #64748b;
    text-align: center;
    padding: 32px 0;
  }

  .admin-page :global(.nowrap) {
    white-space: nowrap;
  }

  /* OIDC tab */
  .admin-page :global(.provider-card) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .admin-page :global(.provider-info) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .admin-page :global(.provider-info strong) {
    font-size: 14px;
  }

  .admin-page :global(.provider-detail) {
    font-size: 12px;
    color: #64748b;
  }

  .admin-page :global(.provider-badges) {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .admin-page :global(.provider-actions) {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  /* Users tab */
  .admin-page :global(.auth-badges) {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .admin-page :global(.badge-auth-local) {
    background: #1e3a5f;
    color: #93c5fd;
  }

  .admin-page :global(.badge-auth-oidc) {
    background: #312e81;
    color: #c4b5fd;
  }

  .admin-page :global(.badge-auth-ldap) {
    background: #1e3a3a;
    color: #5eead4;
  }

  .admin-page :global(.badge-group) {
    background: #1e293b;
    color: #a78bfa;
    border: 1px solid #4c1d95;
  }

  /* API Keys tab */
  .admin-page :global(.key-reveal) {
    background: #1a2332;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .admin-page :global(.key-reveal-warning) {
    font-size: 13px;
    color: #fbbf24;
    font-weight: 600;
    margin: 0 0 8px;
  }

  .admin-page :global(.key-reveal-row) {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  .admin-page :global(.key-value) {
    font-family: monospace;
    font-size: 12px;
    background: #0f172a;
    padding: 8px 12px;
    border-radius: 4px;
    color: #4ade80;
    word-break: break-all;
    flex: 1;
  }

  .admin-page :global(.btn-copy) {
    background: #22c55e;
    color: white;
    white-space: nowrap;
  }

  .admin-page :global(.btn-copy:hover) {
    background: #16a34a;
  }

  .admin-page :global(.expired) {
    color: #f87171;
  }

  .admin-page :global(.input-label) {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #cbd5e1;
    white-space: nowrap;
  }

  .admin-page :global(.input-label input) {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
  }

  .admin-page :global(.key-edit-form) {
    padding: 12px 16px;
    background: #1e293b;
    border-radius: 6px;
  }

  .admin-page :global(.scope-controls) {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  /* Projects tab */
  .admin-page :global(.project-name) {
    font-weight: 500;
  }

  .admin-page :global(.project-id) {
    font-size: 11px;
    color: #64748b;
    margin-left: 8px;
    font-family: monospace;
  }

  .admin-page :global(.project-detail) {
    padding: 12px 16px;
    background: #1e293b;
    border-radius: 6px;
  }

  .admin-page :global(.project-detail h4) {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px;
    color: #cbd5e1;
  }

  .admin-page :global(.member-list) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .admin-page :global(.member-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .admin-page :global(.member-name) {
    font-weight: 500;
  }

  .admin-page :global(.member-username) {
    color: #64748b;
    font-size: 12px;
  }

  .admin-page :global(.transfer-section) {
    border-top: 1px solid #334155;
    padding-top: 12px;
  }

  /* Backup tab */
  .admin-page :global(.stats-grid) {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .admin-page :global(.stat-item) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .admin-page :global(.stat-label) {
    font-size: 12px;
    color: #94a3b8;
  }

  .admin-page :global(.stat-value) {
    font-size: 16px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .admin-page :global(.restore-warning) {
    font-size: 13px;
    color: #f59e0b;
    margin: 0;
    padding: 8px 12px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 6px;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .admin-page :global(.restore-btn) {
    display: inline-block;
    cursor: pointer;
  }

  /* Audit Log tab */
  .admin-page :global(.audit-retention-bar) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    color: #94a3b8;
  }

  .admin-page :global(.retention-sep) {
    color: #475569;
  }

  .admin-page :global(.audit-filters) {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .admin-page :global(.audit-filters select),
  .admin-page :global(.audit-filters input[type="text"]) {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
  }

  .admin-page :global(.audit-filters select:focus),
  .admin-page :global(.audit-filters input:focus) {
    outline: none;
    border-color: #60a5fa;
  }

  .admin-page :global(.audit-total) {
    font-size: 13px;
    color: #94a3b8;
    margin-left: 8px;
  }

  .admin-page :global(.action-login) { background: #1e3a5f; color: #93c5fd; }
  .admin-page :global(.action-create) { background: #14532d; color: #4ade80; }
  .admin-page :global(.action-delete) { background: #7f1d1d; color: #fca5a5; }
  .admin-page :global(.action-update) { background: #713f12; color: #fbbf24; }
  .admin-page :global(.action-other) { background: #334155; color: #94a3b8; }

  .admin-page :global(.cat-badge) {
    background: #1e293b;
    color: #94a3b8;
    border: 1px solid #334155;
  }

  .admin-page :global(.detail-cell) {
    max-width: 300px;
    overflow: hidden;
  }

  .admin-page :global(.detail-summary) {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
    cursor: pointer;
  }

  .admin-page :global(.detail-expanded) {
    font-size: 12px;
    color: #cbd5e1;
    background: #0f172a;
    padding: 8px 12px;
    border-radius: 4px;
    max-width: 400px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 4px 0;
  }
</style>
