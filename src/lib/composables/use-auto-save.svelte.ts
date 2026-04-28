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
      // Capture-and-clear: Svelte 5 batches sync state changes, so callers
      // can't clear these flags via try/finally — the effect would see the
      // final value (false) and misclassify the change as local.
      const skip =
        erdStore._isUndoRedoing || erdStore._isRemoteOp || erdStore._isLoadingSchema;
      erdStore._isUndoRedoing = false;
      erdStore._isRemoteOp = false;
      erdStore._isLoadingSchema = false;
      if (!skip) {
        const prevSchema: ERDSchema = JSON.parse(prevSchemaSnap);
        const curSchema = $state.snapshot(erdStore.schema) as ERDSchema;
        const result = deriveLabel(prevSchema, curSchema);
        if (result) {
          erdStore.pushSnapshotRaw(prevSchemaSnap, result.label, result.detail);
        }
      }
      prevUpdatedAt = cur;
      prevSchemaSnap = JSON.stringify($state.snapshot(erdStore.schema));
    }
    if (projectStore.safeToSave && !permissionStore.isReadOnly) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => { if (projectStore.safeToSave && !permissionStore.isReadOnly) await projectStore.saveCurrentSchema(); }, 300);
    }
  });

  return () => clearTimeout(saveTimer);
}
