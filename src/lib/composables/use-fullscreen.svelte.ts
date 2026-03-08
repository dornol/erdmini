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
    const vp = document.querySelector('.canvas-viewport');
    const oldRect = vp?.getBoundingClientRect();
    const oldW = oldRect?.width ?? 0;
    const oldH = oldRect?.height ?? 0;

    applyChange();
    await tick();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const newVp = document.querySelector('.canvas-viewport');
    const newRect = newVp?.getBoundingClientRect();
    const newW = newRect?.width ?? oldW;
    const newH = newRect?.height ?? oldH;

    canvasState.x += (newW - oldW) / 2;
    canvasState.y += (newH - oldH) / 2;
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
