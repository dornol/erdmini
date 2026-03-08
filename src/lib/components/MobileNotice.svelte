<script lang="ts">
  import { erdStore } from '$lib/store/erd.svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    oncontinue: () => void;
  }

  let { oncontinue }: Props = $props();
</script>

<div class="mobile-notice">
  <div class="mobile-card">
    <svg class="mobile-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="ml" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>
      <rect width="32" height="32" rx="7" fill="#1e293b"/>
      <path d="M16 5 L25 10.5 L25 21.5 L16 27 L7 21.5 L7 10.5 Z" fill="none" stroke="url(#ml)" stroke-width="2" stroke-linejoin="round"/>
      <line x1="16" y1="5" x2="16" y2="27" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
      <line x1="7" y1="10.5" x2="25" y2="21.5" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
      <line x1="25" y1="10.5" x2="7" y2="21.5" stroke="#3b82f6" stroke-width="1" opacity="0.4"/>
      <circle cx="16" cy="5" r="2.2" fill="#60a5fa"/>
      <circle cx="25" cy="10.5" r="2.2" fill="#60a5fa"/>
      <circle cx="25" cy="21.5" r="2.2" fill="#60a5fa"/>
      <circle cx="16" cy="27" r="2.2" fill="#60a5fa"/>
      <circle cx="7" cy="21.5" r="2.2" fill="#60a5fa"/>
      <circle cx="7" cy="10.5" r="2.2" fill="#60a5fa"/>
      <circle cx="16" cy="16" r="2.8" fill="#60a5fa"/>
    </svg>
    <h1 class="mobile-title">erdmini</h1>
    <p class="mobile-heading">{m.mobile_desktop_optimized()}</p>
    <p class="mobile-desc">{m.mobile_description()}</p>

    {#if erdStore.schema.tables.length > 0 || (erdStore.schema.domains ?? []).length > 0}
      <div class="mobile-summary">
        {m.mobile_schema_summary({ tables: erdStore.schema.tables.length, domains: (erdStore.schema.domains ?? []).length })}
      </div>
    {/if}

    <p class="mobile-sub">{m.mobile_open_on_desktop()}</p>
    <button class="mobile-btn" onclick={oncontinue}>
      {m.mobile_continue_anyway()} &rarr;
    </button>
  </div>
</div>

<style>
  .mobile-notice {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    background: #0f172a;
    padding: 24px;
  }

  .mobile-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 360px;
    width: 100%;
  }

  .mobile-logo {
    width: 80px;
    height: 80px;
    margin-bottom: 12px;
  }

  .mobile-title {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 20px;
    letter-spacing: -0.5px;
  }

  .mobile-heading {
    font-size: 16px;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0 0 12px;
  }

  .mobile-desc {
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.6;
    margin: 0 0 20px;
    white-space: pre-line;
  }

  .mobile-summary {
    font-size: 13px;
    color: #cbd5e1;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 16px;
    margin-bottom: 20px;
  }

  .mobile-sub {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 24px;
  }

  .mobile-btn {
    font-size: 14px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 24px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mobile-btn:hover {
    color: #e2e8f0;
    border-color: #475569;
    background: #1e293b;
  }
</style>
