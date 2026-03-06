<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';

  type AuditLogRow = {
    id: number;
    timestamp: string;
    user_id: string | null;
    username: string | null;
    action: string;
    category: string;
    resource_type: string | null;
    resource_id: string | null;
    detail: string | null;
    ip: string | null;
    source: string | null;
  };

  let auditLogs = $state<AuditLogRow[]>([]);
  let auditTotal = $state(0);
  let auditCategory = $state('');
  let auditAction = $state('');
  let auditLoading = $state(false);
  let expandedAuditId = $state<number | null>(null);
  let auditStats = $state<{ totalCount: number; oldestTimestamp: string | null; retentionDays: number } | null>(null);
  let auditPurgeMsg = $state('');

  onMount(() => {
    loadAuditLogs();
    loadAuditStats();
  });

  async function loadAuditLogs(reset = true) {
    auditLoading = true;
    if (reset) auditLogs = [];
    const params = new URLSearchParams();
    if (auditCategory) params.set('category', auditCategory);
    if (auditAction) params.set('action', auditAction);
    params.set('limit', '100');
    params.set('offset', reset ? '0' : String(auditLogs.length));
    const res = await fetch(`/api/admin/audit-logs?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (reset) {
        auditLogs = data.logs;
      } else {
        auditLogs = [...auditLogs, ...data.logs];
      }
      auditTotal = data.total;
    }
    auditLoading = false;
  }

  async function loadAuditStats() {
    const res = await fetch('/api/admin/audit-logs?stats=1');
    if (res.ok) auditStats = await res.json();
  }

  async function purgeAuditLogs() {
    if (!auditStats) return;
    const days = auditStats.retentionDays;
    if (!confirm(m.admin_audit_purge_confirm({ days: String(days) }))) return;
    const res = await fetch(`/api/admin/audit-logs?days=${days}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      auditPurgeMsg = m.admin_audit_purge_result({ count: String(data.deleted) });
      loadAuditLogs();
      loadAuditStats();
      setTimeout(() => auditPurgeMsg = '', 5000);
    }
  }

  function formatAuditTimestamp(ts: string): string {
    try {
      const d = new Date(ts + 'Z');
      return d.toLocaleString();
    } catch {
      return ts;
    }
  }
</script>

<section class="section">
  <h2>{m.admin_audit_title()}</h2>

  {#if auditStats}
    <div class="audit-retention-bar">
      <span>{m.admin_audit_retention({ days: String(auditStats.retentionDays) })}</span>
      <span class="retention-sep">|</span>
      <span>{m.admin_audit_total({ count: String(auditStats.totalCount) })}</span>
      {#if auditStats.oldestTimestamp}
        <span class="retention-sep">|</span>
        <span>{m.admin_audit_oldest({ date: formatAuditTimestamp(auditStats.oldestTimestamp) })}</span>
      {/if}
      <button class="btn-sm btn-danger" style="margin-left:auto" onclick={purgeAuditLogs}>
        {m.admin_audit_purge()}
      </button>
    </div>
    {#if auditPurgeMsg}<div class="msg-success">{auditPurgeMsg}</div>{/if}
  {/if}

  <div class="audit-filters">
    <select bind:value={auditCategory} onchange={() => loadAuditLogs()}>
      <option value="">{m.admin_audit_filter_all()}</option>
      <option value="auth">auth</option>
      <option value="user">user</option>
      <option value="project">project</option>
      <option value="api-key">api-key</option>
      <option value="oidc-provider">oidc-provider</option>
      <option value="ldap-provider">ldap-provider</option>
      <option value="group">group</option>
      <option value="backup">backup</option>
      <option value="mcp">mcp</option>
      <option value="schema">schema</option>
    </select>
    <input
      type="text"
      placeholder={m.admin_audit_action()}
      bind:value={auditAction}
      onkeydown={(e) => { if (e.key === 'Enter') loadAuditLogs(); }}
    />
    <button class="btn-secondary" onclick={() => loadAuditLogs()}>
      Search
    </button>
    {#if auditTotal > 0}
      <span class="audit-total">{m.admin_audit_total({ count: String(auditTotal) })}</span>
    {/if}
  </div>

  {#if auditLogs.length === 0 && !auditLoading}
    <p class="empty-msg">{m.admin_audit_no_logs()}</p>
  {:else}
    <table class="data-table">
      <thead>
        <tr>
          <th>{m.admin_audit_timestamp()}</th>
          <th>{m.admin_audit_user()}</th>
          <th>{m.admin_audit_action()}</th>
          <th>{m.admin_audit_category()}</th>
          <th>{m.admin_audit_resource()}</th>
          <th>{m.admin_audit_detail()}</th>
        </tr>
      </thead>
      <tbody>
        {#each auditLogs as log}
          <tr onclick={() => expandedAuditId = expandedAuditId === log.id ? null : log.id} class="clickable-row">
            <td class="nowrap">{formatAuditTimestamp(log.timestamp)}</td>
            <td>{log.username ?? m.admin_audit_system()}</td>
            <td><span class="badge action-{log.action.startsWith('login') || log.action === 'oidc_login' ? 'login' : log.action.startsWith('create') || log.action.startsWith('add') ? 'create' : log.action.startsWith('delete') ? 'delete' : log.action.startsWith('update') ? 'update' : 'other'}">{log.action}</span></td>
            <td><span class="badge cat-badge">{log.category}</span></td>
            <td class="nowrap">{log.resource_type && log.resource_id ? `${log.resource_type}:${log.resource_id.slice(0, 8)}` : ''}</td>
            <td class="detail-cell">
              {#if log.detail}
                {#if expandedAuditId === log.id}
                  <pre class="detail-expanded">{JSON.stringify(JSON.parse(log.detail), null, 2)}</pre>
                {:else}
                  <span class="detail-summary">{log.detail.length > 60 ? log.detail.slice(0, 60) + '...' : log.detail}</span>
                {/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if auditLogs.length < auditTotal}
      <div style="text-align:center;margin-top:16px">
        <button class="btn-secondary" onclick={() => loadAuditLogs(false)} disabled={auditLoading}>
          {auditLoading ? '...' : m.admin_audit_load_more()}
        </button>
      </div>
    {/if}
  {/if}
</section>
