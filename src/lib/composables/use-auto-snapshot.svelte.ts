import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { collabStore } from '$lib/store/collab.svelte';
import { permissionStore } from '$lib/store/permission.svelte';
import { snapshotStore, AUTO_SNAPSHOT_INTERVAL_MS } from '$lib/store/snapshot.svelte';

/**
 * Sets up periodic auto-snapshot creation with collab peer leader election.
 * Must be called during component initialization.
 */
export function useAutoSnapshot(): void {
  let lastAutoSnapshotSnap = '';

  $effect(() => {
    const _projectId = projectStore.index.activeProjectId;
    lastAutoSnapshotSnap = JSON.stringify($state.snapshot(erdStore.schema));

    const timer = setInterval(async () => {
      if (document.hidden || permissionStore.isReadOnly) return;

      // In collab mode, only the lexicographically first peer creates auto-snapshots
      if (collabStore.myPeerId && collabStore.peers.length > 0) {
        const allPeerIds = [collabStore.myPeerId, ...collabStore.peers.map((p) => p.peerId)];
        allPeerIds.sort();
        if (allPeerIds[0] !== collabStore.myPeerId) return;
      }

      const currentSnap = JSON.stringify($state.snapshot(erdStore.schema));
      if (currentSnap === lastAutoSnapshotSnap) return;

      const now = new Date();
      const name = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      await snapshotStore.createAuto(name);
      lastAutoSnapshotSnap = currentSnap;
    }, AUTO_SNAPSHOT_INTERVAL_MS);

    return () => clearInterval(timer);
  });
}
