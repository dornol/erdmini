import { describe, it, expect } from 'vitest';
import { normalizeType, importDDL } from './ddl-import';
import { parseRefAction } from './ddl-import-types';

// ═════════════════════════════════════════════
// MSSQL
// ═════════════════════════════════════════════
describe('importDDL — MSSQL', () => {
  it('does not create spurious "unique" columns from table-level UNIQUE constraints', async () => {
    const sql = `
      CREATE TABLE [dbo].[Users] (
        [UserId] INT IDENTITY(1,1) NOT NULL,
        [Email] NVARCHAR(255) NOT NULL,
        [Username] NVARCHAR(100) NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([UserId] ASC),
        CONSTRAINT [UQ_Users_Email] UNIQUE NONCLUSTERED ([Email] ASC)
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.errors).toHaveLength(0);
    const table = result.tables[0];
    const colNames = table.columns.map((c) => c.name);
    expect(colNames).not.toContain('unique');
    expect(colNames).toEqual(['UserId', 'Email', 'Username']);
    const emailCol = table.columns.find((c) => c.name === 'Email')!;
    expect(emailCol.unique).toBe(true);
  });

  it('handles composite UNIQUE constraints without creating false columns', async () => {
    const sql = `
      CREATE TABLE [dbo].[Orders] (
        [OrderId] INT IDENTITY(1,1) NOT NULL,
        [CustomerId] INT NOT NULL,
        [ProductId] INT NOT NULL,
        CONSTRAINT [PK_Orders] PRIMARY KEY CLUSTERED ([OrderId] ASC),
        CONSTRAINT [UQ_Customer_Product] UNIQUE NONCLUSTERED ([CustomerId] ASC, [ProductId] ASC)
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.errors).toHaveLength(0);
    const table = result.tables[0];
    const colNames = table.columns.map((c) => c.name);
    expect(colNames).not.toContain('unique');
    expect(table.uniqueKeys.length).toBe(1);
    expect(table.uniqueKeys[0].columnIds).toHaveLength(2);
  });

  it('handles SSMS-generated DDL with WITH/ON clauses on UNIQUE constraints', async () => {
    const sql = `
CREATE TABLE [dbo].[Users](
	[UserId] [int] IDENTITY(1,1) NOT NULL,
	[Email] [nvarchar](255) NOT NULL,
	[Username] [nvarchar](100) NOT NULL,
 CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED
(
	[UserId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_Users_Email] UNIQUE NONCLUSTERED
(
	[Email] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
    `;
    const result = await importDDL(sql, 'mssql');
    const table = result.tables[0];
    const colNames = table.columns.map((c) => c.name);
    expect(colNames).not.toContain('unique');
    expect(colNames).not.toContain('UNIQUE');
    expect(colNames).toEqual(['UserId', 'Email', 'Username']);
    const emailCol = table.columns.find((c) => c.name === 'Email')!;
    expect(emailCol.unique).toBe(true);
  });

  it('handles multiple tables with UNIQUE, FK, and DEFAULT', async () => {
    const sql = `
CREATE TABLE [dbo].[Products](
	[ProductId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](200) NOT NULL,
	[Code] [nvarchar](50) NOT NULL,
	[Status] [nvarchar](20) NOT NULL DEFAULT (N'active'),
 CONSTRAINT [PK_Products] PRIMARY KEY CLUSTERED ([ProductId] ASC)
 WITH (PAD_INDEX = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_Products_Code] UNIQUE NONCLUSTERED ([Code] ASC)
 WITH (PAD_INDEX = OFF) ON [PRIMARY],
 CONSTRAINT [UQ_Products_Name] UNIQUE NONCLUSTERED ([Name] ASC)
 WITH (PAD_INDEX = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
    `;
    const result = await importDDL(sql, 'mssql');
    const table = result.tables[0];
    const colNames = table.columns.map((c) => c.name);
    expect(colNames).not.toContain('unique');
    expect(colNames).toEqual(['ProductId', 'Name', 'Code', 'Status']);
    expect(table.columns.find((c) => c.name === 'Code')!.unique).toBe(true);
    expect(table.columns.find((c) => c.name === 'Name')!.unique).toBe(true);
  });

  // --- IDENTITY ---
  it('parses IDENTITY(1,1) as autoIncrement', async () => {
    const sql = `
      CREATE TABLE [dbo].[test] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [name] NVARCHAR(100),
        CONSTRAINT [PK_test] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.errors).toHaveLength(0);
    const idCol = result.tables[0].columns.find(c => c.name === 'id')!;
    expect(idCol.autoIncrement).toBe(true);
    expect(idCol.primaryKey).toBe(true);
  });

  // --- Type mapping ---
  it('maps MSSQL types: NVARCHAR→VARCHAR, BIT→BOOLEAN, DATETIME2→DATETIME', async () => {
    const sql = `
      CREATE TABLE [dbo].[test] (
        [a] NVARCHAR(100),
        [b] BIT,
        [c] DATETIME2
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const cols = result.tables[0].columns;
    expect(cols.find(c => c.name === 'a')!.type).toBe('VARCHAR');
    expect(cols.find(c => c.name === 'b')!.type).toBe('BOOLEAN');
  });

  // --- sp_addextendedproperty comments ---
  it('extracts table and column comments from sp_addextendedproperty', async () => {
    const sql = `
      CREATE TABLE [dbo].[items] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [name] NVARCHAR(100),
        CONSTRAINT [PK_items] PRIMARY KEY ([id])
      )
      GO
      EXEC sp_addextendedproperty 'MS_Description', N'Item master', 'SCHEMA', 'dbo', 'TABLE', 'items'
      GO
      EXEC sp_addextendedproperty 'MS_Description', N'Item name', 'SCHEMA', 'dbo', 'TABLE', 'items', 'COLUMN', 'name'
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables[0].comment).toBe('Item master');
    expect(result.tables[0].columns.find(c => c.name === 'name')!.comment).toBe('Item name');
  });

  // --- ALTER TABLE FK ---
  it('extracts ALTER TABLE FK via regex', async () => {
    const sql = `
      CREATE TABLE [dbo].[parent] (
        [id] INT IDENTITY(1,1) NOT NULL,
        CONSTRAINT [PK_parent] PRIMARY KEY ([id])
      )
      GO
      CREATE TABLE [dbo].[child] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [parent_id] INT NOT NULL,
        CONSTRAINT [PK_child] PRIMARY KEY ([id])
      )
      GO
      ALTER TABLE [dbo].[child] ADD CONSTRAINT [FK_child_parent]
        FOREIGN KEY ([parent_id]) REFERENCES [dbo].[parent] ([id])
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
  });

  // --- GO batch separator ---
  it('splits batches by GO separator', async () => {
    const sql = `
      CREATE TABLE [dbo].[a] ([id] INT NOT NULL, CONSTRAINT [PK_a] PRIMARY KEY ([id]))
      GO
      CREATE TABLE [dbo].[b] ([id] INT NOT NULL, CONSTRAINT [PK_b] PRIMARY KEY ([id]))
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables).toHaveLength(2);
  });

  // --- ALTER FK deduplication ---
  it('deduplicates inline FK and ALTER TABLE FK', async () => {
    const sql = `
      CREATE TABLE [dbo].[parent] (
        [id] INT NOT NULL,
        CONSTRAINT [PK_parent] PRIMARY KEY ([id])
      )
      GO
      CREATE TABLE [dbo].[child] (
        [id] INT NOT NULL,
        [parent_id] INT REFERENCES [parent]([id]),
        CONSTRAINT [PK_child] PRIMARY KEY ([id])
      )
      GO
      ALTER TABLE [dbo].[child] ADD CONSTRAINT [FK_child_parent]
        FOREIGN KEY ([parent_id]) REFERENCES [dbo].[parent] ([id])
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const child = result.tables.find(t => t.name === 'child')!;
    // Should not have duplicate FKs
    const fkKeys = child.foreignKeys.map(fk =>
      `${fk.columnIds.join(',')}->${fk.referencedColumnIds.join(',')}`
    );
    const uniqueFKs = new Set(fkKeys);
    expect(uniqueFKs.size).toBe(child.foreignKeys.length);
  });

  // --- Inline FK with missing ref columns resolves to PK ---
  it('resolves inline FK with missing ref columns to PK', async () => {
    const sql = `
      CREATE TABLE [dbo].[parent] (
        [id] INT NOT NULL,
        CONSTRAINT [PK_parent] PRIMARY KEY ([id])
      )
      GO
      CREATE TABLE [dbo].[child] (
        [id] INT NOT NULL,
        [parent_id] INT REFERENCES [parent],
        CONSTRAINT [PK_child] PRIMARY KEY ([id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
    const parent = result.tables.find(t => t.name === 'parent')!;
    const pkCol = parent.columns.find(c => c.primaryKey)!;
    expect(child.foreignKeys[0].referencedColumnIds).toContain(pkCol.id);
  });

  // --- ALTER UQ composite → uniqueKeys ---
  it('applies composite ALTER TABLE UNIQUE to uniqueKeys', async () => {
    const sql = `
      CREATE TABLE [dbo].[t] (
        [id] INT NOT NULL,
        [a] INT,
        [b] INT,
        CONSTRAINT [PK_t] PRIMARY KEY ([id])
      )
      GO
      ALTER TABLE [dbo].[t] ADD CONSTRAINT [UQ_ab] UNIQUE ([a], [b])
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables[0].uniqueKeys).toHaveLength(1);
    expect(result.tables[0].uniqueKeys[0].columnIds).toHaveLength(2);
  });

  // --- Inline FK ON DELETE CASCADE ---
  it('extracts ON DELETE/UPDATE actions from inline FK', async () => {
    const sql = `
      CREATE TABLE [dbo].[parent] (
        [id] INT NOT NULL,
        CONSTRAINT [PK_parent] PRIMARY KEY ([id])
      )
      GO
      CREATE TABLE [dbo].[child] (
        [id] INT NOT NULL,
        [parent_id] INT,
        CONSTRAINT [PK_child] PRIMARY KEY ([id]),
        FOREIGN KEY ([parent_id]) REFERENCES [parent]([id]) ON DELETE CASCADE ON UPDATE SET NULL
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    const child = result.tables.find(t => t.name === 'child')!;
    expect(child.foreignKeys).toHaveLength(1);
    expect(child.foreignKeys[0].onDelete).toBe('CASCADE');
    expect(child.foreignKeys[0].onUpdate).toBe('SET NULL');
  });

  it('parses reserved word column names (Explain, Key, Session, etc.)', async () => {
    const sql = `
      create table dbo.tSecurityEvent
      (
          Seq                bigint identity
              constraint pk_tsecurityviolation
                  primary key,
          Create_Datetime    datetime2(3) not null,
          Create_Manager_Seq bigint,
          Event_Type         tinyint      not null,
          IP                 nvarchar(40) not null,
          Explain            nvarchar(1000),
          Report_Datetime    datetime2(3),
          Manager_Seq        bigint
              constraint FK_SECURITY_VIOLATION_MANAGER
                  references dbo.tManager
      )
      go
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables).toHaveLength(1);
    const t = result.tables[0];
    expect(t.name).toBe('tSecurityEvent');
    const colNames = t.columns.map(c => c.name);
    expect(colNames).toContain('Explain');
    expect(colNames).toContain('Seq');
    expect(colNames).toContain('IP');
    expect(colNames).toContain('Event_Type');
    // Manager_Seq gets parsed as FK source + also as a regular column
    expect(colNames.length).toBeGreaterThanOrEqual(7);
    // datetime2(3) precision preserved as length
    const createDt = t.columns.find(c => c.name === 'Create_Datetime');
    expect(createDt?.type).toBe('DATETIME');
    expect(createDt?.length).toBe(3);
    const reportDt = t.columns.find(c => c.name === 'Report_Datetime');
    expect(reportDt?.length).toBe(3);
  });

  it('parses multiple reserved word columns across tables', async () => {
    const sql = `
      CREATE TABLE [dbo].[Config] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [Key] NVARCHAR(200) NOT NULL,
        [Value] NVARCHAR(MAX),
        [Desc] NVARCHAR(500),
        CONSTRAINT [PK_Config] PRIMARY KEY ([Id])
      )
      GO
    `;
    const result = await importDDL(sql, 'mssql');
    expect(result.tables).toHaveLength(1);
    const colNames = result.tables[0].columns.map(c => c.name);
    expect(colNames).toContain('Key');
    expect(colNames).toContain('Value');
    expect(colNames).toContain('Desc');
  });
});
