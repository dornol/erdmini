<script lang="ts">
  import { canvasState, erdStore } from '$lib/store/erd.svelte';
  import { computeLayout } from '$lib/utils/auto-layout';
  import type { LayoutType } from '$lib/utils/auto-layout';
  import DdlModal from './DdlModal.svelte';
  import DomainModal from './DomainModal.svelte';

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
  let showDomainModal = $state(false);

  // Auto-arrange
  function applyLayout(type: LayoutType) {
    const positions = computeLayout(erdStore.schema.tables, type);
    erdStore.applyLayout(positions);
  }

  // JSON export
  function exportJson() {
    const json = JSON.stringify(erdStore.schema, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erdmini_schema.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // JSON import
  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const schema = JSON.parse(reader.result as string);
          erdStore.loadSchema(schema);
        } catch {
          alert('JSON 파싱에 실패했습니다. 올바른 erdmini 스키마 파일인지 확인하세요.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  let layoutOpen = $state(false);

  const LAYOUT_LABELS: Record<LayoutType, string> = {
    grid: '격자',
    hierarchical: '계층',
    radial: '방사형',
  };
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

    <!-- Auto-arrange dropdown -->
    <div class="dropdown-wrap">
      <button
        class="btn-secondary"
        onclick={() => (layoutOpen = !layoutOpen)}
        aria-expanded={layoutOpen}
        aria-haspopup="menu"
      >
        자동 배치 ▾
      </button>
      {#if layoutOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (layoutOpen = false)}
        >
          {#each Object.entries(LAYOUT_LABELS) as [type, label]}
            <button
              class="dropdown-item"
              role="menuitem"
              onclick={() => { applyLayout(type as LayoutType); layoutOpen = false; }}
            >
              {label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button class="btn-secondary" onclick={() => (modalMode = 'import')}>
      Import DDL
    </button>
    <button class="btn-secondary" onclick={() => (modalMode = 'export')}>
      Export DDL
    </button>
    <button class="btn-secondary" onclick={importJson}>
      JSON 불러오기
    </button>
    <button class="btn-secondary" onclick={exportJson}>
      JSON 저장
    </button>
    <button class="btn-secondary" onclick={() => (showDomainModal = true)}>
      도메인
    </button>
  </div>

  <div class="zoom-display">
    {Math.round(canvasState.scale * 100)}%
  </div>
</header>

{#if modalMode}
  <DdlModal mode={modalMode} onclose={() => (modalMode = null)} />
{/if}

{#if showDomainModal}
  <DomainModal onclose={() => (showDomainModal = false)} />
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
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
    flex-shrink: 0;
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
    gap: 6px;
    align-items: center;
    overflow: hidden;
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
    flex-shrink: 0;
  }

  .btn-primary:hover {
    background: #2563eb;
  }

  .btn-secondary {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-secondary:hover {
    background: #334155;
    color: white;
  }

  .dropdown-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 6px;
    overflow: hidden;
    z-index: 200;
    min-width: 110px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 14px;
    font-size: 13px;
    color: #cbd5e1;
    cursor: pointer;
    transition: background 0.1s;
  }

  .dropdown-item:hover {
    background: #334155;
    color: white;
  }

  .zoom-display {
    color: #94a3b8;
    font-size: 12px;
    min-width: 40px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
