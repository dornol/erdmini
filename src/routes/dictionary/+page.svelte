<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { page as pageStore } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/store/auth.svelte';
  import { onMount } from 'svelte';
  import { appPath } from '$lib/utils/paths';

  interface WordRow {
    id: string;
    dictionary_id: string;
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
    wordCount?: number;
    shareTokenCount?: number;
    projectCount?: number;
    projects?: { id: string; name: string }[];
  }

  let dictionaries = $state<DictionaryRow[]>([]);
  let selectedDictionaryId = $state('default');
  let newDictionaryName = $state('');
  let dictionaryEditName = $state('');
  let dictionaryEditDescription = $state('');
  let cloneDictionaryName = $state('');
  let showCloneDictionary = $state(false);
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
  let importStatus = $state<'approved' | 'pending'>('approved');

  const isAdmin = $derived(authStore.user?.role === 'admin');
  const selectedDictionary = $derived(dictionaries.find(d => d.id === selectedDictionaryId));
  const selectedShareTokens = $derived(shareTokens.filter(t => t.dictionaryId === selectedDictionaryId));
  const selectedDictionaryWordCount = $derived(selectedDictionary?.wordCount ?? total);
  const selectedDictionaryShareTokenCount = $derived(selectedDictionary?.shareTokenCount ?? selectedShareTokens.length);
  const selectedDictionaryProjectCount = $derived(selectedDictionary?.projectCount ?? 0);
  const selectedDictionaryProjects = $derived(selectedDictionary?.projects ?? []);
  const dictionaryDeleteBlockedReason = $derived.by(() => {
    if (!selectedDictionary) return '';
    if (selectedDictionary.is_default) return m.dict_delete_blocked_default();
    if (selectedDictionaryWordCount > 0) return m.dict_delete_blocked_words({ count: selectedDictionaryWordCount });
    if (selectedDictionaryShareTokenCount > 0) return m.dict_delete_blocked_share_tokens({ count: selectedDictionaryShareTokenCount });
    if (selectedDictionaryProjectCount > 0) return m.dict_delete_blocked_projects({ count: selectedDictionaryProjectCount });
    return '';
  });
  const dictionaryProjectNames = $derived(selectedDictionaryProjects.map(p => p.name || p.id).join(', '));

  function syncDictionaryForm() {
    const dict = dictionaries.find(d => d.id === selectedDictionaryId);
    dictionaryEditName = dict?.name ?? '';
    dictionaryEditDescription = dict?.description ?? '';
    cloneDictionaryName = dict ? `${dict.name} Copy` : '';
    showCloneDictionary = false;
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; loadWords(); }, 300);
  }

  async function loadWords() {
    error = '';
    const params = new URLSearchParams();
    if (selectedDictionaryId) params.set('dictionaryId', selectedDictionaryId);
    if (search) params.set('search', search);
    if (selectedCategory !== undefined) params.set('category', selectedCategory);
    params.set('page', String(page));
    params.set('limit', String(limit));
    const res = await fetch(appPath(`/api/dictionary?${params}`));
    if (!res.ok) { error = 'Failed to load'; return; }
    const data = await res.json();
    words = data.words;
    total = data.total;
    pendingCount = data.pendingCount ?? 0;
    mySuggestions = data.mySuggestions ?? [];
  }

  async function loadPendingWords() {
    const params = new URLSearchParams({ status: 'pending', limit: '200' });
    if (selectedDictionaryId) params.set('dictionaryId', selectedDictionaryId);
    const res = await fetch(appPath(`/api/dictionary?${params}`));
    if (res.ok) { pendingWords = (await res.json()).words; }
  }

  async function loadCategories() {
    const params = new URLSearchParams();
    if (selectedDictionaryId) params.set('dictionaryId', selectedDictionaryId);
    const res = await fetch(appPath(`/api/dictionary/categories?${params}`));
    if (res.ok) categories = await res.json();
  }

  async function loadDictionaries() {
    const res = await fetch(appPath('/api/dictionaries'));
    if (!res.ok) return;
    dictionaries = await res.json();
    if (!dictionaries.some(d => d.id === selectedDictionaryId)) {
      selectedDictionaryId = dictionaries[0]?.id ?? 'default';
    }
    syncDictionaryForm();
  }

  async function loadShareTokens() {
    const res = await fetch(appPath('/api/admin/dictionary-tokens'));
    if (res.ok) shareTokens = await res.json();
  }

  async function reload() {
    await Promise.all([loadWords(), loadCategories()]);
    if (isAdmin) await loadDictionaries();
    if (isAdmin) await loadPendingWords();
  }

  onMount(async () => {
    const layoutData = $pageStore.data as { isServerMode?: boolean };
    if (!layoutData.isServerMode) { goto(appPath('/')); return; }
    await loadDictionaries();
    await Promise.all([loadWords(), loadCategories()]);
    if (isAdmin) await Promise.all([loadShareTokens(), loadPendingWords()]);
    loading = false;
  });

  function selectCategory(cat: string | undefined) { selectedCategory = cat; page = 1; loadWords(); }
  async function selectDictionary(id: string) {
    selectedDictionaryId = id;
    selectedCategory = undefined;
    page = 1;
    syncDictionaryForm();
    await reload();
  }
  function prevPage() { if (page > 1) { page--; loadWords(); } }
  function nextPage() { if (page * limit < total) { page++; loadWords(); } }

  async function submitAdd() {
    error = ''; success = '';
    if (!addForm.word.trim() || !addForm.meaning.trim()) return;
    const res = await fetch(appPath('/api/dictionary'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...addForm, dictionaryId: selectedDictionaryId }),
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
    const res = await fetch(appPath(`/api/dictionary/${editingId}`), {
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
    await fetch(appPath(`/api/dictionary/${id}`), { method: 'DELETE' });
    await reload();
  }

  async function approveWord(id: string) {
    await fetch(appPath(`/api/dictionary/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    await reload();
  }

  async function rejectWord(id: string) {
    await fetch(appPath(`/api/dictionary/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    await reload();
  }

  // Cancel own pending suggestion / dismiss rejected
  async function dismissSuggestion(id: string) {
    await fetch(appPath(`/api/dictionary/${id}`), { method: 'DELETE' });
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
    const res = await fetch(appPath(`/api/dictionary/export?dictionaryId=${encodeURIComponent(selectedDictionaryId)}`));
    if (!res.ok) return;
    const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'word-dictionary.json' }).click();
    URL.revokeObjectURL(url);
  }

  async function exportWordsXlsx() {
    const res = await fetch(appPath(`/api/dictionary/export?dictionaryId=${encodeURIComponent(selectedDictionaryId)}`));
    if (!res.ok) return;
    const { exportDictionaryXlsx } = await import('$lib/utils/dictionary-xlsx');
    exportDictionaryXlsx(await res.json());
  }

  async function exportWordsTemplate() {
    const { exportDictionaryTemplate } = await import('$lib/utils/dictionary-xlsx');
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
        const { parseDictionaryXlsx } = await import('$lib/utils/dictionary-xlsx');
        data = parseDictionaryXlsx(await file.arrayBuffer());
        if (data.length === 0) { error = 'No valid rows found'; return; }
      }
      const params = new URLSearchParams({ dictionaryId: selectedDictionaryId, status: importStatus });
      const res = await fetch(appPath(`/api/dictionary/import?${params}`), {
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
    const body: Record<string, unknown> = { dictionaryId: selectedDictionaryId };
    if (newSharePassword) body.password = newSharePassword;
    if (newShareExpires) body.expiresInDays = parseInt(newShareExpires, 10);
    const res = await fetch(appPath('/api/admin/dictionary-tokens'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) { newSharePassword = ''; newShareExpires = ''; await loadShareTokens(); }
  }

  async function createDictionary() {
    error = ''; success = '';
    if (!newDictionaryName.trim()) return;
    const res = await fetch(appPath('/api/dictionaries'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDictionaryName }),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    const row = await res.json();
    newDictionaryName = '';
    await loadDictionaries();
    await selectDictionary(row.id);
  }

  async function cloneDictionaryById() {
    error = ''; success = '';
    if (!selectedDictionary || !cloneDictionaryName.trim()) return;
    const res = await fetch(appPath('/api/dictionaries'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cloneDictionaryName,
        description: dictionaryEditDescription,
        cloneFromDictionaryId: selectedDictionary.id,
      }),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    const row = await res.json();
    await loadDictionaries();
    await selectDictionary(row.id);
  }

  async function saveDictionary() {
    error = ''; success = '';
    if (!selectedDictionaryId || !dictionaryEditName.trim()) return;
    const res = await fetch(appPath(`/api/dictionaries/${selectedDictionaryId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dictionaryEditName, description: dictionaryEditDescription }),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    await loadDictionaries();
  }

  async function makeDefaultDictionary() {
    error = ''; success = '';
    const res = await fetch(appPath(`/api/dictionaries/${selectedDictionaryId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) { error = (await res.json()).error || 'Failed'; return; }
    await loadDictionaries();
  }

  async function deleteDictionaryById() {
    error = ''; success = '';
    if (!selectedDictionary || dictionaryDeleteBlockedReason) {
      if (dictionaryDeleteBlockedReason) error = dictionaryDeleteBlockedReason;
      return;
    }
    if (!confirm(m.dict_delete_dictionary_confirm({ name: selectedDictionary.name }))) return;
    const res = await fetch(appPath(`/api/dictionaries/${selectedDictionaryId}`), { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      if (data.code === 'default_dictionary') error = m.dict_delete_blocked_default();
      else if (data.wordCount > 0) error = m.dict_delete_blocked_words({ count: data.wordCount });
      else if (data.shareTokenCount > 0) error = m.dict_delete_blocked_share_tokens({ count: data.shareTokenCount });
      else if (data.projectCount > 0) error = m.dict_delete_blocked_projects({ count: data.projectCount });
      else error = data.error || 'Failed';
      await loadDictionaries();
      return;
    }
    await loadDictionaries();
    await reload();
  }

  async function deleteShareToken(tokenId: string) {
    if (!confirm(m.dict_share_delete_confirm())) return;
    await fetch(appPath('/api/admin/dictionary-tokens'), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenId }),
    });
    await loadShareTokens();
  }

  async function copyShareUrl(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${appPath(`/dictionary/share/${token}`)}`);
    shareCopied = token;
    setTimeout(() => (shareCopied = null), 2000);
  }

  const totalPages = $derived(Math.ceil(total / limit));
</script>

<div class="dict-page">
  <div class="dict-header">
    <div class="dict-heading">
      <a href={appPath('/')} class="back-link">&larr; {m.dict_back()}</a>
      <div class="title-row">
        <h1>{m.dict_title()}</h1>
        {#if isAdmin && pendingCount > 0}
          <span class="badge badge-pending">{m.dict_pending_count({ count: pendingCount })}</span>
        {/if}
      </div>
      <p class="dict-subtitle">{m.dict_desc()}</p>
    </div>
    <div class="header-actions">
      <button class="btn-primary" onclick={() => { showAddRow = true; }}>
        {isAdmin ? m.dict_add() : m.dict_suggest()}
      </button>
      {#if isAdmin}
        <div class="import-group">
          <select class="import-status-select" bind:value={importStatus} title={m.dict_import_status()}>
            <option value="approved">{m.dict_approved()}</option>
            <option value="pending">{m.dict_pending()}</option>
          </select>
          <button class="btn-sm" onclick={importWordsFromFile}>{m.dict_import()}</button>
          <button class="btn-sm" onclick={exportWordsTemplate}>Template</button>
        </div>
      {/if}
      <div class="export-group">
        <button class="btn-sm" onclick={exportWordsXlsx}>Excel</button>
        <button class="btn-sm" onclick={exportWordsJson}>JSON</button>
      </div>
      {#if isAdmin}
        <button class="btn-sm" class:btn-sm-active={showShare} onclick={() => (showShare = !showShare)}>{m.dict_share_title()}</button>
      {/if}
    </div>
  </div>

  <div class="overview-grid">
    <div class="metric">
      <span>{m.dict_title()}</span>
      <strong>{selectedDictionary?.name ?? '-'}</strong>
    </div>
    <div class="metric">
      <span>{m.dict_word()}</span>
      <strong>{total}</strong>
    </div>
    {#if isAdmin}
      <div class="metric">
        <span>{m.dict_pending()}</span>
        <strong>{pendingCount}</strong>
      </div>
      <div class="metric">
        <span>{m.dict_share_title()}</span>
        <strong>{selectedShareTokens.length}</strong>
      </div>
    {/if}
  </div>

  <div class="dictionary-panel">
    <div class="dictionary-panel-main">
      <div class="dictionary-selector">
        <span class="control-caption">{m.dict_title()}</span>
        <select
          class="dictionary-select"
          value={selectedDictionaryId}
          onchange={(e) => selectDictionary((e.target as HTMLSelectElement).value)}
        >
          {#each dictionaries as dict}
            <option value={dict.id}>{dict.name}{dict.is_default ? ` (${m.dict_default()})` : ''}</option>
          {/each}
        </select>
      </div>

      {#if isAdmin}
        <div class="dictionary-create">
          <span class="control-caption">{m.dict_new_dictionary()}</span>
          <div class="inline-control">
            <input
              class="dictionary-input"
              placeholder={m.dict_new_dictionary()}
              bind:value={newDictionaryName}
              onkeydown={(e) => { if (e.key === 'Enter') createDictionary(); }}
            />
            <button class="btn-sm" onclick={createDictionary}>{m.dict_create_dictionary()}</button>
          </div>
        </div>
      {/if}
    </div>

    {#if isAdmin && selectedDictionary}
      <div class="dictionary-manage-row">
        <div class="field-stack name-field">
          <span class="control-caption">{m.dict_dictionary_name()}</span>
          <input class="dictionary-input" bind:value={dictionaryEditName} placeholder={m.dict_dictionary_name()} />
        </div>
        <div class="field-stack description-field">
          <span class="control-caption">{m.dict_dictionary_description()}</span>
          <input class="dictionary-input dictionary-description-input" bind:value={dictionaryEditDescription} placeholder={m.dict_dictionary_description()} />
        </div>
        <div class="dictionary-actions">
          <button class="btn-sm" onclick={saveDictionary}>{m.dict_save_dictionary()}</button>
          <button class="btn-sm" disabled={!!selectedDictionary.is_default} onclick={makeDefaultDictionary}>{m.dict_set_default()}</button>
          <button class="btn-sm" onclick={() => { showCloneDictionary = !showCloneDictionary; }}>{m.dict_clone_dictionary()}</button>
          <button
            class="btn-sm btn-danger"
            disabled={!!dictionaryDeleteBlockedReason}
            title={dictionaryDeleteBlockedReason}
            onclick={deleteDictionaryById}
          >{m.dict_delete_dictionary()}</button>
        </div>
      </div>
      {#if dictionaryDeleteBlockedReason}
        <div class="dictionary-delete-hint">
          <span>{dictionaryDeleteBlockedReason}</span>
          {#if selectedDictionaryProjectCount > 0 && dictionaryProjectNames}
            <span class="dictionary-project-list">{dictionaryProjectNames}</span>
          {/if}
        </div>
      {/if}
      {#if showCloneDictionary}
        <div class="dictionary-clone-row">
          <input class="dictionary-input" bind:value={cloneDictionaryName} placeholder={m.dict_clone_dictionary_name()} />
          <button class="btn-sm" onclick={cloneDictionaryById}>{m.dict_clone_dictionary_create()}</button>
        </div>
      {/if}
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
      {#if selectedShareTokens.length > 0}
        <table class="data-table" style="margin-top:12px">
          <thead><tr><th>Token</th><th>{m.dict_share_password()}</th><th>{m.dict_share_expires()}</th><th></th></tr></thead>
          <tbody>
            {#each selectedShareTokens as t}
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
  <div class="list-panel">
    <div class="list-toolbar">
      <input class="filter-search" placeholder={m.dict_search()} bind:value={search} oninput={onSearchInput} />
      <span class="word-total">{m.dict_total_words({ count: total })}</span>
    </div>
    {#if categories.length > 0}
      <div class="filter-pills">
        <button class="pill" class:active={selectedCategory === undefined} onclick={() => selectCategory(undefined)}>{m.dict_all_categories()}</button>
        <button class="pill" class:active={selectedCategory === ''} onclick={() => selectCategory('')}>{m.dict_uncategorized()}</button>
        {#each categories as cat}
          <button class="pill" class:active={selectedCategory === cat} onclick={() => selectCategory(cat)}>{cat}</button>
        {/each}
      </div>
    {/if}

    <!-- Main table -->
    {#if loading}
      <div class="empty-state">{m.dict_share_loading()}</div>
    {:else}
      <div class="table-scroll">
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
      </div>

      {#if totalPages > 1}
        <div class="pagination">
          <button class="btn-sm" disabled={page <= 1} onclick={prevPage}>&laquo;</button>
          <span>{page} / {totalPages}</span>
          <button class="btn-sm" disabled={page >= totalPages} onclick={nextPage}>&raquo;</button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .dict-page {
    min-height: 100vh;
    background: var(--app-bg);
    color: var(--app-text);
    padding: 24px 32px 40px;
  }

  .dict-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;
  }

  .dict-heading {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .dict-header h1 { font-size: 26px; line-height: 1.2; font-weight: 700; margin: 0; }

  .dict-subtitle {
    margin: 0;
    color: var(--app-text-muted);
    font-size: 13px;
  }

  .word-total {
    font-size: 12px;
    color: var(--app-text-muted);
    padding: 5px 10px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .import-group,
  .export-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .back-link { color: var(--app-accent); text-decoration: none; font-size: 14px; }
  .back-link:hover { text-decoration: underline; }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  .metric {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: var(--app-card-bg);
  }

  .metric span {
    display: block;
    margin-bottom: 6px;
    color: var(--app-text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .metric strong {
    display: block;
    overflow: hidden;
    color: var(--app-text);
    font-size: 20px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dictionary-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    margin-bottom: 16px;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: var(--app-card-bg);
  }

  .dictionary-panel-main {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) minmax(280px, auto);
    gap: 12px;
    align-items: end;
  }

  .dictionary-selector {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .control-caption {
    font-size: 11px;
    font-weight: 600;
    color: var(--app-text-muted);
    text-transform: uppercase;
  }

  .dictionary-create,
  .dictionary-clone-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
  }

  .dictionary-create {
    flex-direction: column;
    align-items: stretch;
  }

  .inline-control {
    display: flex;
    gap: 6px;
  }

  .dictionary-manage-row {
    display: grid;
    grid-template-columns: minmax(180px, 240px) minmax(220px, 1fr) auto;
    gap: 10px;
    align-items: end;
  }

  .field-stack {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .dictionary-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .dictionary-delete-hint {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: #f59e0b;
  }

  .dictionary-project-list { color: var(--app-text-muted); }

  .dictionary-select,
  .dictionary-input,
  .import-status-select {
    padding: 7px 10px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 6px;
    color: var(--app-text);
    font-size: 13px;
  }
  .dictionary-select { min-width: 220px; width: 100%; }
  .dictionary-input { width: 100%; min-width: 0; }
  .dictionary-clone-row .dictionary-input { max-width: 320px; }

  /* ── Filters ────────────────────────────────────── */
  .list-panel {
    padding: 14px;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: var(--app-card-bg);
  }

  .list-toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .filter-search {
    padding: 8px 12px;
    background: var(--app-input-bg);
    border: 1px solid var(--app-input-border);
    border-radius: 6px;
    color: var(--app-text);
    font-size: 13px;
    min-width: 200px;
    flex: 1;
  }

  .filter-search:focus { outline: none; border-color: var(--app-accent); }

  .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }

  .pill {
    padding: 5px 12px;
    background: none;
    border: 1px solid var(--app-border);
    border-radius: 999px;
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

  .table-scroll {
    overflow-x: auto;
  }

  /* ── Global class styles (CSS variable based) ──── */
  .dict-page :global(.data-table) { width: 100%; min-width: 760px; border-collapse: collapse; margin-bottom: 0; font-size: 13px; }
  .dict-page :global(.data-table th) { text-align: left; padding: 10px 12px; color: var(--app-text-muted); font-weight: 600; border-bottom: 1px solid var(--app-border); background: var(--app-card-bg); }
  .dict-page :global(.data-table td) { padding: 10px 12px; border-bottom: 1px solid var(--app-border-light); vertical-align: top; }
  .dict-page :global(.data-table tbody tr:hover) { background: var(--app-hover-bg); }

  .dict-page :global(.badge) { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--app-badge-bg); color: var(--app-text-muted); }
  .dict-page :global(.badge-pending) { background: var(--app-warning-bg); color: var(--app-warning-text); }
  .dict-page :global(.badge-rejected) { background: rgba(248,113,113,0.15); color: var(--app-danger); }

  .dict-page :global(.form-section) { background: var(--app-card-bg); border: 1px solid var(--app-border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  .dict-page :global(.form-section h3) { font-size: 15px; font-weight: 600; margin: 0 0 12px; color: var(--app-text); }

  .dict-page :global(.form-grid) { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .dict-page :global(.form-grid input),
  .dict-page :global(.form-grid select) { padding: 8px 12px; background: var(--app-input-bg); border: 1px solid var(--app-input-border); border-radius: 6px; color: var(--app-text); font-size: 13px; min-width: 140px; flex: 1; }
  .dict-page :global(.form-grid input:focus),
  .dict-page :global(.form-grid select:focus) { outline: none; border-color: var(--app-accent); }

  .dict-page :global(.btn-primary) { padding: 9px 16px; background: var(--app-accent); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .dict-page :global(.btn-primary:hover) { background: var(--app-accent-hover); }

  .dict-page :global(.btn-sm) { min-height: 30px; padding: 5px 10px; background: var(--app-badge-bg); color: var(--app-text-secondary); border: 1px solid transparent; border-radius: 6px; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .dict-page :global(.btn-sm:hover) { background: var(--app-hover-bg); }
  .dict-page :global(.btn-sm:disabled) { opacity: 0.3; cursor: default; }

  .dict-page :global(.btn-danger) { color: var(--app-danger); }
  .dict-page :global(.btn-danger:hover:not(:disabled)) { background: rgba(248, 113, 113, 0.1); }

  .dict-page :global(.btn-save) { background: var(--app-success); color: white; }
  .dict-page :global(.btn-save:hover) { background: var(--app-success-hover); }

  .dict-page :global(.btn-approve) { background: var(--app-success); color: white; }
  .dict-page :global(.btn-approve:hover) { background: var(--app-success-hover); }

  .dict-page :global(.btn-row) { display: flex; gap: 6px; justify-content: flex-end; }

  .dict-page :global(.inline-input) { padding: 4px 8px; background: var(--app-input-bg); border: 1px solid var(--app-input-border); border-radius: 4px; color: var(--app-text); font-size: 12px; width: 100%; min-width: 60px; box-sizing: border-box; }
  .dict-page :global(.inline-input:focus) { outline: none; border-color: var(--app-accent); }

  .dict-page :global(.msg-error) { margin-bottom: 12px; font-size: 13px; color: var(--app-danger); }
  .dict-page :global(.msg-success) { margin-bottom: 12px; font-size: 13px; color: var(--app-success); }

  @media (max-width: 900px) {
    .dict-page { padding: 16px; }
    .dict-header { align-items: stretch; flex-direction: column; }
    .header-actions { justify-content: flex-start; }
    .dictionary-panel-main,
    .dictionary-manage-row { grid-template-columns: 1fr; }
    .dictionary-create,
    .dictionary-manage-row,
    .dictionary-clone-row { justify-content: flex-start; }
    .dictionary-actions { justify-content: flex-start; }
    .list-toolbar { align-items: stretch; flex-direction: column; }
    .word-total { align-self: flex-start; }
  }

  @media (max-width: 560px) {
    .dict-header h1 { font-size: 22px; }
    .overview-grid { grid-template-columns: 1fr; }
    .header-actions,
    .import-group,
    .export-group,
    .inline-control,
    .dictionary-actions { width: 100%; }
    .dict-page :global(.btn-primary),
    .dict-page :global(.btn-sm),
    .import-status-select { flex: 1; }
  }
</style>
