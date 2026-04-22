import { tick } from 'svelte';
import { canvasState } from '$lib/store/canvas.svelte';

/**
 * Fullscreen presentation mode state and helpers.
 * Must be called during component initialization.
 */
export function useFullscreen() {
  let fullscreenMode = $state(false);
  let fullscreenBarVisible = $state(true);
  let fullscreenBarTimer: ReturnType<typeof setTimeout> | undefined;

  async function preserveCenter(applyChange: () => void) {
    // Keep the world content that was under a given screen pixel at that same
    // screen pixel after the layout change. This is equivalent to compensating
    // for the viewport's on-screen position shift (left/top), NOT its size.
    // Example: when the sidebar collapses, the viewport's left shrinks; we
    // shift canvasState.x by the same amount so the view doesn't "jump."
    const vp = document.querySelector('.canvas-viewport');
    const oldRect = vp?.getBoundingClientRect();
    const oldLeft = oldRect?.left ?? 0;
    const oldTop = oldRect?.top ?? 0;

    applyChange();
    await tick();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const newVp = document.querySelector('.canvas-viewport');
    const newRect = newVp?.getBoundingClientRect();
    const newLeft = newRect?.left ?? oldLeft;
    const newTop = newRect?.top ?? oldTop;

    canvasState.x += oldLeft - newLeft;
    canvasState.y += oldTop - newTop;
  }

  function enter() {
    preserveCenter(() => {
      fullscreenMode = true;
      fullscreenBarVisible = true;
      clearTimeout(fullscreenBarTimer);
      fullscreenBarTimer = setTimeout(() => (fullscreenBarVisible = false), 3000);
    });
  }

  function exit() {
    preserveCenter(() => {
      fullscreenMode = false;
      fullscreenBarVisible = true;
      clearTimeout(fullscreenBarTimer);
    });
  }

  function showBar() {
    fullscreenBarVisible = true;
    clearTimeout(fullscreenBarTimer);
    fullscreenBarTimer = setTimeout(() => (fullscreenBarVisible = false), 3000);
  }

  function cleanup() {
    clearTimeout(fullscreenBarTimer);
  }

  return {
    get mode() { return fullscreenMode; },
    get barVisible() { return fullscreenBarVisible; },
    enter,
    exit,
    showBar,
    preserveCenter,
    cleanup,
  };
}
