import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { permissionStore } from '$lib/store/permission.svelte';

/**
 * Loads permission when active project changes (server mode only).
 * Must be called during component initialization.
 */
export function usePermission(): void {
  $effect(() => {
    const projectId = projectStore.index.activeProjectId;
    if (!projectId || !authStore.isLoggedIn) {
      permissionStore.set(null);
      return;
    }
    loadPermission(projectId);
  });

  async function loadPermission(projectId: string) {
    try {
      const res = await fetch(`/api/storage/projects/${projectId}/my-permission`);
      if (res.ok) {
        const data = await res.json();
        permissionStore.set(data.permission);
      }
    } catch {
      permissionStore.set(null);
    }
  }
}
