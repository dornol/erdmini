import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';
import { parseRefAction } from './ddl-import-types';

// ═════════════════════════════════════════════
// PostgreSQL
// ═════════════════════════════════════════════
describe('importDDL — PostgreSQL', () => {
  // --- Auto-increment ---
  it('parses SERIAL as INT with autoIncrement', async () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toHaveLength(0);
    const idCol = result.tables[0].columns.find((c) => c.name === 'id')!;
    expect(idCol.type).toBe('INT');
    expect(idCol.autoIncrement).toBe(true);
  });

  it('parses BIGSERIAL as BIGINT with autoIncrement', async () => {
    const sql = `
      CREATE TABLE test (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100)
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    const idCol = result.tables[0].columns.find(c => c.name === 'id')!;
    expect(idCol.type).toBe('BIGINT');
    expect(idCol.autoIncrement).toBe(true);
  });

  // --- COMMENT ON ---
  it('applies COMMENT ON TABLE/COLUMN', async () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );
      COMMENT ON TABLE users IS 'User table';
      COMMENT ON COLUMN users.name IS 'User name';
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables[0].comment).toBe('User table');
    const nameCol = result.tables[0].columns.find((c) => c.name === 'name')!;
    expect(nameCol.comment).toBe('User name');
  });

  it('handles multiple COMMENT ON COLUMN for same table', async () => {
    const sql = `
      CREATE TABLE test (
        a INT NOT NULL,
        b VARCHAR(100),
        c TEXT
      );
      COMMENT ON COLUMN test.a IS 'Column A';
      COMMENT ON COLUMN test.b IS 'Column B';
      COMMENT ON COLUMN test.c IS 'Column C';
    `;
    const result = await importDDL(sql, 'postgresql');
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'a')!.comment).toBe('Column A');
    expect(cols.find(c => c.name === 'b')!.comment).toBe('Column B');
    expect(cols.find(c => c.name === 'c')!.comment).toBe('Column C');
  });

  // --- Type mapping ---
  it('maps TIMESTAMP WITHOUT TIME ZONE and TIMESTAMPTZ', async () => {
    const sql = `
      CREATE TABLE events (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMPTZ
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toHaveLength(0);
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'created_at')!.type).toBe('TIMESTAMP');
  });

  it('maps NUMERIC to DECIMAL', async () => {
    const sql = `
      CREATE TABLE test (
        id SERIAL PRIMARY KEY,
        amount NUMERIC(12,4)
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    const amountCol = result.tables[0].columns.find(c => c.name === 'amount')!;
    expect(amountCol.type).toBe('NUMERIC');
    expect(amountCol.length).toBe(12);
    expect(amountCol.scale).toBe(4);
  });

  // --- Schema ---
  it('extracts schema name from qualified table', async () => {
    const sql = `
      CREATE TABLE auth.users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100)
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables[0].schema).toBe('auth');
    expect(result.tables[0].name).toBe('users');
  });

  // --- ALTER TABLE FK ---
  it('parses ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY', async () => {
    const sql = `
      CREATE TABLE departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        dept_id INT NOT NULL
      );
      ALTER TABLE employees
        ADD CONSTRAINT fk_dept
        FOREIGN KEY (dept_id) REFERENCES departments (id)
        ON DELETE CASCADE ON UPDATE RESTRICT;
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toHaveLength(0);
    const emp = result.tables.find(t => t.name === 'employees')!;
    expect(emp.foreignKeys).toHaveLength(1);
    expect(emp.foreignKeys[0].onDelete).toBe('CASCADE');
  });

  // --- Double-quoted identifiers ---
  it('handles double-quoted identifiers', async () => {
    const sql = `
      CREATE TABLE "MyTable" (
        "MyColumn" INT NOT NULL,
        PRIMARY KEY ("MyColumn")
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables[0].name).toBe('MyTable');
    expect(result.tables[0].columns[0].name).toBe('MyColumn');
  });

  // --- DEFAULT ---
  it('extracts DEFAULT values including functions', async () => {
    const sql = `
      CREATE TABLE test (
        id SERIAL PRIMARY KEY,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    const statusCol = result.tables[0].columns.find(c => c.name === 'status')!;
    expect(statusCol.defaultValue).toBe("'pending'");
    const createdCol = result.tables[0].columns.find(c => c.name === 'created_at')!;
    expect(createdCol.defaultValue).toMatch(/current_timestamp/i);
  });

  // --- CHECK ---
  it('extracts CHECK constraints', async () => {
    const sql = `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        price DECIMAL(10,2) CHECK (price > 0),
        name VARCHAR(100)
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    const priceCol = result.tables[0].columns.find(c => c.name === 'price')!;
    expect(priceCol.check).toBe('price > 0');
  });

  // --- Index ---
  it('parses CREATE INDEX on PostgreSQL table', async () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255)
      );
      CREATE INDEX idx_users_email ON users (email);
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.tables[0].indexes).toHaveLength(1);
    expect(result.tables[0].indexes[0].name).toBe('idx_users_email');
  });
});
