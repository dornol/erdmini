<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { dialogStore } from '$lib/store/dialog.svelte';

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
    message = { type: 'success', text: m.admin_embed_url_copied() };
    setTimeout(() => { message = null; }, 2000);
  }

  async function deleteToken(id: string, projectName: string) {
    const ok = await dialogStore.confirm(m.admin_embed_delete_confirm({ name: projectName }), { variant: 'danger' }); if (!ok) return;
    message = null;
    const res = await fetch('/api/admin/embed-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId: id }),
    });
    if (res.ok) {
      message = { type: 'success', text: m.admin_embed_deleted() };
      await loadTokens();
    } else {
      const data = await res.json();
      message = { type: 'error', text: data.error || 'Failed to delete.' };
    }
  }
</script>

<section class="section">
  <h2>{m.admin_embed_title({ count: String(tokens.length) })}</h2>
  <p class="section-desc">{m.admin_embed_desc()}</p>

  {#if message}
    <div class={message.type === 'success' ? 'msg-success' : 'msg-error'}>{message.text}</div>
  {/if}

  <table class="data-table">
    <thead>
      <tr>
        <th>{m.admin_embed_project()}</th>
        <th>{m.admin_embed_password()}</th>
        <th>{m.admin_embed_created_by()}</th>
        <th>{m.admin_embed_created()}</th>
        <th>{m.admin_embed_expires()}</th>
        <th>{m.admin_embed_actions()}</th>
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
              <span class="badge badge-on">{m.admin_embed_has_password()}</span>
            {:else}
              <span class="badge">{m.admin_embed_no_password()}</span>
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
              {m.admin_embed_never()}
            {/if}
          </td>
          <td>
            <div class="btn-row">
              <button class="btn-sm" onclick={() => copyUrl(t.token)}>{m.admin_embed_copy_url()}</button>
              <button class="btn-sm btn-danger" onclick={() => deleteToken(t.id, t.projectName)}>{m.action_delete()}</button>
            </div>
          </td>
        </tr>
      {/each}
      {#if tokens.length === 0}
        <tr><td colspan="6" class="empty-msg">{m.admin_embed_no_tokens()}</td></tr>
      {/if}
    </tbody>
  </table>
</section>
