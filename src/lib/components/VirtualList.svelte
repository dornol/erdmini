<script lang="ts" generics="T extends { height: number; key: string }">
  import type { Snippet } from 'svelte';

  let {
    items,
    overscan = 5,
    children,
    class: className = '',
    ondragover,
  }: {
    items: T[];
    overscan?: number;
    children: Snippet<[T, number]>;
    class?: string;
    ondragover?: (e: DragEvent) => void;
  } = $props();

  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let containerEl = $state<HTMLDivElement | null>(null);

  // Cumulative offset array: offsets[i] = sum of heights for items[0..i-1]
  const offsets = $derived.by(() => {
    const arr = new Array(items.length + 1);
    arr[0] = 0;
    for (let i = 0; i < items.length; i++) {
      arr[i + 1] = arr[i] + items[i].height;
    }
    return arr as number[];
  });

  const totalHeight = $derived(offsets[items.length] ?? 0);

  // Binary search: find first index whose bottom edge > scrollTop
  function findStartIndex(st: number): number {
    let lo = 0, hi = items.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid + 1] <= st) lo = mid + 1;
      else hi = mid - 1;
    }
    return lo;
  }

  const visibleRange = $derived.by(() => {
    if (items.length === 0 || viewportHeight === 0) return { start: 0, end: 0 };
    const rawStart = findStartIndex(scrollTop);
    const start = Math.max(0, rawStart - overscan);
    let end = rawStart;
    while (end < items.length && offsets[end] < scrollTop + viewportHeight) {
      end++;
    }
    end = Math.min(items.length, end + overscan);
    return { start, end };
  });

  const visibleItems = $derived.by(() => {
    const { start, end } = visibleRange;
    const result: { item: T; index: number; top: number }[] = [];
    for (let i = start; i < end; i++) {
      result.push({ item: items[i], index: i, top: offsets[i] });
    }
    return result;
  });

  function onScroll(e: Event) {
    scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
  }

  export function scrollToIndex(index: number, behavior: ScrollBehavior = 'auto') {
    if (index < 0 || index >= items.length || !containerEl) return;
    containerEl.scrollTo({ top: offsets[index], behavior });
  }

  export function scrollToTop() {
    if (!containerEl) return;
    containerEl.scrollTop = 0;
    scrollTop = 0;
  }

  export function getContainer(): HTMLDivElement | null {
    return containerEl;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={className}
  bind:this={containerEl}
  bind:clientHeight={viewportHeight}
  onscroll={onScroll}
  {ondragover}
  style="overflow-y:auto;position:relative;"
>
  <div style="height:{totalHeight}px;position:relative;">
    {#each visibleItems as { item, index, top } (item.key)}
      <div style="position:absolute;top:{top}px;left:0;right:0;height:{item.height}px;">
        {@render children(item, index)}
      </div>
    {/each}
  </div>
</div>
