/**
 * Integration tests for Prisma import/export — complex patterns, export options,
 * Auth.js adapter, and full-stack SaaS scenarios.
 */
import { describe, it, expect } from 'vitest';
import { importPrisma } from './prisma-import';
import { exportPrisma } from './prisma-export';
import { importDDL } from './ddl-import';
import { exportDDL } from './ddl-export';
import type { Table, ERDSchema } from '$lib/types/erd';

// ─── helpers ────────────────────────────────────────────────────
function findTable(tables: Table[], name: string): Table {
  const t = tables.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (!t) throw new Error(`Table "${name}" not found. Available: ${tables.map(t => t.name).join(', ')}`);
  return t;
}

function findCol(table: Table, name: string) {
  const c = table.columns.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Column "${name}" not in ${table.name}. Available: ${table.columns.map(c => c.name).join(', ')}`);
  return c;
}

function pkNames(table: Table): string[] {
  return table.columns.filter(c => c.primaryKey).map(c => c.name);
}

function hasFKTo(srcTable: Table, targetTable: Table): boolean {
  return srcTable.foreignKeys.some(fk => fk.referencedTableId === targetTable.id);
}

function findFK(srcTable: Table, targetTable: Table) {
  return srcTable.foreignKeys.find(fk => fk.referencedTableId === targetTable.id);
}

function hasUniqueKey(table: Table, colNames: string[]): boolean {
  const colIds = new Set(colNames.map(n => findCol(table, n).id));
  return (
    table.uniqueKeys?.some(
      uk => uk.columnIds.length === colIds.size && uk.columnIds.every(id => colIds.has(id)),
    ) ?? false
  );
}

function hasIndexOn(table: Table, colName: string): boolean {
  const colId = findCol(table, colName).id;
  return table.indexes?.some(idx => idx.columnIds.includes(colId)) ?? false;
}

function toSchema(tables: Table[]): ERDSchema {
  return {
    version: '1',
    tables,
    domains: [],
    memos: [],
    createdAt: '',
    updatedAt: '',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Scenario 7: Complex real-world patterns
// Tests edge cases users encounter in production Prisma schemas.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Complex Prisma patterns', () => {
  it('handles multiple self-referencing relations (tree structures)', () => {
    const schema = `
model Employee {
  id         Int        @id @default(autoincrement())
  name       String     @db.VarChar(100)
  managerId  Int?
  mentorId   Int?

  manager    Employee?  @relation("Management", fields: [managerId], references: [id])
  reports    Employee[] @relation("Management")
  mentor     Employee?  @relation("Mentorship", fields: [mentorId], references: [id])
  mentees    Employee[] @relation("Mentorship")
}
`;
    const result = importPrisma(schema);
    expect(result.errors).toEqual([]);
    const emp = result.tables[0];
    // Two self-referencing FKs
    expect(emp.foreignKeys).toHaveLength(2);
    expect(emp.foreignKeys.every(fk => fk.referencedTableId === emp.id)).toBe(true);
    // Both managerId and mentorId are nullable
    expect(findCol(emp, 'managerId').nullable).toBe(true);
    expect(findCol(emp, 'mentorId').nullable).toBe(true);
  });

  it('handles multiple FKs from one model to another', () => {
    const schema = `
model User {
  id               Int       @id @default(autoincrement())
  name             String

  sentMessages     Message[] @relation("SentMessages")
  receivedMessages Message[] @relation("ReceivedMessages")
}

model Message {
  id         Int      @id @default(autoincrement())
  senderId   Int
  receiverId Int
  content    String   @db.Text
  createdAt  DateTime @default(now())

  sender   User @relation("SentMessages", fields: [senderId], references: [id])
  receiver User @relation("ReceivedMessages", fields: [receiverId], references: [id])
}
`;
    const result = importPrisma(schema);
    expect(result.errors).toEqual([]);
    const message = findTable(result.tables, 'Message');
    const user = findTable(result.tables, 'User');

    expect(message.foreignKeys).toHaveLength(2);
    expect(message.foreignKeys.every(fk => fk.referencedTableId === user.id)).toBe(true);

    // Export and re-import should handle the relation naming
    const exported = exportPrisma(toSchema(result.tables));
    expect(exported).toContain('@relation(name:');

    const reimported = importPrisma(exported);
    expect(reimported.errors).toEqual([]);
    const reMessage = findTable(reimported.tables, 'Message');
    expect(reMessage.foreignKeys).toHaveLength(2);
  });

  it('handles large schema with many interconnected models', () => {
    const schema = `
model User {
  id       Int       @id @default(autoincrement())
  email    String    @unique
  profile  Profile?
  posts    Post[]
  comments Comment[]
  likes    Like[]
  follows  Follow[]  @relation("Follower")
  followers Follow[] @relation("Following")
}

model Profile {
  id     Int    @id @default(autoincrement())
  userId Int    @unique
  bio    String? @db.Text
  avatar String? @db.VarChar(500)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Post {
  id        Int       @id @default(autoincrement())
  authorId  Int
  title     String    @db.VarChar(300)
  body      String    @db.Text
  createdAt DateTime  @default(now())
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments  Comment[]
  likes     Like[]
  tags      PostTag[]
}

model Comment {
  id        Int      @id @default(autoincrement())
  postId    Int
  authorId  Int
  body      String   @db.Text
  createdAt DateTime @default(now())
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id])
}

model Like {
  id     Int  @id @default(autoincrement())
  userId Int
  postId Int
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@unique([userId, postId])
}

model Follow {
  id          Int  @id @default(autoincrement())
  followerId  Int
  followingId Int
  follower    User @relation("Follower", fields: [followerId], references: [id], onDelete: Cascade)
  following   User @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)
  @@unique([followerId, followingId])
}

model Tag {
  id    Int       @id @default(autoincrement())
  name  String    @unique @db.VarChar(50)
  posts PostTag[]
}

model PostTag {
  postId Int
  tagId  Int
  post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag    Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([postId, tagId])
}
`;

    const result = importPrisma(schema);
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(8);

    // Verify the full FK graph
    const user = findTable(result.tables, 'User');
    const profile = findTable(result.tables, 'Profile');
    const post = findTable(result.tables, 'Post');
    const comment = findTable(result.tables, 'Comment');
    const like = findTable(result.tables, 'Like');
    const follow = findTable(result.tables, 'Follow');
    const postTag = findTable(result.tables, 'PostTag');

    expect(hasFKTo(profile, user)).toBe(true);
    expect(hasFKTo(post, user)).toBe(true);
    expect(hasFKTo(comment, post)).toBe(true);
    expect(hasFKTo(comment, user)).toBe(true);
    expect(hasFKTo(like, user)).toBe(true);
    expect(hasFKTo(like, post)).toBe(true);
    expect(hasFKTo(follow, user)).toBe(true);
    expect(follow.foreignKeys).toHaveLength(2); // two FKs to User

    // PostTag composite PK
    expect(pkNames(postTag)).toEqual(['postId', 'tagId']);
    expect(hasFKTo(postTag, post)).toBe(true);

    // Unique constraints
    expect(hasUniqueKey(like, ['userId', 'postId'])).toBe(true);
    expect(hasUniqueKey(follow, ['followerId', 'followingId'])).toBe(true);

    // Full round-trip
    const exported = exportPrisma(toSchema(result.tables));
    const reimported = importPrisma(exported);
    expect(reimported.errors).toEqual([]);
    expect(reimported.tables).toHaveLength(8);

    // Verify total FK count is preserved
    const origFkCount = result.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    const reFkCount = reimported.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    expect(reFkCount).toBe(origFkCount);
  });

  it('handles composite FK (multi-column reference)', () => {
    const schema = `
model Tenant {
  id   Int    @id @default(autoincrement())
  name String
  users TenantUser[]
  docs  Document[]
}

model TenantUser {
  tenantId Int
  userId   Int
  role     String @default("member")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  docs   Document[]

  @@id([tenantId, userId])
}

model Document {
  id              Int    @id @default(autoincrement())
  tenantId        Int
  creatorTenantId Int
  creatorUserId   Int
  title           String

  tenant  Tenant     @relation(fields: [tenantId], references: [id])
  creator TenantUser @relation(fields: [creatorTenantId, creatorUserId], references: [tenantId, userId])
}
`;
    const result = importPrisma(schema);
    expect(result.errors).toEqual([]);

    const doc = findTable(result.tables, 'Document');
    const tenantUser = findTable(result.tables, 'TenantUser');

    // Composite FK: Document → TenantUser
    const compositeFk = doc.foreignKeys.find(fk => fk.referencedTableId === tenantUser.id);
    expect(compositeFk).toBeDefined();
    expect(compositeFk!.columnIds).toHaveLength(2);
    expect(compositeFk!.referencedColumnIds).toHaveLength(2);
  });
});


// ═══════════════════════════════════════════════════════════════════
// Scenario 8: Export options and formatting
// Tests that export options produce correct output variations.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Prisma export options', () => {
  const SCHEMA = `
/// User table
model User {
  id    Int    @id @default(autoincrement())
  /// User email
  email String @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  authorId Int
  title    String
  author   User   @relation(fields: [authorId], references: [id])
  @@index([authorId])
}
`;

  it('includeComments: false strips all doc comments', () => {
    const { tables } = importPrisma(SCHEMA);
    const output = exportPrisma(toSchema(tables), { includeComments: false });
    expect(output).not.toContain('///');
  });

  it('includeComments: true preserves doc comments', () => {
    const { tables } = importPrisma(SCHEMA);
    const output = exportPrisma(toSchema(tables), { includeComments: true });
    expect(output).toContain('/// User table');
    expect(output).toContain('/// User email');
  });

  it('includeForeignKeys: false omits all relation fields', () => {
    const { tables } = importPrisma(SCHEMA);
    const output = exportPrisma(toSchema(tables), { includeForeignKeys: false });
    expect(output).not.toContain('@relation');
    expect(output).not.toContain('Post[]');
  });

  it('includeIndexes: false omits @@index declarations', () => {
    const { tables } = importPrisma(SCHEMA);
    const output = exportPrisma(toSchema(tables), { includeIndexes: false });
    expect(output).not.toContain('@@index');
  });

  it('all options enabled produces complete output', () => {
    const { tables } = importPrisma(SCHEMA);
    const output = exportPrisma(toSchema(tables));
    expect(output).toContain('///');
    expect(output).toContain('@relation');
    expect(output).toContain('@@index');
    expect(output).toContain('Post[]');
    expect(output).toContain('model User');
    expect(output).toContain('model Post');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 7: Auth.js / NextAuth.js — the most common Prisma template
// https://authjs.dev/getting-started/adapters/prisma
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Auth.js (NextAuth) official adapter schema', () => {
  const AUTHJS_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String
  providerAccountId  String
  refresh_token      String? @db.Text
  access_token       String? @db.Text
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String? @db.Text
  session_state      String?
  user               User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@id([identifier, token])
}`;

  const result = importPrisma(AUTHJS_SCHEMA);

  it('imports all 4 Auth.js models without errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(4);
    expect(result.tables.map(t => t.name).sort()).toEqual(['Account', 'Session', 'User', 'VerificationToken']);
  });

  it('User has cuid() default on id → CUID() defaultValue', () => {
    const user = findTable(result.tables, 'User');
    const idCol = findCol(user, 'id');
    expect(idCol.defaultValue).toBe('CUID()');
    expect(idCol.primaryKey).toBe(true);
  });

  it('Account has text fields with @db.Text for tokens', () => {
    const account = findTable(result.tables, 'Account');
    expect(findCol(account, 'refresh_token').type).toBe('TEXT');
    expect(findCol(account, 'access_token').type).toBe('TEXT');
    expect(findCol(account, 'id_token').type).toBe('TEXT');
    expect(findCol(account, 'refresh_token').nullable).toBe(true);
  });

  it('Account has composite unique on [provider, providerAccountId]', () => {
    const account = findTable(result.tables, 'Account');
    expect(hasUniqueKey(account, ['provider', 'providerAccountId'])).toBe(true);
  });

  it('Account and Session FK to User with onDelete: Cascade', () => {
    const user = findTable(result.tables, 'User');
    const account = findTable(result.tables, 'Account');
    const session = findTable(result.tables, 'Session');

    expect(hasFKTo(account, user)).toBe(true);
    expect(findFK(account, user)!.onDelete).toBe('CASCADE');

    expect(hasFKTo(session, user)).toBe(true);
    expect(findFK(session, user)!.onDelete).toBe('CASCADE');
  });

  it('VerificationToken has composite PK [identifier, token]', () => {
    const vt = findTable(result.tables, 'VerificationToken');
    expect(pkNames(vt).sort()).toEqual(['identifier', 'token']);
  });

  it('Session.sessionToken is unique', () => {
    const session = findTable(result.tables, 'Session');
    expect(findCol(session, 'sessionToken').unique).toBe(true);
  });

  it('round-trips through export → re-import', () => {
    const exported = exportPrisma(toSchema(result.tables));
    const reimported = importPrisma(exported);
    expect(reimported.errors).toEqual([]);
    expect(reimported.tables).toHaveLength(4);
    // FK preserved
    const account2 = findTable(reimported.tables, 'Account');
    expect(account2.foreignKeys).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 8: T3 Stack + Drizzle-style schema — typical full-stack app
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Full-stack SaaS (T3/Next.js style)', () => {
  const T3_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique @db.VarChar(320)
  name      String?  @db.VarChar(100)
  avatar    String?  @db.Text
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  plan      Plan     @default(FREE)

  workspaces WorkspaceMember[]
  apiKeys    ApiKey[]
}

enum Role {
  USER
  ADMIN
  SUPER_ADMIN @map("super_admin")
}

enum Plan {
  FREE
  PRO
  ENTERPRISE
}

model Workspace {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(100)
  slug      String   @unique @db.VarChar(50)
  createdAt DateTime @default(now())

  members  WorkspaceMember[]
  projects Project[]
}

model WorkspaceMember {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  workspaceId String   @db.Uuid
  role        String   @default("member") @db.VarChar(20)
  joinedAt    DateTime @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
  @@index([workspaceId])
}

model Project {
  id          String    @id @default(uuid()) @db.Uuid
  workspaceId String    @db.Uuid
  name        String    @db.VarChar(200)
  description String?   @db.Text
  isPublic    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  apiKeys   ApiKey[]

  @@index([workspaceId])
}

model ApiKey {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  projectId String    @db.Uuid
  name      String    @db.VarChar(100)
  keyHash   String    @unique @db.VarChar(64)
  prefix    String    @db.VarChar(8)
  lastUsed  DateTime?
  expiresAt DateTime?
  createdAt DateTime  @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([projectId])
}`;

  const result = importPrisma(T3_SCHEMA);

  it('imports all 5 models + 3 enums without errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(5);
  });

  it('User.id is UUID type with uuid() default', () => {
    const user = findTable(result.tables, 'User');
    const idCol = findCol(user, 'id');
    expect(idCol.type).toBe('UUID');
    expect(idCol.defaultValue).toBe('UUID()');
    expect(idCol.primaryKey).toBe(true);
  });

  it('User.email uses @db.VarChar(320) native type override', () => {
    const user = findTable(result.tables, 'User');
    const emailCol = findCol(user, 'email');
    expect(emailCol.type).toBe('VARCHAR');
    expect(emailCol.length).toBe(320);
    expect(emailCol.unique).toBe(true);
  });

  it('User.updatedAt gets NOW() default from @updatedAt', () => {
    const user = findTable(result.tables, 'User');
    const updatedAt = findCol(user, 'updatedAt');
    expect(updatedAt.type).toBe('DATETIME');
    expect(updatedAt.defaultValue).toBe('NOW()');
  });

  it('maps Role enum with @map on SUPER_ADMIN value', () => {
    const user = findTable(result.tables, 'User');
    const roleCol = findCol(user, 'role');
    expect(roleCol.type).toBe('ENUM');
    expect(roleCol.enumValues).toContain('super_admin');
    expect(roleCol.enumValues).toContain('USER');
    expect(roleCol.enumValues).toContain('ADMIN');
    expect(roleCol.defaultValue).toBe('USER');
  });

  it('Plan enum is mapped as ENUM type with 3 values', () => {
    const user = findTable(result.tables, 'User');
    const planCol = findCol(user, 'plan');
    expect(planCol.type).toBe('ENUM');
    expect(planCol.enumValues).toEqual(['FREE', 'PRO', 'ENTERPRISE']);
    expect(planCol.defaultValue).toBe('FREE');
  });

  it('WorkspaceMember has composite unique + index + 2 FKs', () => {
    const wm = findTable(result.tables, 'WorkspaceMember');
    const user = findTable(result.tables, 'User');
    const ws = findTable(result.tables, 'Workspace');

    expect(hasUniqueKey(wm, ['userId', 'workspaceId'])).toBe(true);
    expect(hasIndexOn(wm, 'workspaceId')).toBe(true);
    expect(hasFKTo(wm, user)).toBe(true);
    expect(hasFKTo(wm, ws)).toBe(true);
    expect(findFK(wm, user)!.onDelete).toBe('CASCADE');
  });

  it('Project has soft-delete pattern (nullable deletedAt)', () => {
    const project = findTable(result.tables, 'Project');
    const deletedAt = findCol(project, 'deletedAt');
    expect(deletedAt.type).toBe('DATETIME');
    expect(deletedAt.nullable).toBe(true);
  });

  it('ApiKey has 2 indexes and 2 FK relations', () => {
    const apiKey = findTable(result.tables, 'ApiKey');
    expect(apiKey.indexes.length).toBeGreaterThanOrEqual(2);
    expect(apiKey.foreignKeys).toHaveLength(2);
  });

  it('Boolean default works (Project.isPublic = false)', () => {
    const project = findTable(result.tables, 'Project');
    expect(findCol(project, 'isPublic').defaultValue).toBe('false');
  });

  it('String default works (WorkspaceMember.role = "member")', () => {
    const wm = findTable(result.tables, 'WorkspaceMember');
    expect(findCol(wm, 'role').defaultValue).toBe('member');
  });
});
