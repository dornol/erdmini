<script lang="ts">
  import { onMount } from 'svelte';

  interface EmbedTokenInfo {
    id: string;
    projectId: string;
    projectName: string;
    token: string;
    hasPassword: boolean;
    createdBy: string;
    creatorUsername: string | null;
    createdAt: string;
    expiresAt: string | null;
  }

  let tokens = $state<EmbedTokenInfo[]>([]);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  onMount(loadTokens);

  async function loadTokens() {
    const res = await fetch('/api/admin/embed-tokens');
    if (res.ok) tokens = await res.json();
  }

  function isExpired(expiresAt: string | null): boolean {
    return !!expiresAt && new Date(expiresAt) < new Date();
  }

  function embedUrl(token: string): string {
    return `${window.location.origin}/embed/${token}`;
  }

  async function copyUrl(token: string) {
    await navigator.clipboard.writeText(embedUrl(token));
    message = { type: 'success', text: 'URL copied.' };
    setTimeout(() => { message = null; }, 2000);
  }

  async function deleteToken(id: string, projectName: string) {
    if (!confirm(`Delete embed token for "${projectName}"?`)) return;
    message = null;
    const res = await fetch('/api/admin/embed-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId: id }),
    });
    if (res.ok) {
      message = { type: 'success', text: 'Token deleted.' };
      await loadTokens();
    } else {
      const data = await res.json();
      message = { type: 'error', text: data.error || 'Failed to delete.' };
    }
  }
</script>

<section class="section">
  <h2>Embed Tokens ({tokens.length})</h2>
  <p class="section-desc">Manage embed URLs across all projects. Embed links allow read-only access to project schemas.</p>

  {#if message}
    <div class={message.type === 'success' ? 'msg-success' : 'msg-error'}>{message.text}</div>
  {/if}

  <table class="data-table">
    <thead>
      <tr>
        <th>Project</th>
        <th>Password</th>
        <th>Created By</th>
        <th>Created</th>
        <th>Expires</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each tokens as t}
        <tr>
          <td>
            <span class="project-name">{t.projectName}</span>
          </td>
          <td>
            {#if t.hasPassword}
              <span class="badge badge-on">Yes</span>
            {:else}
              <span class="badge">No</span>
            {/if}
          </td>
          <td>{t.createdBy}{t.creatorUsername ? ` (${t.creatorUsername})` : ''}</td>
          <td class="nowrap">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-'}</td>
          <td class="nowrap">
            {#if t.expiresAt}
              <span class:expired={isExpired(t.expiresAt)}>
                {new Date(t.expiresAt).toLocaleDateString()}
              </span>
            {:else}
              Never
            {/if}
          </td>
          <td>
            <div class="btn-row">
              <button class="btn-sm" onclick={() => copyUrl(t.token)}>Copy URL</button>
              <button class="btn-sm btn-danger" onclick={() => deleteToken(t.id, t.projectName)}>Delete</button>
            </div>
          </td>
        </tr>
      {/each}
      {#if tokens.length === 0}
        <tr><td colspan="6" class="empty-msg">No embed tokens</td></tr>
      {/if}
    </tbody>
  </table>
</section>
