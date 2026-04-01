<script lang="ts">
  import { authStore } from '$lib/store/auth.svelte';
  import * as m from '$lib/paraglide/messages';
  import { page } from '$app/state';

  let { data } = $props();

  const siteSettings = $derived((page.data as any)?.siteSettings as { site_name: string; login_message: string; logo_url: string } | null);

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let selectedLdap = $state<string | null>(null);

  const oidcProviders = $derived(data.oidcProviders ?? []);
  const ldapProviders = $derived(data.ldapProviders ?? []);

  const oidcError = $derived.by(() => {
    const code = data.errorCode;
    if (code === 'auto_registration_disabled') return m.auth_error_auto_registration();
    if (code === 'pending_approval') return m.auth_error_pending_approval();
    if (code === 'auth_failed') return m.auth_error_failed();
    return '';
  });

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      const url = selectedLdap
        ? '/api/auth/ldap/login'
        : '/api/auth/login';
      const body = selectedLdap
        ? { providerId: selectedLdap, username, password }
        : { username, password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const resBody = await res.json();
        if (resBody.error === 'pending_approval') {
          error = m.auth_error_pending_approval();
        } else if (resBody.error === 'auto_registration_disabled') {
          error = m.auth_error_auto_registration();
        } else {
          error = resBody.error || m.login_failed();
        }
        return;
      }

      const { user } = await res.json();
      authStore.set(user);
      window.location.href = '/';
    } catch {
      error = m.login_network_error();
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-page">
  <div class="login-card">
    <div class="login-header">
      {#if siteSettings?.logo_url}
        <img class="login-logo" src={siteSettings.logo_url} alt="Logo" />
      {:else}
        <svg class="login-logo" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>
          <rect width="32" height="32" rx="7" fill="#1e293b"/>
          <path d="M16 5 L25 10.5 L25 21.5 L16 27 L7 21.5 L7 10.5 Z" fill="none" stroke="url(#lg)" stroke-width="2" stroke-linejoin="round"/>
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
      {/if}
      <h1>{siteSettings?.site_name || 'erdmini'}</h1>
      {#if siteSettings?.login_message}
        <p class="login-message">{siteSettings.login_message}</p>
      {/if}
    </div>

    {#if oidcError}
      <div class="error-banner">{oidcError}</div>
    {/if}

    {#if selectedLdap}
      <div class="ldap-mode-header">
        <button class="btn-back" onclick={() => (selectedLdap = null)}>&larr;</button>
        <span class="ldap-mode-label">{ldapProviders.find(p => p.id === selectedLdap)?.display_name}</span>
      </div>
    {/if}

    <form onsubmit={handleLogin}>
      <div class="field">
        <label for="username">{m.login_username()}</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          autocomplete="username"
          required
          disabled={loading}
        />
      </div>

      <div class="field">
        <label for="password">{m.login_password()}</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          required
          disabled={loading}
        />
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" class="btn-login" disabled={loading}>
        {loading ? m.login_signing_in() : m.login_sign_in()}
      </button>
    </form>

    {#if (oidcProviders.length > 0 || ldapProviders.length > 0) && !selectedLdap}
      <div class="divider">
        <span>{m.login_or()}</span>
      </div>

      <div class="oidc-buttons">
        {#each oidcProviders as provider}
          <a href="/api/auth/oidc/login/{provider.id}" class="btn-oidc">
            {provider.display_name}
          </a>
        {/each}
        {#each ldapProviders as provider}
          <button
            class="btn-oidc"
            onclick={() => { selectedLdap = provider.id; error = ''; }}
          >
            {provider.display_name}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #0f172a;
    padding: 24px;
  }

  .login-card {
    width: 100%;
    max-width: 380px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 32px;
  }

  .login-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 28px;
  }

  .login-logo {
    width: 56px;
    height: 56px;
    margin-bottom: 8px;
    object-fit: contain;
    border-radius: 8px;
  }

  .login-message {
    font-size: 13px;
    color: #94a3b8;
    margin: 6px 0 0;
    text-align: center;
    line-height: 1.5;
  }

  .login-header h1 {
    font-size: 22px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0;
    letter-spacing: -0.5px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 13px;
    font-weight: 500;
    color: #94a3b8;
  }

  input {
    padding: 10px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #60a5fa;
  }

  input:disabled {
    opacity: 0.6;
  }

  .error-banner {
    font-size: 13px;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .error {
    font-size: 13px;
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 6px;
    padding: 8px 12px;
  }

  .btn-login {
    padding: 10px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-login:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-login:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #334155;
  }

  .divider span {
    font-size: 12px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .oidc-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-oidc {
    display: block;
    padding: 10px;
    background: #334155;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-oidc:hover {
    background: #475569;
    border-color: #64748b;
  }

  .ldap-mode-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  .btn-back {
    background: none;
    border: none;
    color: #60a5fa;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
  }

  .btn-back:hover {
    color: #93c5fd;
  }

  .ldap-mode-label {
    font-size: 14px;
    font-weight: 600;
    color: #cbd5e1;
  }
</style>
