import { beforeEach, expect, it } from 'vitest';
import { defaultSchema, erdStore } from './erd.svelte';

const domain = (name: string) => ({ name, type: 'INT' as const, nullable: false, primaryKey: false, unique: false, autoIncrement: false });

beforeEach(() => {
  erdStore._isRemoteOp = false;
  erdStore.clearHistory();
  erdStore.loadSchema(defaultSchema());
  erdStore._isLoadingSchema = false;
  erdStore.drainOperations();
});

it('retains every synchronous operation in order instead of only the final operation', () => {
  erdStore.upsertDomains([domain('first'), domain('second'), { ...domain('first'), length: 42 }]);
  const operations = erdStore.drainOperations();
  expect(operations.map(op => op.kind)).toEqual(['add-domain', 'add-domain', 'update-domain']);
  expect(operations[0]).toMatchObject({ domain: { name: 'first' } });
  expect(operations[1]).toMatchObject({ domain: { name: 'second' } });
  expect(operations[2]).toMatchObject({ patch: { name: 'first', length: 42 } });
  expect(erdStore.drainOperations()).toEqual([]);
});

it('captures operation values before later mutations can change the original objects', () => {
  erdStore.addDomain(domain('original'));
  const id = erdStore.schema.domains[0].id;
  const patch = { name: 'updated', length: 42 };
  erdStore.updateDomain(id, patch);
  patch.name = 'must not leak';
  const operations = erdStore.drainOperations();
  expect(operations[0]).toMatchObject({ domain: { id, name: 'original' } });
  expect(operations[1]).toMatchObject({ patch: { name: 'updated', length: 42 } });
});

it('drops old-project operations when loading a different schema', () => {
  erdStore.addDomain(domain('old-project'));
  erdStore.loadSchema(defaultSchema());
  expect(erdStore.drainOperations()).toMatchObject([{ kind: 'load-schema', schema: { domains: [] } }]);
});

it('does not queue remote changes for retransmission', () => {
  erdStore._isRemoteOp = true;
  try { erdStore.addDomain(domain('remote')); } finally { erdStore._isRemoteOp = false; }
  expect(erdStore.drainOperations()).toEqual([]);
  erdStore.addDomain(domain('local'));
  expect(erdStore.drainOperations()).toMatchObject([{ kind: 'add-domain', domain: { name: 'local' } }]);
});

for (const tableExists of [true, false]) {
  it(`captures a memo's final detached position with its table ${tableExists ? 'present' : 'missing'}`, () => {
    const schema = defaultSchema();
    schema.tables = tableExists ? [{ id: 'table', name: 'table', columns: [], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 200, y: 300 } }] : [];
    schema.memos = [{ id: 'memo', content: 'Keep documentation', width: 180, height: 100, position: { x: 17, y: 29 }, attachedTableId: 'table' }];
    erdStore.loadSchema(schema);
    erdStore.drainOperations();
    erdStore.detachMemo('memo');
    const position = tableExists ? { x: 200, y: 188 } : { x: 17, y: 29 };
    const operations = erdStore.drainOperations();
    expect(operations).toEqual([{ kind: 'detach-memo', memoId: 'memo', position }]);
    expect(erdStore.schema.memos[0]).toMatchObject({ content: 'Keep documentation', position });
    expect(erdStore.schema.memos[0].attachedTableId).toBeUndefined();
    erdStore.moveMemo('memo', 600, 700);
    erdStore.schema.memos[0].position.x = 999;
    expect(operations).toEqual([{ kind: 'detach-memo', memoId: 'memo', position }]);
  });
}
