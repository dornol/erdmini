import { describe, it, expect } from 'vitest';
import { importPrisma } from './prisma-import';

describe('prisma-import', () => {
  describe('basic model parsing', () => {
    it('parses a simple model with scalar fields', () => {
      const schema = `
model User {
  id    Int    @id @default(autoincrement())
  name  String
  email String @unique
}`;
      const result = importPrisma(schema);
      expect(result.errors).toEqual([]);
      expect(result.tables).toHaveLength(1);
      const user = result.tables[0];
      expect(user.name).toBe('User');
      expect(user.columns).toHaveLength(3);

      const idCol = user.columns.find(c => c.name === 'id')!;
      expect(idCol.type).toBe('INT');
      expect(idCol.primaryKey).toBe(true);
      expect(idCol.autoIncrement).toBe(true);
      expect(idCol.nullable).toBe(false);

      const nameCol = user.columns.find(c => c.name === 'name')!;
      expect(nameCol.type).toBe('VARCHAR');
      expect(nameCol.length).toBe(255);

      const emailCol = user.columns.find(c => c.name === 'email')!;
      expect(emailCol.unique).toBe(true);
    });

    it('parses multiple models', () => {
      const schema = `
model User {
  id Int @id
}
model Post {
  id Int @id
}
model Comment {
  id Int @id
}`;
      const result = importPrisma(schema);
      expect(result.tables).toHaveLength(3);
      expect(result.tables.map(t => t.name)).toEqual(['User', 'Post', 'Comment']);
    });
  });

  describe('type mapping', () => {
    it('maps all Prisma scalar types', () => {
      const schema = `
model TypeTest {
  id      Int      @id
  str     String
  big     BigInt
  flt     Float
  dec     Decimal
  bool    Boolean
  dt      DateTime
  js      Json
  bytes   Bytes
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.columns.find(c => c.name === 'str')!.type).toBe('VARCHAR');
      expect(t.columns.find(c => c.name === 'big')!.type).toBe('BIGINT');
      expect(t.columns.find(c => c.name === 'flt')!.type).toBe('FLOAT');
      expect(t.columns.find(c => c.name === 'dec')!.type).toBe('DECIMAL');
      expect(t.columns.find(c => c.name === 'bool')!.type).toBe('BOOLEAN');
      expect(t.columns.find(c => c.name === 'dt')!.type).toBe('DATETIME');
      expect(t.columns.find(c => c.name === 'js')!.type).toBe('JSON');
      expect(t.columns.find(c => c.name === 'bytes')!.type).toBe('TEXT');
    });

    it('handles nullable fields', () => {
      const schema = `
model User {
  id   Int     @id
  bio  String?
  age  Int?
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.columns.find(c => c.name === 'bio')!.nullable).toBe(true);
      expect(t.columns.find(c => c.name === 'age')!.nullable).toBe(true);
      expect(t.columns.find(c => c.name === 'id')!.nullable).toBe(false);
    });
  });

  describe('native type overrides (@db.*)', () => {
    it('maps @db.Text to TEXT', () => {
      const schema = `
model Post {
  id      Int    @id
  content String @db.Text
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'content')!.type).toBe('TEXT');
    });

    it('maps @db.VarChar(N) with length', () => {
      const schema = `
model Post {
  id    Int    @id
  slug  String @db.VarChar(100)
}`;
      const result = importPrisma(schema);
      const col = result.tables[0].columns.find(c => c.name === 'slug')!;
      expect(col.type).toBe('VARCHAR');
      expect(col.length).toBe(100);
    });

    it('maps @db.SmallInt to SMALLINT', () => {
      const schema = `
model Item {
  id    Int @id
  qty   Int @db.SmallInt
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'qty')!.type).toBe('SMALLINT');
    });

    it('maps @db.DoublePrecision to DOUBLE', () => {
      const schema = `
model Metric {
  id    Int   @id
  value Float @db.DoublePrecision
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'value')!.type).toBe('DOUBLE');
    });

    it('maps @db.Uuid to UUID', () => {
      const schema = `
model Token {
  id    String @id @db.Uuid
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'id')!.type).toBe('UUID');
    });

    it('maps @db.Decimal(P,S) with precision/scale', () => {
      const schema = `
model Price {
  id     Int     @id
  amount Decimal @db.Decimal(12, 4)
}`;
      const result = importPrisma(schema);
      const col = result.tables[0].columns.find(c => c.name === 'amount')!;
      expect(col.type).toBe('DECIMAL');
      expect(col.length).toBe(12);
      expect(col.scale).toBe(4);
    });

    it('maps @db.Timestamp to TIMESTAMP', () => {
      const schema = `
model Event {
  id   Int      @id
  at   DateTime @db.Timestamp
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'at')!.type).toBe('TIMESTAMP');
    });
  });

  describe('enum support', () => {
    it('parses enum and maps to ENUM type', () => {
      const schema = `
enum Role {
  USER
  ADMIN
  MODERATOR
}

model User {
  id   Int  @id
  role Role
}`;
      const result = importPrisma(schema);
      const col = result.tables[0].columns.find(c => c.name === 'role')!;
      expect(col.type).toBe('ENUM');
      expect(col.enumValues).toEqual(['USER', 'ADMIN', 'MODERATOR']);
    });
  });

  describe('attributes', () => {
    it('handles @default with literal values', () => {
      const schema = `
model Config {
  id      Int    @id
  active  Boolean @default(true)
  count   Int     @default(0)
  name    String  @default("unnamed")
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.columns.find(c => c.name === 'active')!.defaultValue).toBe('true');
      expect(t.columns.find(c => c.name === 'count')!.defaultValue).toBe('0');
      expect(t.columns.find(c => c.name === 'name')!.defaultValue).toBe('unnamed');
    });

    it('handles @default(now())', () => {
      const schema = `
model Post {
  id        Int      @id
  createdAt DateTime @default(now())
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'createdAt')!.defaultValue).toBe('NOW()');
    });

    it('handles @default(uuid())', () => {
      const schema = `
model Token {
  id String @id @default(uuid())
}`;
      const result = importPrisma(schema);
      const col = result.tables[0].columns.find(c => c.name === 'id')!;
      expect(col.type).toBe('UUID');
      expect(col.defaultValue).toBe('UUID()');
    });

    it('handles @@id for composite PK', () => {
      const schema = `
model PostTag {
  postId Int
  tagId  Int

  @@id([postId, tagId])
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.columns.find(c => c.name === 'postId')!.primaryKey).toBe(true);
      expect(t.columns.find(c => c.name === 'tagId')!.primaryKey).toBe(true);
    });

    it('handles @@unique for composite unique keys', () => {
      const schema = `
model UserEmail {
  id     Int    @id
  userId Int
  email  String

  @@unique([userId, email])
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.uniqueKeys).toHaveLength(1);
      expect(t.uniqueKeys[0].columnIds).toHaveLength(2);
    });

    it('handles @@index', () => {
      const schema = `
model Post {
  id        Int    @id
  title     String
  authorId  Int

  @@index([authorId])
  @@index([title, authorId])
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.indexes).toHaveLength(2);
      expect(t.indexes[0].columnIds).toHaveLength(1);
      expect(t.indexes[1].columnIds).toHaveLength(2);
    });

    it('handles @map and @@map', () => {
      const schema = `
model User {
  id        Int    @id
  firstName String @map("first_name")

  @@map("users")
}`;
      const result = importPrisma(schema);
      const t = result.tables[0];
      expect(t.name).toBe('users');
      expect(t.columns.find(c => c.name === 'first_name')).toBeDefined();
    });
  });

  describe('relations and foreign keys', () => {
    it('parses a basic 1:N relation', () => {
      const schema = `
model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}`;
      const result = importPrisma(schema);
      expect(result.errors).toEqual([]);
      const post = result.tables.find(t => t.name === 'Post')!;
      expect(post.foreignKeys).toHaveLength(1);
      const fk = post.foreignKeys[0];

      // FK should reference the User table
      const user = result.tables.find(t => t.name === 'User')!;
      expect(fk.referencedTableId).toBe(user.id);

      // FK columns
      const authorIdCol = post.columns.find(c => c.name === 'authorId')!;
      expect(fk.columnIds).toEqual([authorIdCol.id]);
      const userIdCol = user.columns.find(c => c.name === 'id')!;
      expect(fk.referencedColumnIds).toEqual([userIdCol.id]);
    });

    it('parses onDelete and onUpdate', () => {
      const schema = `
model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: SetNull)
}`;
      const result = importPrisma(schema);
      const fk = result.tables.find(t => t.name === 'Post')!.foreignKeys[0];
      expect(fk.onDelete).toBe('CASCADE');
      expect(fk.onUpdate).toBe('SET NULL');
    });

    it('skips relation field as column (no virtual columns)', () => {
      const schema = `
model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int    @id
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}`;
      const result = importPrisma(schema);
      const post = result.tables.find(t => t.name === 'Post')!;
      // Should have id, title, authorId — NOT author
      expect(post.columns.map(c => c.name)).toEqual(['id', 'title', 'authorId']);
    });

    it('handles composite FK', () => {
      const schema = `
model Parent {
  a Int
  b Int
  children Child[]

  @@id([a, b])
}

model Child {
  id       Int    @id
  parentA  Int
  parentB  Int
  parent   Parent @relation(fields: [parentA, parentB], references: [a, b])
}`;
      const result = importPrisma(schema);
      const child = result.tables.find(t => t.name === 'Child')!;
      expect(child.foreignKeys).toHaveLength(1);
      expect(child.foreignKeys[0].columnIds).toHaveLength(2);
      expect(child.foreignKeys[0].referencedColumnIds).toHaveLength(2);
    });

    it('warns on implicit M:N relation', () => {
      const schema = `
model Post {
  id   Int  @id
  tags Tag[]
}

model Tag {
  id    Int    @id
  posts Post[]
}`;
      const result = importPrisma(schema);
      // No errors, but both list relations silently skipped (back-relations)
      expect(result.errors).toEqual([]);
      expect(result.tables.find(t => t.name === 'Post')!.foreignKeys).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('returns error for empty input', () => {
      const result = importPrisma('');
      expect(result.tables).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('returns error for invalid syntax', () => {
      const result = importPrisma('this is not valid prisma');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('ignores datasource and generator blocks', () => {
      const schema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id Int @id
}`;
      const result = importPrisma(schema);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].name).toBe('User');
    });

    it('warns when model has no PK', () => {
      const schema = `
model NoPk {
  name String
  email String
}`;
      const result = importPrisma(schema);
      expect(result.warnings.some(w => w.includes('no primary key'))).toBe(true);
    });

    it('assigns grid positions to multiple tables', () => {
      const schema = `
model A { id Int @id }
model B { id Int @id }
model C { id Int @id }
model D { id Int @id }
model E { id Int @id }`;
      const result = importPrisma(schema);
      expect(result.tables).toHaveLength(5);
      // First row: 4 tables, second row: 1 table
      expect(result.tables[4].position.x).toBe(40);
      expect(result.tables[4].position.y).toBe(40 + 220);
    });

    it('handles doc comments on fields', () => {
      const schema = `
model User {
  id   Int    @id
  /// The user display name
  name String
}`;
      const result = importPrisma(schema);
      expect(result.tables[0].columns.find(c => c.name === 'name')!.comment).toBe('The user display name');
    });
  });

  describe('self-referencing relations', () => {
    it('handles self-referencing FK', () => {
      const schema = `
model Category {
  id       Int        @id
  name     String
  parentId Int?
  parent   Category?  @relation("SubCategories", fields: [parentId], references: [id])
  children Category[] @relation("SubCategories")
}`;
      const result = importPrisma(schema);
      const cat = result.tables[0];
      expect(cat.foreignKeys).toHaveLength(1);
      expect(cat.foreignKeys[0].referencedTableId).toBe(cat.id);
    });
  });
});
