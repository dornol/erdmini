import { describe, it, expect } from 'vitest';
import { schemaToShareString, shareStringToSchema } from './url-share';
import { makeColumn, makeTable, makeSchema } from './test-helpers';

describe('url-share roundtrip', () => {
  it('compresses and decompresses schema with project name', async () => {
    const schema = makeSchema([
      makeTable({
        name: 'users',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ name: 'name', type: 'VARCHAR', nullable: false }),
        ],
      }),
    ]);

    const encoded = await schemaToShareString(schema, 'TestProject');
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const { schema: decoded, projectName } = await shareStringToSchema(encoded);
    expect(projectName).toBe('TestProject');
    expect(decoded.tables).toHaveLength(1);
    expect(decoded.tables[0].name).toBe('users');
    expect(decoded.tables[0].columns).toHaveLength(2);
  });

  it('handles empty schema', async () => {
    const schema = makeSchema([]);
    const encoded = await schemaToShareString(schema, 'Empty');
    const { schema: decoded, projectName } = await shareStringToSchema(encoded);
    expect(projectName).toBe('Empty');
    expect(decoded.tables).toHaveLength(0);
  });

  it('handles schema with FK relationships', async () => {
    const userId = 'u_id';
    const users = makeTable({
      id: 'tbl_users',
      name: 'users',
      columns: [makeColumn({ id: userId, name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    const orders = makeTable({
      name: 'orders',
      columns: [
        makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ id: 'o_uid', name: 'user_id', type: 'INT', nullable: false }),
      ],
      foreignKeys: [{
        id: 'fk1', columnIds: ['o_uid'], referencedTableId: 'tbl_users',
        referencedColumnIds: [userId], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
      }],
    });
    const schema = makeSchema([users, orders]);
    const encoded = await schemaToShareString(schema, 'FKTest');
    const { schema: decoded } = await shareStringToSchema(encoded);
    expect(decoded.tables[1].foreignKeys).toHaveLength(1);
    expect(decoded.tables[1].foreignKeys[0].referencedTableId).toBe('tbl_users');
  });

  it('backwards-compatible: old format (raw schema) returns null projectName', async () => {
    // Simulate old format: raw ERDSchema JSON compressed
    const schema = makeSchema([
      makeTable({ name: 'test', columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })] }),
    ]);
    // Manually compress raw schema (not wrapped in {n,s})
    const json = JSON.stringify(schema);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(json));
        controller.close();
      },
    }).pipeThrough(new CompressionStream('deflate'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    let b64 = btoa(String.fromCharCode(...merged));
    b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const { schema: decoded, projectName } = await shareStringToSchema(b64);
    expect(projectName).toBeNull();
    expect(decoded.tables).toHaveLength(1);
    expect(decoded.tables[0].name).toBe('test');
  });
});
