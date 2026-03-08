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
  <div class="toast-container">
    {#each toastStore.toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}">
        <span class="toast-icon">{ICONS[toast.type]}</span>
        <span class="toast-message">{toast.message}</span>
        <button class="toast-close" onclick={() => toastStore.remove(toast.id)}>✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: toast-in 0.25s ease-out;
    max-width: 360px;
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
  }

  .toast-close {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    opacity: 0.5;
    padding: 2px;
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
</style>
