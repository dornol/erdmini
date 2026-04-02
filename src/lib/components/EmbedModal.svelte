<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { projectStore } from '$lib/store/project.svelte';
  import { dialogStore } from '$lib/store/dialog.svelte';
  import { toastStore } from '$lib/store/toast.svelte';
  import ModalBackdrop from './ModalBackdrop.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  interface EmbedTokenInfo {
    id: string;
    token: string;
    hasPassword: boolean;
    createdBy: string;
    createdAt: string;
    expiresAt: string | null;
  }

  let tokens = $state<EmbedTokenInfo[]>([]);
  let loading = $state(true);

  // Create form
  let password = $state('');
  let expiresOption = $state<string>('never');

  // Copy state
  let copiedId = $state<string | null>(null);
  let copiedType = $state<'url' | 'iframe' | null>(null);

  const projectId = $derived(projectStore.index.activeProjectId);

  $effect(() => {
    if (projectId) loadTokens();
  });

  async function loadTokens() {
    loading = true;
    try {
      const res = await fetch(`/api/embed/${projectId}`);
      if (res.ok) {
        tokens = await res.json();
      }
    } catch {
      toastStore.error(m.login_network_error());
    }
    loading = false;
  }

  async function createToken() {
    const days: Record<string, number | undefined> = {
      '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'never': undefined,
    };
    const body: Record<string, unknown> = {};
    if (password.trim()) body.password = password.trim();
    if (days[expiresOption] != null) body.expiresInDays = days[expiresOption];

    const res = await fetch(`/api/embed/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      password = '';
      expiresOption = 'never';
      await loadTokens();
    } else {
      toastStore.error(m.login_network_error());
    }
  }

  async function deleteToken(tokenId: string) {
    const ok = await dialogStore.confirm(m.embed_delete_confirm(), {
      title: m.embed_delete(),
      confirmText: m.action_delete(),
      variant: 'danger',
    });
    if (!ok) return;

    const res = await fetch(`/api/embed/${projectId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId }),
    });
    if (!res.ok) {
      toastStore.error(m.login_network_error());
    }
    await loadTokens();
  }

  function getEmbedUrl(token: string): string {
    return `${window.location.origin}/embed/${token}`;
  }

  function getIframeSnippet(token: string): string {
    const url = getEmbedUrl(token);
    return `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border:1px solid #334155;border-radius:8px;"></iframe>`;
  }

  async function copyText(text: string, tokenId: string, type: 'url' | 'iframe') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts or permission denied
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copiedId = tokenId;
    copiedType = type;
    setTimeout(() => { copiedId = null; copiedType = null; }, 2000);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  const EXPIRES_OPTIONS = [
    { value: '7d', label: () => m.embed_expires_7d() },
    { value: '30d', label: () => m.embed_expires_30d() },
    { value: '90d', label: () => m.embed_expires_90d() },
    { value: '1y', label: () => m.embed_expires_1y() },
    { value: 'never', label: () => m.embed_expires_never() },
  ] as const;
</script>

<ModalBackdrop {onclose} priority>
  <div class="modal-panel">
    <div class="modal-header">
      <h2>{m.embed_title()}</h2>
      <button class="close-btn" onclick={onclose}>&times;</button>
    </div>

    <div class="modal-body">
      <!-- Create form -->
      <div class="create-section">
        <h3>{m.embed_create()}</h3>
        <div class="form-row">
          <input
            type="password"
            bind:value={password}
            placeholder={m.embed_password_placeholder()}
            class="form-input"
          />
        </div>
        <div class="form-row">
          <label class="form-label">{m.embed_expires()}
            <select bind:value={expiresOption} class="form-select">
              {#each EXPIRES_OPTIONS as opt}
                <option value={opt.value}>{opt.label()}</option>
              {/each}
            </select>
          </label>
        </div>
        <button class="btn-create" onclick={createToken}>{m.embed_create()}</button>
      </div>

      <div class="divider"></div>

      <!-- Token list -->
      {#if loading}
        <p class="muted">{m.embed_loading()}</p>
      {:else if tokens.length === 0}
        <p class="muted">{m.embed_no_tokens()}</p>
      {:else}
        <div class="token-list">
          {#each tokens as tok (tok.id)}
            <div class="token-card">
              <div class="token-info">
                <code class="token-value">{tok.token.slice(0, 12)}...</code>
                {#if tok.hasPassword}
                  <span class="badge password-badge">🔒</span>
                {/if}
                {#if tok.expiresAt}
                  <span class="badge expires-badge">{formatDate(tok.expiresAt)}</span>
                {/if}
                <span class="token-date">{formatDate(tok.createdAt)}</span>
              </div>
              <input
                class="embed-url-display"
                readonly
                value={getEmbedUrl(tok.token)}
                onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
              />
              <div class="token-actions">
                <button
                  class="btn-copy"
                  onclick={() => copyText(getEmbedUrl(tok.token), tok.id, 'url')}
                >
                  {copiedId === tok.id && copiedType === 'url' ? m.embed_copied() : m.embed_copy_url()}
                </button>
                <button
                  class="btn-copy"
                  onclick={() => copyText(getIframeSnippet(tok.token), tok.id, 'iframe')}
                >
                  {copiedId === tok.id && copiedType === 'iframe' ? m.embed_copied() : m.embed_copy_iframe()}
                </button>
                <button class="btn-delete" onclick={() => deleteToken(tok.id)}>
                  {m.embed_delete()}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</ModalBackdrop>

<style>
  .modal-panel {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 520px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #334155;
  }
  .modal-header h2 {
    color: #f1f5f9;
    font-size: 16px;
    margin: 0;
  }
  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
  }
  .close-btn:hover { color: #f1f5f9; }

  .modal-body {
    padding: 16px 20px;
    overflow-y: auto;
  }
  .create-section h3 {
    color: #e2e8f0;
    font-size: 14px;
    margin: 0 0 12px;
  }
  .form-row {
    margin-bottom: 10px;
  }
  .form-label {
    display: block;
    color: #94a3b8;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .form-input, .form-select {
    width: 100%;
    padding: 7px 10px;
    background: #0f172a;
    border: 1px solid #475569;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }
  .form-input:focus, .form-select:focus {
    border-color: #3b82f6;
  }
  .form-select { cursor: pointer; }
  .btn-create {
    padding: 7px 18px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    margin-top: 4px;
  }
  .btn-create:hover { background: #2563eb; }

  .divider {
    height: 1px;
    background: #334155;
    margin: 16px 0;
  }

  .muted {
    color: #64748b;
    font-size: 13px;
    text-align: center;
    padding: 16px 0;
  }

  .token-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .token-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .token-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .token-value {
    color: #60a5fa;
    font-size: 12px;
    background: #1e293b;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .password-badge {
    background: #334155;
    color: #fbbf24;
  }
  .expires-badge {
    background: #334155;
    color: #94a3b8;
  }
  .token-date {
    color: #64748b;
    font-size: 11px;
    margin-left: auto;
  }
  .embed-url-display {
    width: 100%;
    padding: 5px 8px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #94a3b8;
    font-size: 11px;
    font-family: monospace;
    margin-bottom: 8px;
    box-sizing: border-box;
    cursor: text;
    outline: none;
  }
  .embed-url-display:focus {
    border-color: #3b82f6;
    color: #e2e8f0;
  }
  .token-actions {
    display: flex;
    gap: 6px;
  }
  .btn-copy {
    padding: 4px 10px;
    background: #334155;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
  }
  .btn-copy:hover { background: #475569; }
  .btn-delete {
    padding: 4px 10px;
    background: transparent;
    color: #ef4444;
    border: 1px solid #7f1d1d;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    margin-left: auto;
  }
  .btn-delete:hover { background: #7f1d1d33; }
</style>
