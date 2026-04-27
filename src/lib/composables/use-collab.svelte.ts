import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { collabClient } from '$lib/collab/collab-client';
import { collabStore } from '$lib/store/collab.svelte';
import { handleServerMessage, sendPresence, sendOperation } from '$lib/collab/operation-bridge';

/**
 * Reference counting for active mounts. Lets the collab WebSocket survive
 * the unmount→remount triggered by `{#key languageStore.current}` in
 * +layout.svelte (used to refresh Paraglide translations) regardless of
 * whether Svelte runs the new mount before or after the old cleanup.
 */
let mountCount = 0;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sets up WebSocket collab lifecycle: connect/disconnect, presence, operation forwarding.
 * Must be called during component initialization.
 * Returns a cleanup function for onDestroy.
 */
export function useCollab(): () => void {
  mountCount++;

  // A new mount overlaps with a pending teardown — cancel it so the live
  // socket and store state survive.
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  const unsubCollab = collabClient.onMessage(handleServerMessage);

  // Connect/disconnect on project change (server mode + logged in)
  $effect(() => {
    const projectId = projectStore.index.activeProjectId;
    if (!projectId || !authStore.isLoggedIn) {
      collabClient.disconnect();
      collabStore.reset();
      return;
    }
    collabClient.connect(projectId);
  });

  // Send selection presence when selected tables change
  $effect(() => {
    const ids = [...erdStore.selectedTableIds];
    sendPresence({ selectedTableIds: ids });
  });

  // Send operations to peers when erdStore emits them
  $effect(() => {
    void erdStore._opVersion;
    const op = erdStore._lastOperation;
    if (op) sendOperation(op);
  });

  return () => {
    unsubCollab();
    mountCount--;
    if (mountCount > 0) return; // another instance is still active

    // Defer disconnect — a same-tick remount (language switch) will
    // bump mountCount back up before this fires.
    teardownTimer = setTimeout(() => {
      teardownTimer = null;
      if (mountCount > 0) return;
      collabClient.disconnect();
      collabStore.reset();
    }, 50);
  };
}
