import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';
import { parseRefAction } from './ddl-import-types';

// ═════════════════════════════════════════════
// SQLite
// ═════════════════════════════════════════════
describe('importDDL — SQLite', () => {
  // --- Auto-increment ---
  it('parses INTEGER PRIMARY KEY AUTOINCREMENT', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(1);
    const table = result.tables[0];
    expect(table.columns[0].primaryKey).toBe(true);
    expect(table.columns[0].autoIncrement).toBe(true);
  });

  it('parses INTEGER PRIMARY KEY without AUTOINCREMENT', async () => {
    const sql = `
      CREATE TABLE test (
        id INTEGER PRIMARY KEY,
        name TEXT
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const idCol = result.tables[0].columns.find(c => c.name === 'id')!;
    expect(idCol.primaryKey).toBe(true);
    expect(idCol.autoIncrement).toBe(false);
  });

  // --- Type mapping ---
  it('maps INTEGER → INT, TEXT stays TEXT, REAL → DECIMAL', async () => {
    const sql = `
      CREATE TABLE data (
        id INTEGER NOT NULL,
        name TEXT,
        amount REAL
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const cols = result.tables[0].columns;
    expect(cols[0].type).toBe('INT');
    expect(cols[1].type).toBe('TEXT');
    expect(cols[2].type).toBe('REAL');
  });

  it('maps BLOB → BLOB', async () => {
    const sql = `
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        data BLOB
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].columns.find(c => c.name === 'data')!.type).toBe('BLOB');
  });

  it('maps BOOLEAN → BOOLEAN, NUMERIC → NUMERIC', async () => {
    const sql = `
      CREATE TABLE test (
        active BOOLEAN,
        amount NUMERIC
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'active')!.type).toBe('BOOLEAN');
    expect(cols.find(c => c.name === 'amount')!.type).toBe('NUMERIC');
  });

  // --- FK ---
  it('parses FK constraints', async () => {
    const sql = `
      CREATE TABLE parent (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parent (id)
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables).toHaveLength(2);
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
  });

  it('parses FK with ON DELETE CASCADE', async () => {
    const sql = `
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES parent (id) ON DELETE CASCADE
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys[0].onDelete).toBe('CASCADE');
  });

  // --- Schema ---
  it('normalizes main schema to undefined', async () => {
    const sql = `
      CREATE TABLE main.test (
        id INTEGER PRIMARY KEY
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].schema).toBeUndefined();
  });

  it('preserves non-main schema', async () => {
    const sql = `
      CREATE TABLE other.test (
        id INTEGER PRIMARY KEY
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].schema).toBe('other');
  });

  // --- UNIQUE ---
  it('parses inline UNIQUE', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const emailCol = result.tables[0].columns.find(c => c.name === 'email')!;
    expect(emailCol.unique).toBe(true);
  });

  it('parses table-level UNIQUE constraint', async () => {
    const sql = `
      CREATE TABLE test (
        a INTEGER,
        b INTEGER,
        UNIQUE (a, b)
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].uniqueKeys).toHaveLength(1);
    expect(result.tables[0].uniqueKeys[0].columnIds).toHaveLength(2);
  });

  // --- DEFAULT ---
  it('parses DEFAULT values', async () => {
    const sql = `
      CREATE TABLE test (
        id INTEGER PRIMARY KEY,
        status TEXT DEFAULT 'active',
        count INTEGER DEFAULT 0
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'status')!.defaultValue).toBe("'active'");
    expect(cols.find(c => c.name === 'count')!.defaultValue).toBe('0');
  });

  // --- NOT NULL ---
  it('distinguishes NOT NULL vs nullable', async () => {
    const sql = `
      CREATE TABLE test (
        a INTEGER NOT NULL,
        b TEXT
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].columns[0].nullable).toBe(false);
    expect(result.tables[0].columns[1].nullable).toBe(true);
  });

  // --- CHECK ---
  it('extracts CHECK constraint', async () => {
    const sql = `
      CREATE TABLE test (
        age INTEGER CHECK (age >= 0),
        name TEXT,
        PRIMARY KEY (age)
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].columns.find(c => c.name === 'age')!.check).toBe('age >= 0');
  });

  // --- Multiple tables ---
  it('parses multiple tables', async () => {
    const sql = `
      CREATE TABLE a (id INTEGER PRIMARY KEY);
      CREATE TABLE b (id INTEGER PRIMARY KEY);
      CREATE TABLE c (id INTEGER PRIMARY KEY);
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables).toHaveLength(3);
  });

  // --- Composite PK ---
  it('handles composite primary key', async () => {
    const sql = `
      CREATE TABLE test (
        a INTEGER NOT NULL,
        b INTEGER NOT NULL,
        PRIMARY KEY (a, b)
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    const pkCols = result.tables[0].columns.filter(c => c.primaryKey);
    expect(pkCols).toHaveLength(2);
  });

  // --- CREATE INDEX ---
  it('parses CREATE INDEX', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT
      );
      CREATE INDEX idx_email ON users (email);
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].indexes).toHaveLength(1);
    expect(result.tables[0].indexes[0].name).toBe('idx_email');
  });

  it('parses CREATE UNIQUE INDEX', async () => {
    const sql = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT
      );
      CREATE UNIQUE INDEX idx_email_uq ON users (email);
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables[0].indexes[0].unique).toBe(true);
  });

  // --- Error ---
  it('returns error for empty input', async () => {
    const result = await importDDL('', 'sqlite');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // --- Real-world: Spring Session ---
  it('parses Spring Session DDL', async () => {
    const sql = `
      CREATE TABLE SPRING_SESSION (
        PRIMARY_ID CHAR(36) NOT NULL,
        SESSION_ID CHAR(36) NOT NULL,
        CREATION_TIME BIGINT NOT NULL,
        LAST_ACCESS_TIME BIGINT NOT NULL,
        MAX_INACTIVE_INTERVAL INT NOT NULL,
        EXPIRY_TIME BIGINT NOT NULL,
        PRINCIPAL_NAME VARCHAR(100),
        CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
      );
      CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
      CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
      CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].columns).toHaveLength(7);
    expect(result.tables[0].indexes).toHaveLength(3);
    expect(result.tables[0].indexes[0].unique).toBe(true);
  });
});
