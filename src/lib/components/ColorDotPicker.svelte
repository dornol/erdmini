<script lang="ts">
  import { TABLE_COLORS, TABLE_COLOR_IDS } from '$lib/constants/table-colors';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    value: string | undefined;
    onchange: (colorId: string | undefined) => void;
    size?: 'sm' | 'md';
  }

  let { value, onchange, size = 'md' }: Props = $props();
</script>

<div class="color-dots" class:sm={size === 'sm'}>
  <button
    class="color-dot color-dot-none"
    class:active={!value}
    title={m.table_color_none()}
    onclick={() => onchange(undefined)}
  >
    {#if !value}<span class="dot-check">✓</span>{/if}
  </button>
  {#each TABLE_COLOR_IDS as colorId}
    <button
      class="color-dot"
      class:active={value === colorId}
      style="background:{TABLE_COLORS[colorId].dot}"
      title={colorId}
      onclick={() => onchange(colorId)}
    >
      {#if value === colorId}<span class="dot-check">✓</span>{/if}
    </button>
  {/each}
</div>

<style>
  .color-dots {
    display: grid;
    grid-template-columns: repeat(auto-fill, 22px);
    gap: 5px;
  }

  .color-dots.sm {
    grid-template-columns: repeat(auto-fill, 18px);
    gap: 4px;
  }

  .color-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: border-color 0.15s, transform 0.1s;
    flex-shrink: 0;
  }

  .sm .color-dot {
    width: 18px;
    height: 18px;
  }

  .color-dot:hover {
    transform: scale(1.15);
  }

  .color-dot.active {
    border-color: #1e293b;
    box-shadow: 0 0 0 1px white inset;
  }

  .color-dot-none {
    background: #ffffff;
    border: 2px dashed #cbd5e1;
  }

  .sm .color-dot-none {
    border-width: 1.5px;
  }

  .color-dot-none.active {
    border-style: solid;
    border-color: #1e293b;
  }

  .dot-check {
    font-size: 11px;
    color: #ffffff;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 0 2px rgba(0,0,0,0.4);
  }

  .sm .dot-check {
    font-size: 10px;
  }

  .color-dot-none .dot-check {
    color: #64748b;
    text-shadow: none;
  }
</style>
