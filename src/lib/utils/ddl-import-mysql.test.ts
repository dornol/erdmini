import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';
import { parseRefAction } from './ddl-import-types';

// ═════════════════════════════════════════════
// MySQL
// ═════════════════════════════════════════════
describe('importDDL — MySQL', () => {
  // --- Basic parsing ---
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

  // --- All column types ---
  it('parses all standard column types', async () => {
    const sql = `
      CREATE TABLE type_test (
        c_int INT,
        c_bigint BIGINT,
        c_smallint SMALLINT,
        c_varchar VARCHAR(100),
        c_char CHAR(10),
        c_text TEXT,
        c_boolean BOOLEAN,
        c_date DATE,
        c_datetime DATETIME,
        c_timestamp TIMESTAMP,
        c_decimal DECIMAL(10,2),
        c_float FLOAT,
        c_double DOUBLE,
        c_json JSON,
        c_uuid CHAR(36),
        c_enum ENUM('a','b','c')
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'c_int')!.type).toBe('INT');
    expect(cols.find(c => c.name === 'c_bigint')!.type).toBe('BIGINT');
    expect(cols.find(c => c.name === 'c_smallint')!.type).toBe('SMALLINT');
    expect(cols.find(c => c.name === 'c_varchar')!.type).toBe('VARCHAR');
    expect(cols.find(c => c.name === 'c_varchar')!.length).toBe(100);
    expect(cols.find(c => c.name === 'c_char')!.type).toBe('CHAR');
    expect(cols.find(c => c.name === 'c_text')!.type).toBe('TEXT');
    expect(cols.find(c => c.name === 'c_boolean')!.type).toBe('BOOLEAN');
    expect(cols.find(c => c.name === 'c_date')!.type).toBe('DATE');
    expect(cols.find(c => c.name === 'c_decimal')!.type).toBe('DECIMAL');
    expect(cols.find(c => c.name === 'c_decimal')!.length).toBe(10);
    expect(cols.find(c => c.name === 'c_decimal')!.scale).toBe(2);
    expect(cols.find(c => c.name === 'c_float')!.type).toBe('FLOAT');
    expect(cols.find(c => c.name === 'c_double')!.type).toBe('DOUBLE');
    expect(cols.find(c => c.name === 'c_json')!.type).toBe('JSON');
  });

  // --- MySQL-specific type aliases ---
  it('normalizes MySQL-specific types: TINYINT, MEDIUMINT, TINYTEXT, LONGTEXT, MEDIUMBLOB', async () => {
    const sql = `
      CREATE TABLE alias_test (
        a TINYINT,
        b MEDIUMINT,
        c TINYTEXT,
        d LONGTEXT,
        e MEDIUMBLOB
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'a')!.type).toBe('TINYINT');
    expect(cols.find(c => c.name === 'b')!.type).toBe('MEDIUMINT');
    expect(cols.find(c => c.name === 'c')!.type).toBe('TEXT');
    expect(cols.find(c => c.name === 'd')!.type).toBe('TEXT');
    expect(cols.find(c => c.name === 'e')!.type).toBe('BLOB');
  });

  // --- Primary Key ---
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

  it('handles inline PRIMARY KEY on column definition', async () => {
    const sql = `
      CREATE TABLE test (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const idCol = result.tables[0].columns.find(c => c.name === 'id')!;
    expect(idCol.primaryKey).toBe(true);
    expect(idCol.nullable).toBe(false);
  });

  // --- UNIQUE ---
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

  it('handles table-level UNIQUE constraint', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (email)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const emailCol = result.tables[0].columns.find(c => c.name === 'email')!;
    expect(emailCol.unique).toBe(true);
  });

  it('handles composite UNIQUE constraint', async () => {
    const sql = `
      CREATE TABLE user_roles (
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        UNIQUE (user_id, role_id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const t = result.tables[0];
    expect(t.uniqueKeys).toHaveLength(1);
    expect(t.uniqueKeys[0].columnIds).toHaveLength(2);
  });

  // --- Foreign Keys ---
  it('extracts inline foreign keys with ON DELETE/UPDATE', async () => {
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

  it('handles FK with SET NULL action', async () => {
    const sql = `
      CREATE TABLE parent (id INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE child (
        id INT NOT NULL,
        parent_id INT,
        PRIMARY KEY (id),
        FOREIGN KEY (parent_id) REFERENCES parent (id) ON DELETE SET NULL ON UPDATE CASCADE
      );
    `;
    const result = await importDDL(sql, 'mysql');
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys[0].onDelete).toBe('SET NULL');
    expect(child.foreignKeys[0].onUpdate).toBe('CASCADE');
  });

  it('handles FK with NO ACTION', async () => {
    const sql = `
      CREATE TABLE parent (id INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE child (
        id INT NOT NULL,
        parent_id INT NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (parent_id) REFERENCES parent (id) ON DELETE NO ACTION ON UPDATE NO ACTION
      );
    `;
    const result = await importDDL(sql, 'mysql');
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys[0].onDelete).toBe('NO ACTION');
    expect(child.foreignKeys[0].onUpdate).toBe('NO ACTION');
  });

  it('reports error for unresolved FK reference', async () => {
    const sql = `
      CREATE TABLE child (
        id INT NOT NULL,
        parent_id INT NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (parent_id) REFERENCES nonexistent (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // --- DEFAULT values ---
  it('extracts DEFAULT values', async () => {
    const sql = `
      CREATE TABLE settings (
        id INT NOT NULL AUTO_INCREMENT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const statusCol = result.tables[0].columns.find(c => c.name === 'status')!;
    expect(statusCol.defaultValue).toBe("'active'");
    const countCol = result.tables[0].columns.find(c => c.name === 'count')!;
    expect(countCol.defaultValue).toBe('0');
  });

  // --- COMMENT ---
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

  it('extracts table-level COMMENT from ENGINE clause', async () => {
    const sql = `
      CREATE TABLE items (
        id INT NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB COMMENT='Item master';
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables[0].comment).toBe('Item master');
  });

  // --- CHECK ---
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

  // --- INDEX ---
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

  it('extracts composite index', async () => {
    const sql = `
      CREATE TABLE logs (
        id INT NOT NULL,
        user_id INT,
        created_at DATETIME,
        PRIMARY KEY (id)
      );
      CREATE INDEX idx_user_date ON logs (user_id, created_at);
    `;
    const result = await importDDL(sql, 'mysql');
    const idx = result.tables[0].indexes[0];
    expect(idx.columnIds).toHaveLength(2);
  });

  // --- Multiple tables ---
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

  it('deduplicates table names', async () => {
    const sql = `
      CREATE TABLE users (id INT NOT NULL, PRIMARY KEY (id));
      CREATE TABLE users (id INT NOT NULL, PRIMARY KEY (id));
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[1].name).toBe('users_1');
  });

  // --- Error handling ---
  it('reports error for no CREATE TABLE statements', async () => {
    const result = await importDDL('SELECT 1;', 'mysql');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.tables).toHaveLength(0);
  });

  it('reports error for empty input', async () => {
    const result = await importDDL('', 'mysql');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('partially succeeds with mix of valid and invalid tables', async () => {
    const sql = `
      CREATE TABLE valid_table (id INT NOT NULL, PRIMARY KEY (id));
      THIS IS NOT SQL;
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables.length).toBeGreaterThanOrEqual(1);
    expect(result.tables[0].name).toBe('valid_table');
  });

  // --- Backtick quoting ---
  it('handles backtick-quoted identifiers', async () => {
    const sql = `
      CREATE TABLE \`my table\` (
        \`my column\` INT NOT NULL,
        PRIMARY KEY (\`my column\`)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    expect(result.tables[0].name).toBe('my table');
    expect(result.tables[0].columns[0].name).toBe('my column');
  });

  // --- Nullable ---
  it('distinguishes nullable vs NOT NULL columns', async () => {
    const sql = `
      CREATE TABLE test (
        a INT NOT NULL,
        b INT,
        c INT NULL,
        PRIMARY KEY (a)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'a')!.nullable).toBe(false);
    expect(cols.find(c => c.name === 'b')!.nullable).toBe(true);
    expect(cols.find(c => c.name === 'c')!.nullable).toBe(true);
  });

  // --- Composite FK ---
  it('resolves composite foreign key (multi-column)', async () => {
    const sql = `
      CREATE TABLE parent (
        a INT NOT NULL,
        b INT NOT NULL,
        PRIMARY KEY (a, b)
      );
      CREATE TABLE child (
        id INT PRIMARY KEY,
        pa INT,
        pb INT,
        FOREIGN KEY (pa, pb) REFERENCES parent(a, b)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toHaveLength(0);
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
    expect(child.foreignKeys[0].columnIds).toHaveLength(2);
    expect(child.foreignKeys[0].referencedColumnIds).toHaveLength(2);
  });

  // --- Grid position row wrapping ---
  it('wraps grid position to next row after IMPORT_GRID_COLS tables', async () => {
    const sql = Array.from({ length: 5 }, (_, i) =>
      `CREATE TABLE t${i} (id INT PRIMARY KEY);`
    ).join('\n');
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(5);
    // First 4 tables on row 0, 5th table on row 1
    const t0 = result.tables[0].position;
    const t4 = result.tables[4].position;
    expect(t4.y).toBeGreaterThan(t0.y);
    // 5th table should be back at the first column x
    expect(t4.x).toBe(t0.x);
  });

  // --- ENUM type ---
  it('preserves ENUM type and values', async () => {
    const sql = `CREATE TABLE t (id INT PRIMARY KEY, status ENUM('active','inactive'));`;
    const result = await importDDL(sql, 'mysql');
    const col = result.tables[0].columns.find(c => c.name === 'status')!;
    expect(col.type).toBe('ENUM');
  });

  // --- SMALLSERIAL with autoIncrement ---
  it('parses SMALLSERIAL as SMALLINT with autoIncrement', async () => {
    const sql = `CREATE TABLE t (id SMALLSERIAL PRIMARY KEY);`;
    const result = await importDDL(sql, 'postgresql');
    const col = result.tables[0].columns[0];
    expect(col.type).toBe('SMALLINT');
    expect(col.autoIncrement).toBe(true);
  });

  // --- ALTER TABLE UNIQUE via AST (non-MSSQL) ---
  it('handles ALTER TABLE ADD UNIQUE constraint', async () => {
    const sql = `
      CREATE TABLE t (id INT PRIMARY KEY, a INT, b INT);
      ALTER TABLE t ADD CONSTRAINT uq_ab UNIQUE (a, b);
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.tables[0].uniqueKeys).toHaveLength(1);
    expect(result.tables[0].uniqueKeys[0].columnIds).toHaveLength(2);
  });

  // --- Fallback per-statement parsing ---
  it('falls back to per-statement parsing when full parse fails', async () => {
    const sql = `
      CREATE TABLE valid1 (id INT PRIMARY KEY, name VARCHAR(50));
      INVALID SQL STATEMENT HERE;
      CREATE TABLE valid2 (id INT PRIMARY KEY);
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════
// MariaDB
// ═════════════════════════════════════════════
describe('importDDL — MariaDB', () => {
  it('parses basic CREATE TABLE with ENGINE=InnoDB', async () => {
    const sql = `
      CREATE TABLE \`users\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(100) NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE (\`email\`)
      ) ENGINE=InnoDB;
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.tables).toHaveLength(1);
    const table = result.tables[0];
    expect(table.name).toBe('users');
    expect(table.columns).toHaveLength(3);
    expect(table.columns[0].autoIncrement).toBe(true);
    expect(table.columns[0].primaryKey).toBe(true);
    expect(table.columns[2].unique).toBe(true);
  });

  it('parses inline FK with ON DELETE/UPDATE', async () => {
    const sql = `
      CREATE TABLE \`parent\` (
        \`id\` INT NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB;

      CREATE TABLE \`child\` (
        \`id\` INT NOT NULL,
        \`parent_id\` INT NOT NULL,
        PRIMARY KEY (\`id\`),
        FOREIGN KEY (\`parent_id\`) REFERENCES \`parent\` (\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT
      ) ENGINE=InnoDB;
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.tables).toHaveLength(2);
    const child = result.tables.find((t) => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
    expect(child.foreignKeys[0].onDelete).toBe('CASCADE');
    expect(child.foreignKeys[0].onUpdate).toBe('RESTRICT');
  });

  it('parses table and column comments', async () => {
    const sql = `
      CREATE TABLE \`items\` (
        \`id\` INT NOT NULL COMMENT 'Primary key',
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB COMMENT='Item table';
    `;
    const result = await importDDL(sql, 'mariadb');
    const table = result.tables[0];
    expect(table.comment).toBe('Item table');
    expect(table.columns[0].comment).toBe('Primary key');
  });

  it('parses all column types same as MySQL', async () => {
    const sql = `
      CREATE TABLE \`type_test\` (
        \`c_int\` INT,
        \`c_bigint\` BIGINT,
        \`c_varchar\` VARCHAR(100),
        \`c_text\` TEXT,
        \`c_boolean\` BOOLEAN,
        \`c_decimal\` DECIMAL(10,2),
        \`c_float\` FLOAT,
        \`c_json\` JSON,
        \`c_enum\` ENUM('x','y')
      );
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.errors).toHaveLength(0);
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'c_int')!.type).toBe('INT');
    expect(cols.find(c => c.name === 'c_bigint')!.type).toBe('BIGINT');
    expect(cols.find(c => c.name === 'c_varchar')!.type).toBe('VARCHAR');
    expect(cols.find(c => c.name === 'c_text')!.type).toBe('TEXT');
    expect(cols.find(c => c.name === 'c_decimal')!.type).toBe('DECIMAL');
  });

  it('handles CHECK constraint', async () => {
    const sql = `
      CREATE TABLE \`test\` (
        \`age\` INT NOT NULL CHECK (age >= 0),
        \`name\` VARCHAR(100),
        PRIMARY KEY (\`age\`)
      );
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.tables[0].columns.find(c => c.name === 'age')!.check).toBe('age >= 0');
  });

  it('handles DEFAULT value', async () => {
    const sql = `
      CREATE TABLE \`test\` (
        \`status\` VARCHAR(20) DEFAULT 'active'
      );
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.tables[0].columns[0].defaultValue).toBe("'active'");
  });

  it('extracts CREATE INDEX', async () => {
    const sql = `
      CREATE TABLE \`users\` (
        \`id\` INT NOT NULL,
        \`email\` VARCHAR(255),
        PRIMARY KEY (\`id\`)
      );
      CREATE INDEX idx_email ON users (email);
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.tables[0].indexes).toHaveLength(1);
  });
});
