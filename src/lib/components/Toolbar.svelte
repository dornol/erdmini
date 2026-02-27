<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import DdlModal from './DdlModal.svelte';

  let viewportWidth = $state(800);
  let viewportHeight = $state(600);

  $effect(() => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;

    function onResize() {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function addTable() {
    erdStore.addTable(viewportWidth, viewportHeight);
  }

  let modalMode = $state<'import' | 'export' | null>(null);
</script>

<header class="toolbar">
  <div class="logo">
    <span class="logo-icon">◈</span>
    <span class="logo-text">erdmini</span>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick={addTable}>
      + 새 테이블
    </button>
    <button class="btn-secondary" onclick={() => (modalMode = 'import')}>
      Import DDL
    </button>
    <button class="btn-secondary" onclick={() => (modalMode = 'export')}>
      Export DDL
    </button>
  </div>

  <div class="zoom-display">
    {Math.round(canvasState.scale * 100)}%
  </div>
</header>

{#if modalMode}
  <DdlModal mode={modalMode} onclose={() => (modalMode = null)} />
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    height: 48px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .logo-icon {
    color: #60a5fa;
    font-size: 18px;
  }

  .logo-text {
    color: white;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.5px;
  }

  .actions {
    flex: 1;
    display: flex;
    gap: 8px;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-secondary {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .btn-secondary:hover {
    background: #334155;
    color: white;
  }

  .zoom-display {
    color: #94a3b8;
    font-size: 12px;
    min-width: 40px;
    text-align: right;
  }
</style>
