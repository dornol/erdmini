import { describe, it, expect, beforeEach } from 'vitest';
import { erdStore, defaultSchema } from '$lib/store/erd.svelte';
import type { ERDSchema, Table } from '$lib/types/erd';

function table(id: string, name: string, x = 0, y = 0): Table {
  return {
    id,
    name,
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x, y },
  };
}

function freshSchema(): ERDSchema {
  return {
    ...defaultSchema(),
    tables: [table('t1', 'users')],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('loadSchemaFromMcp — MCP changes appear in undo history', () => {
  beforeEach(() => {
    erdStore.clearHistory();
    erdStore.loadSchema(freshSchema());
    erdStore._isLoadingSchema = false; // reset side-effect of loadSchema
    erdStore._isRemoteOp = false;
    erdStore.clearHistory();
  });

  it('pushes the prev snapshot to undo stack with an "(MCP)" marker in detail', () => {
    const before = freshSchema();
    erdStore.loadSchema(before);
    erdStore.clearHistory();

    const after: ERDSchema = {
      ...before,
      tables: [...before.tables, table('t2', 'orders', 100, 100)],
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    expect(erdStore.canUndo).toBe(false);

    erdStore.loadSchemaFromMcp(after);

    // Schema is updated.
    expect(erdStore.schema.tables.map((t) => t.name)).toEqual(['users', 'orders']);

    // Exactly one history entry was added.
    expect(erdStore.canUndo).toBe(true);
    const entries = erdStore.historyEntries;
    expect(entries).toHaveLength(1);

    // Label reflects what changed; detail carries the MCP marker.
    const entry = entries[0];
    expect(entry.label).toBe('history_add_table');
    expect(entry.detail).toContain('(MCP)');
    expect(entry.detail).toContain('orders');
  });

  it('clears _isLoadingSchema so the next genuine local change is not swallowed', () => {
    const after = freshSchema();
    after.tables = [...after.tables, table('t2', 'orders')];
    erdStore.loadSchemaFromMcp(after);

    // After the MCP load, the loading-schema flag must NOT be set —
    // otherwise the next user edit would be misclassified as a load.
    expect(erdStore._isLoadingSchema).toBe(false);
  });

  it('sets _isRemoteOp so the load-schema op is not echoed back to peers', () => {
    // _isRemoteOp is set inside loadSchemaFromMcp and stays true until
    // useAutoSave's effect captures and clears it. That effect doesn't run
    // in this isolated test, so we observe the flag directly.
    const after = freshSchema();
    after.tables = [...after.tables, table('t2', 'orders')];
    erdStore.loadSchemaFromMcp(after);

    expect(erdStore._isRemoteOp).toBe(true);
  });

  it('undo reverts to the pre-MCP state', () => {
    const before = freshSchema();
    erdStore.loadSchema(before);
    erdStore._isLoadingSchema = false;
    erdStore.clearHistory();

    const after: ERDSchema = {
      ...before,
      tables: [...before.tables, table('t2', 'orders')],
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    erdStore.loadSchemaFromMcp(after);
    erdStore._isRemoteOp = false; // simulate effect having run
    expect(erdStore.schema.tables).toHaveLength(2);

    erdStore.undo();
    expect(erdStore.schema.tables).toHaveLength(1);
    expect(erdStore.schema.tables[0].name).toBe('users');
  });
});
