import { onMount } from 'svelte';
import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { authStore } from '$lib/store/auth.svelte';
import { dialogStore } from '$lib/store/dialog.svelte';
import { permissionStore } from '$lib/store/permission.svelte';
import { getShareDataFromUrl, shareStringToSchema } from '$lib/utils/url-share';
import { replaceState } from '$app/navigation';
import { env } from '$env/dynamic/public';
import * as m from '$lib/paraglide/messages';

/**
 * Handles URL share loading (#s=...) and shared project auto-loading.
 * Must be called during component initialization (uses onMount).
 */
export function useUrlShare(): void {
  onMount(() => {
    const handleHashChange = () => {
      if (projectStore.initialized) loadShareFromHash();
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
}

export async function loadShareFromHash() {
  const shareData = getShareDataFromUrl();
  if (!shareData) return;
  replaceState(window.location.pathname, {});
  try {
    const { schema, projectName } = await shareStringToSchema(shareData);

    if (env.PUBLIC_STORAGE_MODE === 'server') {
      erdStore.loadSchema(schema);
      permissionStore.current = 'viewer';
      dialogStore.alert(m.share_readonly_notice());
      return;
    }

    let name: string;
    if (projectName) {
      name = `shared: ${projectName}`;
    } else {
      const tableSummary = schema.tables.slice(0, 3).map((t) => t.name).join(', ');
      name = tableSummary
        ? `Shared: ${tableSummary}${schema.tables.length > 3 ? '…' : ''}`
        : 'Shared Project';
    }
    await projectStore.createProjectWithSchema(name, schema);
  } catch {
    dialogStore.alert(m.share_load_failed());
  }
}

export async function autoLoadSharedProjects() {
  try {
    const res = await fetch('/api/storage/shared');
    if (!res.ok) return;
    const shared = await res.json();
    if (!shared.length) return;
    const first = shared[0];
    const schemaRes = await fetch(`/api/storage/schemas/${first.projectId}`);
    if (!schemaRes.ok) return;
    const schema = await schemaRes.json();
    await projectStore.loadSharedProject(first.projectId, first.projectName, schema);
    for (let i = 1; i < shared.length; i++) {
      const s = shared[i];
      const sRes = await fetch(`/api/storage/schemas/${s.projectId}`);
      if (!sRes.ok) continue;
      const sSchema = await sRes.json();
      await projectStore.loadSharedProject(s.projectId, s.projectName, sSchema);
    }
  } catch { /* ignore */ }
}
