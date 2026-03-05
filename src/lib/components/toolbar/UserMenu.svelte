<script lang="ts">
  import { authStore } from '$lib/store/auth.svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open: boolean;
    ontoggle: () => void;
    onclose: () => void;
    onaction: (action: 'change-password' | 'api-keys') => void;
  }

  let { open, ontoggle, onclose, onaction }: Props = $props();
</script>

{#if authStore.isLoggedIn}
  <div class="dropdown-wrap">
    <button
      class="btn-user"
      onclick={ontoggle}
      aria-expanded={open}
      aria-haspopup="menu"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/>
        <path d="M2 14c0-3.31 2.69-5 6-5s6 1.69 6 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      {authStore.user?.displayName ?? ''} ▾
    </button>
    {#if open}
      <div
        class="dropdown-menu dropdown-right"
        role="menu"
        tabindex="-1"
        onmouseleave={onclose}
      >
        <div class="dropdown-user-info">
          <span class="dropdown-user-name">{authStore.user?.displayName}</span>
          <span class="dropdown-user-role">{authStore.user?.role}</span>
        </div>
        {#if authStore.isAdmin}
          <a href="/admin" class="dropdown-item" role="menuitem" onclick={onclose}>
            {m.nav_admin()}
          </a>
        {/if}
        {#if authStore.user?.username}
          <button
            class="dropdown-item"
            role="menuitem"
            onclick={() => { onclose(); onaction('change-password'); }}
          >
            {m.auth_change_password()}
          </button>
        {/if}
        <button
          class="dropdown-item"
          role="menuitem"
          onclick={() => { onclose(); onaction('api-keys'); }}
        >
          {m.api_keys_title()}
        </button>
        <button
          class="dropdown-item dropdown-item-danger"
          role="menuitem"
          onclick={() => { onclose(); authStore.logout(); }}
        >
          {m.nav_sign_out()}
        </button>
      </div>
    {/if}
  </div>
{/if}
