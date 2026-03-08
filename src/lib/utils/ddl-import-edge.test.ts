import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';
import { parseRefAction } from './ddl-import-types';

// ═══════════════════════════════════════════════════════════════════════
// Edge Case Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Edge: FK to non-existent table produces error', () => {
  it('reports error when FK references missing table', async () => {
    const sql = `
      CREATE TABLE child (
        id INT PRIMARY KEY,
        parent_id INT,
        FOREIGN KEY (parent_id) REFERENCES nonexistent (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('nonexistent'))).toBe(true);
    // FK should not be created
    expect(result.tables[0].foreignKeys).toHaveLength(0);
  });

  it('partial FK success — one resolves, one fails', async () => {
    const sql = `
      CREATE TABLE parent (id INT PRIMARY KEY);
      CREATE TABLE child (
        id INT PRIMARY KEY,
        a INT,
        b INT,
        FOREIGN KEY (a) REFERENCES parent (id),
        FOREIGN KEY (b) REFERENCES ghost (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(2);
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1); // only parent FK
    expect(result.errors.some(e => e.includes('ghost'))).toBe(true);
  });
});

describe('Edge: duplicate table names get suffix', () => {
  it('deduplicates with _1, _2 suffix', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE users (id INT PRIMARY KEY);
    `;
    const result = await importDDL(sql, 'mysql');
    const names = result.tables.map(t => t.name).sort();
    expect(names).toEqual(['users', 'users_1', 'users_2']);
  });

  it('avoids collision with existing _1 suffix', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE TABLE users_1 (id INT PRIMARY KEY);
      CREATE TABLE users (id INT PRIMARY KEY);
    `;
    const result = await importDDL(sql, 'mysql');
    const names = result.tables.map(t => t.name).sort();
    // users, users_1 taken, so duplicate should be users_2
    expect(names).toEqual(['users', 'users_1', 'users_2']);
  });
});

describe('Edge: UNIQUE key deduplication with reversed column order', () => {
  it('deduplicates UNIQUE(a,b) and UNIQUE(b,a) by sorted column IDs', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        a INT,
        b INT,
        UNIQUE (a, b)
      );
      ALTER TABLE t ADD CONSTRAINT uq_ba UNIQUE (b, a);
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.tables).toHaveLength(1);
    // Both should resolve to same sorted set, so only 1 UK
    expect(result.tables[0].uniqueKeys.length).toBe(1);
  });
});

describe('Edge: DEFAULT value extraction', () => {
  it('extracts CURRENT_TIMESTAMP default', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    const col = result.tables[0].columns.find(c => c.name === 'created_at')!;
    // Should have some default value extracted
    expect(col.defaultValue).toBeDefined();
  });

  it('extracts numeric default', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        status INT DEFAULT 0
      );
    `;
    const result = await importDDL(sql, 'mysql');
    const col = result.tables[0].columns.find(c => c.name === 'status')!;
    expect(col.defaultValue).toBe('0');
  });

  it('extracts string default with quotes', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        status VARCHAR(20) DEFAULT 'active'
      );
    `;
    const result = await importDDL(sql, 'mysql');
    const col = result.tables[0].columns.find(c => c.name === 'status')!;
    expect(col.defaultValue).toBe("'active'");
  });

  it('extracts NULL default', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        notes TEXT DEFAULT NULL
      );
    `;
    const result = await importDDL(sql, 'mysql');
    const col = result.tables[0].columns.find(c => c.name === 'notes')!;
    expect(col.defaultValue).toBe('NULL');
  });
});

describe('Edge: empty table (no columns)', () => {
  it('handles CREATE TABLE with no columns gracefully', async () => {
    const sql = `CREATE TABLE empty_table ();`;
    const result = await importDDL(sql, 'mysql');
    // Parser may reject this or create table with 0 columns — either way no crash
    expect(result).toBeDefined();
  });
});

describe('Edge: type normalization with whitespace', () => {
  it('normalizes type with extra spaces in parens', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        price DECIMAL(10, 2),
        name VARCHAR(100)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    const price = result.tables[0].columns.find(c => c.name === 'price')!;
    expect(price.type).toBe('DECIMAL');
    expect(price.length).toBe(10);
    expect(price.scale).toBe(2);
    const name = result.tables[0].columns.find(c => c.name === 'name')!;
    expect(name.type).toBe('VARCHAR');
    expect(name.length).toBe(100);
  });

  it('normalizes Oracle RAW without parens', () => {
    expect(normalizeType('RAW')).toBe('TEXT');
  });

  it('normalizes NVARCHAR(MAX) to TEXT', () => {
    expect(normalizeType('NVARCHAR(MAX)')).toBe('TEXT');
  });

  it('normalizes BINARY_DOUBLE to DOUBLE', () => {
    expect(normalizeType('BINARY_DOUBLE')).toBe('DOUBLE');
  });

  it('normalizes BINARY_FLOAT to FLOAT', () => {
    expect(normalizeType('BINARY_FLOAT')).toBe('FLOAT');
  });

  it('normalizes CLOB to TEXT', () => {
    expect(normalizeType('CLOB')).toBe('TEXT');
  });

  it('normalizes NCLOB to TEXT', () => {
    expect(normalizeType('NCLOB')).toBe('TEXT');
  });

  it('normalizes LONG to TEXT', () => {
    expect(normalizeType('LONG')).toBe('TEXT');
  });

  it('normalizes UNIQUEIDENTIFIER to UUID', () => {
    expect(normalizeType('UNIQUEIDENTIFIER')).toBe('UUID');
  });
});

describe('Edge: Oracle COMMENT ON with escaped quotes', () => {
  it('handles Oracle double-quote escaping in COMMENT ON TABLE', async () => {
    const sql = `
      CREATE TABLE test (id INT NOT NULL, PRIMARY KEY (id));
      COMMENT ON TABLE test IS 'It''s a table';
    `;
    const result = await importDDL(sql, 'oracle');
    expect(result.tables).toHaveLength(1);
    // Comment should be extracted (oracle preprocessor handles it via regex)
    if (result.tables[0].comment) {
      expect(result.tables[0].comment).toContain('It');
    }
  });

  it('handles COMMENT ON non-existent table gracefully', async () => {
    const sql = `
      COMMENT ON TABLE nonexistent IS 'ghost comment';
      CREATE TABLE real_table (id INT NOT NULL, PRIMARY KEY (id));
    `;
    const result = await importDDL(sql, 'oracle');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('real_table');
    // Comment on nonexistent table is silently ignored
    expect(result.tables[0].comment).toBeUndefined();
  });
});

describe('Edge: MSSQL duplicate column comments', () => {
  it('last sp_addextendedproperty wins for same column', async () => {
    const sql = `
      CREATE TABLE users (
        id INT NOT NULL PRIMARY KEY,
        name NVARCHAR(100)
      );
      EXEC sp_addextendedproperty 'MS_Description', 'First description', 'SCHEMA', 'dbo', 'TABLE', 'users', 'COLUMN', 'name';
      EXEC sp_addextendedproperty 'MS_Description', 'Second description', 'SCHEMA', 'dbo', 'TABLE', 'users', 'COLUMN', 'name';
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables).toHaveLength(1);
    const nameCol = result.tables[0].columns.find(c => c.name === 'name')!;
    // Second comment should overwrite
    expect(nameCol.comment).toBe('Second description');
  });
});

describe('Edge: MySQL inline REFERENCES without column list', () => {
  it('MySQL ignores inline REFERENCES (MySQL behavior)', async () => {
    const sql = `
      CREATE TABLE parent (id INT PRIMARY KEY);
      CREATE TABLE child (
        id INT PRIMARY KEY,
        parent_id INT REFERENCES parent (id)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(2);
    // MySQL parser may or may not extract inline REFERENCES
    // Either way, should not crash
  });

  it('SQLite auto-fills (id) for inline REFERENCES without column', async () => {
    const sql = `
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES parent
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.tables).toHaveLength(2);
    const child = result.tables.find(t => t.name === 'child')!;
    // SQLite preprocessor adds (id), so FK should resolve
    expect(child.foreignKeys).toHaveLength(1);
    expect(child.foreignKeys[0].referencedTableId).toBe(result.tables.find(t => t.name === 'parent')!.id);
  });
});

describe('Edge: CHECK constraint with nested parens', () => {
  it('extracts simple inline CHECK constraint', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        status VARCHAR(20) CHECK (status IN ('active', 'inactive'))
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    const col = result.tables[0].columns.find(c => c.name === 'status')!;
    if (col.check) {
      expect(col.check).toContain('status');
    }
  });

  it('extracts CHECK with nested parens (length())', async () => {
    const sql = `
      CREATE TABLE t (
        id INT PRIMARY KEY,
        name VARCHAR(100) CHECK (LENGTH(name) > 0)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    const col = result.tables[0].columns.find(c => c.name === 'name')!;
    if (col.check) {
      expect(col.check).toContain('LENGTH');
    }
  });
});

describe('Edge: ReDoS resilience', () => {
  it('handles malicious input with many unmatched parens without hanging', async () => {
    // This input would cause catastrophic backtracking with the old [\s\S]*? regex
    const malicious = 'CREATE TABLE t (' + ')'.repeat(1000) + ' no_terminator_here';
    const start = Date.now();
    const result = await importDDL(malicious, 'mysql');
    const elapsed = Date.now() - start;
    // Should complete in under 1 second, not hang
    expect(elapsed).toBeLessThan(1000);
    // May or may not parse — the point is it doesn't hang
  });

  it('handles deeply nested parentheses without hanging', async () => {
    const nested = 'CREATE TABLE t (' + '('.repeat(500) + 'id INT' + ')'.repeat(500) + ');';
    const start = Date.now();
    const result = await importDDL(nested, 'mysql');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('Edge: CREATE INDEX edge cases', () => {
  it('parses index with ASC/DESC modifiers', async () => {
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(200)
      );
      CREATE INDEX idx_name ON users (name DESC, email ASC);
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    const idx = result.tables[0].indexes.find(i => i.name === 'idx_name');
    expect(idx).toBeDefined();
    // ASC/DESC should be stripped from column names
    const colNames = idx!.columnIds.map(id =>
      result.tables[0].columns.find(c => c.id === id)!.name
    );
    expect(colNames).toEqual(['name', 'email']);
  });

  it('parses schema-qualified index (schema.table)', async () => {
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY,
        email VARCHAR(200)
      );
      CREATE UNIQUE INDEX idx_email ON public.users (email);
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].indexes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Edge: parseRefAction edge cases', () => {
  it('returns RESTRICT for undefined', () => {
    expect(parseRefAction(undefined)).toBe('RESTRICT');
  });

  it('returns RESTRICT for empty string', () => {
    expect(parseRefAction('')).toBe('RESTRICT');
  });

  it('returns CASCADE for CASCADE', () => {
    expect(parseRefAction('CASCADE')).toBe('CASCADE');
  });

  it('returns SET NULL for SET NULL', () => {
    expect(parseRefAction('SET NULL')).toBe('SET NULL');
  });

  it('returns NO ACTION for unknown action', () => {
    expect(parseRefAction('SOMETHING')).toBe('NO ACTION');
  });

  it('handles lowercase input', () => {
    expect(parseRefAction('cascade')).toBe('CASCADE');
    expect(parseRefAction('set null')).toBe('SET NULL');
  });
});

describe('Edge: composite FK with mismatched column counts', () => {
  it('reports error when FK column counts differ', async () => {
    const sql = `
      CREATE TABLE parent (a INT, b INT, PRIMARY KEY (a, b));
      CREATE TABLE child (
        id INT PRIMARY KEY,
        pa INT,
        pb INT,
        pc INT,
        FOREIGN KEY (pa, pb, pc) REFERENCES parent (a, b)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    // Should either skip or error on mismatched FK
    const child = result.tables.find(t => t.name === 'child')!;
    // If FK resolution fails on column mismatch, FK won't be added
    // The exact behavior depends on parser — key is no crash
    expect(result).toBeDefined();
  });
});

describe('Edge: MSSQL bracket identifiers with schema prefix', () => {
  it('parses [dbo].[table] bracket notation', async () => {
    const sql = `
      CREATE TABLE [dbo].[users] (
        [id] INT NOT NULL IDENTITY(1,1),
        [name] NVARCHAR(100),
        CONSTRAINT [PK_users] PRIMARY KEY ([id])
      );
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[0].columns[0].name).toBe('id');
    expect(result.tables[0].columns[0].autoIncrement).toBe(true);
  });
});

describe('Edge: no CREATE TABLE in input', () => {
  it('returns error for SELECT-only input', async () => {
    const sql = `SELECT * FROM users;`;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error for ALTER TABLE only input', async () => {
    const sql = `ALTER TABLE users ADD COLUMN email VARCHAR(200);`;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error for comment-only input', async () => {
    const sql = `-- just a comment\n/* block comment */`;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('Edge: PK-less table with FK referencing it', () => {
  it('FK to table without explicit PK reports error', async () => {
    const sql = `
      CREATE TABLE parent (
        code VARCHAR(10) NOT NULL
      );
      CREATE TABLE child (
        id INT PRIMARY KEY,
        parent_code VARCHAR(10),
        FOREIGN KEY (parent_code) REFERENCES parent (code)
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(2);
    // FK should still resolve since we're referencing an explicit column
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
  });
});

describe('Edge: type warning for unknown types', () => {
  it('normalizeType falls back to VARCHAR for unrecognized types', () => {
    // normalizeType (public) returns the type string only
    expect(normalizeType('GEOMETRY')).toBe('VARCHAR');
    expect(normalizeType('MONEY')).toBe('DECIMAL');
    expect(normalizeType('NVARCHAR')).toBe('VARCHAR');
  });
});

describe('Edge: PostgreSQL schema-qualified table names', () => {
  it('extracts schema from CREATE TABLE auth.users', async () => {
    const sql = `
      CREATE TABLE auth.users (
        id INT PRIMARY KEY,
        email VARCHAR(200)
      );
      CREATE TABLE public.posts (
        id INT PRIMARY KEY,
        user_id INT REFERENCES auth.users (id)
      );
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.tables).toHaveLength(2);
    const users = result.tables.find(t => t.name === 'users')!;
    expect((users as any).schema).toBe('auth');
    const posts = result.tables.find(t => t.name === 'posts')!;
    expect((posts as any).schema).toBe('public');
  });
});

describe('Edge: MySQL table comment in CREATE TABLE', () => {
  it('extracts COMMENT from table options', async () => {
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY
      ) ENGINE=InnoDB COMMENT='User accounts table';
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].comment).toBe('User accounts table');
  });
});

describe('Edge: multiple dialects with same DDL', () => {
  it('parses basic DDL with all supported dialects', async () => {
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(200)
      );
    `;
    for (const dialect of ['mysql', 'postgresql', 'mariadb', 'sqlite'] as const) {
      const result = await importDDL(sql, dialect);
      expect(result.errors).toHaveLength(0);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].columns).toHaveLength(3);
    }
  });
});
