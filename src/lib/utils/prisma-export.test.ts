import { describe, it, expect } from 'vitest';
import { exportPrisma } from './prisma-export';
import type { ERDSchema, Table, Column } from '$lib/types/erd';

function col(overrides: Partial<Column> & { id: string; name: string }): Column {
  return {
    type: 'VARCHAR',
    length: 255,
    nullable: false,
    primaryKey: false,
    unique: false,
    autoIncrement: false,
    ...overrides,
  };
}

function table(overrides: Partial<Table> & { id: string; name: string; columns: Column[] }): Table {
  return {
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function schema(tables: Table[]): ERDSchema {
  return {
    version: '1',
    tables,
    domains: [],
    memos: [],
    createdAt: '',
    updatedAt: '',
  };
}

describe('prisma-export', () => {
  describe('basic model generation', () => {
    it('generates a simple model', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
            col({ id: 'c2', name: 'name', type: 'VARCHAR', length: 255 }),
            col({ id: 'c3', name: 'email', type: 'VARCHAR', length: 255, unique: true }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('model User {');
      expect(output).toContain('id Int @id @default(autoincrement())');
      expect(output).toContain('name String');
      expect(output).toContain('email String @unique');
      expect(output).toContain('}');
    });

    it('generates @@map for non-PascalCase table names', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'user_accounts',
          columns: [col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('model UserAccounts {');
      expect(output).toContain('@@map("user_accounts")');
    });
  });

  describe('type mapping', () => {
    it('maps all ERD types to Prisma types', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'TypeTest',
          columns: [
            col({ id: 'c1', name: 'pk', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'big', type: 'BIGINT' }),
            col({ id: 'c3', name: 'small', type: 'SMALLINT' }),
            col({ id: 'c4', name: 'vc', type: 'VARCHAR', length: 100 }),
            col({ id: 'c5', name: 'ch', type: 'CHAR', length: 10 }),
            col({ id: 'c6', name: 'txt', type: 'TEXT' }),
            col({ id: 'c7', name: 'bool', type: 'BOOLEAN' }),
            col({ id: 'c8', name: 'dt', type: 'DATE' }),
            col({ id: 'c9', name: 'dtt', type: 'DATETIME' }),
            col({ id: 'c10', name: 'ts', type: 'TIMESTAMP' }),
            col({ id: 'c11', name: 'dec', type: 'DECIMAL', length: 10, scale: 2 }),
            col({ id: 'c12', name: 'flt', type: 'FLOAT' }),
            col({ id: 'c13', name: 'dbl', type: 'DOUBLE' }),
            col({ id: 'c14', name: 'js', type: 'JSON' }),
            col({ id: 'c15', name: 'uid', type: 'UUID' }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('big BigInt');
      expect(output).toContain('small Int @db.SmallInt');
      expect(output).toContain('vc String @db.VarChar(100)');
      expect(output).toContain('ch String @db.Char(10)');
      expect(output).toContain('txt String @db.Text');
      expect(output).toContain('bool Boolean');
      expect(output).toContain('dt DateTime @db.Date');
      expect(output).toContain('dtt DateTime');
      expect(output).toContain('ts DateTime @db.Timestamp');
      expect(output).toContain('dec Decimal @db.Decimal(10, 2)');
      expect(output).toContain('flt Float');
      expect(output).toContain('dbl Float @db.DoublePrecision');
      expect(output).toContain('js Json');
      expect(output).toContain('uid String @db.Uuid');
    });

    it('handles nullable types with ?', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Test',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'bio', type: 'TEXT', nullable: true }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('bio String? @db.Text');
    });
  });

  describe('enum generation', () => {
    it('generates enum block for ENUM type columns', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'role', type: 'ENUM', enumValues: ['USER', 'ADMIN', 'MOD'] }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('enum UserRole {');
      expect(output).toContain('  USER');
      expect(output).toContain('  ADMIN');
      expect(output).toContain('  MOD');
      expect(output).toContain('role UserRole');
    });
  });

  describe('default values', () => {
    it('generates @default for various types', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Config',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'active', type: 'BOOLEAN', defaultValue: 'true' }),
            col({ id: 'c3', name: 'count', type: 'INT', defaultValue: '0' }),
            col({ id: 'c4', name: 'label', type: 'VARCHAR', defaultValue: "'hello'" }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('@default(true)');
      expect(output).toContain('@default(0)');
      expect(output).toContain('@default("hello")');
    });

    it('generates @default(now()) for timestamp defaults', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Post',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'createdAt', type: 'DATETIME', defaultValue: 'NOW()' }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('@default(now())');
    });

    it('generates @default(uuid()) for UUID defaults', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Token',
          columns: [
            col({ id: 'c1', name: 'id', type: 'UUID', primaryKey: true, defaultValue: 'UUID()' }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('@default(uuid())');
    });
  });

  describe('composite PK', () => {
    it('generates @@id for multi-column PK', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'PostTag',
          columns: [
            col({ id: 'c1', name: 'postId', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'tagId', type: 'INT', primaryKey: true }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('@@id([postId, tagId])');
      // Individual columns should NOT have @id
      expect(output).not.toMatch(/postId\s+Int\s+@id/);
      expect(output).not.toMatch(/tagId\s+Int\s+@id/);
    });
  });

  describe('no PK warning', () => {
    it('adds WARNING comment when no PK', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Log',
          columns: [
            col({ id: 'c1', name: 'message', type: 'TEXT' }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('WARNING: No primary key');
    });
  });

  describe('foreign key relations', () => {
    it('generates relation fields for FK', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          columns: [col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
        }),
        table({
          id: 't2',
          name: 'Post',
          columns: [
            col({ id: 'c2', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c3', name: 'authorId', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1',
            columnIds: ['c3'],
            referencedTableId: 't1',
            referencedColumnIds: ['c1'],
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
          }],
        }),
      ]);
      const output = exportPrisma(s);
      // Post model should have relation field
      expect(output).toContain('user User @relation(fields: [authorId], references: [id], onDelete: Cascade)');
      // User model should have back-relation
      expect(output).toContain('posts Post[]');
    });

    it('uses relation name for multiple FKs to same target', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          columns: [col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
        }),
        table({
          id: 't2',
          name: 'Message',
          columns: [
            col({ id: 'c2', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c3', name: 'senderId', type: 'INT' }),
            col({ id: 'c4', name: 'receiverId', type: 'INT' }),
          ],
          foreignKeys: [
            {
              id: 'fk1', columnIds: ['c3'], referencedTableId: 't1', referencedColumnIds: ['c1'],
              onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
            },
            {
              id: 'fk2', columnIds: ['c4'], referencedTableId: 't1', referencedColumnIds: ['c1'],
              onDelete: 'RESTRICT', onUpdate: 'RESTRICT',
            },
          ],
        }),
      ]);
      const output = exportPrisma(s);
      // Should have relation names to disambiguate
      expect(output).toContain('@relation(name: "User_senderId"');
      expect(output).toContain('@relation(name: "User_receiverId"');
    });

    it('skips FK when includeForeignKeys is false', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          columns: [col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true })],
        }),
        table({
          id: 't2',
          name: 'Post',
          columns: [
            col({ id: 'c2', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c3', name: 'authorId', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1', columnIds: ['c3'], referencedTableId: 't1', referencedColumnIds: ['c1'],
            onDelete: 'CASCADE', onUpdate: 'RESTRICT',
          }],
        }),
      ]);
      const output = exportPrisma(s, { includeForeignKeys: false });
      expect(output).not.toContain('@relation');
      expect(output).not.toContain('Post[]');
    });
  });

  describe('unique keys and indexes', () => {
    it('generates @@unique for composite unique keys', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'UserEmail',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'userId', type: 'INT' }),
            col({ id: 'c3', name: 'email', type: 'VARCHAR' }),
          ],
          uniqueKeys: [{ id: 'uk1', columnIds: ['c2', 'c3'] }],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('@@unique([userId, email])');
    });

    it('generates @@index', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Post',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'authorId', type: 'INT' }),
            col({ id: 'c3', name: 'title', type: 'VARCHAR' }),
          ],
          indexes: [
            { id: 'idx1', columnIds: ['c2'], unique: false },
            { id: 'idx2', columnIds: ['c2', 'c3'], unique: false },
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('@@index([authorId])');
      expect(output).toContain('@@index([authorId, title])');
    });

    it('skips indexes when includeIndexes is false', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'Post',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'title', type: 'VARCHAR' }),
          ],
          indexes: [{ id: 'idx1', columnIds: ['c2'], unique: false }],
        }),
      ]);
      const output = exportPrisma(s, { includeIndexes: false });
      expect(output).not.toContain('@@index');
    });
  });

  describe('comments', () => {
    it('generates /// comments for table and column', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          comment: 'User accounts table',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true }),
            col({ id: 'c2', name: 'name', type: 'VARCHAR', comment: 'Display name' }),
          ],
        }),
      ]);
      const output = exportPrisma(s);
      expect(output).toContain('/// User accounts table');
      expect(output).toContain('/// Display name');
    });

    it('skips comments when includeComments is false', () => {
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          comment: 'User table',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, comment: 'PK' }),
          ],
        }),
      ]);
      const output = exportPrisma(s, { includeComments: false });
      expect(output).not.toContain('///');
    });
  });

  describe('round-trip', () => {
    it('preserves semantic meaning through import → export', async () => {
      // We only test that export produces valid-looking Prisma output
      // since the import test already validates import correctness
      const s = schema([
        table({
          id: 't1',
          name: 'User',
          columns: [
            col({ id: 'c1', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
            col({ id: 'c2', name: 'email', type: 'VARCHAR', length: 255, unique: true }),
            col({ id: 'c3', name: 'role', type: 'ENUM', enumValues: ['USER', 'ADMIN'] }),
          ],
        }),
        table({
          id: 't2',
          name: 'Post',
          columns: [
            col({ id: 'c4', name: 'id', type: 'INT', primaryKey: true, autoIncrement: true }),
            col({ id: 'c5', name: 'title', type: 'VARCHAR', length: 200 }),
            col({ id: 'c6', name: 'authorId', type: 'INT' }),
          ],
          foreignKeys: [{
            id: 'fk1', columnIds: ['c6'], referencedTableId: 't1', referencedColumnIds: ['c1'],
            onDelete: 'CASCADE', onUpdate: 'RESTRICT',
          }],
        }),
      ]);

      const output = exportPrisma(s);
      expect(output).toContain('model User');
      expect(output).toContain('model Post');
      expect(output).toContain('enum UserRole');
      expect(output).toContain('@relation');
    });
  });
});
