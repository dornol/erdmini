import { describe, it, expect } from 'vitest';
import { exportDBML } from './dbml-export';
import type { ERDSchema, Table, Column } from '$lib/types/erd';

function makeSchema(tables: Table[]): ERDSchema {
  return {
    version: '1',
    tables,
    domains: [],
    memos: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

function makeColumn(overrides: Partial<Column> & { id: string; name: string }): Column {
  return {
    type: 'VARCHAR',
    nullable: true,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> & { id: string; name: string; columns: Column[] }): Table {
  return {
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe('exportDBML', () => {
  describe('basic table output', () => {
    it('should output a simple table', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR', length: 255 }),
          ],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('Table users {');
      expect(out).toContain('  id int [pk]');
      expect(out).toContain('  name varchar(255)');
      expect(out).toContain('}');
    });

    it('should output table with schema prefix', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          schema: 'public',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('Table public.users {');
    });
  });

  describe('type mapping', () => {
    const types: [Column['type'], string, Partial<Column>?][] = [
      ['INT', 'int'],
      ['BIGINT', 'bigint'],
      ['SMALLINT', 'smallint'],
      ['VARCHAR', 'varchar'],
      ['CHAR', 'char'],
      ['TEXT', 'text'],
      ['BOOLEAN', 'boolean'],
      ['DATE', 'date'],
      ['DATETIME', 'datetime'],
      ['TIMESTAMP', 'timestamp'],
      ['DECIMAL', 'decimal'],
      ['FLOAT', 'float'],
      ['DOUBLE', 'double'],
      ['JSON', 'json'],
      ['UUID', 'uuid'],
    ];

    for (const [erdType, dbmlType, extra] of types) {
      it(`should map ${erdType} to ${dbmlType}`, () => {
        const schema = makeSchema([
          makeTable({
            id: 't1',
            name: 'test',
            columns: [makeColumn({ id: 'c1', name: 'col', type: erdType, primaryKey: true, nullable: false, ...extra })],
          }),
        ]);
        const out = exportDBML(schema);
        expect(out).toContain(`col ${dbmlType}`);
      });
    }

    it('should include length for varchar', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [makeColumn({ id: 'c1', name: 'col', type: 'VARCHAR', length: 100, primaryKey: true, nullable: false })],
        }),
      ]);
      expect(exportDBML(schema)).toContain('col varchar(100)');
    });

    it('should include precision and scale for decimal', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [makeColumn({ id: 'c1', name: 'price', type: 'DECIMAL', length: 10, scale: 2, primaryKey: true, nullable: false })],
        }),
      ]);
      expect(exportDBML(schema)).toContain('price decimal(10,2)');
    });
  });

  describe('column settings', () => {
    it('should output pk', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        }),
      ]);
      expect(exportDBML(schema)).toContain('[pk]');
    });

    it('should output not null', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR', nullable: false }),
          ],
        }),
      ]);
      expect(exportDBML(schema)).toContain('name varchar [not null]');
    });

    it('should output unique', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR', unique: true }),
          ],
        }),
      ]);
      expect(exportDBML(schema)).toContain('[unique]');
    });

    it('should output increment', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false, autoIncrement: true })],
        }),
      ]);
      expect(exportDBML(schema)).toContain('increment');
    });

    it('should output default value', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'count', type: 'INT', defaultValue: '0' }),
          ],
        }),
      ]);
      expect(exportDBML(schema)).toContain('default: 0');
    });

    it('should quote string default', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'status', type: 'VARCHAR', defaultValue: 'active' }),
          ],
        }),
      ]);
      expect(exportDBML(schema)).toContain("default: 'active'");
    });

    it('should output note', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'test',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR', comment: 'User name' }),
          ],
        }),
      ]);
      expect(exportDBML(schema)).toContain("note: 'User name'");
    });
  });

  describe('FK → Ref', () => {
    it('should output Ref statement', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        }),
        makeTable({
          id: 't2',
          name: 'posts',
          columns: [
            makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c3', name: 'user_id', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1',
            columnIds: ['c3'],
            referencedTableId: 't1',
            referencedColumnIds: ['c1'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION',
          }],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('Ref: posts.user_id > users.id');
    });

    it('should include onDelete/onUpdate when not NO ACTION', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        }),
        makeTable({
          id: 't2',
          name: 'posts',
          columns: [
            makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c3', name: 'user_id', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1',
            columnIds: ['c3'],
            referencedTableId: 't1',
            referencedColumnIds: ['c1'],
            onDelete: 'CASCADE',
            onUpdate: 'SET NULL',
          }],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('[delete: cascade, update: set null]');
    });

    it('should not output Ref when includeForeignKeys is false', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        }),
        makeTable({
          id: 't2',
          name: 'posts',
          columns: [
            makeColumn({ id: 'c2', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c3', name: 'user_id', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1',
            columnIds: ['c3'],
            referencedTableId: 't1',
            referencedColumnIds: ['c1'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
          }],
        }),
      ]);
      const out = exportDBML(schema, { includeForeignKeys: false });
      expect(out).not.toContain('Ref:');
    });
  });

  describe('ENUM → Enum block', () => {
    it('should output Enum block for ENUM columns', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'status', type: 'ENUM', enumValues: ['active', 'inactive'] }),
          ],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('Enum status_enum {');
      expect(out).toContain('  active');
      expect(out).toContain('  inactive');
      expect(out).toContain('status status_enum');
    });
  });

  describe('indexes output', () => {
    it('should output unique keys in Indexes block', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR' }),
          ],
          uniqueKeys: [{ id: 'uk1', columnIds: ['c2'] }],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('Indexes {');
      expect(out).toContain('email [unique]');
    });

    it('should output composite index with name', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR' }),
            makeColumn({ id: 'c3', name: 'tenant_id', type: 'INT' }),
          ],
          uniqueKeys: [{ id: 'uk1', columnIds: ['c2', 'c3'], name: 'idx_email_tenant' }],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain("(email, tenant_id) [unique, name: 'idx_email_tenant']");
    });

    it('should not output indexes when includeIndexes is false', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'email', type: 'VARCHAR' }),
          ],
          uniqueKeys: [{ id: 'uk1', columnIds: ['c2'] }],
        }),
      ]);
      const out = exportDBML(schema, { includeIndexes: false });
      expect(out).not.toContain('Indexes');
    });
  });

  describe('comments option', () => {
    it('should output table comment when includeComments is true', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          comment: 'User accounts',
          columns: [makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('// User accounts');
    });

    it('should not output comments when includeComments is false', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'users',
          comment: 'User accounts',
          columns: [
            makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'name', type: 'VARCHAR', comment: 'Full name' }),
          ],
        }),
      ]);
      const out = exportDBML(schema, { includeComments: false });
      expect(out).not.toContain('User accounts');
      expect(out).not.toContain('note:');
    });
  });

  describe('composite FK', () => {
    it('should output composite FK as grouped columns', () => {
      const schema = makeSchema([
        makeTable({
          id: 't1',
          name: 'parent',
          columns: [
            makeColumn({ id: 'c1', name: 'a', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c2', name: 'b', type: 'INT', primaryKey: true, nullable: false }),
          ],
        }),
        makeTable({
          id: 't2',
          name: 'child',
          columns: [
            makeColumn({ id: 'c3', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
            makeColumn({ id: 'c4', name: 'a', type: 'INT' }),
            makeColumn({ id: 'c5', name: 'b', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1',
            columnIds: ['c4', 'c5'],
            referencedTableId: 't1',
            referencedColumnIds: ['c1', 'c2'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION',
          }],
        }),
      ]);
      const out = exportDBML(schema);
      expect(out).toContain('Ref: child.(a, b) > parent.(a, b)');
    });
  });
});
