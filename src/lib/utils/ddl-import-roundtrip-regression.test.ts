import { describe, expect, it } from 'vitest';
import { importDDL } from './ddl-import';

describe('exported ALTER TABLE foreign keys', () => {
  for (const dialect of ['mariadb', 'mssql'] as const) {
    it(`${dialect} resolves a named composite FK and retains both referential actions`, async () => {
      const quote = (id: string) => dialect === 'mariadb' ? `\`${id}\`` : `[${id}]`;
      const sql = `
        CREATE TABLE ${quote('parent')} (${quote('id')} INT NOT NULL, ${quote('tenant')} INT NOT NULL, PRIMARY KEY (${quote('id')}, ${quote('tenant')}));
        CREATE TABLE ${quote('child')} (${quote('parent_id')} INT, ${quote('tenant')} INT);
        ALTER TABLE ${quote('child')} ADD CONSTRAINT ${quote('fk_owner')}
          FOREIGN KEY (${quote('parent_id')}, ${quote('tenant')})
          REFERENCES ${quote('parent')} (${quote('id')}, ${quote('tenant')})
          ON DELETE CASCADE ON UPDATE SET NULL;
      `;
      const result = await importDDL(sql, dialect);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const child = result.tables.find(t => t.name === 'child')!;
      const parent = result.tables.find(t => t.name === 'parent')!;
      expect(child.foreignKeys).toHaveLength(1);
      expect(child.foreignKeys[0]).toMatchObject({
        columnIds: child.columns.map(c => c.id),
        referencedTableId: parent.id,
        referencedColumnIds: parent.columns.map(c => c.id),
        onDelete: 'CASCADE', onUpdate: 'SET NULL',
      });
    });
  }
});


describe('quoted composite index import', () => {
  for (const dialect of ['mysql', 'postgresql', 'mssql', 'sqlite', 'oracle', 'h2', 'mariadb'] as const) {
    it(`${dialect} retains quoted unique and non-unique indexes with column order`, async () => {
      const quote = (name: string) => dialect === 'mysql' || dialect === 'mariadb'
        ? `\x60${name}\x60`
        : dialect === 'mssql' ? `[${name}]` : `"${name}"`;
      const sql = `CREATE TABLE ${quote('records')} (${quote('tenant')} INT NOT NULL, ${quote('id')} INT NOT NULL);
        CREATE UNIQUE INDEX ${quote('unique lookup')} ON ${quote('records')} (${quote('id')}, ${quote('tenant')});
        CREATE INDEX ${quote('normal lookup')} ON ${quote('records')} (${quote('tenant')}, ${quote('id')});`;
      const result = await importDDL(sql, dialect);
      expect(result.errors).toEqual([]);
      const table = result.tables[0];
      expect(table.indexes.map(index => ({ name: index.name, unique: index.unique, columns: index.columnIds.map(id => table.columns.find(column => column.id === id)?.name) }))).toEqual([
        { name: 'unique lookup', unique: true, columns: ['id', 'tenant'] },
        { name: 'normal lookup', unique: false, columns: ['tenant', 'id'] },
      ]);
    });
  }
});

describe('quoted table and column boundaries', () => {
  it('MSSQL preserves spaces, Unicode and reserved names when resolving an ALTER FK', async () => {
    const result = await importDDL(`
      CREATE TABLE [order detail] ([select] INT NOT NULL, [회원 명] NVARCHAR(63) DEFAULT ('O''Brien'), PRIMARY KEY ([select]));
      CREATE TABLE [related records] ([order ref] INT);
      ALTER TABLE [related records] ADD CONSTRAINT [link with spaces] FOREIGN KEY ([order ref]) REFERENCES [order detail] ([select]) ON DELETE CASCADE;
    `, 'mssql');
    expect(result.errors).toEqual([]);
    expect(result.tables.map(t => t.name)).toEqual(['order detail', 'related records']);
    const [parent, child] = result.tables;
    expect(parent.columns.map(c => c.name)).toEqual(['select', '회원 명']);
    expect(parent.columns[1]).toMatchObject({ type: 'NVARCHAR', length: 63, defaultValue: "'O''Brien'" });
    expect(child.columns.map(c => c.name)).toEqual(['order ref']);
    expect(child.foreignKeys).toEqual([expect.objectContaining({ columnIds: [child.columns[0].id], referencedTableId: parent.id, referencedColumnIds: [parent.columns[0].id], onDelete: 'CASCADE' })]);
  });

  it('SQLite normalizes an unknown type without rewriting spaces inside quoted FK identifiers', async () => {
    const result = await importDDL(`
      CREATE TABLE "order detail" ("select" INTEGER NOT NULL, PRIMARY KEY ("select"));
      CREATE TABLE "related records" ("order ref" INTEGER, "odd type" MAGICTYPE);
      ALTER TABLE "related records" ADD CONSTRAINT "link with spaces" FOREIGN KEY ("order ref") REFERENCES "order detail" ("select");
    `, 'sqlite');
    expect(result.errors).toEqual([]);
    const [parent, child] = result.tables;
    expect(child.columns.map(c => ({ name: c.name, type: c.type }))).toEqual([{ name: 'order ref', type: 'INT' }, { name: 'odd type', type: 'TEXT' }]);
    expect(child.foreignKeys).toEqual([expect.objectContaining({ columnIds: [child.columns[0].id], referencedTableId: parent.id, referencedColumnIds: [parent.columns[0].id] })]);
  });
});
