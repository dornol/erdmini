<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { page as pageStore } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/store/auth.svelte';
  import { onMount } from 'svelte';
  import { exportDictionaryXlsx, exportDictionaryTemplate, parseDictionaryXlsx } from '$lib/utils/dictionary-xlsx';

  interface WordRow {
    id: string;
    word: string;
    meaning: string;
    description: string | null;
    category: string | null;
    status: string;
    created_by: string;
    created_by_name: string | null;
    created_at: string;
    updated_at: string;
  }

  interface ShareToken {
    id: string;
    token: string;
    hasPassword: boolean;
    createdBy: string;
    createdAt: string;
    expiresAt: string | null;
  }

  let words = $state<WordRow[]>([]);
  let total = $state(0);
  let pendingCount = $state(0);
  let pendingWords = $state<WordRow[]>([]);
  let mySuggestions = $state<WordRow[]>([]);
  let categories = $state<string[]>([]);
  let loading = $state(true);
  let error = $state('');
  let success = $state('');

  let search = $state('');
  let selectedCategory = $state<string | undefined>(undefined);
  let page = $state(1);
  const limit = 50;

  let editingId = $state<string | null>(null);
  let editForm = $state({ word: '', meaning: '', description: '', category: '' });
  let addForm = $state({ word: '', meaning: '', description: '', category: '' });
  let showAddRow = $state(false);

  let shareTokens = $state<ShareToken[]>([]);
  let showShare = $state(false);
  let newSharePassword = $state('');
  let newShareExpires = $state('');
  let shareCopied = $state<string | null>(null);

  const isAdmin = $derived(authStore.user?.role === 'admin');

  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; loadWords(); }, 300);
  }

  async function loadWords() {
    error = '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategory !== undefined) params.set('category', selectedCategory);
    params.set('page', String(page));
    params.set('limit', String(limit));
    const res = await fetch(`/api/dictionary?${params}`);
    if (!res.ok) { error = 'Failed to load'; return; }
    const data = await res.json();
    words = data.words;
    total = data.total;
    pendingCount = data.pendingCount ?? 0;
    mySuggestions = data.mySuggestions ?? [];
  }

  async function loadPendingWords() {
    const res = await fetch('/api/dictionary?status=pending&limit=200');
    if (res.ok) { pendingWords = (await res.json()).words; }
  }

  async function loadCategories() {
    const res = await fetch('/api/dictionary/categories');
    if (res.ok) categories = await res.json();
  }

  async function loadShareTokens() {
    const res = await fetch('/api/admin/dictionary-tokens');
    if (res.ok) shareTokens = await res.json();
  }

  async function reload() {
    await Promise.all([loadWords(), loadCategories()]);
    if (isAdmin) await loadPendingWords();
  }

  onMount(async () => {
    const layoutData = $pageStore.data as { isServerMode?: boolean };
    if (!layoutData.isServerMode) { goto('/'); return; }
    await Promise.all([loadWords(), loadCategories()]);
    if (isAdmin) await Promise.all([loadShareTokens(), loadPendingWords()]);
    loading = false;
  });

  function selectCategory(cat: string | undefined) { selectedCategory = cat; page = 1; loadWords(); }
  function prevPage() { if (page > 1) { page--; loadWords(); } }
  function nextPage() { if (page * limit < total) { page++; loadWords(); } }

  async function submitAdd() {
    error = ''; success = '';
    if (!addForm.word.trim() || !addForm.meaning.trim()) return;
    const res = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    addForm = { word: '', meaning: '', description: '', category: '' };
    if (!isAdmin) {
      success = m.dict_suggest_success();
      setTimeout(() => (success = ''), 3000);
      showAddRow = false;
    }
    await reload();
  }

  function startEdit(w: WordRow) {
    editingId = w.id;
    editForm = { word: w.word, meaning: w.meaning, description: w.description || '', category: w.category || '' };
  }

  async function saveEdit(alsoApprove = false) {
    if (!editingId) return;
    error = '';
    const body: Record<string, unknown> = { ...editForm };
    if (alsoApprove) body.status = 'approved';
    const res = await fetch(`/api/dictionary/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    editingId = null;
    await reload();
  }

  async function deleteWordById(id: string, word: string) {
    if (!confirm(m.dict_delete_confirm({ word }))) return;
    await fetch(`/api/dictionary/${id}`, { method: 'DELETE' });
    await reload();
  }

  async function approveWord(id: string) {
    await fetch(`/api/dictionary/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    await reload();
  }

  async function rejectWord(id: string) {
    await fetch(`/api/dictionary/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    await reload();
  }

  // Cancel own pending suggestion / dismiss rejected
  async function dismissSuggestion(id: string) {
    await fetch(`/api/dictionary/${id}`, { method: 'DELETE' });
    await reload();
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitAdd();
    if (e.key === 'Escape') showAddRow = false;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') editingId = null;
  }

  async function exportWordsJson() {
    const res = await fetch('/api/dictionary/export');
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'word-dictionary.json' }).click();
    URL.revokeObjectURL(url);
  }

  async function exportWordsXlsx() {
    const res = await fetch('/api/dictionary/export');
    if (!res.ok) return;
    exportDictionaryXlsx(await res.json());
  }

  async function importWordsFromFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,.xlsx,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      error = '';
      let data: { word: string; meaning: string; description?: string | null; category?: string | null }[];
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        try { data = JSON.parse(text); } catch { error = 'Invalid JSON'; return; }
        if (!Array.isArray(data)) { error = 'Expected JSON array'; return; }
      } else {
        data = parseDictionaryXlsx(await file.arrayBuffer());
        if (data.length === 0) { error = 'No valid rows found'; return; }
      }
      const res = await fetch('/api/dictionary/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (!res.ok) { error = 'Import failed'; return; }
      const result = await res.json();
      success = m.dict_import_success({ created: result.created, updated: result.updated });
      setTimeout(() => (success = ''), 3000);
      await reload();
    };
    input.click();
  }

  async function createShareToken() {
    const body: Record<string, unknown> = {};
    if (newSharePassword) body.password = newSharePassword;
    if (newShareExpires) body.expiresInDays = parseInt(newShareExpires, 10);
    const res = await fetch('/api/admin/dictionary-tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) { newSharePassword = ''; newShareExpires = ''; await loadShareTokens(); }
  }

  async function deleteShareToken(tokenId: string) {
    if (!confirm(m.dict_share_delete_confirm())) return;
    await fetch('/api/admin/dictionary-tokens', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenId }),
    });
    await loadShareTokens();
  }

  async function copyShareUrl(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/dictionary/share/${token}`);
    shareCopied = token;
    setTimeout(() => (shareCopied = null), 2000);
  }

  const totalPages = $derived(Math.ceil(total / limit));
</script>

<div class="dict-page">
  <div class="dict-header">
    <a href="/" class="back-link">&larr; {m.dict_back()}</a>
    <h1>{m.dict_title()}</h1>
  </div>

  <p class="section-desc">
    {m.dict_total_words({ count: total })}
    {#if isAdmin && pendingCount > 0}
      &middot; <span class="badge badge-pending">{m.dict_pending_count({ count: pendingCount })}</span>
    {/if}
  </p>

  <!-- Toolbar -->
  <div class="toolbar-row">
    <button class="btn-primary" onclick={() => { showAddRow = true; }}>
      {isAdmin ? m.dict_add() : m.dict_suggest()}
    </button>
    {#if isAdmin}
      <button class="btn-sm" onclick={importWordsFromFile}>{m.dict_import()}</button>
      <button class="btn-sm" onclick={() => exportDictionaryTemplate()}>Template</button>
    {/if}
    <button class="btn-sm" onclick={exportWordsXlsx}>Excel</button>
    <button class="btn-sm" onclick={exportWordsJson}>JSON</button>
    {#if isAdmin}
      <button class="btn-sm" class:btn-sm-active={showShare} onclick={() => (showShare = !showShare)}>{m.dict_share_title()}</button>
    {/if}
  </div>

  {#if error}<div class="msg-error">{error}</div>{/if}
  {#if success}<div class="msg-success">{success}</div>{/if}

  <!-- Share section -->
  {#if isAdmin && showShare}
    <div class="form-section">
      <h3>{m.dict_share_title()}</h3>
      <div class="form-grid">
        <input type="password" placeholder={m.dict_share_password()} bind:value={newSharePassword} />
        <select bind:value={newShareExpires}>
          <option value="">{m.dict_share_never()}</option>
          <option value="7">7d</option><option value="30">30d</option><option value="90">90d</option><option value="365">1y</option>
        </select>
        <button class="btn-primary" onclick={createShareToken}>{m.dict_share_create()}</button>
      </div>
      {#if shareTokens.length > 0}
        <table class="data-table" style="margin-top:12px">
          <thead><tr><th>Token</th><th>{m.dict_share_password()}</th><th>{m.dict_share_expires()}</th><th></th></tr></thead>
          <tbody>
            {#each shareTokens as t}
              <tr>
                <td><code style="color:var(--app-success);font-size:11px">{t.token.slice(0,20)}...</code></td>
                <td>{t.hasPassword ? '🔒' : '—'}</td>
                <td>
                  {#if t.expiresAt}
                    <span class:expired={new Date(t.expiresAt) < new Date()}>{new Date(t.expiresAt).toLocaleDateString()}</span>
                  {:else}
                    {m.dict_share_never()}
                  {/if}
                </td>
                <td>
                  <div class="btn-row">
                    <button class="btn-sm" onclick={() => copyShareUrl(t.token)}>{shareCopied === t.token ? '✓ Copied' : 'Copy URL'}</button>
                    <button class="btn-sm btn-danger" onclick={() => deleteShareToken(t.id)}>✕</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p style="color:var(--app-text-faint);font-size:12px;margin-top:8px">{m.dict_share_no_tokens()}</p>
      {/if}
    </div>
  {/if}

  <!-- Admin: Pending -->
  {#if isAdmin && pendingWords.length > 0}
    <div class="form-section pending-section">
      <h3 style="color:var(--app-warning-text)">{m.dict_pending()} ({pendingWords.length})</h3>
      <table class="data-table">
        <thead><tr>
          <th>{m.dict_word()}</th><th>{m.dict_meaning()}</th><th>{m.dict_description()}</th>
          <th>{m.dict_category()}</th><th>{m.dict_requested_by()}</th><th></th>
        </tr></thead>
        <tbody>
          {#each pendingWords as w}
            {#if editingId === w.id}
              <tr>
                <td><input class="inline-input" bind:value={editForm.word} onkeydown={handleEditKeydown} /></td>
                <td><input class="inline-input" bind:value={editForm.meaning} onkeydown={handleEditKeydown} /></td>
                <td><input class="inline-input" bind:value={editForm.description} onkeydown={handleEditKeydown} /></td>
                <td><input class="inline-input" bind:value={editForm.category} onkeydown={handleEditKeydown} /></td>
                <td></td>
                <td><div class="btn-row">
                  <button class="btn-sm btn-approve" onclick={() => saveEdit(true)}>{m.dict_approve()}</button>
                  <button class="btn-sm" onclick={() => (editingId = null)}>{m.action_cancel()}</button>
                </div></td>
              </tr>
            {:else}
              <tr>
                <td><strong style="color:var(--app-code);font-family:monospace">{w.word}</strong></td>
                <td>{w.meaning}</td>
                <td style="color:var(--app-text-faint)">{w.description || ''}</td>
                <td>{#if w.category}<span class="badge">{w.category}</span>{/if}</td>
                <td style="color:var(--app-text-faint);font-size:12px">{w.created_by_name || w.created_by}</td>
                <td><div class="btn-row">
                  <button class="btn-sm" onclick={() => startEdit(w)}>{m.dict_edit()}</button>
                  <button class="btn-sm btn-approve" onclick={() => approveWord(w.id)}>{m.dict_approve()}</button>
                  <button class="btn-sm btn-danger" onclick={() => rejectWord(w.id)}>{m.dict_reject()}</button>
                </div></td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- User: My suggestions (pending + rejected) -->
  {#if !isAdmin && mySuggestions.length > 0}
    <div class="form-section">
      <h3>{m.dict_suggest()} ({mySuggestions.length})</h3>
      <table class="data-table">
        <thead><tr><th>{m.dict_word()}</th><th>{m.dict_meaning()}</th><th></th><th></th></tr></thead>
        <tbody>
          {#each mySuggestions as w}
            <tr>
              <td><strong style="color:var(--app-code);font-family:monospace">{w.word}</strong></td>
              <td>{w.meaning}</td>
              <td>
                {#if w.status === 'pending'}
                  <span class="badge badge-pending">{m.dict_pending()}</span>
                {:else if w.status === 'rejected'}
                  <span class="badge badge-rejected">{m.dict_rejected()}</span>
                {/if}
              </td>
              <td>
                {#if w.status === 'pending'}
                  <button class="btn-sm" onclick={() => dismissSuggestion(w.id)}>{m.action_cancel()}</button>
                {:else if w.status === 'rejected'}
                  <button class="btn-sm" onclick={() => dismissSuggestion(w.id)}>{m.action_dismiss()}</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Filters -->
  <div class="filter-row">
    <input class="filter-search" placeholder={m.dict_search()} bind:value={search} oninput={onSearchInput} />
    {#if categories.length > 0}
      <div class="filter-pills">
        <button class="pill" class:active={selectedCategory === undefined} onclick={() => selectCategory(undefined)}>{m.dict_all_categories()}</button>
        <button class="pill" class:active={selectedCategory === ''} onclick={() => selectCategory('')}>{m.dict_uncategorized()}</button>
        {#each categories as cat}
          <button class="pill" class:active={selectedCategory === cat} onclick={() => selectCategory(cat)}>{cat}</button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Main table -->
  {#if loading}
    <div class="empty-state">{m.dict_share_loading()}</div>
  {:else}
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:16%">{m.dict_word()}</th>
          <th style="width:28%">{m.dict_meaning()}</th>
          <th style="width:30%">{m.dict_description()}</th>
          <th style="width:14%">{m.dict_category()}</th>
          {#if isAdmin || showAddRow}<th style="width:12%"></th>{/if}
        </tr>
      </thead>
      <tbody>
        <!-- Inline add row -->
        {#if showAddRow}
          <tr>
            <td><input class="inline-input" placeholder="seq" bind:value={addForm.word} onkeydown={handleAddKeydown} /></td>
            <td><input class="inline-input" placeholder="일련번호" bind:value={addForm.meaning} onkeydown={handleAddKeydown} /></td>
            <td><input class="inline-input" bind:value={addForm.description} onkeydown={handleAddKeydown} /></td>
            <td><input class="inline-input" bind:value={addForm.category} onkeydown={handleAddKeydown} /></td>
            <td><div class="btn-row">
              <button class="btn-sm btn-save" onclick={submitAdd}>{isAdmin ? m.dict_save() : m.dict_suggest()}</button>
              <button class="btn-sm" onclick={() => (showAddRow = false)}>✕</button>
            </div></td>
          </tr>
        {/if}

        {#each words as w}
          {#if editingId === w.id}
            <tr>
              <td><input class="inline-input" bind:value={editForm.word} onkeydown={handleEditKeydown} /></td>
              <td><input class="inline-input" bind:value={editForm.meaning} onkeydown={handleEditKeydown} /></td>
              <td><input class="inline-input" bind:value={editForm.description} onkeydown={handleEditKeydown} /></td>
              <td><input class="inline-input" bind:value={editForm.category} onkeydown={handleEditKeydown} /></td>
              <td><div class="btn-row">
                <button class="btn-sm btn-save" onclick={() => saveEdit()}>{m.dict_save()}</button>
                <button class="btn-sm" onclick={() => (editingId = null)}>✕</button>
              </div></td>
            </tr>
          {:else}
            <tr>
              <td><strong style="color:var(--app-code);font-family:monospace">{w.word}</strong></td>
              <td>{w.meaning}</td>
              <td style="color:var(--app-text-faint);font-size:12px">{w.description || ''}</td>
              <td>{#if w.category}<span class="badge">{w.category}</span>{/if}</td>
              {#if isAdmin}
                <td><div class="btn-row">
                  <button class="btn-sm" onclick={() => startEdit(w)}>{m.dict_edit()}</button>
                  <button class="btn-sm btn-danger" onclick={() => deleteWordById(w.id, w.word)}>✕</button>
                </div></td>
              {/if}
            </tr>
          {/if}
        {/each}

        {#if words.length === 0 && !showAddRow}
          <tr><td colspan={(isAdmin || showAddRow) ? 5 : 4} class="empty-state">{m.dict_no_words()}</td></tr>
        {/if}
      </tbody>
    </table>

    {#if totalPages > 1}
      <div class="pagination">
        <button class="btn-sm" disabled={page <= 1} onclick={prevPage}>&laquo;</button>
        <span>{page} / {totalPages}</span>
        <button class="btn-sm" disabled={page >= totalPages} onclick={nextPage}>&raquo;</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .dict-page {
    min-height: 100vh;
    background: var(--app-bg);
    color: var(--app-text);
    padding: 24px 40px;
  }

  .dict-header { display: flex; align-items: center; gap: 16px; margin-bottom: 4px; }
  .dict-header h1 { font-size: 22px; font-weight: 700; margin: 0; }

  .back-link { color: var(--app-accent); text-decoration: none; font-size: 14px; }
  .back-link:hover { text-decoration: underline; }

  .section-desc { color: var(--app-text-muted); font-size: 13px; margin: 0 0 16px; }

  .toolbar-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }

  /* ── Filters ────────────────────────────────────── */
  .filter-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }

  .filter-search {
    padding: 8px 12px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 6px;
    color: var(--app-text);
    font-size: 13px;
    min-width: 200px;
    flex: 1;
    max-width: 360px;
  }

  .filter-search:focus { outline: none; border-color: var(--app-accent); }

  .filter-pills { display: flex; gap: 4px; flex-wrap: wrap; }

  .pill {
    padding: 4px 12px;
    background: none;
    border: 1px solid var(--app-border);
    border-radius: 4px;
    color: var(--app-text-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .pill:hover { color: var(--app-text); background: var(--app-hover-bg); }
  .pill.active { background: var(--app-accent); border-color: var(--app-accent); color: white; }

  .pending-section { border-color: var(--app-warning-bg) !important; }

  .expired { color: var(--app-danger); }

  .empty-state { text-align: center; padding: 32px; color: var(--app-text-faint); font-size: 14px; }

  .pagination { display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; color: var(--app-text-muted); }

  .btn-sm-active { border-color: var(--app-accent) !important; color: var(--app-accent) !important; }

  /* ── Global class styles (CSS variable based) ──── */
  .dict-page :global(.data-table) { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
  .dict-page :global(.data-table th) { text-align: left; padding: 8px 12px; color: var(--app-text-muted); font-weight: 500; border-bottom: 1px solid var(--app-border); }
  .dict-page :global(.data-table td) { padding: 8px 12px; border-bottom: 1px solid var(--app-border-light); }
  .dict-page :global(.data-table tbody tr:hover) { background: var(--app-hover-bg); }

  .dict-page :global(.badge) { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: var(--app-badge-bg); color: var(--app-text-muted); }
  .dict-page :global(.badge-pending) { background: var(--app-warning-bg); color: var(--app-warning-text); }
  .dict-page :global(.badge-rejected) { background: rgba(248,113,113,0.15); color: var(--app-danger); }

  .dict-page :global(.form-section) { background: var(--app-card-bg); border: 1px solid var(--app-border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  .dict-page :global(.form-section h3) { font-size: 15px; font-weight: 600; margin: 0 0 12px; color: var(--app-text); }

  .dict-page :global(.form-grid) { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .dict-page :global(.form-grid input),
  .dict-page :global(.form-grid select) { padding: 8px 12px; background: var(--app-input-bg); border: 1px solid var(--app-input-border); border-radius: 6px; color: var(--app-text); font-size: 13px; min-width: 140px; flex: 1; }
  .dict-page :global(.form-grid input:focus),
  .dict-page :global(.form-grid select:focus) { outline: none; border-color: var(--app-accent); }

  .dict-page :global(.btn-primary) { padding: 8px 16px; background: var(--app-accent); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .dict-page :global(.btn-primary:hover) { background: var(--app-accent-hover); }

  .dict-page :global(.btn-sm) { padding: 4px 10px; background: var(--app-badge-bg); color: var(--app-text-secondary); border: none; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .dict-page :global(.btn-sm:hover) { background: var(--app-hover-bg); }
  .dict-page :global(.btn-sm:disabled) { opacity: 0.3; cursor: default; }

  .dict-page :global(.btn-danger) { color: var(--app-danger); }
  .dict-page :global(.btn-danger:hover:not(:disabled)) { background: rgba(248, 113, 113, 0.1); }

  .dict-page :global(.btn-save) { background: var(--app-success); color: white; }
  .dict-page :global(.btn-save:hover) { background: var(--app-success-hover); }

  .dict-page :global(.btn-approve) { background: var(--app-success); color: white; }
  .dict-page :global(.btn-approve:hover) { background: var(--app-success-hover); }

  .dict-page :global(.btn-row) { display: flex; gap: 6px; }

  .dict-page :global(.inline-input) { padding: 4px 8px; background: var(--app-input-bg); border: 1px solid var(--app-input-border); border-radius: 4px; color: var(--app-text); font-size: 12px; width: 100%; min-width: 60px; box-sizing: border-box; }
  .dict-page :global(.inline-input:focus) { outline: none; border-color: var(--app-accent); }

  .dict-page :global(.msg-error) { margin-bottom: 12px; font-size: 13px; color: var(--app-danger); }
  .dict-page :global(.msg-success) { margin-bottom: 12px; font-size: 13px; color: var(--app-success); }
</style>
