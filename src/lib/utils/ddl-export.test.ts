import { describe, it, expect, beforeEach } from 'vitest';
import { exportDDL } from './ddl-export';
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
});
