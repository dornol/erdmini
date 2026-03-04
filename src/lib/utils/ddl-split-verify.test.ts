import { describe, it, expect } from 'vitest';

// 분리된 모듈 직접 import
import { parseRefAction, DEFAULT_MESSAGES } from './ddl-import-types';
import type { DDLImportMessages, ParsedFK, ImportResult, ParsedIndex } from './ddl-import-types';
import { unwrapDefaultParens, cleanMSSQLSyntax, preprocessMSSQL, cleanMSSQLStatement } from './ddl-import-mssql';
import type { MSSQLAlterFK, MSSQLAlterUQ, MSSQLPreprocessResult } from './ddl-import-mssql';
import { cleanOracleSyntax, preprocessOracle, preprocessH2 } from './ddl-import-oracle';
import type { OraclePreprocessResult, H2PreprocessResult } from './ddl-import-oracle';

// 기존 경로 re-export 검증
import { normalizeType, importDDL } from './ddl-import';
import type { DDLImportMessages as ReExportedMessages, ImportResult as ReExportedResult } from './ddl-import';

// ═══════════════════════════════════════════════
// ddl-import-types.ts
// ═══════════════════════════════════════════════
describe('ddl-import-types', () => {
  describe('parseRefAction', () => {
    it('returns RESTRICT for undefined', () => {
      expect(parseRefAction(undefined)).toBe('RESTRICT');
    });
    it('returns RESTRICT for empty string (treated as falsy after trim)', () => {
      // '' → trim → '' → toUpperCase → '' → no match → falls through to NO ACTION
      // But wait: '' is truthy in JS? No, '' is falsy. So !raw returns true → RESTRICT
      expect(parseRefAction('')).toBe('RESTRICT');
    });
    it('returns CASCADE', () => {
      expect(parseRefAction('CASCADE')).toBe('CASCADE');
    });
    it('returns SET NULL', () => {
      expect(parseRefAction('SET NULL')).toBe('SET NULL');
    });
    it('returns RESTRICT', () => {
      expect(parseRefAction('RESTRICT')).toBe('RESTRICT');
    });
    it('returns NO ACTION for unknown values', () => {
      expect(parseRefAction('SOMETHING')).toBe('NO ACTION');
      expect(parseRefAction('NO ACTION')).toBe('NO ACTION');
      expect(parseRefAction('SET DEFAULT')).toBe('NO ACTION');
    });
    it('is case-insensitive', () => {
      expect(parseRefAction('cascade')).toBe('CASCADE');
      expect(parseRefAction('set null')).toBe('SET NULL');
      expect(parseRefAction('restrict')).toBe('RESTRICT');
    });
    it('trims whitespace', () => {
      expect(parseRefAction('  CASCADE  ')).toBe('CASCADE');
      expect(parseRefAction('\tSET NULL\n')).toBe('SET NULL');
    });
  });

  describe('DEFAULT_MESSAGES', () => {
    it('has all three message functions', () => {
      expect(typeof DEFAULT_MESSAGES.noCreateTable).toBe('function');
      expect(typeof DEFAULT_MESSAGES.tableParseError).toBe('function');
      expect(typeof DEFAULT_MESSAGES.fkResolveFailed).toBe('function');
    });
    it('noCreateTable returns expected string', () => {
      expect(DEFAULT_MESSAGES.noCreateTable()).toBe('No CREATE TABLE statements found.');
    });
    it('tableParseError includes error', () => {
      const msg = DEFAULT_MESSAGES.tableParseError({ error: 'syntax error at line 5' });
      expect(msg).toContain('syntax error at line 5');
      expect(msg).toContain('Table parse error');
    });
    it('fkResolveFailed includes detail', () => {
      const msg = DEFAULT_MESSAGES.fkResolveFailed({ detail: 'orders.user_id → users' });
      expect(msg).toContain('orders.user_id → users');
      expect(msg).toContain('FK resolve failed');
    });
  });

  describe('type exports', () => {
    it('DDLImportMessages type is compatible', () => {
      const msgs: DDLImportMessages = DEFAULT_MESSAGES;
      expect(msgs).toBe(DEFAULT_MESSAGES);
    });
    it('ParsedFK type shape', () => {
      const fk: ParsedFK = {
        columnNames: ['user_id'],
        refTableName: 'users',
        refColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT',
      };
      expect(fk.columnNames).toEqual(['user_id']);
    });
    it('ImportResult type shape', () => {
      const result: ImportResult = { tables: [], errors: [], warnings: [] };
      expect(result.tables).toEqual([]);
    });
    it('ParsedIndex type shape', () => {
      const idx: ParsedIndex = { tableName: 't', columnNames: ['a'], unique: false };
      expect(idx.unique).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════
// ddl-import-mssql.ts — unwrapDefaultParens
// ═══════════════════════════════════════════════
describe('unwrapDefaultParens', () => {
  it('unwraps DEFAULT ((0)) → DEFAULT 0', () => {
    expect(unwrapDefaultParens('DEFAULT ((0))')).toBe('DEFAULT 0');
  });
  it('unwraps DEFAULT (getdate()) → DEFAULT getdate()', () => {
    expect(unwrapDefaultParens('DEFAULT (getdate())')).toBe('DEFAULT getdate()');
  });
  it('handles no DEFAULT', () => {
    expect(unwrapDefaultParens('col INT NOT NULL')).toBe('col INT NOT NULL');
  });
  it('unwraps triple-nested DEFAULT (((1))) → DEFAULT 1', () => {
    expect(unwrapDefaultParens('DEFAULT (((1)))')).toBe('DEFAULT 1');
  });
  it('unwraps DEFAULT with string value', () => {
    const result = unwrapDefaultParens("DEFAULT ('active')");
    expect(result).toBe("DEFAULT 'active'");
  });
  it('handles multiple DEFAULTs in one string', () => {
    const input = 'col1 DEFAULT ((0)), col2 DEFAULT ((1))';
    const result = unwrapDefaultParens(input);
    expect(result).toContain('DEFAULT 0');
    expect(result).toContain('DEFAULT 1');
  });
  it('preserves unbalanced parens (no infinite loop)', () => {
    const input = 'DEFAULT ((0)';
    const result = unwrapDefaultParens(input);
    expect(result).toBeDefined();
  });
  it('handles DEFAULT with function call containing commas', () => {
    const result = unwrapDefaultParens('DEFAULT (newid())');
    expect(result).toBe('DEFAULT newid()');
  });
  it('is case-insensitive (matches lowercase, replaces with uppercase DEFAULT)', () => {
    // regex replaces with 'DEFAULT ' literal, so casing changes
    expect(unwrapDefaultParens('default ((5))')).toBe('DEFAULT 5');
  });
});

// ═══════════════════════════════════════════════
// ddl-import-mssql.ts — cleanMSSQLSyntax
// ═══════════════════════════════════════════════
describe('cleanMSSQLSyntax', () => {
  // --- Comment stripping ---
  it('strips single-line comments', () => {
    expect(cleanMSSQLSyntax('col INT -- this is a comment\nnext')).not.toContain('comment');
  });
  it('strips block comments', () => {
    expect(cleanMSSQLSyntax('col /* block\ncomment */ INT')).not.toContain('block');
  });
  it('strips multiline block comments', () => {
    const sql = `/* This is
    a multiline
    comment */ CREATE TABLE t (id INT)`;
    expect(cleanMSSQLSyntax(sql)).not.toContain('multiline');
    expect(cleanMSSQLSyntax(sql)).toContain('CREATE TABLE');
  });

  // --- Identifier cleanup ---
  it('strips bracket identifiers', () => {
    const result = cleanMSSQLSyntax('[Users].[id]');
    expect(result).not.toContain('[');
    expect(result).not.toContain(']');
    expect(result).toContain('Users');
    expect(result).toContain('id');
  });
  it('strips dbo. prefix', () => {
    expect(cleanMSSQLSyntax('dbo.Users')).not.toMatch(/dbo\./i);
    expect(cleanMSSQLSyntax('DBO.Users')).not.toMatch(/DBO\./i);
  });
  it("strips N' Unicode prefix", () => {
    expect(cleanMSSQLSyntax("N'hello'")).toBe("'hello'");
  });
  it('strips named constraint prefix', () => {
    const result = cleanMSSQLSyntax('CONSTRAINT PK_Users PRIMARY KEY');
    expect(result).not.toContain('CONSTRAINT');
    expect(result).not.toContain('PK_Users');
    expect(result.toLowerCase()).toContain('primary key');
  });

  // --- IDENTITY ---
  it('converts IDENTITY(1,1) to identity', () => {
    const result = cleanMSSQLSyntax('IDENTITY(1,1)');
    expect(result.toLowerCase()).toBe('identity');
  });
  it('converts IDENTITY (100, 1) with spaces to identity', () => {
    const result = cleanMSSQLSyntax('IDENTITY (100, 1)');
    expect(result.toLowerCase()).toBe('identity');
  });
  it('strips NOT FOR REPLICATION', () => {
    expect(cleanMSSQLSyntax('IDENTITY(1,1) NOT FOR REPLICATION')).not.toMatch(/REPLICATION/i);
  });

  // --- MAX types ---
  it('converts nvarchar(max) to nvarchar(4000)', () => {
    expect(cleanMSSQLSyntax('nvarchar(max)')).toContain('nvarchar(4000)');
  });
  it('converts varchar(max) to varchar(8000)', () => {
    expect(cleanMSSQLSyntax('varchar(max)')).toContain('varchar(8000)');
  });
  it('converts varbinary(max) to varbinary(8000)', () => {
    expect(cleanMSSQLSyntax('varbinary(max)')).toContain('varbinary(8000)');
  });

  // --- Type conversions ---
  it('converts datetime2(7) to datetime', () => {
    expect(cleanMSSQLSyntax('datetime2(7)').trim()).toBe('datetime');
  });
  it('converts datetimeoffset(7) to datetime', () => {
    expect(cleanMSSQLSyntax('datetimeoffset(7)').trim()).toBe('datetime');
  });
  it('converts bare datetime2 to datetime', () => {
    expect(cleanMSSQLSyntax('datetime2').trim()).toBe('datetime');
  });
  it('converts smalldatetime to datetime', () => {
    expect(cleanMSSQLSyntax('smalldatetime').trim()).toBe('datetime');
  });
  it('converts time(7) to time', () => {
    expect(cleanMSSQLSyntax('time(7)').trim()).toBe('time');
  });
  it('converts hierarchyid to varchar(900)', () => {
    expect(cleanMSSQLSyntax('hierarchyid').trim()).toBe('varchar(900)');
  });
  it('converts sql_variant to varchar(8000)', () => {
    expect(cleanMSSQLSyntax('sql_variant').trim()).toBe('varchar(8000)');
  });
  it('converts sysname to nvarchar(128)', () => {
    expect(cleanMSSQLSyntax('sysname').trim()).toBe('nvarchar(128)');
  });
  it('converts ntext to text', () => {
    expect(cleanMSSQLSyntax('ntext').trim()).toBe('text');
  });
  it('converts xml to text', () => {
    expect(cleanMSSQLSyntax('xml').trim()).toBe('text');
  });
  it('converts geography to text', () => {
    expect(cleanMSSQLSyntax('geography').trim()).toBe('text');
  });
  it('converts geometry to text', () => {
    expect(cleanMSSQLSyntax('geometry').trim()).toBe('text');
  });
  it('converts uniqueidentifier to char(36)', () => {
    expect(cleanMSSQLSyntax('uniqueidentifier').trim()).toBe('char(36)');
  });
  it('converts smallmoney to decimal(10,4)', () => {
    expect(cleanMSSQLSyntax('smallmoney').trim()).toBe('decimal(10,4)');
  });
  it('converts money to decimal(19,4)', () => {
    expect(cleanMSSQLSyntax('money').trim()).toBe('decimal(19,4)');
  });

  // --- Keyword stripping ---
  it('strips CHECK constraints with balanced parens', () => {
    const result = cleanMSSQLSyntax('col INT CHECK (col > 0 AND col < 100)');
    expect(result).not.toMatch(/CHECK/i);
    expect(result).not.toContain('col > 0');
  });
  it('strips CHECK with nested parens', () => {
    const result = cleanMSSQLSyntax('col INT CHECK ((col > 0) AND (col < 100))');
    expect(result).not.toMatch(/CHECK/i);
  });
  it('strips computed column with AS (...)', () => {
    const result = cleanMSSQLSyntax('full_name AS (first_name + last_name)');
    expect(result).not.toContain('first_name');
  });
  it('strips computed column without parens', () => {
    const result = cleanMSSQLSyntax(', computed_col as col1 + col2');
    expect(result).not.toContain('computed_col');
  });
  it('strips NONCLUSTERED keyword', () => {
    expect(cleanMSSQLSyntax('NONCLUSTERED PRIMARY KEY')).not.toMatch(/NONCLUSTERED/i);
  });
  it('strips CLUSTERED keyword', () => {
    expect(cleanMSSQLSyntax('CLUSTERED PRIMARY KEY')).not.toMatch(/\bCLUSTERED\b/i);
  });
  it('strips INCLUDE (...)', () => {
    expect(cleanMSSQLSyntax('INCLUDE (col1, col2)')).not.toMatch(/INCLUDE/i);
  });
  it('strips WITH (...) options', () => {
    expect(cleanMSSQLSyntax('WITH (PAD_INDEX = ON)')).not.toMatch(/PAD_INDEX/i);
  });
  it('strips WHERE (...) filter', () => {
    expect(cleanMSSQLSyntax('WHERE (status = 1)')).not.toMatch(/WHERE/i);
  });
  it('strips ASC/DESC', () => {
    expect(cleanMSSQLSyntax('id ASC, name DESC')).not.toMatch(/\b(ASC|DESC)\b/i);
  });
  it('strips TEXTIMAGE_ON', () => {
    expect(cleanMSSQLSyntax('TEXTIMAGE_ON PRIMARY')).not.toMatch(/TEXTIMAGE_ON/i);
  });
  it('strips ROWGUIDCOL', () => {
    expect(cleanMSSQLSyntax('col uniqueidentifier ROWGUIDCOL')).not.toMatch(/ROWGUIDCOL/i);
  });
  it('strips SPARSE', () => {
    expect(cleanMSSQLSyntax('col INT SPARSE')).not.toMatch(/SPARSE/i);
  });
  it('strips PERSISTED', () => {
    expect(cleanMSSQLSyntax('col AS (a+b) PERSISTED')).not.toMatch(/PERSISTED/i);
  });
  it('strips FILESTREAM', () => {
    expect(cleanMSSQLSyntax('col VARBINARY(MAX) FILESTREAM')).not.toMatch(/FILESTREAM/i);
  });
  it('strips bare REFERENCES without column list', () => {
    const result = cleanMSSQLSyntax('col INT REFERENCES Users');
    expect(result).not.toMatch(/REFERENCES/i);
  });
  it('strips MASKED WITH (FUNCTION = ...)', () => {
    const result = cleanMSSQLSyntax("col VARCHAR(100) MASKED WITH (FUNCTION = 'partial(1,\"X\",1)')");
    expect(result).not.toMatch(/MASKED/i);
    expect(result).not.toMatch(/FUNCTION/i);
  });

  // --- Syntax fixups ---
  it('fixes trailing comma before closing paren', () => {
    expect(cleanMSSQLSyntax('(a, b,\n)')).toContain('(a, b\n)');
  });
  it('fixes double commas', () => {
    const result = cleanMSSQLSyntax('a, , b');
    expect(result).not.toContain(', ,');
  });
  it('fixes leading comma after opening paren', () => {
    const result = cleanMSSQLSyntax('( , a)');
    expect(result).toContain('( a)');
  });
});

// ═══════════════════════════════════════════════
// ddl-import-mssql.ts — preprocessMSSQL
// ═══════════════════════════════════════════════
describe('preprocessMSSQL', () => {
  // --- Statement extraction ---
  it('extracts CREATE TABLE statements', () => {
    const sql = `
      CREATE TABLE [dbo].[Users] (
        [id] INT IDENTITY(1,1) PRIMARY KEY,
        [name] NVARCHAR(100) NOT NULL
      );
      GO
    `;
    const result = preprocessMSSQL(sql);
    expect(result.statements.length).toBe(1);
    expect(result.statements[0]).toMatch(/create\s+table/i);
  });

  it('handles multiple GO batches with multiple tables', () => {
    const sql = `
      CREATE TABLE [Users] ([id] INT PRIMARY KEY);
      GO
      CREATE TABLE [Orders] ([id] INT PRIMARY KEY);
      GO
    `;
    const result = preprocessMSSQL(sql);
    expect(result.statements.length).toBe(2);
  });

  it('handles semicolon-separated statements within a batch', () => {
    const sql = `
      CREATE TABLE [A] ([id] INT PRIMARY KEY); CREATE TABLE [B] ([id] INT PRIMARY KEY);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.statements.length).toBe(2);
  });

  it('deduplicates identical CREATE TABLE statements', () => {
    const sql = `
      CREATE TABLE [Users] ([id] INT PRIMARY KEY);
      GO
      CREATE TABLE [Users] ([id] INT PRIMARY KEY);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.statements.length).toBe(1);
  });

  // --- sp_addextendedproperty ---
  it('extracts table-level sp_addextendedproperty comments', () => {
    const sql = `
      EXEC sp_addextendedproperty 'MS_Description', N'User accounts table', 'SCHEMA', 'dbo', 'TABLE', 'Users';
    `;
    const result = preprocessMSSQL(sql);
    expect(result.tableComments.get('Users')).toBe('User accounts table');
    expect(result.statements.length).toBe(0);
  });

  it('extracts column-level sp_addextendedproperty comments', () => {
    const sql = `
      EXEC sp_addextendedproperty 'MS_Description', N'User display name', 'SCHEMA', 'dbo', 'TABLE', 'Users', 'COLUMN', 'name';
    `;
    const result = preprocessMSSQL(sql);
    expect(result.colComments.get('Users')?.get('name')).toBe('User display name');
  });

  it('skips CONSTRAINT-level sp_addextendedproperty', () => {
    const sql = `
      EXEC sp_addextendedproperty 'MS_Description', N'PK constraint', 'SCHEMA', 'dbo', 'TABLE', 'Users', 'CONSTRAINT', 'PK_Users';
    `;
    const result = preprocessMSSQL(sql);
    expect(result.tableComments.size).toBe(0);
    expect(result.colComments.size).toBe(0);
  });

  // --- ALTER TABLE FK ---
  it('extracts ALTER TABLE FK', () => {
    const sql = `
      ALTER TABLE [dbo].[Orders] ADD CONSTRAINT FK_Orders_Users
        FOREIGN KEY ([user_id]) REFERENCES [dbo].[Users] ([id]);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.alterFKs.length).toBe(1);
    expect(result.alterFKs[0].tableName).toBe('Orders');
    expect(result.alterFKs[0].columns).toEqual(['user_id']);
    expect(result.alterFKs[0].refTable).toBe('Users');
    expect(result.alterFKs[0].refColumns).toEqual(['id']);
  });

  it('extracts ALTER TABLE FK without CONSTRAINT name', () => {
    const sql = `
      ALTER TABLE [Orders] ADD FOREIGN KEY ([user_id]) REFERENCES [Users] ([id]);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.alterFKs.length).toBe(1);
  });

  // --- ALTER TABLE UNIQUE ---
  it('extracts ALTER TABLE UNIQUE with composite columns', () => {
    const sql = `
      ALTER TABLE [dbo].[Users] ADD CONSTRAINT UQ_email_org UNIQUE ([email], [org_id]);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.alterUQs.length).toBe(1);
    expect(result.alterUQs[0].columns).toEqual(['email', 'org_id']);
    expect(result.alterUQs[0].name).toBe('UQ_email_org');
  });

  it('skips single-column ALTER TABLE UNIQUE (< 2 cols)', () => {
    const sql = `
      ALTER TABLE [Users] ADD CONSTRAINT UQ_email UNIQUE ([email]);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.alterUQs.length).toBe(0);
  });

  it('extracts ALTER TABLE UNIQUE NONCLUSTERED', () => {
    const sql = `
      ALTER TABLE [Users] ADD CONSTRAINT UQ_test UNIQUE NONCLUSTERED ([a], [b]);
    `;
    const result = preprocessMSSQL(sql);
    expect(result.alterUQs.length).toBe(1);
  });

  // --- Inline FK extraction from CREATE TABLE body ---
  it('extracts column-level inline FK references', () => {
    const sql = `
      CREATE TABLE [Orders] (
        [id] INT PRIMARY KEY,
        [user_id] INT REFERENCES [Users]([id])
      );
    `;
    const result = preprocessMSSQL(sql);
    expect(result.alterFKs.some(fk =>
      fk.tableName === 'Orders' && fk.columns[0] === 'user_id' && fk.refTable === 'Users'
    )).toBe(true);
  });

  it('extracts inline FK with ON DELETE/UPDATE actions', () => {
    const sql = `
      CREATE TABLE [Orders] (
        [id] INT PRIMARY KEY,
        [user_id] INT REFERENCES [Users]([id]) ON DELETE CASCADE ON UPDATE SET NULL
      );
    `;
    const result = preprocessMSSQL(sql);
    const fk = result.alterFKs.find(f => f.columns[0] === 'user_id');
    expect(fk?.onDelete).toBe('CASCADE');
    expect(fk?.onUpdate).toBe('SET NULL');
  });

  it('extracts table-level FOREIGN KEY from CREATE TABLE', () => {
    const sql = `
      CREATE TABLE [Orders] (
        [id] INT PRIMARY KEY,
        [user_id] INT,
        FOREIGN KEY ([user_id]) REFERENCES [Users]([id])
      );
    `;
    const result = preprocessMSSQL(sql);
    const fk = result.alterFKs.find(f => f.tableName === 'Orders');
    expect(fk).toBeDefined();
    expect(fk!.columns).toEqual(['user_id']);
  });

  it('extracts table-level FK with ON DELETE action from cleaned CREATE TABLE', () => {
    const sql = `
      CREATE TABLE [Orders] (
        [id] INT PRIMARY KEY,
        [user_id] INT NOT NULL,
        FOREIGN KEY ([user_id]) REFERENCES [Users]([id]) ON DELETE CASCADE
      );
    `;
    const result = preprocessMSSQL(sql);
    const fk = result.alterFKs.find(f => f.tableName === 'Orders' && f.columns[0] === 'user_id');
    expect(fk).toBeDefined();
  });

  // --- Skipping ---
  it('skips EXEC statements', () => {
    const sql = `EXEC sp_rename 'old', 'new';`;
    const result = preprocessMSSQL(sql);
    expect(result.statements.length).toBe(0);
  });

  it('skips CREATE INDEX', () => {
    expect(preprocessMSSQL('CREATE INDEX IX_Name ON Users (name);').statements.length).toBe(0);
  });

  it('skips CREATE UNIQUE INDEX', () => {
    expect(preprocessMSSQL('CREATE UNIQUE INDEX IX_Email ON Users (email);').statements.length).toBe(0);
  });

  it('skips ALTER INDEX', () => {
    expect(preprocessMSSQL('ALTER INDEX IX_Name ON Users REBUILD;').statements.length).toBe(0);
  });

  it('skips CREATE NONCLUSTERED INDEX', () => {
    expect(preprocessMSSQL('CREATE NONCLUSTERED INDEX IX ON T (c);').statements.length).toBe(0);
  });

  it('handles empty input', () => {
    const result = preprocessMSSQL('');
    expect(result.statements.length).toBe(0);
    expect(result.alterFKs.length).toBe(0);
  });

  it('handles input with only comments', () => {
    const result = preprocessMSSQL('-- just a comment\n/* another */');
    expect(result.statements.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// ddl-import-mssql.ts — cleanMSSQLStatement
// ═══════════════════════════════════════════════
describe('cleanMSSQLStatement', () => {
  it('strips inline REFERENCES with column list', () => {
    const result = cleanMSSQLStatement('col INT REFERENCES Users(id)');
    expect(result).not.toMatch(/references/i);
  });
  it('strips inline REFERENCES without column list', () => {
    const result = cleanMSSQLStatement('col INT REFERENCES Users');
    expect(result).not.toMatch(/references/i);
  });
  it('strips DEFAULT with string literal', () => {
    expect(cleanMSSQLStatement("col VARCHAR(10) DEFAULT 'active'")).not.toMatch(/DEFAULT/i);
  });
  it('strips DEFAULT with function call', () => {
    expect(cleanMSSQLStatement('col DATETIME DEFAULT getdate()')).not.toMatch(/DEFAULT/i);
  });
  it('strips DEFAULT with number', () => {
    expect(cleanMSSQLStatement('col INT DEFAULT 0')).not.toMatch(/DEFAULT/i);
  });
  it('removes UNIQUE with column list', () => {
    expect(cleanMSSQLStatement('UNIQUE (email, org_id)')).not.toMatch(/unique/i);
  });
  it('removes bare UNIQUE keyword', () => {
    const result = cleanMSSQLStatement('col INT UNIQUE,)');
    expect(result).not.toMatch(/\bunique\b/i);
  });
  it('fixes trailing comma before closing paren', () => {
    const result = cleanMSSQLStatement('(a,\n)');
    expect(result).not.toMatch(/,\s*\)/);
  });
  it('fixes double commas', () => {
    expect(cleanMSSQLStatement('a, , b')).not.toContain(', ,');
  });
  it('fixes leading comma after open paren', () => {
    expect(cleanMSSQLStatement('( , a)')).toContain('( a)');
  });
});

// ═══════════════════════════════════════════════
// ddl-import-oracle.ts — cleanOracleSyntax
// ═══════════════════════════════════════════════
describe('cleanOracleSyntax', () => {
  // --- Batch separator ---
  it('removes / batch separators on standalone lines', () => {
    const result = cleanOracleSyntax('SELECT 1;\n/\nSELECT 2;');
    expect(result).not.toMatch(/^\s*\/\s*$/m);
  });
  it('does not remove / inside expressions', () => {
    expect(cleanOracleSyntax('col / 2')).toContain('/');
  });

  // --- IDENTITY ---
  it('removes GENERATED ALWAYS AS IDENTITY', () => {
    expect(cleanOracleSyntax('GENERATED ALWAYS AS IDENTITY')).not.toMatch(/GENERATED/i);
  });
  it('removes GENERATED BY DEFAULT AS IDENTITY', () => {
    expect(cleanOracleSyntax('GENERATED BY DEFAULT AS IDENTITY')).not.toMatch(/GENERATED/i);
  });
  it('removes GENERATED AS IDENTITY with options', () => {
    expect(cleanOracleSyntax('GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1)')).not.toMatch(/IDENTITY/i);
  });

  // --- Type conversions ---
  it('converts VARCHAR2 → VARCHAR', () => {
    expect(cleanOracleSyntax('VARCHAR2(100)')).toBe('VARCHAR(100)');
  });
  it('converts NVARCHAR2 → VARCHAR', () => {
    expect(cleanOracleSyntax('NVARCHAR2(200)')).toBe('VARCHAR(200)');
  });
  it('converts NUMBER → DECIMAL', () => {
    expect(cleanOracleSyntax('NUMBER(10,2)')).toBe('DECIMAL(10,2)');
  });
  it('converts CLOB → TEXT', () => {
    expect(cleanOracleSyntax('CLOB')).toBe('TEXT');
  });
  it('converts NCLOB → TEXT', () => {
    expect(cleanOracleSyntax('NCLOB')).toBe('TEXT');
  });
  it('converts BINARY_DOUBLE → DOUBLE PRECISION', () => {
    expect(cleanOracleSyntax('BINARY_DOUBLE')).toBe('DOUBLE PRECISION');
  });
  it('converts BINARY_FLOAT → FLOAT', () => {
    expect(cleanOracleSyntax('BINARY_FLOAT')).toBe('FLOAT');
  });
  it('converts RAW(16) → TEXT', () => {
    expect(cleanOracleSyntax('RAW(16)')).toBe('TEXT');
  });

  // --- Oracle keyword stripping ---
  it('strips ENABLE', () => {
    expect(cleanOracleSyntax('CONSTRAINT pk ENABLE')).not.toMatch(/\bENABLE\b/i);
  });
  it('strips NOVALIDATE', () => {
    expect(cleanOracleSyntax('NOVALIDATE')).not.toMatch(/NOVALIDATE/i);
  });
  it('strips TABLESPACE <name>', () => {
    expect(cleanOracleSyntax('TABLESPACE users_ts')).not.toMatch(/TABLESPACE/i);
    expect(cleanOracleSyntax('TABLESPACE users_ts')).not.toContain('users_ts');
  });
  it('strips PCTFREE <number>', () => {
    expect(cleanOracleSyntax('PCTFREE 10')).not.toMatch(/PCTFREE/i);
  });
  it('strips INITRANS <number>', () => {
    expect(cleanOracleSyntax('INITRANS 2')).not.toMatch(/INITRANS/i);
  });
  it('strips STORAGE (...)', () => {
    expect(cleanOracleSyntax('STORAGE (INITIAL 64K NEXT 64K)')).not.toMatch(/STORAGE/i);
  });
  it('strips LOGGING', () => {
    expect(cleanOracleSyntax('LOGGING')).not.toMatch(/\bLOGGING\b/i);
  });
  it('strips NOLOGGING', () => {
    expect(cleanOracleSyntax('NOLOGGING')).not.toMatch(/NOLOGGING/i);
  });
  it('strips SEGMENT CREATION IMMEDIATE', () => {
    expect(cleanOracleSyntax('SEGMENT CREATION IMMEDIATE')).not.toMatch(/SEGMENT/i);
  });
  it('strips USING INDEX', () => {
    expect(cleanOracleSyntax('USING INDEX')).not.toMatch(/USING\s+INDEX/i);
  });

  // --- Trailing comma fix ---
  it('fixes trailing comma before closing paren', () => {
    expect(cleanOracleSyntax('(a, b,\n)')).not.toMatch(/,\s*\n?\s*\)/);
  });
});

// ═══════════════════════════════════════════════
// ddl-import-oracle.ts — preprocessOracle
// ═══════════════════════════════════════════════
describe('preprocessOracle', () => {
  it('extracts COMMENT ON TABLE', () => {
    const sql = `
      CREATE TABLE employees (id DECIMAL(10) PRIMARY KEY);
      COMMENT ON TABLE employees IS 'Employee master';
    `;
    const result = preprocessOracle(sql);
    expect(result.tableComments.get('employees')).toBe('Employee master');
  });

  it('extracts COMMENT ON TABLE with schema prefix', () => {
    const sql = `COMMENT ON TABLE "HR".employees IS 'HR employees';`;
    const result = preprocessOracle(sql);
    expect(result.tableComments.get('employees')).toBe('HR employees');
  });

  it('extracts COMMENT ON COLUMN', () => {
    const sql = `COMMENT ON COLUMN employees.name IS 'Full name';`;
    const result = preprocessOracle(sql);
    expect(result.colComments.get('employees')?.get('name')).toBe('Full name');
  });

  it('extracts COMMENT ON COLUMN with schema prefix', () => {
    const sql = `COMMENT ON COLUMN "HR".employees.salary IS 'Annual salary';`;
    const result = preprocessOracle(sql);
    expect(result.colComments.get('employees')?.get('salary')).toBe('Annual salary');
  });

  it('extracts multiple comments for same table', () => {
    const sql = `
      COMMENT ON COLUMN users.name IS 'Name';
      COMMENT ON COLUMN users.email IS 'Email';
    `;
    const result = preprocessOracle(sql);
    const cols = result.colComments.get('users');
    expect(cols?.get('name')).toBe('Name');
    expect(cols?.get('email')).toBe('Email');
  });

  it('extracts GENERATED ALWAYS AS IDENTITY columns', () => {
    const sql = `CREATE TABLE t (id DECIMAL(10) GENERATED ALWAYS AS IDENTITY, name VARCHAR(100));`;
    const result = preprocessOracle(sql);
    expect(result.identityColumns.get('t')?.has('id')).toBe(true);
    expect(result.identityColumns.get('t')?.has('name')).toBeFalsy();
  });

  it('extracts GENERATED BY DEFAULT AS IDENTITY columns', () => {
    const sql = `CREATE TABLE t (id DECIMAL(10) GENERATED BY DEFAULT AS IDENTITY);`;
    const result = preprocessOracle(sql);
    expect(result.identityColumns.get('t')?.has('id')).toBe(true);
  });

  it('removes COMMENT ON statements from cleaned SQL', () => {
    const sql = `
      CREATE TABLE t (id INT);
      COMMENT ON TABLE t IS 'test';
      COMMENT ON COLUMN t.id IS 'pk';
    `;
    const result = preprocessOracle(sql);
    expect(result.cleanedSql).not.toMatch(/COMMENT\s+ON/i);
  });

  it('applies cleanOracleSyntax to cleaned SQL', () => {
    const sql = `CREATE TABLE t (id NUMBER(10) GENERATED ALWAYS AS IDENTITY ENABLE);`;
    const result = preprocessOracle(sql);
    expect(result.cleanedSql).not.toMatch(/\bENABLE\b/i);
    expect(result.cleanedSql).not.toMatch(/GENERATED/i);
  });

  it('handles empty input', () => {
    const result = preprocessOracle('');
    expect(result.tableComments.size).toBe(0);
    expect(result.colComments.size).toBe(0);
    expect(result.identityColumns.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// ddl-import-oracle.ts — preprocessH2
// ═══════════════════════════════════════════════
describe('preprocessH2', () => {
  it('extracts COMMENT ON TABLE', () => {
    const sql = `
      CREATE TABLE test (id INT PRIMARY KEY);
      COMMENT ON TABLE test IS 'Test table';
    `;
    const result = preprocessH2(sql);
    expect(result.tableComments.get('test')).toBe('Test table');
  });

  it('extracts COMMENT ON COLUMN', () => {
    const sql = `COMMENT ON COLUMN test.name IS 'Name field';`;
    const result = preprocessH2(sql);
    expect(result.colComments.get('test')?.get('name')).toBe('Name field');
  });

  it('extracts GENERATED BY DEFAULT AS IDENTITY', () => {
    const sql = `CREATE TABLE t (id BIGINT GENERATED BY DEFAULT AS IDENTITY);`;
    const result = preprocessH2(sql);
    expect(result.identityColumns.get('t')?.has('id')).toBe(true);
  });

  it('extracts GENERATED ALWAYS AS IDENTITY', () => {
    const sql = `CREATE TABLE t (id INT GENERATED ALWAYS AS IDENTITY);`;
    const result = preprocessH2(sql);
    expect(result.identityColumns.get('t')?.has('id')).toBe(true);
  });

  it('extracts AUTO_INCREMENT columns', () => {
    const sql = `CREATE TABLE t (id BIGINT AUTO_INCREMENT);`;
    const result = preprocessH2(sql);
    expect(result.identityColumns.get('t')?.has('id')).toBe(true);
  });

  it('extracts IDENTITY with options in parens', () => {
    const sql = `CREATE TABLE t (id INT GENERATED BY DEFAULT AS IDENTITY (START WITH 100));`;
    const result = preprocessH2(sql);
    expect(result.identityColumns.get('t')?.has('id')).toBe(true);
  });

  it('handles multiple IDENTITY columns in same table', () => {
    // The regex requires `);\s*` at end, so use multi-line with semicolons
    const sql = `
      CREATE TABLE t (
        a INT GENERATED BY DEFAULT AS IDENTITY,
        b INT AUTO_INCREMENT
      );
    `;
    const result = preprocessH2(sql);
    expect(result.identityColumns.get('t')?.has('a')).toBe(true);
    expect(result.identityColumns.get('t')?.has('b')).toBe(true);
  });

  it('removes GENERATED keywords from cleaned SQL', () => {
    const sql = `CREATE TABLE t (id INT GENERATED BY DEFAULT AS IDENTITY);`;
    const result = preprocessH2(sql);
    expect(result.cleanedSql).not.toMatch(/GENERATED/i);
    expect(result.cleanedSql).not.toMatch(/\bIDENTITY\b/i);
  });

  it('removes AUTO_INCREMENT from cleaned SQL', () => {
    const sql = `CREATE TABLE t (id INT AUTO_INCREMENT);`;
    const result = preprocessH2(sql);
    expect(result.cleanedSql).not.toMatch(/AUTO_INCREMENT/i);
  });

  it('removes COMMENT ON from cleaned SQL', () => {
    const sql = `COMMENT ON TABLE t IS 'test';`;
    const result = preprocessH2(sql);
    expect(result.cleanedSql).not.toMatch(/COMMENT\s+ON/i);
  });

  it('handles empty input', () => {
    const result = preprocessH2('');
    expect(result.tableComments.size).toBe(0);
    expect(result.identityColumns.size).toBe(0);
  });

  it('handles multiple tables', () => {
    const sql = `
      CREATE TABLE a (id INT GENERATED BY DEFAULT AS IDENTITY);
      CREATE TABLE b (id INT AUTO_INCREMENT);
      COMMENT ON TABLE a IS 'Table A';
      COMMENT ON TABLE b IS 'Table B';
    `;
    const result = preprocessH2(sql);
    expect(result.identityColumns.get('a')?.has('id')).toBe(true);
    expect(result.identityColumns.get('b')?.has('id')).toBe(true);
    expect(result.tableComments.get('a')).toBe('Table A');
    expect(result.tableComments.get('b')).toBe('Table B');
  });
});

// ═══════════════════════════════════════════════
// re-export 검증
// ═══════════════════════════════════════════════
describe('re-export from ddl-import.ts', () => {
  it('normalizeType is accessible from main module', () => {
    expect(normalizeType('INTEGER')).toBe('INT');
    expect(normalizeType('SERIAL')).toBe('INT');
    expect(normalizeType('VARCHAR2')).toBe('VARCHAR');
  });
  it('importDDL is accessible from main module', () => {
    expect(typeof importDDL).toBe('function');
  });
  it('type re-exports are usable (compile-time check)', () => {
    const msgs: ReExportedMessages = DEFAULT_MESSAGES;
    const result: ReExportedResult = { tables: [], errors: [], warnings: [] };
    expect(msgs).toBeDefined();
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// 통합: importDDL round-trip per dialect
// ═══════════════════════════════════════════════
describe('split consistency — importDDL round-trip', () => {
  it('MySQL: basic table with FK', async () => {
    const sql = `
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE
      );
      CREATE TABLE orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;
    const result = await importDDL(sql, 'mysql');
    expect(result.errors).toEqual([]);
    expect(result.tables.length).toBe(2);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[1].foreignKeys.length).toBe(1);
    expect(result.tables[1].foreignKeys[0].onDelete).toBe('CASCADE');
  });

  it('MSSQL: table + ALTER TABLE FK + sp_addextendedproperty', async () => {
    const sql = `
      CREATE TABLE [dbo].[Users] (
        [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [name] NVARCHAR(100) NOT NULL,
        [email] NVARCHAR(255) NULL
      );
      GO
      CREATE TABLE [dbo].[Orders] (
        [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [user_id] INT NOT NULL
      );
      GO
      ALTER TABLE [dbo].[Orders] ADD CONSTRAINT FK_Orders_Users
        FOREIGN KEY ([user_id]) REFERENCES [dbo].[Users] ([id]);
      GO
      EXEC sp_addextendedproperty 'MS_Description', N'User accounts', 'SCHEMA', 'dbo', 'TABLE', 'Users';
      EXEC sp_addextendedproperty 'MS_Description', N'Display name', 'SCHEMA', 'dbo', 'TABLE', 'Users', 'COLUMN', 'name';
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.errors).toEqual([]);
    expect(result.tables.length).toBe(2);
    expect(result.tables[1].foreignKeys.length).toBe(1);
    expect(result.tables[0].comment).toBe('User accounts');
    const nameCol = result.tables[0].columns.find(c => c.name === 'name');
    expect(nameCol?.comment).toBe('Display name');
  });

  it('MSSQL: IDENTITY columns are autoIncrement', async () => {
    const sql = `
      CREATE TABLE [T] ([id] INT IDENTITY(1,1) PRIMARY KEY, [name] NVARCHAR(50));
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.errors).toEqual([]);
    const idCol = result.tables[0].columns.find(c => c.name === 'id');
    expect(idCol?.autoIncrement).toBe(true);
  });

  it('PostgreSQL: COMMENT ON TABLE + COMMENT ON COLUMN', async () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE
      );
      COMMENT ON TABLE users IS 'User accounts';
      COMMENT ON COLUMN users.name IS 'Full name';
      COMMENT ON COLUMN users.email IS 'Email address';
    `;
    const result = await importDDL(sql, 'postgresql');
    expect(result.errors).toEqual([]);
    expect(result.tables[0].comment).toBe('User accounts');
    expect(result.tables[0].columns.find(c => c.name === 'name')?.comment).toBe('Full name');
    expect(result.tables[0].columns.find(c => c.name === 'email')?.comment).toBe('Email address');
  });

  it('Oracle: IDENTITY + COMMENT + Oracle types', async () => {
    const sql = `
      CREATE TABLE employees (
        id DECIMAL(10) GENERATED ALWAYS AS IDENTITY,
        name VARCHAR(100) NOT NULL,
        salary DECIMAL(10,2),
        bio TEXT
      );
      COMMENT ON TABLE employees IS 'Employee master';
      COMMENT ON COLUMN employees.name IS 'Full name';
    `;
    const result = await importDDL(sql, 'oracle');
    expect(result.errors).toEqual([]);
    expect(result.tables[0].comment).toBe('Employee master');
    const idCol = result.tables[0].columns.find(c => c.name === 'id');
    expect(idCol?.autoIncrement).toBe(true);
    expect(result.tables[0].columns.find(c => c.name === 'name')?.comment).toBe('Full name');
  });

  it('H2: GENERATED IDENTITY + COMMENT', async () => {
    const sql = `
      CREATE TABLE test (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name VARCHAR(50),
        active BOOLEAN DEFAULT TRUE
      );
      COMMENT ON TABLE test IS 'Test table';
      COMMENT ON COLUMN test.name IS 'Name col';
    `;
    const result = await importDDL(sql, 'h2');
    expect(result.errors).toEqual([]);
    expect(result.tables[0].comment).toBe('Test table');
    const idCol = result.tables[0].columns.find(c => c.name === 'id');
    expect(idCol?.autoIncrement).toBe(true);
    expect(result.tables[0].columns.find(c => c.name === 'name')?.comment).toBe('Name col');
  });

  it('SQLite: inline REFERENCES + AUTOINCREMENT', async () => {
    const sql = `
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL
      );
    `;
    const result = await importDDL(sql, 'sqlite');
    expect(result.errors).toEqual([]);
    expect(result.tables.length).toBe(2);
    expect(result.tables[1].foreignKeys.length).toBe(1);
    expect(result.tables[1].foreignKeys[0].onDelete).toBe('CASCADE');
  });

  it('MariaDB: same as MySQL path', async () => {
    const sql = `
      CREATE TABLE items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL COMMENT 'Item name'
      ) ENGINE=InnoDB;
    `;
    const result = await importDDL(sql, 'mariadb');
    expect(result.errors).toEqual([]);
    expect(result.tables[0].columns.find(c => c.name === 'name')?.comment).toBe('Item name');
  });

  it('handles no CREATE TABLE gracefully', async () => {
    const result = await importDDL('SELECT 1;', 'mysql');
    expect(result.tables.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles empty input', async () => {
    const result = await importDDL('', 'mysql');
    expect(result.tables.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
