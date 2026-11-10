<script lang="ts">
  import { toastStore } from '$lib/store/toast.svelte';

  const ICONS: Record<string, string> = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'ℹ',
  };
</script>

{#if toastStore.toasts.length > 0}
  <div class="toast-container" aria-live="polite" aria-atomic="true">
    {#each toastStore.toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" role={toast.type === 'error' ? 'alert' : 'status'}>
        <span class="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
        <span class="toast-message">{toast.message}</span>
        <button class="toast-close" aria-label="Dismiss notification" onclick={() => toastStore.remove(toast.id)}>✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 72px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
    padding: 0 12px;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: toast-in 0.25s ease-out;
    width: min(360px, calc(100vw - 24px));
    backdrop-filter: blur(8px);
  }

  .toast-success {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .toast-error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  .toast-warning {
    background: #fffbeb;
    color: #92400e;
    border: 1px solid #fde68a;
  }

  .toast-info {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
  }

  .toast-icon {
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .toast-success .toast-icon { background: #d1fae5; }
  .toast-error .toast-icon { background: #fee2e2; }
  .toast-warning .toast-icon { background: #fef3c7; }
  .toast-info .toast-icon { background: #dbeafe; }

  .toast-message {
    flex: 1;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .toast-close {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    opacity: 0.5;
    width: 28px;
    height: 28px;
    padding: 0;
    line-height: 1;
    color: inherit;
    flex-shrink: 0;
  }

  .toast-close:hover {
    opacity: 1;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  :global([data-dark]) .toast-success {
    background: #064e3b;
    color: #d1fae5;
    border-color: #047857;
  }

  :global([data-dark]) .toast-error {
    background: #450a0a;
    color: #fee2e2;
    border-color: #991b1b;
  }

  :global([data-dark]) .toast-warning {
    background: #451a03;
    color: #fef3c7;
    border-color: #92400e;
  }

  :global([data-dark]) .toast-info {
    background: #172554;
    color: #dbeafe;
    border-color: #1d4ed8;
  }

  @media (max-width: 760px) {
    .toast-container {
      right: 0;
      bottom: 68px;
      left: 0;
      align-items: center;
    }
  }
</style>
