import { erdStore } from '$lib/store/erd.svelte';
import { dialogStore } from '$lib/store/dialog.svelte';
import { permissionStore } from '$lib/store/permission.svelte';
import * as m from '$lib/paraglide/messages';

export async function confirmColumnDeletion(tableId: string, columnId: string): Promise<boolean> {
  if (permissionStore.isReadOnly) return false;
  // Count each FK once, even when both ends use the same column.
  const count = erdStore.schema.tables.reduce((sum, table) => sum + table.foreignKeys.filter((fk) =>
    (table.id === tableId && fk.columnIds.includes(columnId))
      || (fk.referencedTableId === tableId && fk.referencedColumnIds.includes(columnId)),
  ).length, 0);
  if (count > 0 && !await dialogStore.confirm(m.column_delete_fk_confirm({ count }), {
    title: m.action_delete(), confirmText: m.action_delete(), variant: 'danger',
  })) return false;
  if (permissionStore.isReadOnly) return false;
  erdStore.deleteColumn(tableId, columnId);
  return true;
}
