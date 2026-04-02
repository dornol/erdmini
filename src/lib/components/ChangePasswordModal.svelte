<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import ModalBackdrop from './ModalBackdrop.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let cpCurrent = $state('');
  let cpNew = $state('');
  let cpConfirm = $state('');
  let cpError = $state('');
  let cpSuccess = $state('');
  let cpLoading = $state(false);

  async function submitChangePassword() {
    cpError = '';
    cpSuccess = '';

    if (cpNew.length < 4) {
      cpError = m.auth_password_too_short();
      return;
    }
    if (cpNew !== cpConfirm) {
      cpError = m.auth_password_mismatch();
      return;
    }

    cpLoading = true;
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          cpError = m.auth_wrong_current_password();
        } else {
          cpError = data.error || 'Error';
        }
        return;
      }
      cpSuccess = m.auth_password_changed();
      setTimeout(() => {
        onclose();
      }, 1200);
    } catch {
      cpError = m.login_network_error();
    } finally {
      cpLoading = false;
    }
  }
</script>

<ModalBackdrop {onclose} priority>
  <div class="cp-modal">
    <h3>{m.auth_change_password()}</h3>
    <form onsubmit={async (e) => { e.preventDefault(); await submitChangePassword(); }}>
      <label>
        <span>{m.auth_current_password()}</span>
        <input type="password" bind:value={cpCurrent} autocomplete="current-password" required />
      </label>
      <label>
        <span>{m.auth_new_password()}</span>
        <input type="password" bind:value={cpNew} autocomplete="new-password" required />
      </label>
      <label>
        <span>{m.auth_confirm_password()}</span>
        <input type="password" bind:value={cpConfirm} autocomplete="new-password" required />
      </label>
      {#if cpError}
        <div class="cp-error">{cpError}</div>
      {/if}
      {#if cpSuccess}
        <div class="cp-success">{cpSuccess}</div>
      {/if}
      <div class="cp-actions">
        <button type="button" class="cp-btn-cancel" onclick={onclose}>
          {m.action_cancel()}
        </button>
        <button type="submit" class="cp-btn-submit" disabled={cpLoading}>
          {m.auth_change_password()}
        </button>
      </div>
    </form>
  </div>
</ModalBackdrop>

<style>
  .cp-modal {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px;
    min-width: 340px;
    max-width: 400px;
    color: #e2e8f0;
  }

  .cp-modal h3 {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
  }

  .cp-modal label {
    display: block;
    margin-bottom: 12px;
  }

  .cp-modal label span {
    display: block;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .cp-modal input {
    width: 100%;
    padding: 8px 10px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #e2e8f0;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
  }

  .cp-modal input:focus {
    border-color: #3b82f6;
  }

  .cp-error {
    color: #f87171;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .cp-success {
    color: #4ade80;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .cp-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .cp-btn-cancel {
    background: transparent;
    border: 1px solid #475569;
    color: #94a3b8;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .cp-btn-cancel:hover {
    background: #334155;
  }

  .cp-btn-submit {
    background: #3b82f6;
    border: none;
    color: white;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }

  .cp-btn-submit:hover {
    background: #2563eb;
  }

  .cp-btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
