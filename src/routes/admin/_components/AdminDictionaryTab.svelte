<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { dialogStore } from '$lib/store/dialog.svelte';

  interface DictShareToken {
    id: string;
    token: string;
    hasPassword: boolean;
    createdBy: string;
    createdAt: string;
    expiresAt: string | null;
  }

  let tokens = $state<DictShareToken[]>([]);
  let wordCount = $state(0);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create form
  let newPassword = $state('');
  let newExpires = $state('');

  onMount(async () => {
    await Promise.all([loadTokens(), loadWordCount()]);
  });

  async function loadTokens() {
    const res = await fetch('/api/admin/dictionary-tokens');
    if (res.ok) tokens = await res.json();
  }

  async function loadWordCount() {
    const res = await fetch('/api/dictionary?limit=0');
    if (res.ok) {
      const data = await res.json();
      wordCount = data.total;
    }
  }

  function shareUrl(token: string): string {
    return `${window.location.origin}/dictionary/share/${token}`;
  }

  async function copyUrl(token: string) {
    await navigator.clipboard.writeText(shareUrl(token));
    message = { type: 'success', text: m.dict_share_url_copied() };
    setTimeout(() => { message = null; }, 2000);
  }

  async function createToken() {
    message = null;
    const body: Record<string, unknown> = {};
    if (newPassword) body.password = newPassword;
    if (newExpires) body.expiresInDays = parseInt(newExpires, 10);

    const res = await fetch('/api/admin/dictionary-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      newPassword = '';
      newExpires = '';
      await loadTokens();
    } else {
      const data = await res.json();
      message = { type: 'error', text: data.error || 'Failed' };
    }
  }

  async function deleteToken(id: string) {
    const ok = await dialogStore.confirm(m.dict_share_delete_confirm(), { variant: 'danger' }); if (!ok) return;
    message = null;
    const res = await fetch('/api/admin/dictionary-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId: id }),
    });
    if (res.ok) {
      await loadTokens();
    } else {
      const data = await res.json();
      message = { type: 'error', text: data.error || 'Failed' };
    }
  }

  function isExpired(expiresAt: string | null): boolean {
    return !!expiresAt && new Date(expiresAt) < new Date();
  }
</script>

<section class="section">
  <h2>{m.admin_dict_tokens_title()} ({tokens.length})</h2>
  <p class="section-desc">{m.admin_dict_tokens_desc()}</p>
  <p class="section-desc">
    <a href="/dictionary" style="color:#60a5fa">{m.dict_title()}</a> — {m.dict_total_words({ count: wordCount })}
  </p>

  {#if message}
    <div class={message.type === 'error' ? 'msg-error' : 'msg-success'}>{message.text}</div>
  {/if}

  <div class="form-section">
    <h3>{m.dict_share_create()}</h3>
    <div class="form-grid">
      <input type="password" placeholder={m.dict_share_password()} bind:value={newPassword} />
      <select bind:value={newExpires}>
        <option value="">{m.dict_share_never()}</option>
        <option value="7">7d</option>
        <option value="30">30d</option>
        <option value="90">90d</option>
        <option value="365">1y</option>
      </select>
      <button class="btn-primary" onclick={createToken}>{m.dict_share_create()}</button>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th>Token</th>
        <th>{m.dict_share_password()}</th>
        <th>{m.dict_share_expires()}</th>
        <th>Created</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each tokens as t}
        <tr>
          <td><code style="font-size:11px;color:#4ade80">{t.token.slice(0, 16)}...</code></td>
          <td>{t.hasPassword ? '🔒' : '—'}</td>
          <td>
            {#if t.expiresAt}
              <span class:expired={isExpired(t.expiresAt)}>{new Date(t.expiresAt).toLocaleDateString()}</span>
            {:else}
              {m.dict_share_never()}
            {/if}
          </td>
          <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}</td>
          <td>
            <div class="btn-row">
              <button class="btn-sm" onclick={() => copyUrl(t.token)}>Copy URL</button>
              <button class="btn-sm btn-danger" onclick={() => deleteToken(t.id)}>{m.dict_delete()}</button>
            </div>
          </td>
        </tr>
      {/each}
      {#if tokens.length === 0}
        <tr><td colspan="5" style="text-align:center;color:#64748b">{m.dict_share_no_tokens()}</td></tr>
      {/if}
    </tbody>
  </table>
</section>
