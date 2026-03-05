import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyCollabSchemaChange } from './collab-notify';
import type { ERDSchema } from '$lib/types/erd';

function makeSchema(): ERDSchema {
  return {
    version: '1',
    tables: [],
    domains: [],
    memos: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('notifyCollabSchemaChange', () => {
  let originalHandler: typeof globalThis.__erdmini_notifySchemaChange;

  beforeEach(() => {
    originalHandler = globalThis.__erdmini_notifySchemaChange;
  });

  afterEach(() => {
    globalThis.__erdmini_notifySchemaChange = originalHandler;
  });

  it('calls globalThis handler when defined', () => {
    const handler = vi.fn();
    globalThis.__erdmini_notifySchemaChange = handler;

    const schema = makeSchema();
    notifyCollabSchemaChange('proj1', schema);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('proj1', schema, 'collab');
  });

  it('passes custom source parameter', () => {
    const handler = vi.fn();
    globalThis.__erdmini_notifySchemaChange = handler;

    notifyCollabSchemaChange('proj1', makeSchema(), 'mcp');

    expect(handler).toHaveBeenCalledWith('proj1', expect.any(Object), 'mcp');
  });

  it('defaults source to "collab"', () => {
    const handler = vi.fn();
    globalThis.__erdmini_notifySchemaChange = handler;

    notifyCollabSchemaChange('proj1', makeSchema());

    expect(handler.mock.calls[0][2]).toBe('collab');
  });

  it('does not throw when handler is undefined', () => {
    globalThis.__erdmini_notifySchemaChange = undefined;
    expect(() => notifyCollabSchemaChange('proj1', makeSchema())).not.toThrow();
  });

  it('passes projectId and schema correctly', () => {
    const handler = vi.fn();
    globalThis.__erdmini_notifySchemaChange = handler;

    const schema = makeSchema();
    schema.tables = [{ id: 't1', name: 'users', columns: [], foreignKeys: [], uniqueKeys: [], indexes: [], position: { x: 0, y: 0 } }];

    notifyCollabSchemaChange('my-project', schema, 'collab');

    expect(handler.mock.calls[0][0]).toBe('my-project');
    expect((handler.mock.calls[0][1] as ERDSchema).tables).toHaveLength(1);
  });
});
