<script lang="ts">
  import { authStore } from '$lib/store/auth.svelte';

  let { data } = $props();

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  const providers = $derived(data.oidcProviders ?? []);

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.json();
        error = body.error || 'Login failed';
        return;
      }

      const { user } = await res.json();
      authStore.set(user);
      window.location.href = '/';
    } catch {
      error = 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-page">
  <div class="login-card">
    <div class="login-header">
      <svg class="login-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="10" width="35" height="30" rx="4" fill="none" stroke="#60a5fa" stroke-width="2.5"/>
        <line x1="5" y1="20" x2="40" y2="20" stroke="#60a5fa" stroke-width="2" opacity="0.5"/>
        <rect x="60" y="10" width="35" height="24" rx="4" fill="none" stroke="#34d399" stroke-width="2.5"/>
        <line x1="60" y1="20" x2="95" y2="20" stroke="#34d399" stroke-width="2" opacity="0.5"/>
        <rect x="30" y="60" width="40" height="30" rx="4" fill="none" stroke="#f472b6" stroke-width="2.5"/>
        <line x1="30" y1="70" x2="70" y2="70" stroke="#f472b6" stroke-width="2" opacity="0.5"/>
        <line x1="40" y1="40" x2="68" y2="60" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 2"/>
        <line x1="22" y1="40" x2="42" y2="60" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 2"/>
        <circle cx="68" cy="60" r="3" fill="#94a3b8"/>
        <circle cx="42" cy="60" r="3" fill="#94a3b8"/>
      </svg>
      <h1>erdmini</h1>
    </div>

    <form onsubmit={handleLogin}>
      <div class="field">
        <label for="username">Username</label>
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
        <label for="password">Password</label>
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
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>

    {#if providers.length > 0}
      <div class="divider">
        <span>or</span>
      </div>

      <div class="oidc-buttons">
        {#each providers as provider}
          <a href="/api/auth/oidc/login/{provider.id}" class="btn-oidc">
            {provider.display_name}
          </a>
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
</style>
