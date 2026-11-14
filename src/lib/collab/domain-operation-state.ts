import { DOMAIN_FIELDS, type ERDSchema, type Column } from '$lib/types/erd';
import type { CollabOperation } from '$lib/types/collab';
import { getDescendantIds } from '$lib/utils/domain-hierarchy';

type ColumnUpdate = Extract<CollabOperation, { kind: 'update-column' }>;

/** Reconcile optimistic derived values with the relay's accepted operation order. */
export class DomainOperationState {
  private updates = new Map<string, Set<string>>();
  private unlinks = new Map<string, { tableId: string; columnId: string; domainId: string }>();

  register(id: string, op: CollabOperation, schema: ERDSchema) {
    if (op.kind === 'update-domain') this.updates.set(id, new Set([op.domainId, ...getDescendantIds(op.domainId, schema.domains)]));
    if (op.kind === 'update-column' && Object.hasOwn(op.patch, 'domainId') && op.patch.domainId === undefined && op.domainSnapshot?.domainId) {
      this.unlinks.set(id, { tableId: op.tableId, columnId: op.columnId, domainId: op.domainSnapshot.domainId });
    }
  }

  acknowledge(id: string) { this.updates.delete(id); this.unlinks.delete(id); }
  reset() { this.updates.clear(); this.unlinks.clear(); }

  columnPatch(op: ColumnUpdate): Partial<Column> {
    const snapshot = op.domainSnapshot;
    // An incoming unlink accepted before our still-pending domain update must
    // remove that optimistic update's derived column values as well as its link.
    const restore = snapshot?.domainId && [...this.updates.values()].some(ids => ids.has(snapshot.domainId!));
    return {
      ...(restore ? Object.fromEntries(DOMAIN_FIELDS.map(field => [field, snapshot[field]])) : {}),
      ...op.patch,
      ...Object.fromEntries((op.unsetFields ?? []).map(field => [field, undefined])),
    };
  }

  applyDomainUpdate(schema: ERDSchema, apply: () => void) {
    const restored: { tableId: string; columnId: string }[] = [];
    // A remote domain update accepted before a pending local unlink still
    // affects this column. Preserve its new values when restoring the unlink.
    for (const unlink of this.unlinks.values()) {
      const column = schema.tables.find(t => t.id === unlink.tableId)?.columns.find(c => c.id === unlink.columnId);
      if (column && !column.domainId) {
        column.domainId = unlink.domainId; restored.push(unlink);
      }
    }
    try { apply(); }
    finally {
      for (const reference of restored) {
        const column = schema.tables.find(t => t.id === reference.tableId)?.columns.find(c => c.id === reference.columnId);
        if (column) column.domainId = undefined;
      }
    }
  }
}
