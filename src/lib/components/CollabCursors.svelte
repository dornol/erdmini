<script lang="ts">
  import { collabStore } from '$lib/store/collab.svelte';
  import { canvasState } from '$lib/store/erd.svelte';

  // Convert world coordinates to viewport coordinates
  function worldToViewport(wx: number, wy: number) {
    return {
      x: wx * canvasState.scale + canvasState.x,
      y: wy * canvasState.scale + canvasState.y,
    };
  }
</script>

{#each [...collabStore.remoteCursors.entries()] as [peerId, cursor] (peerId)}
  {@const vp = worldToViewport(cursor.cursor.x, cursor.cursor.y)}
  <div
    class="collab-cursor"
    style="left:{vp.x}px;top:{vp.y}px;--cursor-color:{cursor.color}"
  >
    <!-- Cursor arrow -->
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
      <path
        d="M1 1L1 15L5.5 11L10 18L12.5 16.5L8 10L14 9L1 1Z"
        fill={cursor.color}
        stroke="white"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
    <!-- Name label -->
    <span
      class="cursor-label"
      style="background:{cursor.color}"
    >
      {cursor.displayName}
    </span>
  </div>
{/each}

<style>
  .collab-cursor {
    position: absolute;
    z-index: 200;
    pointer-events: none;
    transition: left 0.1s linear, top 0.1s linear;
  }

  .cursor-label {
    position: absolute;
    top: 16px;
    left: 10px;
    font-size: 11px;
    font-weight: 600;
    color: white;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
    line-height: 1.4;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
</style>
