<script lang="ts">
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { appPath } from '$lib/utils/paths';

  interface DictShareToken {
    id: string;
    dictionaryId: string;
    token: string;
    hasPassword: boolean;
    createdBy: string;
    createdAt: string;
    expiresAt: string | null;
  }

  interface DictionaryRow {
    id: string;
    name: string;
    description: string | null;
    is_default: number;
  }

  let dictionaries = $state<DictionaryRow[]>([]);
  let selectedDictionaryId = $state('default');
  let tokens = $state<DictShareToken[]>([]);
  let wordCount = $state(0);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create form
  let newPassword = $state('');
  let newExpires = $state('');

  onMount(async () => {
    await loadDictionaries();
    await Promise.all([loadTokens(), loadWordCount()]);
  });

  async function loadDictionaries() {
    const res = await fetch(appPath('/api/dictionaries'));
    if (!res.ok) return;
    dictionaries = await res.json();
    if (!dictionaries.some(d => d.id === selectedDictionaryId)) {
      selectedDictionaryId = dictionaries[0]?.id ?? 'default';
    }
  }

  async function loadTokens() {
    const res = await fetch(appPath('/api/admin/dictionary-tokens'));
    if (res.ok) tokens = await res.json();
  }

  async function loadWordCount() {
    const res = await fetch(appPath(`/api/dictionary?limit=0&dictionaryId=${encodeURIComponent(selectedDictionaryId)}`));
    if (res.ok) {
      const data = await res.json();
      wordCount = data.total;
    }
  }

  function dictionaryName(id: string): string {
    return dictionaries.find(d => d.id === id)?.name ?? id;
  }

  async function selectDictionary(id: string) {
    selectedDictionaryId = id;
    await loadWordCount();
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
    const body: Record<string, unknown> = { dictionaryId: selectedDictionaryId };
    if (newPassword) body.password = newPassword;
    if (newExpires) body.expiresInDays = parseInt(newExpires, 10);

    const res = await fetch(appPath('/api/admin/dictionary-tokens'), {
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
    const res = await fetch(appPath('/api/admin/dictionary-tokens'), {
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
    <a href={appPath('/dictionary')} style="color:#60a5fa">{m.dict_title()}</a> — {m.dict_total_words({ count: wordCount })}
  </p>

  {#if message}
    <div class={message.type === 'error' ? 'msg-error' : 'msg-success'}>{message.text}</div>
  {/if}

  <div class="form-section">
    <h3>{m.dict_share_create()}</h3>
    <div class="form-grid">
      <select value={selectedDictionaryId} onchange={(e) => selectDictionary((e.target as HTMLSelectElement).value)}>
        {#each dictionaries as dict}
          <option value={dict.id}>{dict.name}{dict.is_default ? ` (${m.dict_default()})` : ''}</option>
        {/each}
      </select>
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
        <th>{m.dict_title()}</th>
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
          <td>{dictionaryName(t.dictionaryId)}</td>
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
        <tr><td colspan="6" style="text-align:center;color:#64748b">{m.dict_share_no_tokens()}</td></tr>
      {/if}
    </tbody>
  </table>
</section>
