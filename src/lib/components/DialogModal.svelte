<script lang="ts">
  import { dialogStore } from '$lib/store/dialog.svelte';
  import * as m from '$lib/paraglide/messages';

  const opts = $derived(dialogStore.current.options);
  const isConfirm = $derived(opts?.type === 'confirm');
  const isDanger = $derived(opts?.variant === 'danger');

  function onConfirm() {
    dialogStore.close(true);
  }

  function onCancel() {
    dialogStore.close(false);
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onCancel();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') onConfirm();
  }

  let confirmBtn: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (opts && confirmBtn) {
      confirmBtn.focus();
    }
  });
</script>

{#if opts}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="backdrop" onmousedown={handleBackdrop} onkeydown={handleKeydown}>
    <div class="dialog" role="alertdialog" aria-modal="true">
      {#if opts.title}
        <div class="dialog-title">{opts.title}</div>
      {/if}
      <div class="dialog-message">{opts.message}</div>
      <div class="dialog-actions">
        {#if isConfirm}
          <button class="btn btn-cancel" onclick={onCancel}>
            {opts.cancelText ?? m.action_cancel()}
          </button>
        {/if}
        <button
          class="btn"
          class:btn-danger={isDanger}
          class:btn-primary={!isDanger}
          bind:this={confirmBtn}
          onclick={onConfirm}
        >
          {opts.confirmText ?? m.action_confirm()}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: fadeIn 0.12s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: scale(0.95) translateY(-8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .dialog {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
    padding: 24px;
    min-width: 320px;
    max-width: 440px;
    animation: slideIn 0.15s ease-out;
  }

  .dialog-title {
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .dialog-message {
    font-size: 14px;
    color: #475569;
    line-height: 1.6;
    word-break: keep-all;
    white-space: pre-line;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  .btn {
    border: none;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
    outline: none;
  }

  .btn:focus-visible {
    box-shadow: 0 0 0 2px #93c5fd;
  }

  .btn-cancel {
    background: #f1f5f9;
    color: #475569;
  }

  .btn-cancel:hover {
    background: #e2e8f0;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }
</style>
