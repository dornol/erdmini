import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';

describe('normalizeType', () => {
  it('maps SERIAL → INT', () => {
    expect(normalizeType('SERIAL')).toBe('INT');
  });

  it('maps BIGSERIAL → BIGINT', () => {
    expect(normalizeType('BIGSERIAL')).toBe('BIGINT');
  });

  it('maps INTEGER → INT', () => {
    expect(normalizeType('INTEGER')).toBe('INT');
  });

  it('maps TINYINT → SMALLINT', () => {
    expect(normalizeType('TINYINT')).toBe('SMALLINT');
  });

  it('maps MEDIUMINT → INT', () => {
    expect(normalizeType('MEDIUMINT')).toBe('INT');
  });

  it('maps BIT → BOOLEAN', () => {
    expect(normalizeType('BIT')).toBe('BOOLEAN');
  });

  it('maps BOOL → BOOLEAN', () => {
    expect(normalizeType('BOOL')).toBe('BOOLEAN');
  });

  it('maps DATETIME → TIMESTAMP', () => {
    expect(normalizeType('DATETIME')).toBe('TIMESTAMP');
  });

  it('maps DATETIME2 → TIMESTAMP', () => {
    expect(normalizeType('DATETIME2')).toBe('TIMESTAMP');
  });

  it('maps TIMESTAMPTZ → TIMESTAMP', () => {
    expect(normalizeType('TIMESTAMPTZ')).toBe('TIMESTAMP');
  });

  it('maps NUMERIC → DECIMAL', () => {
    expect(normalizeType('NUMERIC')).toBe('DECIMAL');
  });

  it('maps REAL → DECIMAL', () => {
    expect(normalizeType('REAL')).toBe('DECIMAL');
  });

  it('maps MONEY → DECIMAL', () => {
    expect(normalizeType('MONEY')).toBe('DECIMAL');
  });

  it('maps CHARACTER VARYING → VARCHAR', () => {
    expect(normalizeType('CHARACTER VARYING')).toBe('VARCHAR');
  });

  it('maps NVARCHAR → VARCHAR', () => {
    expect(normalizeType('NVARCHAR')).toBe('VARCHAR');
  });

  it('maps NCHAR → CHAR', () => {
    expect(normalizeType('NCHAR')).toBe('CHAR');
  });

  it('maps CHARACTER → CHAR', () => {
    expect(normalizeType('CHARACTER')).toBe('CHAR');
  });

  it('maps UNIQUEIDENTIFIER → UUID', () => {
    expect(normalizeType('UNIQUEIDENTIFIER')).toBe('UUID');
  });

  it('maps TINYTEXT → TEXT', () => {
    expect(normalizeType('TINYTEXT')).toBe('TEXT');
  });

  it('maps MEDIUMTEXT → TEXT', () => {
    expect(normalizeType('MEDIUMTEXT')).toBe('TEXT');
  });

  it('maps LONGTEXT → TEXT', () => {
    expect(normalizeType('LONGTEXT')).toBe('TEXT');
  });

  it('maps BLOB → TEXT', () => {
    expect(normalizeType('BLOB')).toBe('TEXT');
  });

  it('maps VARBINARY → TEXT', () => {
    expect(normalizeType('VARBINARY')).toBe('TEXT');
  });

  it('maps IMAGE → TEXT', () => {
    expect(normalizeType('IMAGE')).toBe('TEXT');
  });

  it('maps NVARCHAR(MAX) → TEXT (via MAX check)', () => {
    expect(normalizeType('NVARCHAR(MAX)')).toBe('TEXT');
  });

  it('keeps known types as-is: INT, VARCHAR, BOOLEAN, etc.', () => {
    expect(normalizeType('INT')).toBe('INT');
    expect(normalizeType('VARCHAR')).toBe('VARCHAR');
    expect(normalizeType('BOOLEAN')).toBe('BOOLEAN');
    expect(normalizeType('TEXT')).toBe('TEXT');
    expect(normalizeType('JSON')).toBe('JSON');
    expect(normalizeType('UUID')).toBe('UUID');
    expect(normalizeType('FLOAT')).toBe('FLOAT');
    expect(normalizeType('DOUBLE')).toBe('DOUBLE');
    expect(normalizeType('DATE')).toBe('DATE');
  });

  it('falls back to VARCHAR for unknown types', () => {
    expect(normalizeType('CUSTOM_TYPE')).toBe('VARCHAR');
  });

  it('is case-insensitive', () => {
    expect(normalizeType('serial')).toBe('INT');
    expect(normalizeType('Nvarchar')).toBe('VARCHAR');
  });

  it('strips length from base for normalization', () => {
    expect(normalizeType('NVARCHAR(50)')).toBe('VARCHAR');
    expect(normalizeType('DECIMAL(10,2)')).toBe('DECIMAL');
  });
});

describe('importDDL — MySQL', () => {
  it('parses a basic CREATE TABLE', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        PRIMARY KEY (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(1);
    const t = result.tables[0];
    expect(t.name).toBe('users');
    expect(t.columns).toHaveLength(3);

    const idCol = t.columns.find((c) => c.name === 'id')!;
    expect(idCol.primaryKey).toBe(true);
    expect(idCol.autoIncrement).toBe(true);
    expect(idCol.nullable).toBe(false);
    expect(idCol.type).toBe('INT');

    const nameCol = t.columns.find((c) => c.name === 'name')!;
    expect(nameCol.type).toBe('VARCHAR');
    expect(nameCol.nullable).toBe(false);
  });

  it('extracts inline foreign keys', async () => {
    const sql = `
      CREATE TABLE departments (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        PRIMARY KEY (id)
      );

      CREATE TABLE employees (
        id INT NOT NULL AUTO_INCREMENT,
        dept_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (dept_id) REFERENCES departments (id)
          ON DELETE CASCADE ON UPDATE RESTRICT
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(2);
    const emp = result.tables.find((t) => t.name === 'employees')!;
    expect(emp.foreignKeys).toHaveLength(1);
    const fk = emp.foreignKeys[0];
    expect(fk.onDelete).toBe('CASCADE');
    expect(fk.onUpdate).toBe('RESTRICT');

    const dept = result.tables.find((t) => t.name === 'departments')!;
    const refColId = fk.referencedColumnIds[0];
    expect(dept.columns.some((c) => c.id === refColId)).toBe(true);
  });

  it('handles composite primary key', async () => {
    const sql = `
      CREATE TABLE order_items (
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        PRIMARY KEY (order_id, product_id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const t = result.tables[0];
    const pkCols = t.columns.filter((c) => c.primaryKey);
    expect(pkCols).toHaveLength(2);
    expect(pkCols.map((c) => c.name)).toEqual(['order_id', 'product_id']);
  });

  it('extracts inline CHECK constraint from raw SQL', async () => {
    const sql = `
      CREATE TABLE products (
        id INT NOT NULL AUTO_INCREMENT,
        price DECIMAL(10,2) NOT NULL CHECK (price > 0),
        PRIMARY KEY (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const priceCol = result.tables[0].columns.find((c) => c.name === 'price')!;
    expect(priceCol.check).toBe('price > 0');
  });

  it('extracts CREATE INDEX statements', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255),
        PRIMARY KEY (id)
      );
      CREATE INDEX idx_email ON users (email);
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const t = result.tables[0];
    expect(t.indexes).toHaveLength(1);
    expect(t.indexes[0].name).toBe('idx_email');
    expect(t.indexes[0].unique).toBe(false);
  });

  it('extracts CREATE UNIQUE INDEX', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255),
        PRIMARY KEY (id)
      );
      CREATE UNIQUE INDEX idx_email_unique ON users (email);
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const t = result.tables[0];
    expect(t.indexes).toHaveLength(1);
    expect(t.indexes[0].unique).toBe(true);
  });

  it('reports error for no CREATE TABLE statements', async () => {
    const result = await importDDL('SELECT 1;', 'mysql');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.tables).toHaveLength(0);
  });

  it('extracts inline UNIQUE column', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE,
        PRIMARY KEY (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const emailCol = result.tables[0].columns.find((c) => c.name === 'email')!;
    expect(emailCol.unique).toBe(true);
  });

  it('extracts inline COMMENT', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
        PRIMARY KEY (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const idCol = result.tables[0].columns.find((c) => c.name === 'id')!;
    expect(idCol.comment).toBe('Primary key');
  });

  it('assigns grid positions to multiple tables', async () => {
    const sql = `
      CREATE TABLE a (id INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE b (id INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE c (id INT NOT NULL, PRIMARY KEY (id));
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(3);
    const positions = result.tables.map((t) => t.position);
    const uniquePositions = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(uniquePositions.size).toBe(3);
  });
});

describe('importDDL — PostgreSQL', () => {
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
});
