import type { CollabOperation } from '$lib/types/collab';
import type { MemoStatePatch } from './memo-state';

export interface MemoStateAcknowledgement {
  kind: 'memo-state';
  memoId: string;
  patch: MemoStatePatch;
}
type AcknowledgedOperation = CollabOperation | MemoStateAcknowledgement;

function fields(op: AcknowledgedOperation): string[] {
  const key = (...parts: string[]) => JSON.stringify(parts);
  switch (op.kind) {
    case 'update-table-name': case 'update-table-comment': case 'update-table-color':
    case 'update-table-group': case 'update-table-schema':
      return [key('table', op.tableId, op.kind)];
    case 'move-column': return op.columnIds ? [key('table', op.tableId, 'column-order')] : [];
    case 'move-table': return [key('table', op.tableId, 'position')];
    case 'move-tables': return op.moves.map(move => key('table', move.tableId, 'position'));
    case 'move-memo': return [key('memo', op.memoId, 'position')];
    case 'move-memos': return op.moves.map(move => key('memo', move.memoId, 'position'));
    case 'memo-state': return Object.keys(op.patch).map(field => key('memo', op.memoId, field));
    case 'update-column':
      return Object.keys(op.patch).map(field => key('column', op.tableId, op.columnId, field));
    case 'update-domain':
      return Object.keys(op.patch).map(field => key('domain', op.domainId, field));
    case 'update-memo':
      return Object.keys(op.patch).map(field => key('memo', op.memoId, field));
    case 'update-db-object':
      return Object.keys(op.updates).map(field => key('object', op.objectId, field));
    case 'update-fk': return [key('fk', op.tableId, op.fk.id)];
    case 'reorder-schemas': return ['schema-order'];
    case 'reorder-db-object-categories': return ['object-category-order'];
    case 'set-dialect': return ['dialect'];
    default: return [];
  }
}

/** Replay only acknowledged overwrite fields which have no newer local write.
 * Structural operations are applied optimistically; only derived field state can be replayed.
 */
export class OperationAcknowledgements {
  private pending = new Map<string, { op: AcknowledgedOperation; fields: string[] }>();
  private latest = new Map<string, string>();

  register(id: string, op: CollabOperation): boolean {
    let replay: AcknowledgedOperation = op;
    if (op.kind === 'attach-memo') {
      replay = { kind: 'memo-state', memoId: op.memoId, patch: { attachedTableId: op.tableId } };
    } else if (op.kind === 'detach-memo' && op.position
      && Number.isFinite(op.position.x) && Number.isFinite(op.position.y)) {
      replay = { kind: 'memo-state', memoId: op.memoId, patch: { attachedTableId: null, position: { ...op.position } } };
    }
    const keys = fields(replay);
    if (!keys.length) return false;
    this.pending.set(id, { op: replay, fields: keys });
    for (const key of keys) this.latest.set(key, id);
    return true;
  }

  acknowledge(id: string): AcknowledgedOperation | null {
    const entry = this.pending.get(id);
    if (!entry) return null;
    this.pending.delete(id);
    const accepted = entry.fields.map(key => this.latest.get(key) === id);
    entry.fields.forEach((key, index) => { if (accepted[index]) this.latest.delete(key); });
    if (!accepted.some(Boolean)) return null;
    if (accepted.every(Boolean)) return entry.op;
    const filter = (patch: object) => Object.fromEntries(Object.entries(patch).filter((_, index) => accepted[index]));
    const op = entry.op;
    switch (op.kind) {
      case 'memo-state': return { ...op, patch: filter(op.patch) as MemoStatePatch };
      case 'move-tables': return { ...op, moves: op.moves.filter((_, index) => accepted[index]) };
      case 'move-memos': return { ...op, moves: op.moves.filter((_, index) => accepted[index]) };
      case 'update-column': return { ...op, patch: filter(op.patch) as typeof op.patch };
      case 'update-domain': return { ...op, patch: filter(op.patch) as typeof op.patch };
      case 'update-memo': return { ...op, patch: filter(op.patch) as typeof op.patch };
      case 'update-db-object': return { ...op, updates: filter(op.updates) as typeof op.updates };
      default: return null;
    }
  }

  reset(): void {
    this.pending.clear();
    this.latest.clear();
  }
}
