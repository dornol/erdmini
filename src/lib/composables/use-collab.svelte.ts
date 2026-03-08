import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { collabClient } from '$lib/collab/collab-client';
import { collabStore } from '$lib/store/collab.svelte';
import { handleServerMessage, sendPresence, sendOperation } from '$lib/collab/operation-bridge';

/**
 * Sets up WebSocket collab lifecycle: connect/disconnect, presence, operation forwarding.
 * Must be called during component initialization.
 * Returns a cleanup function for onDestroy.
 */
export function useCollab(): () => void {
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
    collabClient.disconnect();
    collabStore.reset();
  };
}
