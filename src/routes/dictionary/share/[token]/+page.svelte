<script lang="ts">
  import { page } from '$app/stores';
  import * as m from '$lib/paraglide/messages';

  interface WordRow {
    id: string;
    word: string;
    meaning: string;
    description: string | null;
    category: string | null;
  }

  let viewState = $state<'loading' | 'password' | 'ready' | 'error'>('loading');
  let errorMsg = $state('');
  let password = $state('');
  let words = $state<WordRow[]>([]);
  let categories = $state<string[]>([]);
  let search = $state('');
  let selectedCategory = $state<string | undefined>(undefined);

  const token = $derived($page.params.token);

  const filteredWords = $derived(() => {
    let result = words;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(w => w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
    }
    if (selectedCategory !== undefined) {
      if (selectedCategory === '') {
        result = result.filter(w => !w.category);
      } else {
        result = result.filter(w => w.category === selectedCategory);
      }
    }
    return result;
  });

  async function loadData() {
    viewState = 'loading';
    const res = await fetch(`/api/dictionary/share/${token}`);
    if (res.status === 401) {
      const data = await res.json();
      if (data.requiresPassword) { viewState = 'password'; return; }
    }
    if (!res.ok) {
      errorMsg = res.status === 403 ? m.dict_share_expired() : m.dict_share_not_found();
      viewState = 'error';
      return;
    }
    const data = await res.json();
    words = data.words;
    categories = data.categories;
    viewState = 'ready';
  }

  async function submitPassword() {
    errorMsg = '';
    const res = await fetch(`/api/dictionary/share/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 401) {
      errorMsg = m.dict_share_password_wrong();
      return;
    }
    if (res.status === 429) {
      errorMsg = 'Too many attempts. Please try again later.';
      return;
    }
    if (!res.ok) {
      errorMsg = m.dict_share_not_found();
      viewState = 'error';
      return;
    }
    const data = await res.json();
    words = data.words;
    categories = data.categories;
    viewState = 'ready';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && viewState === 'password') submitPassword();
  }

  $effect(() => {
    if (token) loadData();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="share-page">
  {#if viewState === 'loading'}
    <div class="center">{m.dict_share_loading()}</div>

  {:else if viewState === 'error'}
    <div class="center error-box">{errorMsg}</div>

  {:else if viewState === 'password'}
    <div class="center">
      <div class="password-card">
        <h2>{m.dict_share_view_title()}</h2>
        <p class="password-hint">🔒</p>
        {#if errorMsg}<div class="msg-error">{errorMsg}</div>{/if}
        <input
          type="password"
          class="password-input"
          placeholder={m.dict_share_password_placeholder()}
          bind:value={password}
        />
        <button class="btn btn-primary" onclick={submitPassword}>{m.dict_share_submit_password()}</button>
      </div>
    </div>

  {:else}
    <header class="share-header">
      <h1>{m.dict_share_view_title()}</h1>
      <span class="word-count">{m.dict_total_words({ count: words.length })}</span>
    </header>

    <div class="filters">
      <input class="search-input" placeholder={m.dict_search()} bind:value={search} />
      <div class="category-filter">
        <button class="cat-btn" class:active={selectedCategory === undefined} onclick={() => (selectedCategory = undefined)}>{m.dict_all_categories()}</button>
        {#each categories as cat}
          <button class="cat-btn" class:active={selectedCategory === cat} onclick={() => (selectedCategory = cat)}>{cat}</button>
        {/each}
      </div>
    </div>

    {#if filteredWords().length === 0}
      <div class="empty">{m.dict_no_words()}</div>
    {:else}
      <table class="dict-table">
        <thead>
          <tr>
            <th>{m.dict_word()}</th>
            <th>{m.dict_meaning()}</th>
            <th>{m.dict_description()}</th>
            <th>{m.dict_category()}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredWords() as w}
            <tr>
              <td class="word-cell">{w.word}</td>
              <td>{w.meaning}</td>
              <td class="desc-cell">{w.description || ''}</td>
              <td><span class="cat-badge">{w.category || ''}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<style>
  .share-page {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, sans-serif;
    min-height: 100vh;
  }

  .center {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    color: #94a3b8;
    font-size: 14px;
  }

  .error-box { color: #f87171; }

  .password-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 32px;
    text-align: center;
    min-width: 300px;
  }

  .password-card h2 {
    margin: 0 0 8px;
    font-size: 18px;
    color: #f1f5f9;
  }

  .password-hint {
    font-size: 32px;
    margin: 0 0 16px;
  }

  .password-input {
    display: block;
    width: 100%;
    padding: 10px 14px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 14px;
    margin-bottom: 12px;
    box-sizing: border-box;
  }

  .password-input:focus { outline: none; border-color: #60a5fa; }

  .share-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .share-header h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
  }

  .word-count {
    font-size: 13px;
    color: #64748b;
  }

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

  .empty {
    text-align: center;
    padding: 40px;
    color: #64748b;
    font-size: 14px;
  }

  .btn {
    padding: 8px 20px;
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-primary {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
    width: 100%;
  }

  .btn-primary:hover { background: #2563eb; }

  .msg-error { color: #f87171; font-size: 13px; margin-bottom: 10px; }
</style>
