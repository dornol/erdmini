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

  let search = $state('');
  let selectedCategory = $state<string | undefined>(undefined);
  let page = $state(1);
  const limit = 50;

  // Inline edit
  let editingId = $state<string | null>(null);
  let editForm = $state({ word: '', meaning: '', description: '', category: '' });

  // Inline add (shown as first row of table)
  let addForm = $state({ word: '', meaning: '', description: '', category: '' });
  let showAddRow = $state(false);

  // Share
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
    myPending = data.myPending ?? [];
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

  // ── CRUD ──────────────────────────────────────────

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

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitAdd();
    if (e.key === 'Escape') { showAddRow = false; }
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') { editingId = null; }
  }

  // ── Import / Export ───────────────────────────────

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

  // ── Share ─────────────────────────────────────────

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

<div class="page">
  <!-- Header -->
  <div class="topbar">
    <a href="/" class="back">&larr;</a>
    <h1>{m.dict_title()}</h1>
    <span class="count">{total}</span>
    {#if isAdmin && pendingCount > 0}
      <span class="badge-pending">{pendingCount} {m.dict_pending()}</span>
    {/if}
    <span class="grow"></span>

    {#if isAdmin}
      <button class="tb" onclick={importWordsFromFile}>{m.dict_import()}</button>
      <button class="tb" onclick={() => exportDictionaryTemplate()}>Template</button>
    {/if}
    <button class="tb" onclick={exportWordsXlsx}>Excel</button>
    <button class="tb" onclick={exportWordsJson}>JSON</button>
    {#if isAdmin}
      <button class="tb" class:tb-active={showShare} onclick={() => (showShare = !showShare)}>{m.dict_share_title()}</button>
    {/if}
  </div>

  {#if error}<div class="toast toast-error">{error}</div>{/if}
  {#if success}<div class="toast toast-success">{success}</div>{/if}

  <!-- Share panel -->
  {#if isAdmin && showShare}
    <div class="panel">
      <div class="panel-row">
        <input type="password" placeholder={m.dict_share_password()} bind:value={newSharePassword} />
        <select bind:value={newShareExpires}>
          <option value="">{m.dict_share_never()}</option>
          <option value="7">7d</option><option value="30">30d</option><option value="90">90d</option><option value="365">1y</option>
        </select>
        <button class="btn-accent" onclick={createShareToken}>{m.dict_share_create()}</button>
      </div>
      {#each shareTokens as t}
        <div class="panel-row token-row">
          <code>{t.token.slice(0, 20)}...</code>
          {#if t.hasPassword}<span class="chip">🔒</span>{/if}
          {#if t.expiresAt}<span class="chip" class:chip-expired={new Date(t.expiresAt) < new Date()}>{new Date(t.expiresAt).toLocaleDateString()}</span>{/if}
          <span class="grow"></span>
          <button class="tb" onclick={() => copyShareUrl(t.token)}>{shareCopied === t.token ? '✓' : 'Copy URL'}</button>
          <button class="tb tb-danger" onclick={() => deleteShareToken(t.id)}>✕</button>
        </div>
      {/each}
      {#if shareTokens.length === 0}<p class="hint">{m.dict_share_no_tokens()}</p>{/if}
    </div>
  {/if}

  <!-- Admin: Pending review -->
  {#if isAdmin && pendingWords.length > 0}
    <div class="panel panel-warn">
      <div class="panel-title">{m.dict_pending()} ({pendingWords.length})</div>
      <table class="tbl tbl-compact">
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
            {#if editingId === w.id}
              <tr>
                <td><input class="cell" bind:value={editForm.word} onkeydown={handleEditKeydown} /></td>
                <td><input class="cell" bind:value={editForm.meaning} onkeydown={handleEditKeydown} /></td>
                <td><input class="cell" bind:value={editForm.description} onkeydown={handleEditKeydown} /></td>
                <td><input class="cell" bind:value={editForm.category} onkeydown={handleEditKeydown} /></td>
                <td></td>
                <td class="acts">
                  <button class="tb tb-approve" onclick={() => saveEdit(true)}>{m.dict_approve()}</button>
                  <button class="tb" onclick={() => (editingId = null)}>{m.action_cancel()}</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td class="mono">{w.word}</td>
                <td>{w.meaning}</td>
                <td class="hint">{w.description || ''}</td>
                <td>{#if w.category}<span class="chip">{w.category}</span>{/if}</td>
                <td class="hint">{w.created_by}</td>
                <td class="acts">
                  <button class="tb" onclick={() => startEdit(w)}>{m.dict_edit()}</button>
                  <button class="tb tb-approve" onclick={() => approveWord(w.id)}>{m.dict_approve()}</button>
                  <button class="tb tb-danger" onclick={() => rejectWord(w.id)}>{m.dict_reject()}</button>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- User: My pending -->
  {#if !isAdmin && myPending.length > 0}
    <div class="panel">
      <div class="panel-title">{m.dict_pending()} ({myPending.length})</div>
      {#each myPending as w}
        <div class="panel-row">
          <span class="mono">{w.word}</span>
          <span>{w.meaning}</span>
          <span class="grow"></span>
          <span class="chip chip-pending">{m.dict_pending()}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Filters -->
  <div class="filters">
    <input class="search" placeholder={m.dict_search()} bind:value={search} oninput={onSearchInput} />
    {#if categories.length > 0}
      <div class="pills">
        <button class="pill" class:on={selectedCategory === undefined} onclick={() => selectCategory(undefined)}>{m.dict_all_categories()}</button>
        <button class="pill" class:on={selectedCategory === ''} onclick={() => selectCategory('')}>{m.dict_uncategorized()}</button>
        {#each categories as cat}
          <button class="pill" class:on={selectedCategory === cat} onclick={() => selectCategory(cat)}>{cat}</button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Dictionary table -->
  {#if loading}
    <div class="empty">{m.dict_share_loading()}</div>
  {:else if words.length === 0 && !showAddRow}
    <div class="empty">{m.dict_no_words()}</div>
  {:else}
    <table class="tbl">
      <thead>
        <tr>
          <th class="cw">{m.dict_word()}</th>
          <th class="cm">{m.dict_meaning()}</th>
          <th class="cd">{m.dict_description()}</th>
          <th class="cc">{m.dict_category()}</th>
          {#if isAdmin}<th class="ca"></th>{/if}
        </tr>
      </thead>
      <tbody>
        <!-- Inline add row -->
        {#if showAddRow}
          <tr class="row-add">
            <td><input class="cell" placeholder="seq" bind:value={addForm.word} onkeydown={handleAddKeydown} /></td>
            <td><input class="cell" placeholder="일련번호" bind:value={addForm.meaning} onkeydown={handleAddKeydown} /></td>
            <td><input class="cell" placeholder="" bind:value={addForm.description} onkeydown={handleAddKeydown} /></td>
            <td><input class="cell" placeholder="" bind:value={addForm.category} onkeydown={handleAddKeydown} /></td>
            {#if isAdmin}
              <td class="acts">
                <button class="tb tb-approve" onclick={submitAdd}>{m.dict_save()}</button>
                <button class="tb" onclick={() => (showAddRow = false)}>✕</button>
              </td>
            {:else}
              <td class="acts">
                <button class="tb tb-approve" onclick={submitAdd}>{m.dict_suggest()}</button>
                <button class="tb" onclick={() => (showAddRow = false)}>✕</button>
              </td>
            {/if}
          </tr>
        {:else}
          <tr class="row-add-trigger" onclick={() => (showAddRow = true)}>
            <td colspan={isAdmin ? 5 : 4}>
              <span class="add-hint">+ {isAdmin ? m.dict_add() : m.dict_suggest()}</span>
            </td>
          </tr>
        {/if}

        {#each words as w}
          {#if editingId === w.id}
            <tr class="row-edit">
              <td><input class="cell" bind:value={editForm.word} onkeydown={handleEditKeydown} /></td>
              <td><input class="cell" bind:value={editForm.meaning} onkeydown={handleEditKeydown} /></td>
              <td><input class="cell" bind:value={editForm.description} onkeydown={handleEditKeydown} /></td>
              <td><input class="cell" bind:value={editForm.category} onkeydown={handleEditKeydown} /></td>
              <td class="acts">
                <button class="tb tb-approve" onclick={() => saveEdit()}>{m.dict_save()}</button>
                <button class="tb" onclick={() => (editingId = null)}>✕</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td class="mono">{w.word}</td>
              <td>{w.meaning}</td>
              <td class="hint">{w.description || ''}</td>
              <td>{#if w.category}<span class="chip">{w.category}</span>{/if}</td>
              {#if isAdmin}
                <td class="acts">
                  <button class="tb" onclick={() => startEdit(w)}>{m.dict_edit()}</button>
                  <button class="tb tb-danger" onclick={() => deleteWordById(w.id, w.word)}>✕</button>
                </td>
              {/if}
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>

    {#if totalPages > 1}
      <div class="paging">
        <button class="tb" disabled={page <= 1} onclick={prevPage}>&laquo;</button>
        <span>{page} / {totalPages}</span>
        <button class="tb" disabled={page >= totalPages} onclick={nextPage}>&raquo;</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* ── Page ────────────────────────────────────────── */
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px 20px 40px;
    color: #cbd5e1;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
  }

  /* ── Top bar ────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-bottom: 12px;
    border-bottom: 1px solid #1e293b;
    margin-bottom: 12px;
  }

  .back {
    color: #64748b;
    text-decoration: none;
    font-size: 16px;
    line-height: 1;
  }

  .back:hover { color: #f1f5f9; }

  h1 { font-size: 16px; font-weight: 600; margin: 0; color: #f1f5f9; }

  .count {
    background: #334155;
    color: #94a3b8;
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 8px;
  }

  .badge-pending {
    background: #92400e;
    color: #fbbf24;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 8px;
    font-weight: 600;
  }

  .grow { flex: 1; }

  /* ── Toolbar buttons ────────────────────────────── */
  .tb {
    padding: 4px 10px;
    background: none;
    color: #94a3b8;
    border: 1px solid #334155;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  .tb:hover { background: #1e293b; color: #e2e8f0; }
  .tb:disabled { opacity: 0.3; cursor: default; }
  .tb-active { border-color: #60a5fa; color: #60a5fa; }

  .tb-approve { border-color: #059669; color: #34d399; }
  .tb-approve:hover { background: #059669; color: white; }

  .tb-danger { border-color: transparent; color: #64748b; }
  .tb-danger:hover { color: #f87171; }

  .btn-accent {
    padding: 4px 12px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-accent:hover { background: #2563eb; }

  /* ── Panels ─────────────────────────────────────── */
  .panel {
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: #0f172a08;
  }

  .panel-warn { border-color: #92400e; }

  .panel-title {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .panel-warn .panel-title { color: #fbbf24; }

  .panel-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 12px;
  }

  .panel-row input, .panel-row select {
    padding: 4px 8px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 12px;
    flex: 1;
    min-width: 60px;
  }

  .panel-row input:focus, .panel-row select:focus { outline: none; border-color: #60a5fa; }

  .token-row code {
    font-family: monospace;
    color: #4ade80;
    font-size: 11px;
  }

  /* ── Chips / Tags ───────────────────────────────── */
  .chip {
    padding: 1px 6px;
    border: 1px solid #334155;
    border-radius: 3px;
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
  }

  .chip-pending { border-color: #92400e; color: #fbbf24; }
  .chip-expired { color: #f87171; border-color: #7f1d1d; }

  /* ── Filters ────────────────────────────────────── */
  .filters { margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }

  .search {
    padding: 6px 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 5px;
    color: #f1f5f9;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
  }

  .search:focus { outline: none; border-color: #60a5fa; }

  .pills { display: flex; gap: 3px; flex-wrap: wrap; }

  .pill {
    padding: 2px 9px;
    background: none;
    border: 1px solid #334155;
    border-radius: 10px;
    color: #64748b;
    font-size: 11px;
    cursor: pointer;
  }

  .pill:hover { color: #cbd5e1; border-color: #475569; }
  .pill.on { background: #3b82f6; border-color: #3b82f6; color: white; }

  /* ── Table ──────────────────────────────────────── */
  .tbl {
    width: 100%;
    border-collapse: collapse;
  }

  .tbl th {
    text-align: left;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 500;
    color: #475569;
    border-bottom: 1px solid #1e293b;
  }

  .cw { width: 16%; }
  .cm { width: 28%; }
  .cd { width: 30%; }
  .cc { width: 14%; }
  .ca { width: 12%; }

  .tbl td {
    padding: 5px 8px;
    border-bottom: 1px solid #0f172a;
    vertical-align: middle;
  }

  .tbl tbody tr:hover { background: #1e293b44; }

  .tbl-compact { font-size: 12px; }
  .tbl-compact th { font-size: 10px; }

  /* ── Inline cells ───────────────────────────────── */
  .cell {
    width: 100%;
    padding: 4px 7px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 3px;
    color: #f1f5f9;
    font-size: 13px;
    box-sizing: border-box;
  }

  .cell:focus { outline: none; border-color: #60a5fa; background: #1e293b; }

  .row-add td, .row-edit td { padding: 3px 4px; }
  .row-add { background: #1e293b33; }
  .row-edit { background: #1e293b55; }

  .row-add-trigger { cursor: pointer; }
  .row-add-trigger:hover { background: #1e293b33; }

  .add-hint {
    color: #475569;
    font-size: 12px;
  }

  .row-add-trigger:hover .add-hint { color: #60a5fa; }

  /* ── Utility ────────────────────────────────────── */
  .mono { font-family: monospace; font-weight: 600; color: #60a5fa; font-size: 13px; }
  .hint { color: #475569; font-size: 12px; }
  .acts { display: flex; gap: 3px; white-space: nowrap; }

  .paging {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
    color: #475569;
  }

  .empty {
    text-align: center;
    padding: 40px;
    color: #334155;
    font-size: 14px;
  }

  .toast {
    padding: 6px 12px;
    border-radius: 5px;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .toast-error { color: #fca5a5; background: #7f1d1d22; }
  .toast-success { color: #6ee7b7; background: #06524422; }
</style>
