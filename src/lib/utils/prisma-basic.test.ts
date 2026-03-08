/**
 * Integration tests for Prisma import/export using realistic user scenarios.
 * Tests real-world Prisma schemas from popular projects and verifies
 * round-trip data integrity through import → export → re-import cycles.
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
// Scenario 1: E-commerce (Next.js + Prisma + PostgreSQL)
// A typical SaaS e-commerce schema with users, products, orders,
// reviews — the most common Prisma use case.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: E-commerce SaaS (Prisma)', () => {
  const ECOMMERCE_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  USER
  ADMIN
  SELLER
}

enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

/// User accounts for the platform
model User {
  id        String   @id @default(uuid())
  email     String   @unique @db.VarChar(320)
  name      String   @db.VarChar(100)
  password  String   @db.Text
  role      Role     @default(USER)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orders    Order[]
  reviews   Review[]
  addresses Address[]

  @@index([email])
  @@index([role])
}

model Address {
  id       Int    @id @default(autoincrement())
  userId   String
  line1    String @db.VarChar(200)
  line2    String? @db.VarChar(200)
  city     String @db.VarChar(100)
  state    String @db.VarChar(50)
  zip      String @db.VarChar(20)
  country  String @db.VarChar(2)
  isDefault Boolean @default(false)

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  orders Order[]

  @@index([userId])
}

/// Product catalog
model Product {
  id          Int      @id @default(autoincrement())
  sku         String   @unique @db.VarChar(50)
  name        String   @db.VarChar(200)
  description String?  @db.Text
  price       Decimal  @db.Decimal(10, 2)
  stock       Int      @default(0)
  active      Boolean  @default(true)
  categoryId  Int?
  createdAt   DateTime @default(now())

  category   Category?   @relation(fields: [categoryId], references: [id])
  orderItems OrderItem[]
  reviews    Review[]

  @@index([categoryId])
  @@index([sku])
}

model Category {
  id       Int        @id @default(autoincrement())
  name     String     @unique @db.VarChar(100)
  parentId Int?
  parent   Category?  @relation("SubCategories", fields: [parentId], references: [id])
  children Category[] @relation("SubCategories")
  products Product[]
}

model Order {
  id        Int         @id @default(autoincrement())
  userId    String
  addressId Int
  status    OrderStatus @default(PENDING)
  total     Decimal     @db.Decimal(12, 2)
  note      String?     @db.Text
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  user      User        @relation(fields: [userId], references: [id])
  address   Address     @relation(fields: [addressId], references: [id])
  items     OrderItem[]

  @@index([userId])
  @@index([status])
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int
  productId Int
  quantity  Int     @default(1)
  unitPrice Decimal @db.Decimal(10, 2)

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@unique([orderId, productId])
}

model Review {
  id        Int      @id @default(autoincrement())
  userId    String
  productId Int
  rating    Int
  title     String   @db.VarChar(200)
  body      String?  @db.Text
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([userId, productId])
  @@index([productId])
}
`;

  it('imports all 7 models without errors', () => {
    const result = importPrisma(ECOMMERCE_SCHEMA);
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(7);
    expect(result.tables.map(t => t.name).sort()).toEqual(
      ['Address', 'Category', 'Order', 'OrderItem', 'Product', 'Review', 'User'],
    );
  });

  it('maps User columns correctly with native types and defaults', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const user = findTable(tables, 'User');

    const id = findCol(user, 'id');
    expect(id.type).toBe('UUID');
    expect(id.primaryKey).toBe(true);
    expect(id.defaultValue).toBe('UUID()');

    const email = findCol(user, 'email');
    expect(email.type).toBe('VARCHAR');
    expect(email.length).toBe(320);
    expect(email.unique).toBe(true);

    const password = findCol(user, 'password');
    expect(password.type).toBe('TEXT');

    const role = findCol(user, 'role');
    expect(role.type).toBe('ENUM');
    expect(role.enumValues).toEqual(['USER', 'ADMIN', 'SELLER']);
    expect(role.defaultValue).toBe('USER');

    const active = findCol(user, 'active');
    expect(active.type).toBe('BOOLEAN');
    expect(active.defaultValue).toBe('true');

    const createdAt = findCol(user, 'createdAt');
    expect(createdAt.type).toBe('DATETIME');
    expect(createdAt.defaultValue).toBe('NOW()');
  });

  it('resolves FK relationships across all models', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const user = findTable(tables, 'User');
    const address = findTable(tables, 'Address');
    const product = findTable(tables, 'Product');
    const category = findTable(tables, 'Category');
    const order = findTable(tables, 'Order');
    const orderItem = findTable(tables, 'OrderItem');
    const review = findTable(tables, 'Review');

    // Address → User (onDelete: Cascade)
    expect(hasFKTo(address, user)).toBe(true);
    expect(findFK(address, user)!.onDelete).toBe('CASCADE');

    // Order → User, Order → Address
    expect(hasFKTo(order, user)).toBe(true);
    expect(hasFKTo(order, address)).toBe(true);

    // OrderItem → Order (Cascade), OrderItem → Product
    expect(hasFKTo(orderItem, order)).toBe(true);
    expect(findFK(orderItem, order)!.onDelete).toBe('CASCADE');
    expect(hasFKTo(orderItem, product)).toBe(true);

    // Review → User (Cascade), Review → Product (Cascade)
    expect(hasFKTo(review, user)).toBe(true);
    expect(findFK(review, user)!.onDelete).toBe('CASCADE');
    expect(hasFKTo(review, product)).toBe(true);
    expect(findFK(review, product)!.onDelete).toBe('CASCADE');

    // Product → Category (optional)
    expect(hasFKTo(product, category)).toBe(true);

    // Category → Category (self-referencing)
    expect(hasFKTo(category, category)).toBe(true);
  });

  it('imports composite unique keys', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const orderItem = findTable(tables, 'OrderItem');
    expect(hasUniqueKey(orderItem, ['orderId', 'productId'])).toBe(true);

    const review = findTable(tables, 'Review');
    expect(hasUniqueKey(review, ['userId', 'productId'])).toBe(true);
  });

  it('imports indexes', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const user = findTable(tables, 'User');
    expect(hasIndexOn(user, 'email')).toBe(true);
    expect(hasIndexOn(user, 'role')).toBe(true);

    const product = findTable(tables, 'Product');
    expect(hasIndexOn(product, 'categoryId')).toBe(true);
    expect(hasIndexOn(product, 'sku')).toBe(true);
  });

  it('preserves table comments via doc comments', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const user = findTable(tables, 'User');
    expect(user.comment).toBe('User accounts for the platform');

    const product = findTable(tables, 'Product');
    expect(product.comment).toBe('Product catalog');
  });

  it('exports nullable fields with ?', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const product = findTable(tables, 'Product');
    expect(findCol(product, 'description').nullable).toBe(true);
    expect(findCol(product, 'categoryId').nullable).toBe(true);
    expect(findCol(product, 'name').nullable).toBe(false);
  });

  it('handles Decimal precision and scale', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const product = findTable(tables, 'Product');
    const price = findCol(product, 'price');
    expect(price.type).toBe('DECIMAL');
    expect(price.length).toBe(10);
    expect(price.scale).toBe(2);

    const order = findTable(tables, 'Order');
    const total = findCol(order, 'total');
    expect(total.type).toBe('DECIMAL');
    expect(total.length).toBe(12);
    expect(total.scale).toBe(2);
  });

  it('relation fields are not included as columns', () => {
    const { tables } = importPrisma(ECOMMERCE_SCHEMA);
    const user = findTable(tables, 'User');
    // User should NOT have columns named 'orders', 'reviews', 'addresses'
    expect(user.columns.find(c => c.name === 'orders')).toBeUndefined();
    expect(user.columns.find(c => c.name === 'reviews')).toBeUndefined();
    expect(user.columns.find(c => c.name === 'addresses')).toBeUndefined();

    const order = findTable(tables, 'Order');
    expect(order.columns.find(c => c.name === 'user')).toBeUndefined();
    expect(order.columns.find(c => c.name === 'address')).toBeUndefined();
    expect(order.columns.find(c => c.name === 'items')).toBeUndefined();
  });
});


// ═══════════════════════════════════════════════════════════════════
// Scenario 2: Blog + CMS (T3 Stack / Prisma typical starter)
// A common schema for blog/CMS apps with auth, posts, tags, media.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Blog CMS (Prisma)', () => {
  const BLOG_SCHEMA = `
enum PublishStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?

  accounts Account[]
  sessions Session[]
  posts    Post[]
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@id([identifier, token])
}

model Post {
  id          String        @id @default(cuid())
  slug        String        @unique @db.VarChar(300)
  title       String        @db.VarChar(500)
  excerpt     String?       @db.VarChar(1000)
  content     String        @db.Text
  status      PublishStatus @default(DRAFT)
  publishedAt DateTime?
  authorId    String
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  author     User      @relation(fields: [authorId], references: [id])
  tags       PostTag[]
  comments   Comment[]
  media      Media[]

  @@index([authorId])
  @@index([status])
  @@index([slug])
}

model Tag {
  id    Int     @id @default(autoincrement())
  name  String  @unique @db.VarChar(50)
  slug  String  @unique @db.VarChar(60)
  posts PostTag[]
}

model PostTag {
  postId String
  tagId  Int

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([postId, tagId])
}

model Comment {
  id        Int      @id @default(autoincrement())
  postId    String
  authorName String  @db.VarChar(100)
  email     String   @db.VarChar(320)
  body      String   @db.Text
  approved  Boolean  @default(false)
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
}

model Media {
  id       Int    @id @default(autoincrement())
  postId   String?
  url      String @db.VarChar(2000)
  altText  String? @db.VarChar(500)
  mimeType String @db.VarChar(100)
  size     Int
  createdAt DateTime @default(now())

  post Post? @relation(fields: [postId], references: [id], onDelete: SetNull)
}
`;

  it('imports all 9 models', () => {
    const result = importPrisma(BLOG_SCHEMA);
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(9);
  });

  it('handles NextAuth.js Account model with composite unique', () => {
    const { tables } = importPrisma(BLOG_SCHEMA);
    const account = findTable(tables, 'Account');

    expect(findCol(account, 'id').defaultValue).toBe('CUID()');
    expect(findCol(account, 'refresh_token').nullable).toBe(true);
    expect(findCol(account, 'refresh_token').type).toBe('TEXT');
    expect(hasUniqueKey(account, ['provider', 'providerAccountId'])).toBe(true);
  });

  it('handles VerificationToken composite PK', () => {
    const { tables } = importPrisma(BLOG_SCHEMA);
    const vt = findTable(tables, 'VerificationToken');
    expect(pkNames(vt)).toEqual(['identifier', 'token']);
    expect(findCol(vt, 'token').unique).toBe(true);
  });

  it('handles PostTag join table with composite PK and cascade FKs', () => {
    const { tables } = importPrisma(BLOG_SCHEMA);
    const postTag = findTable(tables, 'PostTag');
    expect(pkNames(postTag)).toEqual(['postId', 'tagId']);

    const post = findTable(tables, 'Post');
    const tag = findTable(tables, 'Tag');
    expect(hasFKTo(postTag, post)).toBe(true);
    expect(hasFKTo(postTag, tag)).toBe(true);
    expect(findFK(postTag, post)!.onDelete).toBe('CASCADE');
    expect(findFK(postTag, tag)!.onDelete).toBe('CASCADE');
  });

  it('handles Media optional FK (onDelete: SetNull)', () => {
    const { tables } = importPrisma(BLOG_SCHEMA);
    const media = findTable(tables, 'Media');
    const post = findTable(tables, 'Post');

    expect(findCol(media, 'postId').nullable).toBe(true);
    expect(hasFKTo(media, post)).toBe(true);
    expect(findFK(media, post)!.onDelete).toBe('SET NULL');
  });

  it('maps cuid() defaults and VarChar lengths correctly', () => {
    const { tables } = importPrisma(BLOG_SCHEMA);
    const post = findTable(tables, 'Post');

    expect(findCol(post, 'id').defaultValue).toBe('CUID()');
    expect(findCol(post, 'slug').type).toBe('VARCHAR');
    expect(findCol(post, 'slug').length).toBe(300);
    expect(findCol(post, 'title').length).toBe(500);
    expect(findCol(post, 'excerpt').length).toBe(1000);
    expect(findCol(post, 'content').type).toBe('TEXT');
  });
});


// ═══════════════════════════════════════════════════════════════════
// Scenario 3: Multi-tenant SaaS with @@map (snake_case tables)
// Tests @@map and @map for snake_case database naming conventions.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Multi-tenant SaaS with @@map (Prisma)', () => {
  const SAAS_SCHEMA = `
model Organization {
  id        Int      @id @default(autoincrement())
  name      String   @db.VarChar(200)
  slug      String   @unique @db.VarChar(100)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  members  Membership[]
  projects Project[]

  @@map("organizations")
}

model Membership {
  id        Int    @id @default(autoincrement())
  userId    Int    @map("user_id")
  orgId     Int    @map("org_id")
  role      String @default("member") @db.VarChar(20)

  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId])
  @@map("memberships")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique @db.VarChar(320)
  name  String @db.VarChar(100)

  memberships Membership[]
  tasks       Task[]

  @@map("users")
}

model Project {
  id    Int    @id @default(autoincrement())
  orgId Int    @map("org_id")
  name  String @db.VarChar(200)

  org   Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  tasks Task[]

  @@map("projects")
}

model Task {
  id         Int      @id @default(autoincrement())
  projectId  Int      @map("project_id")
  assigneeId Int?     @map("assignee_id")
  title      String   @db.VarChar(300)
  done       Boolean  @default(false)
  dueDate    DateTime? @map("due_date") @db.Date
  createdAt  DateTime @default(now()) @map("created_at")

  project  Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignee User?   @relation(fields: [assigneeId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([assigneeId])
  @@map("tasks")
}
`;

  it('uses @@map table names instead of model names', () => {
    const { tables } = importPrisma(SAAS_SCHEMA);
    expect(tables.map(t => t.name).sort()).toEqual(
      ['memberships', 'organizations', 'projects', 'tasks', 'users'],
    );
  });

  it('uses @map column names instead of field names', () => {
    const { tables } = importPrisma(SAAS_SCHEMA);
    const org = findTable(tables, 'organizations');
    expect(org.columns.find(c => c.name === 'created_at')).toBeDefined();
    expect(org.columns.find(c => c.name === 'updated_at')).toBeDefined();

    const task = findTable(tables, 'tasks');
    expect(task.columns.find(c => c.name === 'project_id')).toBeDefined();
    expect(task.columns.find(c => c.name === 'assignee_id')).toBeDefined();
    expect(task.columns.find(c => c.name === 'due_date')).toBeDefined();
    expect(findCol(task, 'due_date').type).toBe('DATE');
  });

  it('resolves FKs correctly when using @map column names', () => {
    const { tables } = importPrisma(SAAS_SCHEMA);
    const membership = findTable(tables, 'memberships');
    const user = findTable(tables, 'users');
    const org = findTable(tables, 'organizations');

    expect(hasFKTo(membership, user)).toBe(true);
    expect(hasFKTo(membership, org)).toBe(true);
    expect(findFK(membership, user)!.onDelete).toBe('CASCADE');
    expect(findFK(membership, org)!.onDelete).toBe('CASCADE');
  });

  it('maps composite unique with mapped column names', () => {
    const { tables } = importPrisma(SAAS_SCHEMA);
    const membership = findTable(tables, 'memberships');
    // The unique key uses the original Prisma field names (userId, orgId) for resolution,
    // but the column IDs point to the @map'd columns
    expect(membership.uniqueKeys.length).toBeGreaterThanOrEqual(1);
  });
});


// ═══════════════════════════════════════════════════════════════════
// Scenario 4: Import → Export → Re-import round-trip
// Verifies that data integrity is preserved across format cycles.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Prisma Import → Export → Re-import round-trip', () => {
  const ROUNDTRIP_SCHEMA = `
enum Status {
  ACTIVE
  INACTIVE
  SUSPENDED
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(320)
  name      String   @db.VarChar(100)
  status    Status   @default(ACTIVE)
  bio       String?  @db.Text
  score     Decimal  @db.Decimal(8, 3)
  isAdmin   Boolean  @default(false)
  createdAt DateTime @default(now())

  posts    Post[]
  comments Comment[]
}

model Post {
  id        Int      @id @default(autoincrement())
  authorId  Int
  title     String   @db.VarChar(500)
  content   String   @db.Text
  published Boolean  @default(false)
  viewCount Int      @default(0)
  createdAt DateTime @default(now())

  author   User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments Comment[]

  @@index([authorId])
}

model Comment {
  id       Int      @id @default(autoincrement())
  postId   Int
  authorId Int
  body     String   @db.Text
  createdAt DateTime @default(now())

  post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id])

  @@index([postId])
  @@index([authorId])
}
`;

  it('preserves table count and names through round-trip', () => {
    const imported = importPrisma(ROUNDTRIP_SCHEMA);
    expect(imported.errors).toEqual([]);

    const exported = exportPrisma(toSchema(imported.tables));
    const reimported = importPrisma(exported);
    expect(reimported.errors).toEqual([]);

    expect(reimported.tables).toHaveLength(imported.tables.length);
    const origNames = imported.tables.map(t => t.name).sort();
    const reNames = reimported.tables.map(t => t.name).sort();
    expect(reNames).toEqual(origNames);
  });

  it('preserves column types, nullability, and PK through round-trip', () => {
    const imported = importPrisma(ROUNDTRIP_SCHEMA);
    const exported = exportPrisma(toSchema(imported.tables));
    const reimported = importPrisma(exported);

    for (const origTable of imported.tables) {
      const reTable = findTable(reimported.tables, origTable.name);
      // Same number of columns
      expect(reTable.columns.length).toBe(origTable.columns.length);

      for (const origCol of origTable.columns) {
        const reCol = findCol(reTable, origCol.name);
        expect(reCol.type).toBe(origCol.type);
        expect(reCol.nullable).toBe(origCol.nullable);
        expect(reCol.primaryKey).toBe(origCol.primaryKey);
        expect(reCol.unique).toBe(origCol.unique);
        expect(reCol.autoIncrement).toBe(origCol.autoIncrement);
      }
    }
  });

  it('preserves FK count and referential actions through round-trip', () => {
    const imported = importPrisma(ROUNDTRIP_SCHEMA);
    const exported = exportPrisma(toSchema(imported.tables));
    const reimported = importPrisma(exported);

    // Post → User FK
    const origPost = findTable(imported.tables, 'Post');
    const rePost = findTable(reimported.tables, 'Post');
    expect(rePost.foreignKeys.length).toBe(origPost.foreignKeys.length);

    // Verify cascade is preserved
    const reUser = findTable(reimported.tables, 'User');
    const fk = findFK(rePost, reUser);
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe('CASCADE');

    // Comment has 2 FKs
    const origComment = findTable(imported.tables, 'Comment');
    const reComment = findTable(reimported.tables, 'Comment');
    expect(reComment.foreignKeys.length).toBe(origComment.foreignKeys.length);
  });

  it('preserves enum types and values through round-trip', () => {
    const imported = importPrisma(ROUNDTRIP_SCHEMA);
    const exported = exportPrisma(toSchema(imported.tables));
    const reimported = importPrisma(exported);

    const origUser = findTable(imported.tables, 'User');
    const reUser = findTable(reimported.tables, 'User');

    const origStatus = findCol(origUser, 'status');
    const reStatus = findCol(reUser, 'status');
    expect(reStatus.type).toBe('ENUM');
    expect(reStatus.enumValues).toEqual(origStatus.enumValues);
  });

  it('preserves indexes through round-trip', () => {
    const imported = importPrisma(ROUNDTRIP_SCHEMA);
    const exported = exportPrisma(toSchema(imported.tables));
    const reimported = importPrisma(exported);

    const origPost = findTable(imported.tables, 'Post');
    const rePost = findTable(reimported.tables, 'Post');
    expect(rePost.indexes.length).toBe(origPost.indexes.length);
  });

  it('preserves defaults (autoincrement, now, boolean, numeric) through round-trip', () => {
    const imported = importPrisma(ROUNDTRIP_SCHEMA);
    const exported = exportPrisma(toSchema(imported.tables));
    const reimported = importPrisma(exported);

    const reUser = findTable(reimported.tables, 'User');
    expect(findCol(reUser, 'id').autoIncrement).toBe(true);
    expect(findCol(reUser, 'createdAt').defaultValue).toBe('NOW()');
    expect(findCol(reUser, 'isAdmin').defaultValue).toBe('false');
  });
});


// ═══════════════════════════════════════════════════════════════════
// Scenario 5: Cross-format conversion DDL → Prisma
// User imports SQL DDL, then exports as Prisma — a real migration scenario.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: DDL → ERD → Prisma export', () => {
  it('converts a MySQL DDL schema into valid Prisma output', async () => {
    const mysqlDDL = `
CREATE TABLE \`users\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`email\` VARCHAR(255) NOT NULL,
  \`name\` VARCHAR(100) NOT NULL,
  \`active\` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY (\`email\`)
) ENGINE=InnoDB;

CREATE TABLE \`posts\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`author_id\` INT NOT NULL,
  \`title\` VARCHAR(200) NOT NULL,
  \`body\` TEXT,
  \`published\` BOOLEAN DEFAULT false,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;

ALTER TABLE \`posts\` ADD CONSTRAINT \`fk_posts_author\`
  FOREIGN KEY (\`author_id\`) REFERENCES \`users\` (\`id\`)
  ON DELETE CASCADE ON UPDATE NO ACTION;
`;

    const ddlResult = await importDDL(mysqlDDL, 'mysql');
    expect(ddlResult.errors).toEqual([]);
    expect(ddlResult.tables).toHaveLength(2);

    const prismaOutput = exportPrisma(toSchema(ddlResult.tables));

    // Should contain model declarations
    expect(prismaOutput).toContain('model Users {');
    expect(prismaOutput).toContain('model Posts {');

    // Should have @@map since table names are lowercase
    expect(prismaOutput).toContain('@@map("users")');
    expect(prismaOutput).toContain('@@map("posts")');

    // PK and autoincrement
    expect(prismaOutput).toContain('@id');
    expect(prismaOutput).toContain('@default(autoincrement())');

    // Unique
    expect(prismaOutput).toContain('@unique');

    // FK relation
    expect(prismaOutput).toContain('@relation');
    expect(prismaOutput).toContain('onDelete: Cascade');

    // Should be re-importable as Prisma
    const reimported = importPrisma(prismaOutput);
    expect(reimported.errors).toEqual([]);
    expect(reimported.tables).toHaveLength(2);

    // Verify core properties survive DDL → Prisma → re-import
    const reUser = findTable(reimported.tables, 'users');
    expect(findCol(reUser, 'id').autoIncrement).toBe(true);
    expect(findCol(reUser, 'email').unique).toBe(true);
  });

  it('converts a PostgreSQL DDL into Prisma with correct type mapping', async () => {
    const pgDDL = `
CREATE TABLE "products" (
  "id" SERIAL NOT NULL,
  "sku" VARCHAR(50) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "weight" DOUBLE PRECISION,
  "in_stock" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSON,
  PRIMARY KEY ("id"),
  UNIQUE ("sku")
);
`;

    const ddlResult = await importDDL(pgDDL, 'postgresql');
    expect(ddlResult.errors).toEqual([]);

    const prismaOutput = exportPrisma(toSchema(ddlResult.tables));

    // Verify it can be re-imported
    const reimported = importPrisma(prismaOutput);
    expect(reimported.errors).toEqual([]);
    const product = findTable(reimported.tables, 'products');
    // Type fidelity checks
    expect(findCol(product, 'sku').unique).toBe(true);
    expect(findCol(product, 'price').type).toBe('DECIMAL');
    expect(findCol(product, 'id').autoIncrement).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════
// Scenario 6: Prisma → ERD → DDL export
// User imports Prisma schema, then exports as DDL SQL.
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Prisma → ERD → DDL export', () => {
  const SIMPLE_PRISMA = `
model User {
  id    Int    @id @default(autoincrement())
  email String @unique @db.VarChar(255)
  name  String @db.VarChar(100)
  posts Post[]
}

model Post {
  id       Int      @id @default(autoincrement())
  title    String   @db.VarChar(200)
  content  String   @db.Text
  authorId Int
  author   User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
`;

  it('generates valid MySQL DDL from Prisma import', () => {
    const { tables } = importPrisma(SIMPLE_PRISMA);
    const ddl = exportDDL(toSchema(tables), 'mysql');

    expect(ddl).toContain('CREATE TABLE');
    expect(ddl).toContain('`User`');
    expect(ddl).toContain('`Post`');
    expect(ddl).toContain('AUTO_INCREMENT');
    expect(ddl).toContain('VARCHAR(255)');
    expect(ddl).toContain('VARCHAR(200)');
    expect(ddl).toContain('TEXT');
    expect(ddl).toContain('UNIQUE');
    expect(ddl).toContain('FOREIGN KEY');
    expect(ddl).toContain('ON DELETE CASCADE');
  });

  it('generates valid PostgreSQL DDL from Prisma import', () => {
    const { tables } = importPrisma(SIMPLE_PRISMA);
    const ddl = exportDDL(toSchema(tables), 'postgresql');

    expect(ddl).toContain('CREATE TABLE');
    expect(ddl).toContain('"User"');
    expect(ddl).toContain('"Post"');
    expect(ddl).toContain('SERIAL');
    expect(ddl).toContain('FOREIGN KEY');
  });

  it('Prisma → MySQL DDL → re-import preserves structure', async () => {
    const prismaResult = importPrisma(SIMPLE_PRISMA);
    const mysqlDDL = exportDDL(toSchema(prismaResult.tables), 'mysql');
    const ddlResult = await importDDL(mysqlDDL, 'mysql');

    expect(ddlResult.errors).toEqual([]);
    expect(ddlResult.tables).toHaveLength(2);

    const user = findTable(ddlResult.tables, 'User');
    const post = findTable(ddlResult.tables, 'Post');
    expect(findCol(user, 'id').autoIncrement).toBe(true);
    expect(findCol(user, 'email').unique).toBe(true);
    expect(hasFKTo(post, user)).toBe(true);
    expect(findFK(post, user)!.onDelete).toBe('CASCADE');
  });
});
