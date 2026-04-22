import { describe, it, expect } from 'vitest';
import { exportDrizzle } from './drizzle-export';
import type { Column, ERDSchema, Table } from '$lib/types/erd';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeCol(overrides: Partial<Column> & { type: Column['type'] }): Column {
  const { type, ...rest } = overrides;
  return {
    id: 'c1',
    name: 'col',
    type,
    nullable: true,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...rest,
  };
}

function makeTable(overrides: Partial<Table> & { name: string; columns: Column[] }): Table {
  const { name, columns, ...rest } = overrides;
  return {
    id: 't_' + name,
    name,
    columns,
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...rest,
  };
}

function makeSchema(tables: Table[]): ERDSchema {
  return {
    version: '1.0',
    tables,
    domains: [],
    memos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function simpleSchema(): ERDSchema {
  return makeSchema([
    makeTable({
      name: 'users',
      columns: [
        makeCol({ id: 'u1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeCol({ id: 'u2', name: 'name', type: 'VARCHAR', length: 100, nullable: false }),
        makeCol({ id: 'u3', name: 'email', type: 'VARCHAR', length: 255, unique: true, nullable: false }),
      ],
    }),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Imports
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — imports', () => {
  it('PostgreSQL imports from drizzle-orm/pg-core', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'postgresql' });
    expect(ts).toContain(`from 'drizzle-orm/pg-core'`);
    expect(ts).toContain('pgTable');
  });

  it('MySQL imports from drizzle-orm/mysql-core', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'mysql' });
    expect(ts).toContain(`from 'drizzle-orm/mysql-core'`);
    expect(ts).toContain('mysqlTable');
  });

  it('SQLite imports from drizzle-orm/sqlite-core', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'sqlite' });
    expect(ts).toContain(`from 'drizzle-orm/sqlite-core'`);
    expect(ts).toContain('sqliteTable');
  });

  it('imports only the helpers actually used', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('integer');
    expect(ts).not.toContain('varchar'); // not used
    expect(ts).not.toContain('text');    // not used
  });

  it('imports index helper only when indexes exist', () => {
    const withIdx = makeSchema([
      makeTable({
        name: 't',
        columns: [makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
        indexes: [{ id: 'i1', name: 'idx_id', columnIds: ['c1'], unique: false }],
      }),
    ]);
    const withoutIdx = simpleSchema();
    expect(exportDrizzle(withIdx, { dialect: 'postgresql' })).toContain('index');
    expect(exportDrizzle(withoutIdx, { dialect: 'postgresql' })).not.toContain("'index'");
  });

  it('imports relations from drizzle-orm when FKs exist', () => {
    const schema = makeSchema([
      makeTable({
        name: 'users',
        columns: [makeCol({ id: 'u1', name: 'id', type: 'INT', primaryKey: true })],
      }),
      makeTable({
        name: 'posts',
        columns: [
          makeCol({ id: 'p1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'p2', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['p2'],
          referencedTableId: 't_users',
          referencedColumnIds: ['u1'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`from 'drizzle-orm'`);
    expect(ts).toContain('relations');
  });

  it('does not import relations when no FKs', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'postgresql' });
    expect(ts).not.toContain(`import { relations }`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Table definition
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — table definition', () => {
  it('exports pgTable with table name and camelCase variable', () => {
    const schema = makeSchema([
      makeTable({
        name: 'user_accounts',
        columns: [makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`export const userAccounts = pgTable('user_accounts'`);
  });

  it('PostgreSQL VARCHAR with length', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'name', type: 'VARCHAR', length: 100 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`varchar('name', { length: 100 })`);
  });

  it('MySQL VARCHAR always has length (default 255)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'name', type: 'VARCHAR' }), // no length
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'mysql' });
    expect(ts).toContain(`varchar('name', { length: 255 })`);
  });

  it('SQLite maps all strings to text()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'a', type: 'VARCHAR' }),
          makeCol({ id: 'c3', name: 'b', type: 'CHAR' }),
          makeCol({ id: 'c4', name: 'c', type: 'TEXT' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'sqlite' });
    expect(ts).toContain(`a: text('a')`);
    expect(ts).toContain(`b: text('b')`);
    expect(ts).toContain(`c: text('c')`);
  });

  it('primaryKey() modifier applied', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'postgresql' });
    expect(ts).toMatch(/id: integer\('id'\)\.primaryKey\(\)/);
  });

  it('notNull() applied to non-nullable non-PK columns', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'postgresql' });
    expect(ts).toContain(`.notNull()`);
  });

  it('unique() applied to unique columns', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'postgresql' });
    expect(ts).toContain(`.unique()`);
  });

  it('nullable columns have no notNull()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'nullable_col', type: 'VARCHAR', nullable: true }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`nullable_col`);
    const nullableLine = ts.split('\n').find(l => l.includes('nullable_col'));
    expect(nullableLine).not.toContain('.notNull()');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Default values
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — defaults', () => {
  it('CURRENT_TIMESTAMP → .defaultNow()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'created_at', type: 'TIMESTAMP', defaultValue: 'CURRENT_TIMESTAMP' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('.defaultNow()');
  });

  it('Boolean TRUE → .default(true)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'active', type: 'BOOLEAN', defaultValue: 'TRUE' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('.default(true)');
  });

  it('Boolean FALSE → .default(false)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'active', type: 'BOOLEAN', defaultValue: 'FALSE' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('.default(false)');
  });

  it('Numeric default → .default(N)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'count', type: 'INT', defaultValue: '0' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('.default(0)');
  });

  it('String default wrapped in quotes', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'status', type: 'VARCHAR', defaultValue: "'active'" }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`.default('active')`);
  });

  it('PG: GEN_RANDOM_UUID() → .defaultRandom()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'UUID', primaryKey: true, defaultValue: 'GEN_RANDOM_UUID()' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('.defaultRandom()');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Foreign keys + relations
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — relations', () => {
  function schemaWithFk(): ERDSchema {
    return makeSchema([
      makeTable({
        name: 'users',
        columns: [
          makeCol({ id: 'u1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'u2', name: 'name', type: 'VARCHAR', length: 100, nullable: false }),
        ],
      }),
      makeTable({
        name: 'posts',
        columns: [
          makeCol({ id: 'p1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'p2', name: 'user_id', type: 'INT', nullable: false }),
          makeCol({ id: 'p3', name: 'title', type: 'VARCHAR', length: 255 }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['p2'],
          referencedTableId: 't_users',
          referencedColumnIds: ['u1'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        }],
      }),
    ]);
  }

  it('generates relations block for table with FK', () => {
    const ts = exportDrizzle(schemaWithFk(), { dialect: 'postgresql' });
    expect(ts).toContain('postsRelations');
    expect(ts).toContain('relations(posts');
    expect(ts).toContain('one(users');
  });

  it('relations uses fields/references arrays', () => {
    const ts = exportDrizzle(schemaWithFk(), { dialect: 'postgresql' });
    expect(ts).toContain('fields: [posts.user_id]');
    expect(ts).toContain('references: [users.id]');
  });

  it('does not generate relations block for parent-only tables', () => {
    const ts = exportDrizzle(schemaWithFk(), { dialect: 'postgresql' });
    // users has no outgoing FK, so no relations block
    expect(ts).not.toContain('usersRelations');
  });

  it('includeRelations: false omits relations blocks entirely', () => {
    const ts = exportDrizzle(schemaWithFk(), { dialect: 'postgresql', includeRelations: false });
    expect(ts).not.toContain('postsRelations');
    expect(ts).not.toContain(`from 'drizzle-orm'`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Unique keys, indexes, composite PKs
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — constraints', () => {
  it('composite PK generates primaryKey() in table block', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'a', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'c2', name: 'b', type: 'INT', primaryKey: true, nullable: false }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('primaryKey({ columns: [t.a, t.b] })');
    expect(ts).toContain('}, (t) => ({');
  });

  it('unique key generates unique() in table block', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'email', type: 'VARCHAR', length: 255 }),
        ],
        uniqueKeys: [{ id: 'uk1', name: 'uk_email', columnIds: ['c2'] }],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`unique('uk_email').on(t.email)`);
  });

  it('index generates index() in table block', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'name', type: 'VARCHAR', length: 100 }),
        ],
        indexes: [{ id: 'i1', name: 'idx_name', columnIds: ['c2'], unique: false }],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`index('idx_name').on(t.name)`);
  });

  it('composite unique key includes multiple columns', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'a', type: 'INT' }),
          makeCol({ id: 'c3', name: 'b', type: 'INT' }),
        ],
        uniqueKeys: [{ id: 'uk1', name: 'uk_ab', columnIds: ['c2', 'c3'] }],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`unique('uk_ab').on(t.a, t.b)`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Tier-1 types
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — tier-1 types', () => {
  it('PostgreSQL JSONB → jsonb()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'data', type: 'JSONB' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`data: jsonb('data')`);
  });

  it('PostgreSQL MONEY → numeric(19, 4)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'price', type: 'MONEY' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`numeric('price', { precision: 19, scale: 4 })`);
  });

  it('PostgreSQL DATETIMEOFFSET → timestamp with withTimezone', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'ts', type: 'DATETIMEOFFSET' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('withTimezone: true');
  });

  it('MySQL YEAR → year()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'birth', type: 'YEAR' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'mysql' });
    expect(ts).toContain(`birth: year('birth')`);
  });

  it('PostgreSQL INTERVAL → interval()', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'dur', type: 'INTERVAL' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`dur: interval('dur')`);
  });

  it('PostgreSQL NVARCHAR → varchar (fallback)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'name', type: 'NVARCHAR', length: 200 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`varchar('name', { length: 200 })`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Enum handling
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — ENUM', () => {
  it('MySQL ENUM uses mysqlEnum with values', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'status', type: 'ENUM', enumValues: ['active', 'inactive', 'pending'] }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'mysql' });
    expect(ts).toContain(`mysqlEnum('status', ['active', 'inactive', 'pending'])`);
  });

  it('PostgreSQL ENUM falls back to varchar', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'status', type: 'ENUM', enumValues: ['a', 'b'] }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('varchar');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. SQLite special cases
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — SQLite specifics', () => {
  it('SQLite BOOLEAN → integer with mode boolean', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'active', type: 'BOOLEAN' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'sqlite' });
    expect(ts).toContain(`mode: 'boolean'`);
  });

  it('SQLite TIMESTAMP → integer with mode timestamp', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'ts', type: 'TIMESTAMP' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'sqlite' });
    expect(ts).toContain(`mode: 'timestamp'`);
  });

  it('SQLite autoIncrement PK uses primaryKey({ autoIncrement: true })', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'sqlite' });
    expect(ts).toContain('primaryKey({ autoIncrement: true })');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Empty schema
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — empty schema', () => {
  it('empty schema returns a minimal file', () => {
    const ts = exportDrizzle(makeSchema([]), { dialect: 'postgresql' });
    expect(ts).toContain('Empty schema');
    expect(ts).toContain('pgTable');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. Output formatting
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — formatting', () => {
  it('output ends with a newline', () => {
    const ts = exportDrizzle(simpleSchema(), { dialect: 'postgresql' });
    expect(ts.endsWith('\n')).toBe(true);
  });

  it('each table is separated by a blank line', () => {
    const schema = makeSchema([
      makeTable({
        name: 'a',
        columns: [makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
      }),
      makeTable({
        name: 'b',
        columns: [makeCol({ id: 'c2', name: 'id', type: 'INT', primaryKey: true })],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toMatch(/export const a = pgTable[\s\S]*?\}\);\n\nexport const b = pgTable/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. autoIncrement handling per dialect
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — autoIncrement', () => {
  function schemaWithAutoInc(): ERDSchema {
    return makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false, autoIncrement: true }),
        ],
      }),
    ]);
  }

  it('PostgreSQL autoIncrement → generatedAlwaysAsIdentity()', () => {
    const ts = exportDrizzle(schemaWithAutoInc(), { dialect: 'postgresql' });
    expect(ts).toContain('.generatedAlwaysAsIdentity()');
  });

  it('MySQL autoIncrement → generatedAlwaysAsIdentity()', () => {
    const ts = exportDrizzle(schemaWithAutoInc(), { dialect: 'mysql' });
    expect(ts).toContain('.generatedAlwaysAsIdentity()');
  });

  it('SQLite autoIncrement does NOT use generatedAlwaysAsIdentity', () => {
    const ts = exportDrizzle(schemaWithAutoInc(), { dialect: 'sqlite' });
    expect(ts).not.toContain('generatedAlwaysAsIdentity');
    expect(ts).toContain('primaryKey({ autoIncrement: true })');
  });

  it('BIGINT autoIncrement works in all dialects', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'BIGINT', primaryKey: true, nullable: false, autoIncrement: true }),
        ],
      }),
    ]);
    expect(exportDrizzle(schema, { dialect: 'postgresql' })).toContain('generatedAlwaysAsIdentity');
    expect(exportDrizzle(schema, { dialect: 'mysql' })).toContain('generatedAlwaysAsIdentity');
    const sqliteTs = exportDrizzle(schema, { dialect: 'sqlite' });
    expect(sqliteTs).toContain('primaryKey({ autoIncrement: true })');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 12. Integer type family per dialect
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — integer type family', () => {
  const intTypes: Column['type'][] = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT'];

  const expectedFns: Record<'postgresql' | 'mysql' | 'sqlite', Record<string, string>> = {
    postgresql: {
      INT: 'integer',
      BIGINT: 'bigint',
      SMALLINT: 'smallint',
      TINYINT: 'smallint',
      MEDIUMINT: 'integer',
    },
    mysql: {
      INT: 'int',
      BIGINT: 'bigint',
      SMALLINT: 'smallint',
      TINYINT: 'tinyint',
      MEDIUMINT: 'int',
    },
    sqlite: {
      INT: 'integer',
      BIGINT: 'integer',
      SMALLINT: 'integer',
      TINYINT: 'integer',
      MEDIUMINT: 'integer',
    },
  };

  for (const dialect of ['postgresql', 'mysql', 'sqlite'] as const) {
    for (const t of intTypes) {
      it(`${dialect}: ${t} → ${expectedFns[dialect][t]}()`, () => {
        const schema = makeSchema([
          makeTable({
            name: 't',
            columns: [
              makeCol({ id: 'pk', name: 'id', type: 'INT', primaryKey: true }),
              makeCol({ id: 'c1', name: 'val', type: t }),
            ],
          }),
        ]);
        const ts = exportDrizzle(schema, { dialect });
        const expectedFn = expectedFns[dialect][t];
        expect(ts).toContain(`val: ${expectedFn}(`);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 13. DECIMAL precision/scale
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — DECIMAL precision/scale', () => {
  it('PostgreSQL DECIMAL(10,2) → numeric with precision and scale', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'amount', type: 'DECIMAL', length: 10, scale: 2 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`numeric('amount', { precision: 10, scale: 2 })`);
  });

  it('MySQL DECIMAL(8,4) → decimal with precision and scale', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'amount', type: 'DECIMAL', length: 8, scale: 4 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'mysql' });
    expect(ts).toContain(`decimal('amount', { precision: 8, scale: 4 })`);
  });

  it('DECIMAL with no length uses default (10, 2)', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'amount', type: 'DECIMAL' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('precision: 10');
    expect(ts).toContain('scale: 2');
  });

  it('NUMERIC is treated same as DECIMAL', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'val', type: 'NUMERIC', length: 15, scale: 3 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`{ precision: 15, scale: 3 }`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 14. Column name camelCase conversion
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — identifier handling', () => {
  it('snake_case column name → camelCase key', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          // name starts with lowercase letter — kept as-is (valid TS ident)
          makeCol({ id: 'c2', name: 'first_name', type: 'VARCHAR', length: 100 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    // snake_case is valid JS ident so kept as-is
    expect(ts).toContain(`first_name: varchar('first_name'`);
  });

  it('column name containing hyphen gets camelCased', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'my-col', type: 'VARCHAR', length: 100 }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`myCol: varchar('my-col'`);
  });

  it('column name preserves original in DB column name argument', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: 'user_id', type: 'INT' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    // Key is user_id (valid ident), DB col arg is 'user_id'
    expect(ts).toContain(`user_id: integer('user_id')`);
  });

  it('table name snake_case → camelCase variable', () => {
    const schema = makeSchema([
      makeTable({
        name: 'blog_posts',
        columns: [makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`export const blogPosts = pgTable('blog_posts'`);
  });

  it('single quotes in column name are escaped', () => {
    const schema = makeSchema([
      makeTable({
        name: 't',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
          makeCol({ id: 'c2', name: `col'name`, type: 'VARCHAR' }),
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain(`col\\'name`);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 15. Self-referencing FK
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — self-referencing FK', () => {
  it('self-ref generates relations block pointing to same table', () => {
    const schema = makeSchema([
      makeTable({
        name: 'categories',
        columns: [
          makeCol({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'c2', name: 'parent_id', type: 'INT', nullable: true }),
          makeCol({ id: 'c3', name: 'name', type: 'VARCHAR', length: 100 }),
        ],
        foreignKeys: [{
          id: 'fk_self',
          columnIds: ['c2'],
          referencedTableId: 't_categories',
          referencedColumnIds: ['c1'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        }],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    expect(ts).toContain('categoriesRelations');
    expect(ts).toContain('one(categories');
    expect(ts).toContain('fields: [categories.parent_id]');
    expect(ts).toContain('references: [categories.id]');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 16. All ColumnTypes produce valid output (matrix test)
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — all ColumnTypes produce non-empty output', () => {
  // Skip types that need special handling in the test (ENUM needs values)
  const ALL_TYPES: Column['type'][] = [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
    'VARCHAR', 'CHAR', 'TEXT',
    'NVARCHAR', 'NCHAR', 'NTEXT',
    'BOOLEAN', 'BIT',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'DATETIMEOFFSET', 'YEAR', 'INTERVAL',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'MONEY',
    'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'JSONB', 'UUID',
  ];

  for (const dialect of ['postgresql', 'mysql', 'sqlite'] as const) {
    it(`${dialect}: every ColumnType produces a helper call`, () => {
      const schema = makeSchema([
        makeTable({
          name: 't',
          columns: [
            makeCol({ id: 'pk', name: 'id', type: 'INT', primaryKey: true }),
            ...ALL_TYPES.map((t, i) => makeCol({ id: `c${i}`, name: `col${i}`, type: t })),
          ],
        }),
      ]);
      const ts = exportDrizzle(schema, { dialect });
      // Each column must produce a line with the column name
      for (let i = 0; i < ALL_TYPES.length; i++) {
        expect(ts, `${dialect} ${ALL_TYPES[i]} col${i}`).toMatch(new RegExp(`col${i}: \\w+\\('col${i}'`));
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 17. FK with non-null source column
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — FK with NOT NULL source', () => {
  it('NOT NULL FK column still appears in fields array', () => {
    const schema = makeSchema([
      makeTable({
        name: 'users',
        columns: [makeCol({ id: 'u1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        name: 'posts',
        columns: [
          makeCol({ id: 'p1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'p2', name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk1',
          columnIds: ['p2'],
          referencedTableId: 't_users',
          referencedColumnIds: ['u1'],
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        }],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    // user_id should be .notNull()
    expect(ts).toMatch(/user_id:[^\n]*\.notNull\(\)/);
    // Relations block exists
    expect(ts).toContain('postsRelations');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 18. Multi-FK table
// ═══════════════════════════════════════════════════════════════════════

describe('exportDrizzle — multiple FKs', () => {
  it('table with two FKs generates two relation entries', () => {
    const schema = makeSchema([
      makeTable({
        name: 'users',
        columns: [makeCol({ id: 'u1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        name: 'categories',
        columns: [makeCol({ id: 'cat1', name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
      makeTable({
        name: 'posts',
        columns: [
          makeCol({ id: 'p1', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeCol({ id: 'p2', name: 'author_id', type: 'INT', nullable: false }),
          makeCol({ id: 'p3', name: 'category_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [
          {
            id: 'fk1',
            columnIds: ['p2'],
            referencedTableId: 't_users',
            referencedColumnIds: ['u1'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
          },
          {
            id: 'fk2',
            columnIds: ['p3'],
            referencedTableId: 't_categories',
            referencedColumnIds: ['cat1'],
            onDelete: 'SET NULL',
            onUpdate: 'NO ACTION',
          },
        ],
      }),
    ]);
    const ts = exportDrizzle(schema, { dialect: 'postgresql' });
    // Both relation entries should exist
    expect(ts).toContain('one(users');
    expect(ts).toContain('one(categories');
    expect(ts).toContain('author_id');
    expect(ts).toContain('category_id');
  });
});
