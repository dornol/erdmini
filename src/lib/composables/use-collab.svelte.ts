import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { collabClient } from '$lib/collab/collab-client';
import { collabStore } from '$lib/store/collab.svelte';
import { handleServerMessage, sendPresence, sendOperation } from '$lib/collab/operation-bridge';

/**
 * Deferred cleanup so that a quick unmount→remount cycle (e.g. the
 * `{#key languageStore.current}` wrapping +page.svelte) does not actually
 * tear down the collab WebSocket. If a new useCollab() runs before the
 * timer fires, the pending disconnect is cancelled.
 */
let pendingTeardown: ReturnType<typeof setTimeout> | null = null;

/**
 * Sets up WebSocket collab lifecycle: connect/disconnect, presence, operation forwarding.
 * Must be called during component initialization.
 * Returns a cleanup function for onDestroy.
 */
export function useCollab(): () => void {
  // A new mount is taking over — cancel any pending teardown from the
  // previous mount so the live WebSocket is preserved.
  if (pendingTeardown) {
    clearTimeout(pendingTeardown);
    pendingTeardown = null;
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
    // Defer disconnect so a same-tick remount (language switch) can cancel it.
    pendingTeardown = setTimeout(() => {
      pendingTeardown = null;
      collabClient.disconnect();
      collabStore.reset();
    }, 0);
  };
}
