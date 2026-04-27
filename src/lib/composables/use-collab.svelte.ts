import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { collabClient } from '$lib/collab/collab-client';
import { collabStore } from '$lib/store/collab.svelte';
import { handleServerMessage, sendPresence, sendOperation } from '$lib/collab/operation-bridge';

// Long enough to bridge a Svelte unmount→remount tick (e.g. {#key
// languageStore.current} in +layout.svelte) without tearing down the WS.
const REMOUNT_GRACE_MS = 50;

let mountCount = 0;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Sets up WebSocket collab lifecycle: connect/disconnect, presence, operation forwarding.
 * Must be called during component initialization.
 * Returns a cleanup function for onDestroy.
 */
export function useCollab(): () => void {
  mountCount++;
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }

  const unsubCollab = collabClient.onMessage(handleServerMessage);

  $effect(() => {
    const projectId = projectStore.index.activeProjectId;
    if (!projectId || !authStore.isLoggedIn) {
      collabClient.disconnect();
      collabStore.reset();
      return;
    }
    collabClient.connect(projectId);
  });

  $effect(() => {
    const ids = [...erdStore.selectedTableIds];
    sendPresence({ selectedTableIds: ids });
  });

  $effect(() => {
    void erdStore._opVersion;
    const op = erdStore._lastOperation;
    if (op) sendOperation(op);
  });

  return () => {
    unsubCollab();
    mountCount--;
    if (mountCount > 0) return;

    teardownTimer = setTimeout(() => {
      teardownTimer = null;
      if (mountCount > 0) return;
      collabClient.disconnect();
      collabStore.reset();
    }, REMOUNT_GRACE_MS);
  };
}
