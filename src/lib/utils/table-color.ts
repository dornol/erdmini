import type { Table, ERDSchema } from '$lib/types/erd';
import type { TableColorId } from '$lib/constants/table-colors';

/**
 * Resolve effective color for a table.
 * Priority: table.color > schema.groupColors[table.group] > undefined
 */
export function getEffectiveColor(table: Table, schema: ERDSchema): TableColorId | undefined {
  if (table.color) return table.color as TableColorId;
  if (table.group && schema.groupColors?.[table.group]) {
    return schema.groupColors[table.group] as TableColorId;
  }
  return undefined;
}
