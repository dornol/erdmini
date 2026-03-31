import { erdStore } from '$lib/store/erd.svelte';
import { projectStore } from '$lib/store/project.svelte';
import { permissionStore } from '$lib/store/permission.svelte';
import { deriveLabel } from '$lib/utils/history-labels';
import type { ERDSchema } from '$lib/types/erd';

/**
 * Sets up auto-save and undo snapshot derivation.
 * Must be called during component initialization.
 * Returns a cleanup function for the save timer.
 */
export function useAutoSave(): () => void {
  let prevUpdatedAt = $state(erdStore.schema.updatedAt);
  let prevSchemaSnap: string = JSON.stringify($state.snapshot(erdStore.schema));
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const cur = erdStore.schema.updatedAt;
    if (cur !== prevUpdatedAt) {
      if (erdStore._isUndoRedoing) {
        erdStore._isUndoRedoing = false;
      } else if (erdStore._isRemoteOp) {
        // Remote operations don't go into undo stack
      } else if (erdStore._isLoadingSchema) {
        erdStore._isLoadingSchema = false;
      } else {
        const prevSchema: ERDSchema = JSON.parse(prevSchemaSnap);
        const curSchema = $state.snapshot(erdStore.schema) as ERDSchema;
        const result = deriveLabel(prevSchema, curSchema);
        if (result) {
          erdStore.pushSnapshotRaw(prevSchemaSnap, result.label, result.detail);
        }
      }
      prevUpdatedAt = cur;
    }
    prevSchemaSnap = JSON.stringify($state.snapshot(erdStore.schema));
    if (projectStore.safeToSave && !permissionStore.isReadOnly) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => { if (projectStore.safeToSave && !permissionStore.isReadOnly) await projectStore.saveCurrentSchema(); }, 300);
    }
  });

  return () => clearTimeout(saveTimer);
}
