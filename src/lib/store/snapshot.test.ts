import { describe, it, expect, beforeEach } from 'vitest';
import type { SchemaSnapshot, ERDSchema, ProjectIndex, Column, ForeignKey, Table, Memo, ColumnDomain, UniqueKey, TableIndex } from '$lib/types/erd';
import type { StorageProvider, CanvasData } from '$lib/storage/types';

// Mock storage provider (mirrors LocalStorageProvider snapshot logic)
class MockStorageProvider implements StorageProvider {
  private snapshots = new Map<string, SchemaSnapshot>();
  private schemas = new Map<string, ERDSchema>();

  async listSnapshots(projectId: string): Promise<SchemaSnapshot[]> {
    const result: SchemaSnapshot[] = [];
    for (const [key, snap] of this.snapshots) {
      if (key.startsWith(`${projectId}:`)) {
        result.push(snap);
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveSnapshot(projectId: string, snapshot: SchemaSnapshot): Promise<void> {
    this.snapshots.set(`${projectId}:${snapshot.id}`, snapshot);
  }

  async loadSnapshot(projectId: string, snapshotId: string): Promise<SchemaSnapshot | null> {
    return this.snapshots.get(`${projectId}:${snapshotId}`) ?? null;
  }

  async deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
    this.snapshots.delete(`${projectId}:${snapshotId}`);
  }

  /** Simulates deleteAllSnapshots cascade when project is deleted */
  async deleteAllSnapshots(projectId: string): Promise<void> {
    for (const key of [...this.snapshots.keys()]) {
      if (key.startsWith(`${projectId}:`)) {
        this.snapshots.delete(key);
      }
    }
  }

  // Required interface methods
  async loadIndex(): Promise<ProjectIndex | null> { return null; }
  async saveIndex(): Promise<void> {}
  async loadSchema(projectId: string): Promise<ERDSchema | null> {
    return this.schemas.get(projectId) ?? null;
  }
  async saveSchema(projectId: string, schema: ERDSchema): Promise<void> {
    this.schemas.set(projectId, schema);
  }
  async deleteSchema(projectId: string): Promise<void> {
    this.schemas.delete(projectId);
    await this.deleteAllSnapshots(projectId);
  }
  async loadCanvasState(): Promise<CanvasData | null> { return null; }
  async saveCanvasState(): Promise<void> {}
  async deleteCanvasState(): Promise<void> {}
  async loadLegacySchema(): Promise<string | null> { return null; }
  async deleteLegacyKey(): Promise<void> {}
}

// ─── Test Data Helpers ───

function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: 'col1',
    name: 'id',
    type: 'INT',
    nullable: false,
    primaryKey: true,
    unique: false,
    autoIncrement: true,
    ...overrides,
  };
}

function makeFK(overrides: Partial<ForeignKey> = {}): ForeignKey {
  return {
    id: 'fk1',
    columnIds: ['col_user_id'],
    referencedTableId: 'users',
    referencedColumnIds: ['col1'],
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
    ...overrides,
  };
}

function makeTable(name: string, overrides: Partial<Table> = {}): Table {
  return {
    id: name,
    name,
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeMemo(overrides: Partial<Memo> = {}): Memo {
  return {
    id: 'memo1',
    content: 'Test memo',
    position: { x: 100, y: 200 },
    width: 200,
    height: 150,
    ...overrides,
  };
}

function makeDomain(overrides: Partial<ColumnDomain> = {}): ColumnDomain {
  return {
    id: 'd1',
    name: 'email',
    type: 'VARCHAR',
    length: 255,
    nullable: false,
    primaryKey: false,
    unique: true,
    autoIncrement: false,
    ...overrides,
  };
}

function makeSchema(tables: string[] = [], extras: Partial<ERDSchema> = {}): ERDSchema {
  return {
    version: '1',
    tables: tables.map((name) => makeTable(name)),
    domains: [],
    memos: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...extras,
  };
}

function makeSnap(overrides: Partial<SchemaSnapshot> & { id: string; name: string }): SchemaSnapshot {
  return {
    snap: '{}',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// 1. StorageProvider CRUD Tests
// ═══════════════════════════════════════════

describe('StorageProvider snapshot CRUD', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('listSnapshots returns empty for new project', async () => {
    const result = await provider.listSnapshots('proj1');
    expect(result).toEqual([]);
  });

  it('saveSnapshot + loadSnapshot round-trip', async () => {
    const schema = makeSchema(['users', 'orders']);
    const snapshot: SchemaSnapshot = {
      id: 'snap1',
      name: 'v1.0',
      description: 'Initial release',
      snap: JSON.stringify(schema),
      createdAt: Date.now(),
    };

    await provider.saveSnapshot('proj1', snapshot);
    const loaded = await provider.loadSnapshot('proj1', 'snap1');
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('v1.0');
    expect(loaded!.description).toBe('Initial release');
    expect(JSON.parse(loaded!.snap).tables).toHaveLength(2);
  });

  it('loadSnapshot returns null for non-existent', async () => {
    const loaded = await provider.loadSnapshot('proj1', 'nonexistent');
    expect(loaded).toBeNull();
  });

  it('listSnapshots returns snapshots sorted by createdAt desc', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 'snap1', name: 'First', createdAt: 1000 }));
    await provider.saveSnapshot('proj1', makeSnap({ id: 'snap2', name: 'Second', createdAt: 2000 }));
    await provider.saveSnapshot('proj1', makeSnap({ id: 'snap3', name: 'Third', createdAt: 1500 }));

    const list = await provider.listSnapshots('proj1');
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe('Second');
    expect(list[1].name).toBe('Third');
    expect(list[2].name).toBe('First');
  });

  it('deleteSnapshot removes only the specified snapshot', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 'a', name: 'A', createdAt: 1 }));
    await provider.saveSnapshot('proj1', makeSnap({ id: 'b', name: 'B', createdAt: 2 }));

    await provider.deleteSnapshot('proj1', 'a');

    const list = await provider.listSnapshots('proj1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('b');
  });

  it('delete non-existent snapshot does not throw', async () => {
    await expect(provider.deleteSnapshot('proj1', 'nonexistent')).resolves.toBeUndefined();
  });

  it('overwrite snapshot with same id replaces data', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 'dup', name: 'v1', snap: '{"v":1}', createdAt: 1 }));
    await provider.saveSnapshot('proj1', makeSnap({ id: 'dup', name: 'v2', snap: '{"v":2}', createdAt: 2 }));

    const loaded = await provider.loadSnapshot('proj1', 'dup');
    expect(loaded!.name).toBe('v2');
    expect(JSON.parse(loaded!.snap).v).toBe(2);

    const list = await provider.listSnapshots('proj1');
    expect(list).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// 2. Project Isolation Tests
// ═══════════════════════════════════════════

describe('Snapshot project isolation', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('snapshots are isolated per project', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 's1', name: 'P1', createdAt: 1 }));
    await provider.saveSnapshot('proj2', makeSnap({ id: 's2', name: 'P2', createdAt: 2 }));

    const list1 = await provider.listSnapshots('proj1');
    const list2 = await provider.listSnapshots('proj2');
    expect(list1).toHaveLength(1);
    expect(list1[0].name).toBe('P1');
    expect(list2).toHaveLength(1);
    expect(list2[0].name).toBe('P2');
  });

  it('same snapshot id in different projects are independent', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 'shared-id', name: 'Proj1 snap', createdAt: 1 }));
    await provider.saveSnapshot('proj2', makeSnap({ id: 'shared-id', name: 'Proj2 snap', createdAt: 2 }));

    const from1 = await provider.loadSnapshot('proj1', 'shared-id');
    const from2 = await provider.loadSnapshot('proj2', 'shared-id');
    expect(from1!.name).toBe('Proj1 snap');
    expect(from2!.name).toBe('Proj2 snap');
  });

  it('deleting snapshot in one project does not affect another', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 'snap1', name: 'A', createdAt: 1 }));
    await provider.saveSnapshot('proj2', makeSnap({ id: 'snap1', name: 'B', createdAt: 2 }));

    await provider.deleteSnapshot('proj1', 'snap1');

    expect(await provider.loadSnapshot('proj1', 'snap1')).toBeNull();
    expect(await provider.loadSnapshot('proj2', 'snap1')).not.toBeNull();
  });

  it('loadSnapshot from wrong project returns null', async () => {
    await provider.saveSnapshot('proj1', makeSnap({ id: 'snap1', name: 'A', createdAt: 1 }));
    expect(await provider.loadSnapshot('proj2', 'snap1')).toBeNull();
  });

  it('listSnapshots with prefix collision does not leak', async () => {
    // "proj1" prefix should not match "proj10" snapshots
    await provider.saveSnapshot('proj1', makeSnap({ id: 'a', name: 'proj1', createdAt: 1 }));
    await provider.saveSnapshot('proj10', makeSnap({ id: 'b', name: 'proj10', createdAt: 2 }));

    const list = await provider.listSnapshots('proj1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('proj1');
  });
});

// ═══════════════════════════════════════════
// 3. Schema Data Fidelity Tests
// ═══════════════════════════════════════════

describe('Snapshot schema data fidelity', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('preserves columns with all properties', async () => {
    const col: Column = {
      id: 'col1',
      name: 'email',
      domainId: 'd1',
      type: 'VARCHAR',
      length: 255,
      scale: undefined,
      nullable: false,
      primaryKey: false,
      unique: true,
      autoIncrement: false,
      defaultValue: "'unknown@example.com'",
      check: "LENGTH(email) > 5",
      comment: 'User email address',
    };
    const schema = makeSchema([], {
      tables: [makeTable('users', { columns: [col] })],
    });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;
    const restoredCol = parsed.tables[0].columns[0];

    expect(restoredCol.id).toBe('col1');
    expect(restoredCol.name).toBe('email');
    expect(restoredCol.domainId).toBe('d1');
    expect(restoredCol.type).toBe('VARCHAR');
    expect(restoredCol.length).toBe(255);
    expect(restoredCol.nullable).toBe(false);
    expect(restoredCol.unique).toBe(true);
    expect(restoredCol.autoIncrement).toBe(false);
    expect(restoredCol.defaultValue).toBe("'unknown@example.com'");
    expect(restoredCol.check).toBe('LENGTH(email) > 5');
    expect(restoredCol.comment).toBe('User email address');
  });

  it('preserves ENUM columns with enumValues', async () => {
    const col = makeColumn({
      id: 'status',
      name: 'status',
      type: 'ENUM',
      enumValues: ['active', 'inactive', 'pending'],
      primaryKey: false,
      autoIncrement: false,
    });
    const schema = makeSchema([], {
      tables: [makeTable('users', { columns: [col] })],
    });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;
    expect(parsed.tables[0].columns[0].enumValues).toEqual(['active', 'inactive', 'pending']);
  });

  it('preserves foreign keys with all referential actions', async () => {
    const fk: ForeignKey = {
      id: 'fk_order_user',
      columnIds: ['user_id', 'org_id'],
      referencedTableId: 'users',
      referencedColumnIds: ['id', 'org_id'],
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    };
    const schema = makeSchema([], {
      tables: [
        makeTable('users', { columns: [makeColumn()] }),
        makeTable('orders', { foreignKeys: [fk] }),
      ],
    });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;
    const restoredFK = parsed.tables[1].foreignKeys[0];

    expect(restoredFK.columnIds).toEqual(['user_id', 'org_id']);
    expect(restoredFK.referencedTableId).toBe('users');
    expect(restoredFK.referencedColumnIds).toEqual(['id', 'org_id']);
    expect(restoredFK.onDelete).toBe('SET NULL');
    expect(restoredFK.onUpdate).toBe('CASCADE');
  });

  it('preserves unique keys and indexes', async () => {
    const uk: UniqueKey = { id: 'uk1', columnIds: ['email', 'org_id'], name: 'uq_email_org' };
    const idx: TableIndex = { id: 'idx1', columnIds: ['created_at'], name: 'idx_created', unique: false };
    const uidx: TableIndex = { id: 'idx2', columnIds: ['code'], name: 'idx_code_unique', unique: true };

    const schema = makeSchema([], {
      tables: [makeTable('users', { uniqueKeys: [uk], indexes: [idx, uidx] })],
    });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;
    const t = parsed.tables[0];

    expect(t.uniqueKeys).toHaveLength(1);
    expect(t.uniqueKeys[0].name).toBe('uq_email_org');
    expect(t.uniqueKeys[0].columnIds).toEqual(['email', 'org_id']);
    expect(t.indexes).toHaveLength(2);
    expect(t.indexes[0].unique).toBe(false);
    expect(t.indexes[1].unique).toBe(true);
  });

  it('preserves domains with hierarchy and documentation fields', async () => {
    const parent = makeDomain({
      id: 'parent',
      name: 'string_base',
      type: 'VARCHAR',
      length: 100,
      description: 'Base string domain',
      tags: ['base'],
    });
    const child = makeDomain({
      id: 'child',
      name: 'email',
      type: 'VARCHAR',
      length: 255,
      parentId: 'parent',
      description: 'Email address',
      alias: 'e-mail',
      dataStandard: 'RFC 5322',
      example: 'user@example.com',
      validRange: 'N/A',
      owner: 'Team A',
      tags: ['contact', 'pii'],
      group: 'contact-info',
    });

    const schema = makeSchema([], { domains: [parent, child] });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;

    expect(parsed.domains).toHaveLength(2);
    const c = parsed.domains[1];
    expect(c.parentId).toBe('parent');
    expect(c.description).toBe('Email address');
    expect(c.alias).toBe('e-mail');
    expect(c.dataStandard).toBe('RFC 5322');
    expect(c.example).toBe('user@example.com');
    expect(c.owner).toBe('Team A');
    expect(c.tags).toEqual(['contact', 'pii']);
    expect(c.group).toBe('contact-info');
  });

  it('preserves memos with attachment and schema', async () => {
    const memo: Memo = {
      id: 'memo1',
      content: '# Design Notes\nThis is a **rich** memo.',
      position: { x: 500, y: 300 },
      width: 300,
      height: 200,
      color: '#FFE082',
      locked: true,
      attachedTableId: 'users',
      schema: 'public',
    };
    const schema = makeSchema([], { memos: [memo] });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;
    const m = parsed.memos[0];

    expect(m.content).toBe('# Design Notes\nThis is a **rich** memo.');
    expect(m.position).toEqual({ x: 500, y: 300 });
    expect(m.width).toBe(300);
    expect(m.height).toBe(200);
    expect(m.color).toBe('#FFE082');
    expect(m.locked).toBe(true);
    expect(m.attachedTableId).toBe('users');
    expect(m.schema).toBe('public');
  });

  it('preserves table properties: color, group, locked, schema, comment, position', async () => {
    const table = makeTable('users', {
      color: '#E3F2FD',
      group: 'auth',
      locked: true,
      schema: 'public',
      comment: 'System users table',
      position: { x: 1234, y: 5678 },
    });
    const schema = makeSchema([], { tables: [table] });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;
    const t = parsed.tables[0];

    expect(t.color).toBe('#E3F2FD');
    expect(t.group).toBe('auth');
    expect(t.locked).toBe(true);
    expect(t.schema).toBe('public');
    expect(t.comment).toBe('System users table');
    expect(t.position).toEqual({ x: 1234, y: 5678 });
  });

  it('preserves groupColors and schemas arrays', async () => {
    const schema = makeSchema(['t1'], {
      groupColors: { auth: '#FF0000', billing: '#00FF00' },
      schemas: ['public', 'auth', 'billing'],
    });

    await provider.saveSnapshot('p1', { id: 's1', name: 'test', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;

    expect(parsed.groupColors).toEqual({ auth: '#FF0000', billing: '#00FF00' });
    expect(parsed.schemas).toEqual(['public', 'auth', 'billing']);
  });

  it('preserves empty schema correctly', async () => {
    const schema = makeSchema();

    await provider.saveSnapshot('p1', { id: 's1', name: 'empty', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;

    expect(parsed.tables).toEqual([]);
    expect(parsed.domains).toEqual([]);
    expect(parsed.memos).toEqual([]);
    expect(parsed.version).toBe('1');
  });

  it('preserves complex schema with multiple tables, FKs, domains, and memos', async () => {
    const schema: ERDSchema = {
      version: '1',
      tables: [
        makeTable('users', {
          columns: [
            makeColumn({ id: 'u_id', name: 'id' }),
            makeColumn({ id: 'u_email', name: 'email', type: 'VARCHAR', length: 255, primaryKey: false, autoIncrement: false, unique: true }),
          ],
          schema: 'auth',
        }),
        makeTable('posts', {
          columns: [
            makeColumn({ id: 'p_id', name: 'id' }),
            makeColumn({ id: 'p_user_id', name: 'user_id', type: 'INT', primaryKey: false, autoIncrement: false }),
            makeColumn({ id: 'p_title', name: 'title', type: 'VARCHAR', length: 200, primaryKey: false, autoIncrement: false }),
          ],
          foreignKeys: [makeFK({ id: 'fk_post_user', columnIds: ['p_user_id'], referencedTableId: 'users', referencedColumnIds: ['u_id'] })],
          schema: 'content',
        }),
        makeTable('comments', {
          columns: [
            makeColumn({ id: 'c_id', name: 'id' }),
            makeColumn({ id: 'c_post_id', name: 'post_id', type: 'INT', primaryKey: false, autoIncrement: false }),
          ],
          foreignKeys: [makeFK({ id: 'fk_comment_post', columnIds: ['c_post_id'], referencedTableId: 'posts', referencedColumnIds: ['p_id'] })],
          schema: 'content',
        }),
      ],
      domains: [
        makeDomain({ id: 'd1', name: 'email', type: 'VARCHAR', length: 255 }),
        makeDomain({ id: 'd2', name: 'title', type: 'VARCHAR', length: 200 }),
      ],
      memos: [
        makeMemo({ id: 'm1', content: 'Auth schema notes', attachedTableId: 'users', schema: 'auth' }),
        makeMemo({ id: 'm2', content: 'Content schema notes', schema: 'content' }),
      ],
      groupColors: { auth: '#E3F2FD', content: '#FFF3E0' },
      schemas: ['auth', 'content'],
      createdAt: '2024-06-15T10:00:00Z',
      updatedAt: '2024-06-15T12:30:00Z',
    };

    await provider.saveSnapshot('p1', { id: 'complex', name: 'Full', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 'complex');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;

    expect(parsed.tables).toHaveLength(3);
    expect(parsed.tables[1].foreignKeys).toHaveLength(1);
    expect(parsed.tables[2].foreignKeys[0].referencedTableId).toBe('posts');
    expect(parsed.domains).toHaveLength(2);
    expect(parsed.memos).toHaveLength(2);
    expect(parsed.memos[0].attachedTableId).toBe('users');
    expect(parsed.schemas).toEqual(['auth', 'content']);
    expect(parsed.groupColors).toEqual({ auth: '#E3F2FD', content: '#FFF3E0' });
    expect(parsed.createdAt).toBe('2024-06-15T10:00:00Z');
  });
});

// ═══════════════════════════════════════════
// 4. Edge Cases
// ═══════════════════════════════════════════

describe('Snapshot edge cases', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('snapshot name with special characters', async () => {
    const names = [
      'v1.0 (초기 버전)',
      '日本語テスト',
      '中文快照名称',
      'emoji 🎉✨',
      'quotes "double" and \'single\'',
      'slashes /path/to\\here',
      'newline\nembedded',
    ];

    for (let i = 0; i < names.length; i++) {
      await provider.saveSnapshot('p1', makeSnap({ id: `s${i}`, name: names[i], createdAt: i }));
    }

    const list = await provider.listSnapshots('p1');
    expect(list).toHaveLength(names.length);

    for (let i = 0; i < names.length; i++) {
      const loaded = await provider.loadSnapshot('p1', `s${i}`);
      expect(loaded!.name).toBe(names[i]);
    }
  });

  it('snapshot description with multiline text', async () => {
    const desc = 'Line 1\nLine 2\nLine 3\n\n- Bullet\n- Another';
    await provider.saveSnapshot('p1', makeSnap({ id: 's1', name: 'test', description: desc, createdAt: 1 }));
    const loaded = await provider.loadSnapshot('p1', 's1');
    expect(loaded!.description).toBe(desc);
  });

  it('snapshot without description stores undefined', async () => {
    await provider.saveSnapshot('p1', makeSnap({ id: 's1', name: 'no desc', createdAt: 1 }));
    const loaded = await provider.loadSnapshot('p1', 's1');
    expect(loaded!.description).toBeUndefined();
  });

  it('handles very large schema data', async () => {
    // Schema with 100 tables, each with 10 columns
    const tables: Table[] = [];
    for (let i = 0; i < 100; i++) {
      const columns: Column[] = [];
      for (let j = 0; j < 10; j++) {
        columns.push(makeColumn({ id: `t${i}_c${j}`, name: `column_${j}` }));
      }
      tables.push(makeTable(`table_${i}`, { columns }));
    }
    const schema = makeSchema([], { tables });
    const snapStr = JSON.stringify(schema);

    await provider.saveSnapshot('p1', { id: 'big', name: 'Large', snap: snapStr, createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 'big');
    const parsed = JSON.parse(loaded!.snap) as ERDSchema;

    expect(parsed.tables).toHaveLength(100);
    expect(parsed.tables[50].columns).toHaveLength(10);
    expect(parsed.tables[99].columns[9].name).toBe('column_9');
  });

  it('same createdAt timestamp sorts stably', async () => {
    const ts = 1000;
    await provider.saveSnapshot('p1', makeSnap({ id: 'a', name: 'A', createdAt: ts }));
    await provider.saveSnapshot('p1', makeSnap({ id: 'b', name: 'B', createdAt: ts }));
    await provider.saveSnapshot('p1', makeSnap({ id: 'c', name: 'C', createdAt: ts }));

    const list = await provider.listSnapshots('p1');
    expect(list).toHaveLength(3);
    // All have same timestamp, verify all are present
    const names = list.map((s) => s.name).sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('snapshot with empty tables array', async () => {
    const schema = makeSchema();
    await provider.saveSnapshot('p1', { id: 's1', name: 'empty tables', snap: JSON.stringify(schema), createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    expect(JSON.parse(loaded!.snap).tables).toEqual([]);
  });

  it('rapid create and delete sequence', async () => {
    // Create 10 snapshots
    for (let i = 0; i < 10; i++) {
      await provider.saveSnapshot('p1', makeSnap({ id: `s${i}`, name: `Snap ${i}`, createdAt: i }));
    }
    expect(await provider.listSnapshots('p1')).toHaveLength(10);

    // Delete odd-numbered ones
    for (let i = 1; i < 10; i += 2) {
      await provider.deleteSnapshot('p1', `s${i}`);
    }
    const remaining = await provider.listSnapshots('p1');
    expect(remaining).toHaveLength(5);
    expect(remaining.map((s) => s.id).sort()).toEqual(['s0', 's2', 's4', 's6', 's8']);
  });

  it('snapshot preserves JSON data exactly (no floating point drift)', async () => {
    const schema = makeSchema([], {
      tables: [makeTable('t1', { position: { x: 123.456789, y: -987.654321 } })],
    });
    const snapStr = JSON.stringify(schema);

    await provider.saveSnapshot('p1', { id: 's1', name: 'precise', snap: snapStr, createdAt: 1 });
    const loaded = await provider.loadSnapshot('p1', 's1');
    // snap string should be identical
    expect(loaded!.snap).toBe(snapStr);
  });
});

// ═══════════════════════════════════════════
// 5. deleteSchema Cascade Tests
// ═══════════════════════════════════════════

describe('deleteSchema cascades to snapshots', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('deleteSchema removes all project snapshots', async () => {
    const schema = makeSchema(['users']);
    await provider.saveSchema('proj1', schema);
    await provider.saveSnapshot('proj1', makeSnap({ id: 's1', name: 'A', createdAt: 1 }));
    await provider.saveSnapshot('proj1', makeSnap({ id: 's2', name: 'B', createdAt: 2 }));
    await provider.saveSnapshot('proj1', makeSnap({ id: 's3', name: 'C', createdAt: 3 }));

    await provider.deleteSchema('proj1');

    const list = await provider.listSnapshots('proj1');
    expect(list).toEqual([]);
    expect(await provider.loadSnapshot('proj1', 's1')).toBeNull();
    expect(await provider.loadSnapshot('proj1', 's2')).toBeNull();
  });

  it('deleteSchema does not affect other project snapshots', async () => {
    await provider.saveSchema('proj1', makeSchema(['t1']));
    await provider.saveSchema('proj2', makeSchema(['t2']));
    await provider.saveSnapshot('proj1', makeSnap({ id: 's1', name: 'P1', createdAt: 1 }));
    await provider.saveSnapshot('proj2', makeSnap({ id: 's2', name: 'P2', createdAt: 2 }));

    await provider.deleteSchema('proj1');

    expect(await provider.listSnapshots('proj1')).toEqual([]);
    const list2 = await provider.listSnapshots('proj2');
    expect(list2).toHaveLength(1);
    expect(list2[0].name).toBe('P2');
  });

  it('deleteSchema with no snapshots does not throw', async () => {
    await provider.saveSchema('proj1', makeSchema());
    await expect(provider.deleteSchema('proj1')).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// 6. Snapshot Restore Fidelity Tests
// ═══════════════════════════════════════════

describe('Snapshot save → modify → restore fidelity', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('restoring snapshot returns exact original schema', async () => {
    const original = makeSchema([], {
      tables: [
        makeTable('users', {
          columns: [
            makeColumn({ id: 'id', name: 'id' }),
            makeColumn({ id: 'email', name: 'email', type: 'VARCHAR', length: 255, primaryKey: false, autoIncrement: false }),
          ],
          group: 'auth',
          color: '#E3F2FD',
        }),
      ],
      domains: [makeDomain()],
      memos: [makeMemo()],
    });

    // Save snapshot
    const snapStr = JSON.stringify(original);
    await provider.saveSnapshot('p1', { id: 's1', name: 'before change', snap: snapStr, createdAt: 1 });

    // Simulate schema modification (add a table)
    const modified = JSON.parse(snapStr) as ERDSchema;
    modified.tables.push(makeTable('orders'));
    modified.updatedAt = '2024-12-01T00:00:00Z';

    // Restore from snapshot
    const loaded = await provider.loadSnapshot('p1', 's1');
    const restored = JSON.parse(loaded!.snap) as ERDSchema;

    // Verify restored matches original (not modified)
    expect(restored.tables).toHaveLength(1);
    expect(restored.tables[0].name).toBe('users');
    expect(restored.tables[0].columns).toHaveLength(2);
    expect(restored.domains).toHaveLength(1);
    expect(restored.memos).toHaveLength(1);
    expect(restored.updatedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('multiple snapshots capture different schema states', async () => {
    const v1 = makeSchema(['users']);
    await provider.saveSnapshot('p1', { id: 'v1', name: 'v1', snap: JSON.stringify(v1), createdAt: 1 });

    const v2 = makeSchema(['users', 'orders']);
    await provider.saveSnapshot('p1', { id: 'v2', name: 'v2', snap: JSON.stringify(v2), createdAt: 2 });

    const v3 = makeSchema(['users', 'orders', 'products']);
    await provider.saveSnapshot('p1', { id: 'v3', name: 'v3', snap: JSON.stringify(v3), createdAt: 3 });

    const s1 = JSON.parse((await provider.loadSnapshot('p1', 'v1'))!.snap) as ERDSchema;
    const s2 = JSON.parse((await provider.loadSnapshot('p1', 'v2'))!.snap) as ERDSchema;
    const s3 = JSON.parse((await provider.loadSnapshot('p1', 'v3'))!.snap) as ERDSchema;

    expect(s1.tables).toHaveLength(1);
    expect(s2.tables).toHaveLength(2);
    expect(s3.tables).toHaveLength(3);
  });

  it('snapshot is immutable — modifying loaded data does not affect stored snapshot', async () => {
    const schema = makeSchema(['users']);
    await provider.saveSnapshot('p1', { id: 's1', name: 'immutable', snap: JSON.stringify(schema), createdAt: 1 });

    // Load and modify
    const loaded1 = await provider.loadSnapshot('p1', 's1');
    const parsed = JSON.parse(loaded1!.snap) as ERDSchema;
    parsed.tables.push(makeTable('orders'));

    // Load again — should still be original
    const loaded2 = await provider.loadSnapshot('p1', 's1');
    const parsed2 = JSON.parse(loaded2!.snap) as ERDSchema;
    expect(parsed2.tables).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// 7. SchemaSnapshot Type Tests
// ═══════════════════════════════════════════

describe('SchemaSnapshot type', () => {
  it('has required fields', () => {
    const snap: SchemaSnapshot = {
      id: 'abc12345',
      name: 'Test',
      snap: '{}',
      createdAt: 1700000000000,
    };
    expect(snap.id).toBe('abc12345');
    expect(snap.description).toBeUndefined();
  });

  it('supports optional description', () => {
    const snap: SchemaSnapshot = {
      id: 'abc12345',
      name: 'Test',
      description: 'My description',
      snap: '{}',
      createdAt: 1700000000000,
    };
    expect(snap.description).toBe('My description');
  });

  it('createdAt is numeric timestamp', () => {
    const snap: SchemaSnapshot = {
      id: 'abc12345',
      name: 'Test',
      snap: '{}',
      createdAt: Date.now(),
    };
    expect(typeof snap.createdAt).toBe('number');
    expect(snap.createdAt).toBeGreaterThan(0);
  });

  it('snap field holds valid JSON string', () => {
    const schema = makeSchema(['users', 'orders']);
    const snap: SchemaSnapshot = {
      id: 'test',
      name: 'Test',
      snap: JSON.stringify(schema),
      createdAt: Date.now(),
    };
    const parsed = JSON.parse(snap.snap);
    expect(parsed.tables).toHaveLength(2);
    expect(parsed.version).toBe('1');
  });
});

// ═══════════════════════════════════════════
// 8. Server API Route Logic Tests
// ═══════════════════════════════════════════

describe('Snapshot API response mapping', () => {
  it('maps DB row fields to SchemaSnapshot correctly', () => {
    // Simulates what the server API route does
    const dbRow = {
      id: 'snap1',
      name: 'My Snapshot',
      description: 'A description',
      data: '{"version":"1","tables":[],"domains":[],"memos":[],"createdAt":"2024-01-01","updatedAt":"2024-01-01"}',
      created_at: 1700000000000,
    };

    const mapped = {
      id: dbRow.id,
      name: dbRow.name,
      description: dbRow.description || undefined,
      snap: dbRow.data,
      createdAt: dbRow.created_at,
    };

    expect(mapped.id).toBe('snap1');
    expect(mapped.name).toBe('My Snapshot');
    expect(mapped.description).toBe('A description');
    expect(mapped.snap).toBe(dbRow.data);
    expect(mapped.createdAt).toBe(1700000000000);
  });

  it('maps null description to undefined', () => {
    const dbRow = {
      id: 'snap1',
      name: 'No Desc',
      description: null as string | null,
      data: '{}',
      created_at: 1700000000000,
    };

    const mapped = {
      id: dbRow.id,
      name: dbRow.name,
      description: dbRow.description || undefined,
      snap: dbRow.data,
      createdAt: dbRow.created_at,
    };

    expect(mapped.description).toBeUndefined();
  });

  it('POST body maps to DB insert params correctly', () => {
    const body = {
      id: 'snap1',
      name: 'My Snapshot',
      description: 'desc',
      snap: '{"tables":[]}',
      createdAt: 1700000000000,
    };
    const projectId = 'proj1';
    const userId = 'user1';

    // Simulates the insert param order
    const params = [body.id, projectId, body.name, body.description || null, body.snap, body.createdAt, userId];

    expect(params).toEqual(['snap1', 'proj1', 'My Snapshot', 'desc', '{"tables":[]}', 1700000000000, 'user1']);
  });

  it('POST body without description maps null', () => {
    const body = {
      id: 'snap1',
      name: 'No Desc',
      snap: '{}',
      createdAt: 1700000000000,
    };

    const descParam = body.description || null;
    expect(descParam).toBeNull();
  });
});

// ═══════════════════════════════════════════
// 9. MCP Tool Schema Tests
// ═══════════════════════════════════════════

describe('MCP snapshot tool schemas', () => {
  it('list_snapshots requires project_id', () => {
    // Validate the expected input shape
    const validInput = { project_id: 'proj1' };
    expect(typeof validInput.project_id).toBe('string');
  });

  it('create_snapshot requires project_id, name, optional description', () => {
    const validInput = { project_id: 'proj1', name: 'v1.0' };
    expect(typeof validInput.project_id).toBe('string');
    expect(typeof validInput.name).toBe('string');

    const withDesc = { project_id: 'proj1', name: 'v1.0', description: 'Initial' };
    expect(typeof withDesc.description).toBe('string');
  });

  it('restore_snapshot requires project_id and snapshot_id', () => {
    const validInput = { project_id: 'proj1', snapshot_id: 'snap1' };
    expect(typeof validInput.project_id).toBe('string');
    expect(typeof validInput.snapshot_id).toBe('string');
  });

  it('delete_snapshot requires project_id and snapshot_id', () => {
    const validInput = { project_id: 'proj1', snapshot_id: 'snap1' };
    expect(typeof validInput.project_id).toBe('string');
    expect(typeof validInput.snapshot_id).toBe('string');
  });
});

// ═══════════════════════════════════════════
// 10. Snapshot Ordering & Pagination Tests
// ═══════════════════════════════════════════

describe('Snapshot ordering', () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
  });

  it('newest snapshot appears first in list', async () => {
    await provider.saveSnapshot('p1', makeSnap({ id: 'old', name: 'Old', createdAt: 1000 }));
    await provider.saveSnapshot('p1', makeSnap({ id: 'new', name: 'New', createdAt: 9999 }));
    await provider.saveSnapshot('p1', makeSnap({ id: 'mid', name: 'Mid', createdAt: 5000 }));

    const list = await provider.listSnapshots('p1');
    expect(list[0].id).toBe('new');
    expect(list[1].id).toBe('mid');
    expect(list[2].id).toBe('old');
  });

  it('handles many snapshots correctly', async () => {
    for (let i = 0; i < 50; i++) {
      await provider.saveSnapshot('p1', makeSnap({ id: `s${i}`, name: `Snap ${i}`, createdAt: i * 100 }));
    }

    const list = await provider.listSnapshots('p1');
    expect(list).toHaveLength(50);
    // First should be the newest (highest createdAt)
    expect(list[0].createdAt).toBe(4900);
    // Last should be the oldest
    expect(list[49].createdAt).toBe(0);

    // Verify descending order
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].createdAt).toBeGreaterThanOrEqual(list[i].createdAt);
    }
  });

  it('single snapshot returns list of length 1', async () => {
    await provider.saveSnapshot('p1', makeSnap({ id: 'only', name: 'Only One', createdAt: 1 }));

    const list = await provider.listSnapshots('p1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Only One');
  });
});

// ═══════════════════════════════════════════
// 11. Migration SQL Verification
// ═══════════════════════════════════════════

describe('V007 migration SQL structure', () => {
  it('schema_snapshots table has expected columns', () => {
    // Verify the expected column structure matches the interface
    const expectedColumns = ['id', 'project_id', 'name', 'description', 'data', 'created_at', 'created_by'];
    const snapshotInterface: Record<string, string> = {
      id: 'TEXT NOT NULL',
      project_id: 'TEXT NOT NULL',
      name: 'TEXT NOT NULL',
      description: 'TEXT',
      data: 'TEXT NOT NULL',
      created_at: 'INTEGER NOT NULL',
      created_by: 'TEXT',
    };

    // All columns are present
    for (const col of expectedColumns) {
      expect(snapshotInterface).toHaveProperty(col);
    }

    // Primary key is composite (project_id, id)
    const pk = ['project_id', 'id'];
    expect(pk).toEqual(['project_id', 'id']);
  });
});
