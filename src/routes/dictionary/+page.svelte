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
  let categories = $state<string[]>([]);
  let loading = $state(true);
  let error = $state('');
  let success = $state('');

  // Filters
  let search = $state('');
  let selectedCategory = $state<string | undefined>(undefined);
  let page = $state(1);
  const limit = 50;

  // Edit state
  let editingId = $state<string | null>(null);
  let editForm = $state({ word: '', meaning: '', description: '', category: '' });

  // Add / Suggest state
  let showAddForm = $state(false);
  let addForm = $state({ word: '', meaning: '', description: '', category: '' });
  let showSuggestForm = $state(false);
  let suggestForm = $state({ word: '', meaning: '', description: '', category: '' });

  // Share tokens
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

  onMount(async () => {
    // Dictionary is server-mode only
    const layoutData = $pageStore.data as { isServerMode?: boolean };
    if (!layoutData.isServerMode) {
      goto('/');
      return;
    }
    await Promise.all([loadWords(), loadCategories()]);
    if (isAdmin) await Promise.all([loadShareTokens(), loadPendingWords()]);
    loading = false;
  });

  function selectCategory(cat: string | undefined) {
    selectedCategory = cat;
    page = 1;
    loadWords();
  }

  function prevPage() { if (page > 1) { page--; loadWords(); } }
  function nextPage() { if (page * limit < total) { page++; loadWords(); } }

  // CRUD
  async function addWord() {
    error = ''; success = '';
    if (!addForm.word.trim() || !addForm.meaning.trim()) { error = 'Word and meaning are required'; return; }
    const res = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed';
      return;
    }
    addForm = { word: '', meaning: '', description: '', category: '' };
    showAddForm = false;
    await Promise.all([loadWords(), loadCategories()]);
  }

  function startEdit(w: WordRow) {
    editingId = w.id;
    editForm = { word: w.word, meaning: w.meaning, description: w.description || '', category: w.category || '' };
  }

  async function saveEdit() {
    if (!editingId) return;
    error = '';
    const res = await fetch(`/api/dictionary/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed';
      return;
    }
    editingId = null;
    await Promise.all([loadWords(), loadCategories()]);
  }

  async function deleteWordById(id: string, word: string) {
    if (!confirm(m.dict_delete_confirm({ word }))) return;
    await fetch(`/api/dictionary/${id}`, { method: 'DELETE' });
    await Promise.all([loadWords(), loadCategories()]);
  }

  // Suggest (non-admin)
  async function suggestWord() {
    error = ''; success = '';
    if (!suggestForm.word.trim() || !suggestForm.meaning.trim()) { error = 'Word and meaning are required'; return; }
    const res = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(suggestForm),
    });
    if (!res.ok) {
      const data = await res.json();
      error = data.error || 'Failed';
      return;
    }
    suggestForm = { word: '', meaning: '', description: '', category: '' };
    showSuggestForm = false;
    success = m.dict_suggest_success();
    setTimeout(() => (success = ''), 4000);
  }

  // Approve / Reject (admin)
  async function approveWord(id: string) {
    await fetch(`/api/dictionary/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    await Promise.all([loadWords(), loadPendingWords()]);
  }

  async function rejectWord(id: string) {
    await fetch(`/api/dictionary/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    await Promise.all([loadWords(), loadPendingWords()]);
  }

  // Import / Export
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
    const data = await res.json();
    exportDictionaryXlsx(data);
  }

  function downloadTemplate() {
    exportDictionaryTemplate();
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
        const buffer = await file.arrayBuffer();
        data = parseDictionaryXlsx(buffer);
        if (data.length === 0) { error = 'No valid rows found in Excel file'; return; }
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
      await Promise.all([loadWords(), loadCategories()]);
    };
    input.click();
  }

  // Share tokens
  async function createShareToken() {
    const body: Record<string, unknown> = {};
    if (newSharePassword) body.password = newSharePassword;
    if (newShareExpires) body.expiresInDays = parseInt(newShareExpires, 10);
    const res = await fetch('/api/admin/dictionary-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      newSharePassword = '';
      newShareExpires = '';
      await loadShareTokens();
    }
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
    const url = `${window.location.origin}/dictionary/share/${token}`;
    await navigator.clipboard.writeText(url);
    shareCopied = token;
    setTimeout(() => (shareCopied = null), 2000);
  }

  const totalPages = $derived(Math.ceil(total / limit));
</script>

<div class="dict-page">
  <header class="dict-header">
    <div class="dict-header-left">
      <a href="/" class="back-link">&larr; {m.dict_back()}</a>
      <h1>{m.dict_title()}</h1>
      <span class="word-count">{m.dict_total_words({ count: total })}</span>
    </div>
    <div class="dict-header-right">
      {#if isAdmin}
        <button class="btn" onclick={importWordsFromFile}>{m.dict_import()}</button>
        <button class="btn" onclick={downloadTemplate}>Template</button>
      {/if}
      <button class="btn" onclick={exportWordsXlsx}>Excel</button>
      <button class="btn" onclick={exportWordsJson}>JSON</button>
      {#if isAdmin}
        <button class="btn btn-primary" onclick={() => (showAddForm = !showAddForm)}>{m.dict_add()}</button>
        <button class="btn" onclick={() => (showShareSection = !showShareSection)}>{m.dict_share_title()}</button>
      {:else}
        <button class="btn btn-primary" onclick={() => (showSuggestForm = !showSuggestForm)}>{m.dict_suggest()}</button>
      {/if}
    </div>
  </header>

  {#if error}<div class="msg-error">{error}</div>{/if}
  {#if success}<div class="msg-success">{success}</div>{/if}

  {#if !isAdmin && showSuggestForm}
    <div class="add-form">
      <input placeholder={m.dict_word()} bind:value={suggestForm.word} />
      <input placeholder={m.dict_meaning()} bind:value={suggestForm.meaning} />
      <input placeholder={m.dict_description()} bind:value={suggestForm.description} />
      <input placeholder={m.dict_category()} bind:value={suggestForm.category} />
      <button class="btn btn-primary" onclick={suggestWord}>{m.dict_suggest()}</button>
      <button class="btn" onclick={() => (showSuggestForm = false)}>{m.action_cancel()}</button>
    </div>
  {/if}

  {#if isAdmin && pendingCount > 0}
    <div class="pending-section">
      <h3>{m.dict_pending()} <span class="pending-badge">{pendingCount}</span></h3>
      <table class="dict-table pending-table">
        <thead>
          <tr>
            <th>{m.dict_word()}</th>
            <th>{m.dict_meaning()}</th>
            <th>{m.dict_description()}</th>
            <th>{m.dict_category()}</th>
            <th>{m.dict_requested_by()}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each pendingWords as w}
            <tr>
              <td class="word-cell">{w.word}</td>
              <td>{w.meaning}</td>
              <td class="desc-cell">{w.description || ''}</td>
              <td><span class="cat-badge">{w.category || m.dict_uncategorized()}</span></td>
              <td class="desc-cell">{w.created_by}</td>
              <td class="actions">
                <button class="btn-sm btn-approve" onclick={() => approveWord(w.id)}>{m.dict_approve()}</button>
                <button class="btn-sm btn-danger" onclick={() => rejectWord(w.id)}>{m.dict_reject()}</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if isAdmin && showAddForm}
    <div class="add-form">
      <input placeholder={m.dict_word()} bind:value={addForm.word} />
      <input placeholder={m.dict_meaning()} bind:value={addForm.meaning} />
      <input placeholder={m.dict_description()} bind:value={addForm.description} />
      <input placeholder={m.dict_category()} bind:value={addForm.category} />
      <button class="btn btn-primary" onclick={addWord}>{m.dict_save()}</button>
      <button class="btn" onclick={() => (showAddForm = false)}>{m.action_cancel()}</button>
    </div>
  {/if}

  {#if isAdmin && showShareSection}
    <div class="share-section">
      <h3>{m.dict_share_title()}</h3>
      <div class="share-create">
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
        <div class="share-tokens">
          {#each shareTokens as t}
            <div class="share-token-row">
              <code class="token-preview">{t.token.slice(0, 12)}...</code>
              {#if t.hasPassword}<span class="badge">🔒</span>{/if}
              {#if t.expiresAt}
                <span class="badge" class:expired={new Date(t.expiresAt) < new Date()}>
                  {new Date(t.expiresAt).toLocaleDateString()}
                </span>
              {/if}
              <button class="btn-sm" onclick={() => copyShareUrl(t.token)}>
                {shareCopied === t.token ? m.dict_share_url_copied() : 'Copy URL'}
              </button>
              <button class="btn-sm btn-danger" onclick={() => deleteShareToken(t.id)}>{m.dict_delete()}</button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="empty-text">{m.dict_share_no_tokens()}</p>
      {/if}
    </div>
  {/if}

  <div class="filters">
    <input class="search-input" placeholder={m.dict_search()} bind:value={search} oninput={onSearchInput} />
    <div class="category-filter">
      <button class="cat-btn" class:active={selectedCategory === undefined} onclick={() => selectCategory(undefined)}>{m.dict_all_categories()}</button>
      <button class="cat-btn" class:active={selectedCategory === ''} onclick={() => selectCategory('')}>{m.dict_uncategorized()}</button>
      {#each categories as cat}
        <button class="cat-btn" class:active={selectedCategory === cat} onclick={() => selectCategory(cat)}>{cat}</button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="loading">{m.dict_share_loading()}</div>
  {:else if words.length === 0}
    <div class="empty">{m.dict_no_words()}</div>
  {:else}
    <table class="dict-table">
      <thead>
        <tr>
          <th>{m.dict_word()}</th>
          <th>{m.dict_meaning()}</th>
          <th>{m.dict_description()}</th>
          <th>{m.dict_category()}</th>
          {#if isAdmin}<th></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each words as w}
          {#if editingId === w.id}
            <tr class="edit-row">
              <td><input class="cell-input" bind:value={editForm.word} /></td>
              <td><input class="cell-input" bind:value={editForm.meaning} /></td>
              <td><input class="cell-input" bind:value={editForm.description} /></td>
              <td><input class="cell-input" bind:value={editForm.category} /></td>
              <td class="actions">
                <button class="btn-sm btn-primary" onclick={saveEdit}>{m.dict_save()}</button>
                <button class="btn-sm" onclick={() => (editingId = null)}>{m.action_cancel()}</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td class="word-cell">{w.word}</td>
              <td>{w.meaning}</td>
              <td class="desc-cell">{w.description || ''}</td>
              <td><span class="cat-badge">{w.category || m.dict_uncategorized()}</span></td>
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
        <button class="btn-sm" disabled={page <= 1} onclick={prevPage}>&laquo; Prev</button>
        <span>{page} / {totalPages}</span>
        <button class="btn-sm" disabled={page >= totalPages} onclick={nextPage}>Next &raquo;</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .dict-page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 24px;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .dict-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
  }

  .dict-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .dict-header-right {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .back-link {
    color: #60a5fa;
    text-decoration: none;
    font-size: 13px;
  }

  .back-link:hover { text-decoration: underline; }

  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
  }

  .word-count {
    font-size: 13px;
    color: #64748b;
  }

  .btn {
    padding: 6px 14px;
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn:hover { background: #475569; }

  .btn-primary {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .btn-primary:hover { background: #2563eb; }

  .btn-sm {
    padding: 3px 8px;
    background: #334155;
    color: #cbd5e1;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .btn-sm:hover { background: #475569; }
  .btn-sm:disabled { opacity: 0.4; cursor: default; }

  .btn-danger { color: #f87171; }
  .btn-danger:hover { background: rgba(248, 113, 113, 0.15); }

  .add-form, .share-create {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .add-form input, .share-create input, .share-create select {
    padding: 6px 10px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    flex: 1;
    min-width: 100px;
  }

  .share-section {
    background: #1a2332;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .share-section h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
  }

  .share-tokens {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .share-token-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #0f172a;
    border-radius: 6px;
    font-size: 12px;
  }

  .token-preview {
    font-family: monospace;
    color: #4ade80;
    font-size: 11px;
  }

  .badge {
    padding: 2px 6px;
    background: #334155;
    border-radius: 4px;
    font-size: 11px;
  }

  .expired { color: #f87171; }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .search-input {
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
  }

  .search-input:focus { outline: none; border-color: #60a5fa; }

  .category-filter {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .cat-btn {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid #475569;
    border-radius: 4px;
    color: #94a3b8;
    font-size: 11px;
    cursor: pointer;
  }

  .cat-btn:hover { background: #1e293b; color: #e2e8f0; }
  .cat-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; }

  .dict-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .dict-table th {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 2px solid #334155;
    color: #94a3b8;
    font-weight: 600;
    font-size: 12px;
  }

  .dict-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #1e293b;
  }

  .dict-table tbody tr:hover { background: #1e293b; }

  .word-cell {
    font-weight: 600;
    color: #60a5fa;
    font-family: monospace;
  }

  .desc-cell {
    color: #64748b;
    font-size: 12px;
  }

  .cat-badge {
    padding: 2px 8px;
    background: #1e293b;
    border-radius: 4px;
    font-size: 11px;
    color: #94a3b8;
  }

  .cell-input {
    width: 100%;
    padding: 4px 6px;
    background: #0f172a;
    border: 1px solid #475569;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 13px;
    box-sizing: border-box;
  }

  .actions {
    display: flex;
    gap: 4px;
    white-space: nowrap;
  }

  .edit-row { background: #1a2332; }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    font-size: 13px;
    color: #94a3b8;
  }

  .loading, .empty {
    text-align: center;
    padding: 40px;
    color: #64748b;
    font-size: 14px;
  }

  .empty-text {
    color: #64748b;
    font-size: 12px;
    margin: 8px 0 0;
  }

  .msg-error { color: #f87171; font-size: 13px; margin-bottom: 10px; }
  .msg-success { color: #4ade80; font-size: 13px; margin-bottom: 10px; }

  .pending-section {
    background: #1a1a2e;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .pending-section h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #fbbf24;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pending-badge {
    background: #f59e0b;
    color: #000;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 700;
  }

  .pending-table {
    font-size: 12px;
  }

  .btn-approve {
    background: #22c55e;
    color: white;
  }

  .btn-approve:hover {
    background: #16a34a;
  }
</style>
