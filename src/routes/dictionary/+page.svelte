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
  let myPending = $state<WordRow[]>([]);
  let categories = $state<string[]>([]);
  let loading = $state(true);
  let error = $state('');
  let success = $state('');

  // Filters
  let search = $state('');
  let selectedCategory = $state<string | undefined>(undefined);
  let page = $state(1);
  const limit = 50;

  // Edit state (shared for both main table and pending edits)
  let editingId = $state<string | null>(null);
  let editForm = $state({ word: '', meaning: '', description: '', category: '' });

  // Add / Suggest
  let showAddForm = $state(false);
  let addForm = $state({ word: '', meaning: '', description: '', category: '' });

  // Share
  let shareTokens = $state<ShareToken[]>([]);
  let showShareSection = $state(false);
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
    myPending = data.myPending ?? [];
  }

  async function loadPendingWords() {
    const res = await fetch('/api/dictionary?status=pending&limit=200');
    if (res.ok) {
      const data = await res.json();
      pendingWords = data.words;
    }
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

  function selectCategory(cat: string | undefined) {
    selectedCategory = cat; page = 1; loadWords();
  }
  function prevPage() { if (page > 1) { page--; loadWords(); } }
  function nextPage() { if (page * limit < total) { page++; loadWords(); } }

  // ── CRUD ──────────────────────────────────────────────────

  async function addWord() {
    error = ''; success = '';
    if (!addForm.word.trim() || !addForm.meaning.trim()) { error = 'Word and meaning are required'; return; }
    const res = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    addForm = { word: '', meaning: '', description: '', category: '' };
    showAddForm = false;
    if (!isAdmin) {
      success = m.dict_suggest_success();
      setTimeout(() => (success = ''), 4000);
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

  // ── Import / Export ───────────────────────────────────────

  async function exportWordsJson() {
    const res = await fetch('/api/dictionary/export');
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'word-dictionary.json'; a.click();
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) { error = 'Import failed'; return; }
      const result = await res.json();
      success = m.dict_import_success({ created: result.created, updated: result.updated });
      setTimeout(() => (success = ''), 3000);
      await reload();
    };
    input.click();
  }

  // ── Share ─────────────────────────────────────────────────

  async function createShareToken() {
    const body: Record<string, unknown> = {};
    if (newSharePassword) body.password = newSharePassword;
    if (newShareExpires) body.expiresInDays = parseInt(newShareExpires, 10);
    const res = await fetch('/api/admin/dictionary-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) { newSharePassword = ''; newShareExpires = ''; await loadShareTokens(); }
  }

  async function deleteShareToken(tokenId: string) {
    if (!confirm(m.dict_share_delete_confirm())) return;
    await fetch('/api/admin/dictionary-tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId }),
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
  <!-- Header -->
  <header class="dict-header">
    <div class="dict-header-left">
      <a href="/" class="back-link">&larr; {m.dict_back()}</a>
      <h1>{m.dict_title()}</h1>
      <span class="word-count">{m.dict_total_words({ count: total })}</span>
      {#if isAdmin && pendingCount > 0}
        <span class="pending-badge">{m.dict_pending_count({ count: pendingCount })}</span>
      {/if}
    </div>
    <div class="dict-actions">
      <button class="btn btn-primary" onclick={() => (showAddForm = !showAddForm)}>
        {isAdmin ? m.dict_add() : m.dict_suggest()}
      </button>
      {#if isAdmin}
        <div class="btn-group">
          <button class="btn" onclick={importWordsFromFile}>{m.dict_import()}</button>
          <button class="btn" onclick={() => exportDictionaryTemplate()}>Template</button>
        </div>
      {/if}
      <div class="btn-group">
        <button class="btn" onclick={exportWordsXlsx}>Excel</button>
        <button class="btn" onclick={exportWordsJson}>JSON</button>
      </div>
      {#if isAdmin}
        <button class="btn" class:active={showShareSection} onclick={() => (showShareSection = !showShareSection)}>{m.dict_share_title()}</button>
      {/if}
    </div>
  </header>

  {#if error}<div class="msg msg-error">{error}</div>{/if}
  {#if success}<div class="msg msg-success">{success}</div>{/if}

  <!-- Add / Suggest Form -->
  {#if showAddForm}
    <div class="card form-card">
      <h3>{isAdmin ? m.dict_add() : m.dict_suggest()}</h3>
      <div class="form-grid-2col">
        <div class="form-field">
          <label>{m.dict_word()} *</label>
          <input bind:value={addForm.word} placeholder="seq" />
        </div>
        <div class="form-field">
          <label>{m.dict_meaning()} *</label>
          <input bind:value={addForm.meaning} placeholder="일련번호" />
        </div>
        <div class="form-field">
          <label>{m.dict_category()}</label>
          <input bind:value={addForm.category} placeholder="접미어" />
        </div>
        <div class="form-field">
          <label>{m.dict_description()}</label>
          <input bind:value={addForm.description} placeholder="Sequence number" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick={addWord}>{isAdmin ? m.dict_save() : m.dict_suggest()}</button>
        <button class="btn" onclick={() => (showAddForm = false)}>{m.action_cancel()}</button>
      </div>
    </div>
  {/if}

  <!-- Share Section -->
  {#if isAdmin && showShareSection}
    <div class="card">
      <h3>{m.dict_share_title()}</h3>
      <div class="share-form">
        <input type="password" placeholder={m.dict_share_password()} bind:value={newSharePassword} />
        <select bind:value={newShareExpires}>
          <option value="">{m.dict_share_never()}</option>
          <option value="7">7d</option>
          <option value="30">30d</option>
          <option value="90">90d</option>
          <option value="365">1y</option>
        </select>
        <button class="btn btn-primary" onclick={createShareToken}>{m.dict_share_create()}</button>
      </div>
      {#if shareTokens.length > 0}
        <div class="share-list">
          {#each shareTokens as t}
            <div class="share-row">
              <code>{t.token.slice(0, 16)}...</code>
              {#if t.hasPassword}<span class="tag">🔒</span>{/if}
              {#if t.expiresAt}
                <span class="tag" class:expired={new Date(t.expiresAt) < new Date()}>{new Date(t.expiresAt).toLocaleDateString()}</span>
              {/if}
              <span class="spacer"></span>
              <button class="btn-sm" onclick={() => copyShareUrl(t.token)}>
                {shareCopied === t.token ? m.dict_share_url_copied() : 'Copy URL'}
              </button>
              <button class="btn-sm btn-danger" onclick={() => deleteShareToken(t.id)}>{m.dict_delete()}</button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted">{m.dict_share_no_tokens()}</p>
      {/if}
    </div>
  {/if}

  <!-- My Pending (non-admin) -->
  {#if !isAdmin && myPending.length > 0}
    <div class="card card-pending">
      <h3>{m.dict_pending()} <span class="pending-badge">{myPending.length}</span></h3>
      {#each myPending as w}
        <div class="pending-row">
          <span class="mono">{w.word}</span>
          <span class="meaning">{w.meaning}</span>
          <span class="tag tag-pending">{m.dict_pending()}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Admin Pending Review -->
  {#if isAdmin && pendingWords.length > 0}
    <div class="card card-review">
      <h3>{m.dict_pending()} <span class="pending-badge">{pendingWords.length}</span></h3>
      {#each pendingWords as w}
        {#if editingId === w.id}
          <div class="review-row editing">
            <div class="review-fields">
              <input class="inline-input" bind:value={editForm.word} placeholder={m.dict_word()} />
              <input class="inline-input" bind:value={editForm.meaning} placeholder={m.dict_meaning()} />
              <input class="inline-input" bind:value={editForm.category} placeholder={m.dict_category()} />
              <input class="inline-input" bind:value={editForm.description} placeholder={m.dict_description()} />
            </div>
            <div class="review-actions">
              <button class="btn-sm btn-approve" onclick={() => saveEdit(true)}>{m.dict_approve()}</button>
              <button class="btn-sm" onclick={() => (editingId = null)}>{m.action_cancel()}</button>
            </div>
          </div>
        {:else}
          <div class="review-row">
            <div class="review-info">
              <span class="mono">{w.word}</span>
              <span class="meaning">{w.meaning}</span>
              {#if w.category}<span class="tag">{w.category}</span>{/if}
              {#if w.description}<span class="muted">{w.description}</span>{/if}
            </div>
            <span class="muted requested-by">{w.created_by}</span>
            <div class="review-actions">
              <button class="btn-sm" onclick={() => startEdit(w)}>{m.dict_edit()}</button>
              <button class="btn-sm btn-approve" onclick={() => approveWord(w.id)}>{m.dict_approve()}</button>
              <button class="btn-sm btn-danger" onclick={() => rejectWord(w.id)}>{m.dict_reject()}</button>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Search & Filter -->
  <div class="filters">
    <input class="search-input" placeholder={m.dict_search()} bind:value={search} oninput={onSearchInput} />
    {#if categories.length > 0}
      <div class="cat-pills">
        <button class="pill" class:active={selectedCategory === undefined} onclick={() => selectCategory(undefined)}>{m.dict_all_categories()}</button>
        <button class="pill" class:active={selectedCategory === ''} onclick={() => selectCategory('')}>{m.dict_uncategorized()}</button>
        {#each categories as cat}
          <button class="pill" class:active={selectedCategory === cat} onclick={() => selectCategory(cat)}>{cat}</button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Word Table -->
  {#if loading}
    <div class="placeholder">{m.dict_share_loading()}</div>
  {:else if words.length === 0}
    <div class="placeholder">{m.dict_no_words()}</div>
  {:else}
    <table class="dict-table">
      <thead>
        <tr>
          <th class="col-word">{m.dict_word()}</th>
          <th class="col-meaning">{m.dict_meaning()}</th>
          <th class="col-desc">{m.dict_description()}</th>
          <th class="col-cat">{m.dict_category()}</th>
          {#if isAdmin}<th class="col-actions"></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each words as w}
          {#if editingId === w.id}
            <tr class="row-editing">
              <td><input class="inline-input" bind:value={editForm.word} /></td>
              <td><input class="inline-input" bind:value={editForm.meaning} /></td>
              <td><input class="inline-input" bind:value={editForm.description} /></td>
              <td><input class="inline-input" bind:value={editForm.category} /></td>
              <td class="actions">
                <button class="btn-sm btn-primary" onclick={() => saveEdit()}>{m.dict_save()}</button>
                <button class="btn-sm" onclick={() => (editingId = null)}>{m.action_cancel()}</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td class="mono">{w.word}</td>
              <td>{w.meaning}</td>
              <td class="muted">{w.description || ''}</td>
              <td>{#if w.category}<span class="tag">{w.category}</span>{/if}</td>
              {#if isAdmin}
                <td class="actions">
                  <button class="btn-sm" onclick={() => startEdit(w)}>{m.dict_edit()}</button>
                  <button class="btn-sm btn-danger" onclick={() => deleteWordById(w.id, w.word)}>{m.dict_delete()}</button>
                </td>
              {/if}
            </tr>
          {/if}
        {/each}
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
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 24px;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* ── Header ─────────────────────────────────────── */
  .dict-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1e293b;
  }

  .dict-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .back-link { color: #60a5fa; text-decoration: none; font-size: 13px; }
  .back-link:hover { text-decoration: underline; }

  h1 { font-size: 18px; font-weight: 700; margin: 0; }

  .word-count { font-size: 12px; color: #64748b; }

  .dict-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .btn-group {
    display: flex;
    gap: 0;
  }

  .btn-group .btn {
    border-radius: 0;
    margin-left: -1px;
  }

  .btn-group .btn:first-child { border-radius: 6px 0 0 6px; margin-left: 0; }
  .btn-group .btn:last-child { border-radius: 0 6px 6px 0; }

  /* ── Buttons ────────────────────────────────────── */
  .btn {
    padding: 5px 12px;
    background: #1e293b;
    color: #cbd5e1;
    border: 1px solid #334155;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }

  .btn:hover { background: #334155; }
  .btn.active { background: #334155; border-color: #60a5fa; color: #60a5fa; }

  .btn-primary { background: #3b82f6; border-color: #3b82f6; color: white; }
  .btn-primary:hover { background: #2563eb; }

  .btn-sm {
    padding: 3px 8px;
    background: #1e293b;
    color: #cbd5e1;
    border: 1px solid #334155;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-sm:hover { background: #334155; }
  .btn-sm:disabled { opacity: 0.3; cursor: default; }

  .btn-danger { color: #f87171; }
  .btn-danger:hover { background: rgba(248, 113, 113, 0.1); }

  .btn-approve { background: #059669; border-color: #059669; color: white; }
  .btn-approve:hover { background: #047857; }

  /* ── Cards ──────────────────────────────────────── */
  .card {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }

  .card h3 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-review { border-color: #f59e0b33; }
  .card-review h3 { color: #fbbf24; }
  .card-pending { border-color: #47556933; }

  .form-card h3 { color: #e2e8f0; }

  /* ── Form ───────────────────────────────────────── */
  .form-grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }

  .form-field label {
    display: block;
    font-size: 11px;
    color: #64748b;
    margin-bottom: 4px;
  }

  .form-field input {
    width: 100%;
    padding: 6px 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 5px;
    color: #f1f5f9;
    font-size: 13px;
    box-sizing: border-box;
  }

  .form-field input:focus { outline: none; border-color: #60a5fa; }

  .form-actions { display: flex; gap: 6px; }

  /* ── Share ──────────────────────────────────────── */
  .share-form {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }

  .share-form input, .share-form select {
    padding: 5px 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 5px;
    color: #f1f5f9;
    font-size: 12px;
    flex: 1;
    min-width: 80px;
  }

  .share-list { display: flex; flex-direction: column; gap: 4px; }

  .share-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: #1e293b;
    border-radius: 5px;
    font-size: 11px;
  }

  .share-row code { font-family: monospace; color: #4ade80; font-size: 11px; }
  .spacer { flex: 1; }

  /* ── Pending Review ────────────────────────────── */
  .review-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: #1e293b;
    border-radius: 6px;
    margin-bottom: 4px;
    font-size: 13px;
  }

  .review-row.editing {
    flex-direction: column;
    align-items: stretch;
  }

  .review-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
  }

  .review-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .review-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .requested-by { font-size: 11px; flex-shrink: 0; }

  /* ── Pending (my) ──────────────────────────────── */
  .pending-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background: #1e293b;
    border-radius: 5px;
    margin-bottom: 3px;
    font-size: 13px;
  }

  .pending-row .meaning { flex: 1; }

  /* ── Tags / Badges ─────────────────────────────── */
  .tag {
    padding: 1px 7px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 3px;
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
  }

  .tag-pending { border-color: #f59e0b55; color: #f59e0b; }
  .expired { color: #f87171; border-color: #f8717155; }

  .pending-badge {
    background: #f59e0b;
    color: #000;
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 10px;
    font-weight: 700;
  }

  /* ── Filters ────────────────────────────────────── */
  .filters { margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }

  .search-input {
    padding: 7px 12px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
  }

  .search-input:focus { outline: none; border-color: #60a5fa; }

  .cat-pills { display: flex; gap: 4px; flex-wrap: wrap; }

  .pill {
    padding: 3px 10px;
    background: transparent;
    border: 1px solid #334155;
    border-radius: 12px;
    color: #94a3b8;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .pill:hover { background: #1e293b; color: #e2e8f0; }
  .pill.active { background: #3b82f6; border-color: #3b82f6; color: white; }

  /* ── Table ──────────────────────────────────────── */
  .dict-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .dict-table th {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid #334155;
    color: #64748b;
    font-weight: 500;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .col-word { width: 18%; }
  .col-meaning { width: 30%; }
  .col-desc { width: 28%; }
  .col-cat { width: 12%; }
  .col-actions { width: 12%; }

  .dict-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #0f172a;
  }

  .dict-table tbody tr:hover { background: #1e293b44; }
  .row-editing { background: #1e293b; }

  .inline-input {
    width: 100%;
    padding: 4px 7px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 13px;
    box-sizing: border-box;
  }

  .inline-input:focus { outline: none; border-color: #60a5fa; }

  .mono { font-family: monospace; font-weight: 600; color: #60a5fa; }
  .muted { color: #64748b; font-size: 12px; }
  .meaning { color: #e2e8f0; }

  .actions { display: flex; gap: 3px; white-space: nowrap; }

  /* ── Misc ───────────────────────────────────────── */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    font-size: 12px;
    color: #64748b;
  }

  .placeholder {
    text-align: center;
    padding: 48px;
    color: #475569;
    font-size: 14px;
  }

  .msg {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 10px;
  }

  .msg-error { color: #f87171; background: #f8717110; }
  .msg-success { color: #4ade80; background: #4ade8010; }
</style>
