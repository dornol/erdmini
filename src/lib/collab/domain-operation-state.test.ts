import { describe, expect, it } from 'vitest';
import { DomainOperationState } from './domain-operation-state';
import type { ERDSchema } from '$lib/types/erd';
import type { CollabOperation } from '$lib/types/collab';
import { updateColumnOp } from '$lib/store/ops/column-ops';
import { updateDomainOp } from '$lib/store/ops/domain-ops';

function fixture(): ERDSchema {
  const flags = { nullable: false, primaryKey: false, unique: false, autoIncrement: false };
  return { version: '1', createdAt: '', updatedAt: '', memos: [], domains: [
    { ...flags, id: 'root', name: 'root', type: 'VARCHAR', length: 80 },
    { ...flags, id: 'child', name: 'child', type: 'VARCHAR', parentId: 'root' },
  ], tables: [{ id: 't', name: 't', position: { x: 0, y: 0 }, foreignKeys: [], uniqueKeys: [], indexes: [], columns: [
    { ...flags, id: 'c', name: 'c', type: 'VARCHAR', length: 80, domainId: 'child', comment: 'Keep comment' },
  ] }] };
}
const column = (schema: ERDSchema) => schema.tables[0].columns[0];
describe('accepted order of domain updates and optimistic unlink', () => {
  for (const first of ['unlink', 'update'] as const) it(`converges when ${first} is accepted first, including JSON serialization`, () => {
    const owner = fixture(), peer = fixture();
    const left = new DomainOperationState(), right = new DomainOperationState();
    const unlink: Extract<CollabOperation, { kind: 'update-column' }> = { kind: 'update-column', tableId: 't', columnId: 'c', patch: { domainId: undefined }, domainSnapshot: structuredClone(column(owner)), unsetFields: ['domainId'] };
    const update: Extract<CollabOperation, { kind: 'update-domain' }> = { kind: 'update-domain', domainId: 'root', patch: { length: 160 } };
    updateColumnOp(owner, 't', 'c', unlink.patch); left.register('unlink', unlink, owner);
    updateDomainOp(peer, 'root', update.patch); right.register('update', update, peer);
    const acceptUnlink = () => {
      const wire = JSON.parse(JSON.stringify(unlink));
      updateColumnOp(peer, 't', 'c', right.columnPatch(wire));
      left.acknowledge('unlink'); updateColumnOp(owner, 't', 'c', left.columnPatch(unlink));
    };
    const acceptUpdate = () => {
      left.applyDomainUpdate(owner, () => updateDomainOp(owner, 'root', update.patch));
      right.acknowledge('update'); right.applyDomainUpdate(peer, () => updateDomainOp(peer, 'root', update.patch));
    };
    if (first === 'unlink') { acceptUnlink(); acceptUpdate(); } else { acceptUpdate(); acceptUnlink(); }
    expect(owner.tables).toEqual(peer.tables);
    expect(owner.domains).toEqual(peer.domains);
    expect(column(owner)).toMatchObject({ length: first === 'unlink' ? 80 : 160, comment: 'Keep comment' });
    expect(column(owner).domainId).toBeUndefined();
    expect(owner.domains[0].length).toBe(160);
  });
  it('clears optional column fields explicitly after JSON drops undefined values', () => {
    const state = new DomainOperationState();
    expect(state.columnPatch({ kind: 'update-column', tableId: 't', columnId: 'c', patch: {}, unsetFields: ['domainId', 'length', 'defaultValue'] })).toEqual({ domainId: undefined, length: undefined, defaultValue: undefined });
  });
  it('does not apply an old snapshot after the local update was acknowledged or disconnected', () => {
    const schema = fixture(), state = new DomainOperationState();
    const update: CollabOperation = { kind: 'update-domain', domainId: 'root', patch: { length: 160 } };
    const unlink: Extract<CollabOperation, { kind: 'update-column' }> = { kind: 'update-column', tableId: 't', columnId: 'c', patch: {}, domainSnapshot: structuredClone(column(schema)), unsetFields: ['domainId'] };
    state.register('u', update, schema); state.acknowledge('u');
    expect(state.columnPatch(unlink)).toEqual({ domainId: undefined });
    state.register('v', update, schema); state.reset();
    expect(state.columnPatch(unlink)).toEqual({ domainId: undefined });
  });
});
