import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { permissionStore } from '$lib/store/permission.svelte';
import { appPath } from '$lib/utils/paths';

/** Refresh server permissions while a project is open and when returning to it. */
export function usePermission(): void {
  $effect(() => {
    const projectId = projectStore.index.activeProjectId;
    if (!projectId || !authStore.isLoggedIn) {
      permissionStore.set(null);
      return;
    }

    // null grants local-mode access, so never use it for an unverified server grant.
    permissionStore.set('viewer');
    let controller: AbortController | undefined;
    let disposed = false;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const res = await fetch(appPath(`/api/storage/projects/${projectId}/my-permission`), { signal: request.signal });
        const data = res.ok ? await res.json() : null;
        if (disposed || request.signal.aborted) return;
        const permission = data?.permission;
        permissionStore.set(permission === 'owner' || permission === 'editor' ? permission : 'viewer');
      } catch {
        if (!disposed && !request.signal.aborted) permissionStore.set('viewer');
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, 10_000);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
}
