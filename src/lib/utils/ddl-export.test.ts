import { describe, it, expect, beforeEach } from 'vitest';
import { exportDDL } from './ddl-export';
import type { ColumnDomain } from '$lib/types/erd';
import { makeColumn, makeTable, makeSchema, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

function usersOrdersSchema() {
  const userId = 'u_id';
  const orderId = 'o_id';
  const orderUserId = 'o_user_id';

  const users = makeTable({
    id: 'tbl_users',
    name: 'users',
    columns: [
      makeColumn({ id: userId, name: 'id', type: 'INT', primaryKey: true, nullable: false, autoIncrement: true }),
      makeColumn({ name: 'name', type: 'VARCHAR', length: 100, nullable: false }),
      makeColumn({ name: 'email', type: 'VARCHAR', unique: true, nullable: false }),
    ],
  });

  const orders = makeTable({
    id: 'tbl_orders',
    name: 'orders',
    columns: [
      makeColumn({ id: orderId, name: 'id', type: 'INT', primaryKey: true, nullable: false, autoIncrement: true }),
      makeColumn({ id: orderUserId, name: 'user_id', type: 'INT', nullable: false }),
      makeColumn({ name: 'total', type: 'DECIMAL', length: 10, nullable: false }),
    ],
    foreignKeys: [
      {
        id: 'fk_1',
        columnIds: [orderUserId],
        referencedTableId: 'tbl_users',
        referencedColumnIds: [userId],
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT',
      },
    ],
  });

  return makeSchema([users, orders]);
}

describe('exportDDL — MySQL', () => {
  it('generates CREATE TABLE with backtick quoting', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('CREATE TABLE `users`');
    expect(ddl).toContain('CREATE TABLE `orders`');
  });

  it('uses AUTO_INCREMENT for auto-increment columns', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('AUTO_INCREMENT');
  });

  it('generates VARCHAR with default length 255', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'VARCHAR', nullable: true })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('VARCHAR(255)');
  });

  it('generates VARCHAR with explicit length', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('VARCHAR(100)');
  });

  it('generates PRIMARY KEY clause', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('PRIMARY KEY (`id`)');
  });

  it('generates UNIQUE constraint', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('UNIQUE (`email`)');
  });

  it('generates ALTER TABLE with FK', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('ALTER TABLE `orders`');
    expect(ddl).toContain('FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)');
    expect(ddl).toContain('ON DELETE CASCADE ON UPDATE RESTRICT');
  });

  it('generates ENGINE=InnoDB trailer', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('ENGINE=InnoDB');
  });

  it('generates table COMMENT in trailer', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false })],
        comment: 'Test table',
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain("COMMENT='Test table'");
  });

  it('generates column COMMENT inline', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false, comment: 'My column' })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain("COMMENT 'My column'");
  });
});

describe('exportDDL — PostgreSQL', () => {
  it('generates CREATE TABLE with double-quote quoting', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'postgresql');
    expect(ddl).toContain('CREATE TABLE "users"');
  });

  it('uses SERIAL for auto-increment INT', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'postgresql');
    expect(ddl).toContain('SERIAL');
  });

  it('uses BIGSERIAL for auto-increment BIGINT', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'id', type: 'BIGINT', primaryKey: true, nullable: false, autoIncrement: true })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('BIGSERIAL');
  });

  it('converts DATETIME to TIMESTAMP', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'created', type: 'DATETIME', nullable: true })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('TIMESTAMP');
  });

  it('generates COMMENT ON statements for table and column comments', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false, comment: 'col comment' })],
        comment: 'table comment',
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain("COMMENT ON TABLE \"test\" IS 'table comment'");
    expect(ddl).toContain("COMMENT ON COLUMN \"test\".\"col\" IS 'col comment'");
  });
});

describe('exportDDL — MariaDB', () => {
  it('generates backtick quoting like MySQL', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mariadb');
    expect(ddl).toContain('CREATE TABLE `users`');
  });

  it('uses AUTO_INCREMENT like MySQL', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mariadb');
    expect(ddl).toContain('AUTO_INCREMENT');
  });

  it('generates ENGINE=InnoDB trailer', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mariadb');
    expect(ddl).toContain('ENGINE=InnoDB');
  });
});

describe('exportDDL — MSSQL', () => {
  it('generates CREATE TABLE with bracket quoting', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mssql');
    expect(ddl).toContain('CREATE TABLE [users]');
  });

  it('uses IDENTITY(1,1) for auto-increment', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mssql');
    expect(ddl).toContain('IDENTITY(1,1)');
  });

  it('converts BOOLEAN to BIT', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'active', type: 'BOOLEAN', nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('BIT');
  });

  it('converts TEXT to NVARCHAR(MAX)', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'body', type: 'TEXT', nullable: true })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('NVARCHAR(MAX)');
  });

  it('converts UUID to UNIQUEIDENTIFIER', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'uid', type: 'UUID', nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('UNIQUEIDENTIFIER');
  });

  it('generates sp_addextendedproperty for table comments', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false, comment: 'col desc' })],
        comment: 'table desc',
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('sp_addextendedproperty');
    expect(ddl).toContain("N'table desc'");
    expect(ddl).toContain("N'col desc'");
  });

  it('wraps DEFAULT with parentheses', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'val', type: 'INT', nullable: false, defaultValue: '0' })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('DEFAULT (0)');
  });
});

describe('exportDDL — Common features', () => {
  it('generates NOT NULL for non-nullable columns', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddl).toContain('NOT NULL');
  });

  it('generates composite PRIMARY KEY', () => {
    const col1 = makeColumn({ name: 'a', type: 'INT', primaryKey: true, nullable: false });
    const col2 = makeColumn({ name: 'b', type: 'INT', primaryKey: true, nullable: false });
    const schema = makeSchema([makeTable({ name: 'test', columns: [col1, col2] })]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('PRIMARY KEY (`a`, `b`)');
  });

  it('generates CHECK constraint', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'age', type: 'INT', nullable: false, check: 'age >= 0' })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('CHECK (age >= 0)');
  });

  it('generates DEFAULT value', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'status', type: 'VARCHAR', nullable: false, defaultValue: "'active'" })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain("DEFAULT 'active'");
  });

  it('generates CREATE INDEX', () => {
    const col = makeColumn({ name: 'email', type: 'VARCHAR', nullable: false });
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [col],
        indexes: [{ id: 'idx1', columnIds: [col.id], unique: false, name: 'idx_email' }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('CREATE INDEX `idx_email` ON `test` (`email`)');
  });

  it('generates CREATE UNIQUE INDEX', () => {
    const col = makeColumn({ name: 'code', type: 'VARCHAR', nullable: false });
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [col],
        indexes: [{ id: 'idx2', columnIds: [col.id], unique: true, name: 'idx_code_unique' }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('CREATE UNIQUE INDEX');
  });

  it('generates composite UNIQUE KEY with CONSTRAINT name', () => {
    const col1 = makeColumn({ name: 'a', type: 'INT', nullable: false });
    const col2 = makeColumn({ name: 'b', type: 'INT', nullable: false });
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [col1, col2],
        uniqueKeys: [{ id: 'uk1', columnIds: [col1.id, col2.id], name: 'uq_ab' }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('CONSTRAINT `uq_ab` UNIQUE (`a`, `b`)');
  });

  it('returns empty string for empty schema', () => {
    const schema = makeSchema([]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toBe('');
  });

  it('generates ENUM type for MySQL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'status', type: 'ENUM', enumValues: ['active', 'inactive'], nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain("ENUM('active', 'inactive')");
  });

  it('generates DECIMAL with precision and scale', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'price', type: 'DECIMAL', length: 12, scale: 4, nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('DECIMAL(12,4)');
  });

  it('generates composite FK with multiple columns', () => {
    const col1 = makeColumn({ id: 'c1', name: 'a_id', type: 'INT', nullable: false });
    const col2 = makeColumn({ id: 'c2', name: 'b_id', type: 'INT', nullable: false });
    const refCol1 = makeColumn({ id: 'r1', name: 'a', type: 'INT', primaryKey: true, nullable: false });
    const refCol2 = makeColumn({ id: 'r2', name: 'b', type: 'INT', primaryKey: true, nullable: false });
    const schema = makeSchema([
      makeTable({ id: 'ref', name: 'ref_table', columns: [refCol1, refCol2] }),
      makeTable({
        name: 'child',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }), col1, col2],
        foreignKeys: [{
          id: 'fk_comp', columnIds: ['c1', 'c2'], referencedTableId: 'ref',
          referencedColumnIds: ['r1', 'r2'], onDelete: 'CASCADE', onUpdate: 'RESTRICT',
        }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('FOREIGN KEY (`a_id`, `b_id`) REFERENCES `ref_table` (`a`, `b`)');
  });

  it('generates composite UNIQUE KEY without name', () => {
    const col1 = makeColumn({ name: 'x', type: 'INT', nullable: false });
    const col2 = makeColumn({ name: 'y', type: 'INT', nullable: false });
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [col1, col2],
        uniqueKeys: [{ id: 'uk_no_name', columnIds: [col1.id, col2.id] }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('UNIQUE (`x`, `y`)');
    expect(ddl).not.toContain('CONSTRAINT');
  });

  it('generates CREATE TYPE for PostgreSQL ENUM with values', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'status', type: 'ENUM', enumValues: ['a', 'b'], nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain("CREATE TYPE \"test_status_enum\" AS ENUM ('a', 'b');");
    expect(ddl).toContain('test_status_enum');
  });

  it('generates ENUM fallback to NVARCHAR(255) for MSSQL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'status', type: 'ENUM', enumValues: ['a', 'b'], nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('NVARCHAR(255)');
  });

  it('generates MSSQL type mappings (DATETIME→DATETIME2, VARCHAR→NVARCHAR, JSON→NVARCHAR(MAX))', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'created', type: 'DATETIME', nullable: true }),
          makeColumn({ name: 'name', type: 'VARCHAR', length: 50, nullable: false }),
          makeColumn({ name: 'data', type: 'JSON', nullable: true }),
          makeColumn({ name: 'rate', type: 'DOUBLE', nullable: true }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('DATETIME2');
    expect(ddl).toContain('NVARCHAR(50)');
    expect(ddl).toContain('NVARCHAR(MAX)');
    expect(ddl).toContain('FLOAT');
  });

  it('generates auto-generated index name when name is omitted', () => {
    const col = makeColumn({ name: 'email', type: 'VARCHAR', nullable: false });
    const schema = makeSchema([
      makeTable({
        name: 'users',
        columns: [col],
        indexes: [{ id: 'idx1', columnIds: [col.id], unique: false }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('idx_users_email');
  });

  it('generates UUID as CHAR(36) for MySQL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'uid', type: 'UUID', nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('CHAR(36)');
  });
});

describe('exportDDL — DDL Export Options', () => {
  it('uses 4-space indent', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql', { indent: '4spaces' });
    expect(ddl).toContain('    `id`');
  });

  it('uses tab indent', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql', { indent: 'tab' });
    expect(ddl).toContain('\t`id`');
  });

  it('uses double-quote style on MySQL', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql', { quoteStyle: 'double' });
    expect(ddl).toContain('CREATE TABLE "users"');
    expect(ddl).toContain('"id"');
  });

  it('uses no quoting', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'postgresql', { quoteStyle: 'none' });
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).not.toContain('"users"');
  });

  it('uses bracket quoting on PostgreSQL', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'postgresql', { quoteStyle: 'bracket' });
    expect(ddl).toContain('CREATE TABLE [users]');
  });

  it('generates lowercase keywords', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql', { upperCaseKeywords: false });
    expect(ddl).toContain('create table');
    expect(ddl).toContain('not null');
    expect(ddl).toContain('primary key');
  });

  it('excludes comments when includeComments is false', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false, comment: 'My column' })],
        comment: 'Test table',
      }),
    ]);
    const ddlMysql = exportDDL(schema, 'mysql', { includeComments: false });
    expect(ddlMysql).not.toContain("COMMENT");

    const ddlPg = exportDDL(schema, 'postgresql', { includeComments: false });
    expect(ddlPg).not.toContain('COMMENT ON');

    const ddlMssql = exportDDL(schema, 'mssql', { includeComments: false });
    expect(ddlMssql).not.toContain('sp_addextendedproperty');
  });

  it('excludes indexes when includeIndexes is false', () => {
    const col = makeColumn({ name: 'email', type: 'VARCHAR', nullable: false });
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [col],
        indexes: [{ id: 'idx1', columnIds: [col.id], unique: false, name: 'idx_email' }],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql', { includeIndexes: false });
    expect(ddl).not.toContain('CREATE INDEX');
    expect(ddl).not.toContain('idx_email');
  });

  it('excludes foreign keys when includeForeignKeys is false', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql', { includeForeignKeys: false });
    expect(ddl).not.toContain('ALTER TABLE');
    expect(ddl).not.toContain('FOREIGN KEY');
  });

  it('combines multiple options together', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'mysql', {
      indent: 'tab',
      quoteStyle: 'double',
      upperCaseKeywords: false,
      includeForeignKeys: false,
    });
    expect(ddl).toContain('\t"id"');
    expect(ddl).toContain('create table "users"');
    expect(ddl).toContain('not null');
    expect(ddl).not.toContain('ALTER TABLE');
  });

  it('defaults to dialect-appropriate quote style when not specified', () => {
    const ddlMysql = exportDDL(usersOrdersSchema(), 'mysql');
    expect(ddlMysql).toContain('`users`');

    const ddlPg = exportDDL(usersOrdersSchema(), 'postgresql');
    expect(ddlPg).toContain('"users"');

    const ddlMssql = exportDDL(usersOrdersSchema(), 'mssql');
    expect(ddlMssql).toContain('[users]');
  });
});

describe('exportDDL — Domain comments', () => {
  function makeDomain(overrides: Partial<ColumnDomain> & { id: string; name: string }): ColumnDomain {
    return {
      type: 'VARCHAR',
      nullable: true,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
      ...overrides,
    };
  }

  it('appends domain comment for column with domainId', () => {
    const domain = makeDomain({ id: 'd1', name: 'email_type' });
    const col = makeColumn({ name: 'email', type: 'VARCHAR', nullable: false, domainId: 'd1' });
    const schema = makeSchema([makeTable({ name: 'users', columns: [col] })], [domain]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('-- domain: email_type');
  });

  it('does not append domain comment for column without domainId', () => {
    const domain = makeDomain({ id: 'd1', name: 'email_type' });
    const col = makeColumn({ name: 'email', type: 'VARCHAR', nullable: false });
    const schema = makeSchema([makeTable({ name: 'users', columns: [col] })], [domain]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).not.toContain('-- domain:');
  });

  it('does not append domain comment when includeDomains is false', () => {
    const domain = makeDomain({ id: 'd1', name: 'email_type' });
    const col = makeColumn({ name: 'email', type: 'VARCHAR', nullable: false, domainId: 'd1' });
    const schema = makeSchema([makeTable({ name: 'users', columns: [col] })], [domain]);
    const ddl = exportDDL(schema, 'mysql', { includeDomains: false });
    expect(ddl).not.toContain('-- domain:');
  });

  it('works with PostgreSQL dialect', () => {
    const domain = makeDomain({ id: 'd1', name: 'user_id' });
    const col = makeColumn({ name: 'id', type: 'INT', nullable: false, primaryKey: true, domainId: 'd1' });
    const schema = makeSchema([makeTable({ name: 'users', columns: [col] })], [domain]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('-- domain: user_id');
  });

  it('works with MSSQL dialect', () => {
    const domain = makeDomain({ id: 'd1', name: 'status_type' });
    const col = makeColumn({ name: 'status', type: 'VARCHAR', nullable: false, domainId: 'd1' });
    const schema = makeSchema([makeTable({ name: 'test', columns: [col] })], [domain]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain('-- domain: status_type');
  });

  it('works with MariaDB dialect', () => {
    const domain = makeDomain({ id: 'd1', name: 'amount_type' });
    const col = makeColumn({ name: 'amount', type: 'DECIMAL', length: 10, scale: 2, nullable: false, domainId: 'd1' });
    const schema = makeSchema([makeTable({ name: 'orders', columns: [col] })], [domain]);
    const ddl = exportDDL(schema, 'mariadb');
    expect(ddl).toContain('-- domain: amount_type');
  });
});

describe('exportDDL — Schema namespace', () => {
  it('generates qualified table name for PostgreSQL with non-public schema', () => {
    const col = makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false });
    const table = makeTable({ name: 'users', columns: [col] });
    table.schema = 'auth';
    const schema = makeSchema([table]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('CREATE SCHEMA IF NOT EXISTS "auth"');
    expect(ddl).toContain('CREATE TABLE "auth"."users"');
  });

  it('skips CREATE SCHEMA for public schema in PostgreSQL', () => {
    const col = makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false });
    const table = makeTable({ name: 'users', columns: [col] });
    table.schema = 'public';
    const schema = makeSchema([table]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).not.toContain('CREATE SCHEMA');
    expect(ddl).toContain('CREATE TABLE "public"."users"');
  });

  it('generates qualified table name for MySQL with schema prefix (backtick)', () => {
    const col = makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false });
    const table = makeTable({ name: 'users', columns: [col] });
    table.schema = 'auth';
    const schema = makeSchema([table]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).toContain('CREATE TABLE `auth`.`users`');
    // MySQL does not emit CREATE SCHEMA
    expect(ddl).not.toContain('CREATE SCHEMA');
  });

  it('generates no schema prefix when table.schema is undefined', () => {
    const col = makeColumn({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, nullable: false });
    const table = makeTable({ name: 'products', columns: [col] });
    const schema = makeSchema([table]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).not.toContain('"public"');
    expect(ddl).toContain('CREATE TABLE "products"');
  });

  it('generates qualified FK REFERENCES for PostgreSQL', () => {
    const userId = 'u_id';
    const orderUserId = 'o_user_id';
    const users = makeTable({
      id: 'tbl_users',
      name: 'users',
      columns: [makeColumn({ id: userId, name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    users.schema = 'auth';
    const orders = makeTable({
      id: 'tbl_orders',
      name: 'orders',
      columns: [
        makeColumn({ id: 'o_id', name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        makeColumn({ id: orderUserId, name: 'user_id', type: 'INT', nullable: false }),
      ],
      foreignKeys: [{ id: 'fk_1', columnIds: [orderUserId], referencedTableId: 'tbl_users', referencedColumnIds: [userId], onDelete: 'CASCADE', onUpdate: 'RESTRICT' }],
    });
    orders.schema = 'billing';
    const schema = makeSchema([users, orders]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('REFERENCES "auth"."users"');
    expect(ddl).toContain('ALTER TABLE "billing"."orders"');
  });
});

describe('exportDDL — SQLite', () => {
  it('maps INT/BIGINT/SMALLINT/BOOLEAN to INTEGER', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'INT', nullable: false }),
          makeColumn({ name: 'b', type: 'BIGINT', nullable: false }),
          makeColumn({ name: 'c', type: 'SMALLINT', nullable: false }),
          makeColumn({ name: 'd', type: 'BOOLEAN', nullable: false }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).toContain('a INTEGER');
    expect(ddl).toContain('b INTEGER');
    expect(ddl).toContain('c INTEGER');
    expect(ddl).toContain('d INTEGER');
  });

  it('maps VARCHAR/CHAR/TEXT/JSON/UUID/ENUM/DATE/DATETIME/TIMESTAMP to TEXT', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'VARCHAR', nullable: true }),
          makeColumn({ name: 'b', type: 'TEXT', nullable: true }),
          makeColumn({ name: 'c', type: 'JSON', nullable: true }),
          makeColumn({ name: 'd', type: 'UUID', nullable: true }),
          makeColumn({ name: 'e', type: 'DATE', nullable: true }),
          makeColumn({ name: 'f', type: 'TIMESTAMP', nullable: true }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'sqlite');
    // All should be TEXT
    const textCount = (ddl.match(/\bTEXT\b/g) ?? []).length;
    expect(textCount).toBeGreaterThanOrEqual(6);
  });

  it('maps DECIMAL/FLOAT/DOUBLE to REAL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'DECIMAL', nullable: true }),
          makeColumn({ name: 'b', type: 'FLOAT', nullable: true }),
          makeColumn({ name: 'c', type: 'DOUBLE', nullable: true }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'sqlite');
    const realCount = (ddl.match(/\bREAL\b/g) ?? []).length;
    expect(realCount).toBe(3);
  });

  it('generates AUTOINCREMENT for auto-increment PK', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'sqlite');
    expect(ddl).toContain('PRIMARY KEY AUTOINCREMENT');
  });

  it('does not generate ENGINE=InnoDB', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'sqlite');
    expect(ddl).not.toContain('ENGINE');
  });

  it('defaults to no quoting', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'sqlite');
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).not.toContain('`users`');
    expect(ddl).not.toContain('"users"');
  });

  it('skips CREATE SCHEMA even when tables have schema', () => {
    const t = makeTable({
      name: 'test',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    t.schema = 'myschema';
    const schema = makeSchema([t]);
    const ddl = exportDDL(schema, 'sqlite');
    expect(ddl).not.toContain('CREATE SCHEMA');
    // Table name should NOT have schema prefix
    expect(ddl).toContain('CREATE TABLE test');
    expect(ddl).not.toContain('myschema');
  });

  it('generates FK without ON UPDATE in ALTER TABLE', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'sqlite');
    expect(ddl).toContain('FOREIGN KEY');
    expect(ddl).toContain('ON DELETE CASCADE');
    expect(ddl).toContain('ON UPDATE RESTRICT');
  });
});

describe('exportDDL — Oracle', () => {
  it('maps INT to NUMBER(10), BIGINT to NUMBER(19), SMALLINT to NUMBER(5)', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'INT', nullable: false }),
          makeColumn({ name: 'b', type: 'BIGINT', nullable: false }),
          makeColumn({ name: 'c', type: 'SMALLINT', nullable: false }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'oracle');
    expect(ddl).toContain('NUMBER(10)');
    expect(ddl).toContain('NUMBER(19)');
    expect(ddl).toContain('NUMBER(5)');
  });

  it('maps VARCHAR to VARCHAR2, TEXT/JSON to CLOB', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'VARCHAR', length: 100, nullable: true }),
          makeColumn({ name: 'b', type: 'TEXT', nullable: true }),
          makeColumn({ name: 'c', type: 'JSON', nullable: true }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'oracle');
    expect(ddl).toContain('VARCHAR2(100)');
    expect(ddl).toContain('CLOB');
  });

  it('maps BOOLEAN to NUMBER(1), DOUBLE to BINARY_DOUBLE, UUID to VARCHAR2(36)', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'BOOLEAN', nullable: true }),
          makeColumn({ name: 'b', type: 'DOUBLE', nullable: true }),
          makeColumn({ name: 'c', type: 'UUID', nullable: true }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'oracle');
    expect(ddl).toContain('NUMBER(1)');
    expect(ddl).toContain('BINARY_DOUBLE');
    expect(ddl).toContain('VARCHAR2(36)');
  });

  it('uses GENERATED ALWAYS AS IDENTITY for auto-increment', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'oracle');
    expect(ddl).toContain('GENERATED ALWAYS AS IDENTITY');
    expect(ddl).not.toContain('AUTO_INCREMENT');
    expect(ddl).not.toContain('AUTOINCREMENT');
  });

  it('generates COMMENT ON for table and column comments', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false, comment: 'col comment' })],
        comment: 'table comment',
      }),
    ]);
    const ddl = exportDDL(schema, 'oracle');
    expect(ddl).toContain("COMMENT ON TABLE \"test\" IS 'table comment'");
    expect(ddl).toContain("COMMENT ON COLUMN \"test\".\"col\" IS 'col comment'");
  });

  it('omits ON UPDATE from FK constraints', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'oracle');
    expect(ddl).toContain('ON DELETE CASCADE');
    expect(ddl).not.toContain('ON UPDATE');
  });

  it('uses double-quote quoting by default', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'oracle');
    expect(ddl).toContain('CREATE TABLE "users"');
  });

  it('does not emit ENGINE=InnoDB', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'oracle');
    expect(ddl).not.toContain('ENGINE');
  });

  it('skips CREATE SCHEMA for schema-prefixed tables', () => {
    const t = makeTable({
      name: 'test',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    t.schema = 'hr';
    const schema = makeSchema([t]);
    const ddl = exportDDL(schema, 'oracle');
    expect(ddl).not.toContain('CREATE SCHEMA');
    expect(ddl).toContain('"hr"."test"');
  });

  it('maps DECIMAL with precision to NUMBER(p,s)', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'amount', type: 'DECIMAL', length: 12, scale: 4, nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'oracle');
    expect(ddl).toContain('NUMBER(12,4)');
  });
});

describe('exportDDL — H2', () => {
  it('maps TEXT to CLOB and JSON to native JSON', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'TEXT', nullable: true }),
          makeColumn({ name: 'b', type: 'JSON', nullable: true }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'h2');
    expect(ddl).toContain('CLOB');
    expect(ddl).toContain('JSON');
  });

  it('passes through BOOLEAN, UUID, INT natively', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [
          makeColumn({ name: 'a', type: 'BOOLEAN', nullable: true }),
          makeColumn({ name: 'b', type: 'UUID', nullable: true }),
          makeColumn({ name: 'c', type: 'INT', nullable: false }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'h2');
    expect(ddl).toContain('BOOLEAN');
    expect(ddl).toContain('UUID');
    expect(ddl).toContain('INT');
  });

  it('uses AUTO_INCREMENT for auto-increment', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'h2');
    expect(ddl).toContain('AUTO_INCREMENT');
  });

  it('generates COMMENT ON for table and column comments', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'col', type: 'INT', nullable: false, comment: 'col comment' })],
        comment: 'table comment',
      }),
    ]);
    const ddl = exportDDL(schema, 'h2');
    expect(ddl).toContain("COMMENT ON TABLE \"test\" IS 'table comment'");
    expect(ddl).toContain("COMMENT ON COLUMN \"test\".\"col\" IS 'col comment'");
  });

  it('generates CREATE SCHEMA IF NOT EXISTS', () => {
    const t = makeTable({
      name: 'test',
      columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
    });
    t.schema = 'app';
    const schema = makeSchema([t]);
    const ddl = exportDDL(schema, 'h2');
    expect(ddl).toContain('CREATE SCHEMA IF NOT EXISTS "app"');
    expect(ddl).toContain('"app"."test"');
  });

  it('uses double-quote quoting by default', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'h2');
    expect(ddl).toContain('CREATE TABLE "users"');
  });

  it('does not emit ENGINE=InnoDB', () => {
    const ddl = exportDDL(usersOrdersSchema(), 'h2');
    expect(ddl).not.toContain('ENGINE');
  });

  it('generates DECIMAL with precision', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'amount', type: 'DECIMAL', length: 10, scale: 2, nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'h2');
    expect(ddl).toContain('DECIMAL(10,2)');
  });
});

describe('exportDDL — PostgreSQL ENUM', () => {
  it('generates CREATE TYPE ... AS ENUM before CREATE TABLE', () => {
    const schema = makeSchema([
      makeTable({
        name: 'orders',
        columns: [
          makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
          makeColumn({ name: 'status', type: 'ENUM', enumValues: ['pending', 'active', 'closed'], nullable: false }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain("CREATE TYPE \"orders_status_enum\" AS ENUM ('pending', 'active', 'closed');");
    expect(ddl).toContain('orders_status_enum');
    // CREATE TYPE should appear before CREATE TABLE
    const typeIdx = ddl.indexOf('CREATE TYPE');
    const tableIdx = ddl.indexOf('CREATE TABLE');
    expect(typeIdx).toBeLessThan(tableIdx);
  });

  it('uses VARCHAR(255) for ENUM without enumValues', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'status', type: 'ENUM', nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).not.toContain('CREATE TYPE');
    expect(ddl).toContain('VARCHAR(255)');
  });

  it('does not generate CREATE TYPE for MySQL ENUM', () => {
    const schema = makeSchema([
      makeTable({
        name: 'orders',
        columns: [
          makeColumn({ name: 'status', type: 'ENUM', enumValues: ['a', 'b'], nullable: false }),
        ],
      }),
    ]);
    const ddl = exportDDL(schema, 'mysql');
    expect(ddl).not.toContain('CREATE TYPE');
    expect(ddl).toContain("ENUM('a', 'b')");
  });
});

describe('exportDDL — PostgreSQL SMALLSERIAL', () => {
  it('maps SMALLINT autoIncrement to SMALLSERIAL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'id', type: 'SMALLINT', autoIncrement: true, primaryKey: true, nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('SMALLSERIAL');
  });

  it('maps BIGINT autoIncrement to BIGSERIAL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'id', type: 'BIGINT', autoIncrement: true, primaryKey: true, nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('BIGSERIAL');
  });

  it('maps INT autoIncrement to SERIAL', () => {
    const schema = makeSchema([
      makeTable({
        name: 'test',
        columns: [makeColumn({ name: 'id', type: 'INT', autoIncrement: true, primaryKey: true, nullable: false })],
      }),
    ]);
    const ddl = exportDDL(schema, 'postgresql');
    expect(ddl).toContain('SERIAL');
    expect(ddl).not.toContain('SMALLSERIAL');
    expect(ddl).not.toContain('BIGSERIAL');
  });
});

describe('exportDDL — MSSQL schema in sp_addextendedproperty', () => {
  it('uses table.schema instead of hardcoded dbo', () => {
    const schema = makeSchema([
      makeTable({
        name: 'users',
        schema: 'sales',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false, comment: 'PK' })],
        comment: 'User table',
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain("@level0name=N'sales'");
    expect(ddl).not.toContain("@level0name=N'dbo'");
  });

  it('defaults to dbo when no schema set', () => {
    const schema = makeSchema([
      makeTable({
        name: 'users',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
        comment: 'User table',
      }),
    ]);
    const ddl = exportDDL(schema, 'mssql');
    expect(ddl).toContain("@level0name=N'dbo'");
  });
});

describe('exportDDL — FK label (UI-only field)', () => {
  function schemaWithFKLabel(label?: string) {
    const userId = 'u_id';
    const orderUserId = 'o_user_id';
    return makeSchema([
      makeTable({
        id: 'tbl_users',
        name: 'users',
        columns: [
          makeColumn({ id: userId, name: 'id', type: 'INT', primaryKey: true, nullable: false }),
        ],
      }),
      makeTable({
        id: 'tbl_orders',
        name: 'orders',
        columns: [
          makeColumn({ id: orderUserId, name: 'user_id', type: 'INT', nullable: false }),
        ],
        foreignKeys: [{
          id: 'fk_1',
          columnIds: [orderUserId],
          referencedTableId: 'tbl_users',
          referencedColumnIds: [userId],
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT',
          ...(label != null ? { label } : {}),
        }],
      }),
    ]);
  }

  it('FK with label produces same DDL as FK without label (MySQL)', () => {
    const withLabel = exportDDL(schemaWithFKLabel('places order'), 'mysql');
    const withoutLabel = exportDDL(schemaWithFKLabel(), 'mysql');
    expect(withLabel).toBe(withoutLabel);
  });

  it('FK with label produces same DDL as FK without label (PostgreSQL)', () => {
    const withLabel = exportDDL(schemaWithFKLabel('places order'), 'postgresql');
    const withoutLabel = exportDDL(schemaWithFKLabel(), 'postgresql');
    expect(withLabel).toBe(withoutLabel);
  });

  it('FK with label produces same DDL as FK without label (MSSQL)', () => {
    const withLabel = exportDDL(schemaWithFKLabel('places order'), 'mssql');
    const withoutLabel = exportDDL(schemaWithFKLabel(), 'mssql');
    expect(withLabel).toBe(withoutLabel);
  });

  it('FK with label produces same DDL as FK without label (SQLite)', () => {
    const withLabel = exportDDL(schemaWithFKLabel('places order'), 'sqlite');
    const withoutLabel = exportDDL(schemaWithFKLabel(), 'sqlite');
    expect(withLabel).toBe(withoutLabel);
  });

  it('FK label does not appear in DDL output', () => {
    const ddl = exportDDL(schemaWithFKLabel('places order'), 'mysql');
    expect(ddl).not.toContain('places order');
    expect(ddl).toContain('FOREIGN KEY');
  });
});
