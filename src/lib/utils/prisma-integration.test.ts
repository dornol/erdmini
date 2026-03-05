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

// ═══════════════════════════════════════════════════════════════════
// Scenario 9: @ignore, @@ignore, Unsupported types — real edge cases
// ═══════════════════════════════════════════════════════════════════
describe('Integration: @ignore / @@ignore / Unsupported patterns', () => {
  it('@@ignore model is skipped entirely', () => {
    const schema = `
model User {
  id   Int    @id
  name String
}

model InternalLog {
  id   Int    @id
  data String

  @@ignore
}

model Post {
  id     Int    @id
  title  String
  userId Int
  user   User   @relation(fields: [userId], references: [id])
}`;
    const result = importPrisma(schema);
    expect(result.tables.map(t => t.name).sort()).toEqual(['Post', 'User']);
    expect(result.warnings.some(w => w.includes('@@ignore'))).toBe(true);
  });

  it('@ignore field is excluded from columns', () => {
    const schema = `
model User {
  id        Int     @id
  name      String
  password  String  @ignore
  tempToken String? @ignore
}`;
    const result = importPrisma(schema);
    const user = result.tables[0];
    expect(user.columns.map(c => c.name)).toEqual(['id', 'name']);
  });

  it('Unsupported type generates warning and skips field', () => {
    const schema = `
model GeoData {
  id       Int                    @id
  name     String
  location Unsupported("geometry")
  path     Unsupported("ltree")?
}`;
    const result = importPrisma(schema);
    const geo = result.tables[0];
    expect(geo.columns.map(c => c.name)).toEqual(['id', 'name']);
    expect(result.warnings.filter(w => w.includes('Unsupported'))).toHaveLength(2);
  });

  it('@ignore + @@ignore + Unsupported combined', () => {
    const schema = `
model Visible {
  id     Int    @id
  name   String
  secret String @ignore
}

model Hidden {
  id Int @id
  @@ignore
}

model WithGeo {
  id    Int                     @id
  title String
  point Unsupported("geometry")
}`;
    const result = importPrisma(schema);
    expect(result.tables).toHaveLength(2);
    expect(result.tables.map(t => t.name).sort()).toEqual(['Visible', 'WithGeo']);

    const visible = findTable(result.tables, 'Visible');
    expect(visible.columns.map(c => c.name)).toEqual(['id', 'name']);

    const withGeo = findTable(result.tables, 'WithGeo');
    expect(withGeo.columns.map(c => c.name)).toEqual(['id', 'title']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 10: Stripe/billing-style schema with advanced patterns
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Billing/Stripe-style schema', () => {
  const BILLING_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Customer {
  id               String   @id @default(cuid())
  stripeCustomerId String?  @unique @db.VarChar(255)
  email            String   @unique
  name             String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  subscriptions Subscription[]
  invoices      Invoice[]
  paymentMethods PaymentMethod[]
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
  INCOMPLETE
  PAUSED
}

enum InvoiceStatus {
  DRAFT
  OPEN
  PAID
  VOID
  UNCOLLECTIBLE
}

model Subscription {
  id                   String             @id @default(cuid())
  customerId           String
  stripeSubscriptionId String?            @unique
  status               SubscriptionStatus @default(ACTIVE)
  priceId              String
  quantity             Int                @default(1)
  cancelAtPeriodEnd    Boolean            @default(false)
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  trialEnd             DateTime?
  canceledAt           DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  items    SubscriptionItem[]

  @@index([customerId])
  @@index([status])
}

model SubscriptionItem {
  id             String @id @default(cuid())
  subscriptionId String
  priceId        String
  quantity       Int    @default(1)

  subscription Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId])
}

model Invoice {
  id              String        @id @default(cuid())
  customerId      String
  stripeInvoiceId String?       @unique
  status          InvoiceStatus @default(DRAFT)
  currency        String        @default("usd") @db.VarChar(3)
  subtotal        Decimal       @db.Decimal(10, 2)
  tax             Decimal       @default(0) @db.Decimal(10, 2)
  total           Decimal       @db.Decimal(10, 2)
  amountPaid      Decimal       @default(0) @db.Decimal(10, 2)
  dueDate         DateTime?
  paidAt          DateTime?
  createdAt       DateTime      @default(now())

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  items    InvoiceItem[]

  @@index([customerId])
  @@index([status])
}

model InvoiceItem {
  id          String  @id @default(cuid())
  invoiceId   String
  description String
  quantity    Int     @default(1)
  unitPrice   Decimal @db.Decimal(10, 2)
  amount      Decimal @db.Decimal(10, 2)

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
}

model PaymentMethod {
  id               String   @id @default(cuid())
  customerId       String
  stripePaymentId  String?  @unique
  type             String   @db.VarChar(30)
  last4            String?  @db.Char(4)
  expiryMonth      Int?     @db.SmallInt
  expiryYear       Int?     @db.SmallInt
  isDefault        Boolean  @default(false)
  createdAt        DateTime @default(now())

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([customerId])
}`;

  const result = importPrisma(BILLING_SCHEMA);

  it('imports all 6 billing models', () => {
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(6);
    expect(result.tables.map(t => t.name).sort()).toEqual([
      'Customer', 'Invoice', 'InvoiceItem', 'PaymentMethod',
      'Subscription', 'SubscriptionItem',
    ]);
  });

  it('Decimal columns have correct precision and scale', () => {
    const invoice = findTable(result.tables, 'Invoice');
    const subtotal = findCol(invoice, 'subtotal');
    expect(subtotal.type).toBe('DECIMAL');
    expect(subtotal.length).toBe(10);
    expect(subtotal.scale).toBe(2);

    const tax = findCol(invoice, 'tax');
    expect(tax.defaultValue).toBe('0');
  });

  it('SmallInt native type mapped correctly', () => {
    const pm = findTable(result.tables, 'PaymentMethod');
    expect(findCol(pm, 'expiryMonth').type).toBe('SMALLINT');
    expect(findCol(pm, 'expiryYear').type).toBe('SMALLINT');
  });

  it('Char(4) native type for last4 digits', () => {
    const pm = findTable(result.tables, 'PaymentMethod');
    const last4 = findCol(pm, 'last4');
    expect(last4.type).toBe('CHAR');
    expect(last4.length).toBe(4);
    expect(last4.nullable).toBe(true);
  });

  it('SubscriptionStatus enum values are correct', () => {
    const sub = findTable(result.tables, 'Subscription');
    const statusCol = findCol(sub, 'status');
    expect(statusCol.type).toBe('ENUM');
    expect(statusCol.enumValues).toEqual(['ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'INCOMPLETE', 'PAUSED']);
    expect(statusCol.defaultValue).toBe('ACTIVE');
  });

  it('InvoiceStatus enum has 5 values', () => {
    const inv = findTable(result.tables, 'Invoice');
    const statusCol = findCol(inv, 'status');
    expect(statusCol.enumValues).toHaveLength(5);
    expect(statusCol.defaultValue).toBe('DRAFT');
  });

  it('Currency has VarChar(3) with string default "usd"', () => {
    const inv = findTable(result.tables, 'Invoice');
    const currency = findCol(inv, 'currency');
    expect(currency.type).toBe('VARCHAR');
    expect(currency.length).toBe(3);
    expect(currency.defaultValue).toBe('usd');
  });

  it('All cascade FKs are preserved', () => {
    const customer = findTable(result.tables, 'Customer');
    const sub = findTable(result.tables, 'Subscription');
    const subItem = findTable(result.tables, 'SubscriptionItem');
    const inv = findTable(result.tables, 'Invoice');
    const invItem = findTable(result.tables, 'InvoiceItem');
    const pm = findTable(result.tables, 'PaymentMethod');

    expect(findFK(sub, customer)!.onDelete).toBe('CASCADE');
    expect(findFK(subItem, sub)!.onDelete).toBe('CASCADE');
    expect(findFK(inv, customer)!.onDelete).toBe('CASCADE');
    expect(findFK(invItem, inv)!.onDelete).toBe('CASCADE');
    expect(findFK(pm, customer)!.onDelete).toBe('CASCADE');
  });

  it('@updatedAt columns get NOW() default', () => {
    const customer = findTable(result.tables, 'Customer');
    const sub = findTable(result.tables, 'Subscription');
    expect(findCol(customer, 'updatedAt').defaultValue).toBe('NOW()');
    expect(findCol(sub, 'updatedAt').defaultValue).toBe('NOW()');
  });

  it('round-trips correctly through export → re-import', () => {
    const exported = exportPrisma(toSchema(result.tables));
    const reimported = importPrisma(exported);
    expect(reimported.errors).toEqual([]);
    expect(reimported.tables).toHaveLength(6);

    // Spot-check: Invoice FK count preserved
    const inv2 = findTable(reimported.tables, 'Invoice');
    expect(inv2.foreignKeys).toHaveLength(1);

    // Spot-check: enum values preserved
    const sub2 = findTable(reimported.tables, 'Subscription');
    expect(findCol(sub2, 'status').enumValues).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 11: CMS / Content platform with polymorphic patterns
// ═══════════════════════════════════════════════════════════════════
describe('Integration: CMS content platform', () => {
  const CMS_SCHEMA = `
model Organization {
  id        String   @id @default(cuid())
  name      String
  domain    String?  @unique
  logo      String?  @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members    OrganizationMember[]
  sites      Site[]
}

model OrganizationMember {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           String   @default("editor") @db.VarChar(20)
  invitedAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
}

model Site {
  id             String   @id @default(cuid())
  organizationId String
  name           String   @db.VarChar(100)
  subdomain      String   @unique @db.VarChar(63)
  customDomain   String?  @unique
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  pages        Page[]
  assets       Asset[]

  @@index([organizationId])
}

/// Content page with versioning support
model Page {
  id        String     @id @default(cuid())
  siteId    String
  slug      String     @db.VarChar(200)
  title     String
  /// Raw JSON content (ProseMirror/TipTap format)
  content   Json?
  status    PageStatus @default(DRAFT)
  /// SEO meta description
  metaDesc  String?    @db.VarChar(160)
  sortOrder Int        @default(0)
  parentId  String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  site   Site  @relation(fields: [siteId], references: [id], onDelete: Cascade)
  parent Page? @relation("PageTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Page[] @relation("PageTree")

  @@unique([siteId, slug])
  @@index([siteId, status])
  @@index([parentId])
}

enum PageStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model Asset {
  id        String   @id @default(cuid())
  siteId    String
  filename  String   @db.VarChar(255)
  mimeType  String   @db.VarChar(100)
  size      BigInt
  url       String   @db.Text
  createdAt DateTime @default(now())

  site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)

  @@index([siteId])
}`;

  const result = importPrisma(CMS_SCHEMA);

  it('imports all 5 CMS models', () => {
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(5);
  });

  it('Page has self-referencing FK (tree structure) with SetNull', () => {
    const page = findTable(result.tables, 'Page');
    const selfFk = page.foreignKeys.find(fk => fk.referencedTableId === page.id);
    expect(selfFk).toBeDefined();
    expect(selfFk!.onDelete).toBe('SET NULL');
  });

  it('Page has composite unique [siteId, slug]', () => {
    const page = findTable(result.tables, 'Page');
    expect(hasUniqueKey(page, ['siteId', 'slug'])).toBe(true);
  });

  it('Page.content is Json type (nullable)', () => {
    const page = findTable(result.tables, 'Page');
    const content = findCol(page, 'content');
    expect(content.type).toBe('JSON');
    expect(content.nullable).toBe(true);
  });

  it('Asset.size is BigInt', () => {
    const asset = findTable(result.tables, 'Asset');
    expect(findCol(asset, 'size').type).toBe('BIGINT');
  });

  it('preserves doc comments (/// on Page and fields)', () => {
    const page = findTable(result.tables, 'Page');
    expect(page.comment).toContain('Content page with versioning');
    expect(findCol(page, 'content')!.comment).toContain('ProseMirror');
    expect(findCol(page, 'metaDesc')!.comment).toContain('SEO');
  });

  it('multiple indexes on Page', () => {
    const page = findTable(result.tables, 'Page');
    expect(page.indexes.length).toBeGreaterThanOrEqual(2);
  });

  it('Site has two unique columns (subdomain + customDomain)', () => {
    const site = findTable(result.tables, 'Site');
    expect(findCol(site, 'subdomain').unique).toBe(true);
    expect(findCol(site, 'customDomain').unique).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 12: dbgenerated() + mixed defaults — PostgreSQL advanced
// ═══════════════════════════════════════════════════════════════════
describe('Integration: PostgreSQL advanced defaults (dbgenerated)', () => {
  it('handles dbgenerated() with SQL expression', () => {
    const schema = `
model Audit {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  data      Json     @default("{}")
}`;
    const result = importPrisma(schema);
    const audit = result.tables[0];
    expect(findCol(audit, 'createdAt').defaultValue).toBe('CURRENT_TIMESTAMP');
    expect(findCol(audit, 'data').defaultValue).toBe('{}');
  });

  it('handles enum default with @default(VALUE)', () => {
    const schema = `
enum Priority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model Ticket {
  id       Int      @id
  priority Priority @default(MEDIUM)
}`;
    const result = importPrisma(schema);
    expect(findCol(result.tables[0], 'priority').defaultValue).toBe('MEDIUM');
  });

  it('handles BigInt with autoincrement()', () => {
    const schema = `
model Event {
  id        BigInt   @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
}`;
    const result = importPrisma(schema);
    const event = result.tables[0];
    const idCol = findCol(event, 'id');
    expect(idCol.type).toBe('BIGINT');
    expect(idCol.autoIncrement).toBe(true);
    expect(idCol.primaryKey).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 13: @updatedAt comprehensive test
// ═══════════════════════════════════════════════════════════════════
describe('Integration: @updatedAt handling', () => {
  it('@updatedAt on DateTime gets NOW() default', () => {
    const schema = `
model Post {
  id        Int      @id
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`;
    const result = importPrisma(schema);
    const post = result.tables[0];
    expect(findCol(post, 'createdAt').defaultValue).toBe('NOW()');
    expect(findCol(post, 'updatedAt').defaultValue).toBe('NOW()');
  });

  it('@updatedAt does not override explicit @default', () => {
    const schema = `
model Config {
  id        Int      @id
  updatedAt DateTime @default(dbgenerated("NOW()")) @updatedAt
}`;
    // @default is processed first, then @updatedAt only fills if no default
    const result = importPrisma(schema);
    expect(findCol(result.tables[0], 'updatedAt').defaultValue).toBe('NOW()');
  });

  it('multiple models with @updatedAt all get defaults', () => {
    const schema = `
model User {
  id        Int      @id
  updatedAt DateTime @updatedAt
}
model Post {
  id        Int      @id
  updatedAt DateTime @updatedAt
}
model Comment {
  id        Int      @id
  editedAt  DateTime @updatedAt
}`;
    const result = importPrisma(schema);
    expect(findCol(findTable(result.tables, 'User'), 'updatedAt').defaultValue).toBe('NOW()');
    expect(findCol(findTable(result.tables, 'Post'), 'updatedAt').defaultValue).toBe('NOW()');
    expect(findCol(findTable(result.tables, 'Comment'), 'editedAt').defaultValue).toBe('NOW()');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 14: enum @map on values — real-world DB naming conventions
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Enum value @map', () => {
  it('uses @map names for enum values in DB', () => {
    const schema = `
enum NotificationType {
  EMAIL        @map("email")
  SMS          @map("sms")
  PUSH         @map("push_notification")
  IN_APP       @map("in_app")
}

model Notification {
  id   Int              @id
  type NotificationType
}`;
    const result = importPrisma(schema);
    const col = findCol(result.tables[0], 'type');
    expect(col.type).toBe('ENUM');
    expect(col.enumValues).toEqual(['email', 'sms', 'push_notification', 'in_app']);
  });

  it('enum with mixed @map and non-@map values', () => {
    const schema = `
enum Status {
  ACTIVE
  INACTIVE    @map("disabled")
  PENDING
  ARCHIVED    @map("archived_v2")
}

model Record {
  id     Int    @id
  status Status @default(ACTIVE)
}`;
    const result = importPrisma(schema);
    const col = findCol(result.tables[0], 'status');
    expect(col.enumValues).toEqual(['ACTIVE', 'disabled', 'PENDING', 'archived_v2']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 15: Large real-world schema — HR/People management
// ═══════════════════════════════════════════════════════════════════
describe('Integration: HR/People management (large schema)', () => {
  const HR_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Company {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(200)
  taxId       String?  @unique @db.VarChar(20)
  foundedDate DateTime? @db.Date
  createdAt   DateTime @default(now())

  departments Department[]
  employees   Employee[]
  locations   Location[]
}

model Department {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @db.Uuid
  name      String  @db.VarChar(100)
  code      String  @db.VarChar(10)
  parentId  String? @db.Uuid
  managerId String? @db.Uuid
  budget    Decimal? @db.Decimal(15, 2)

  company  Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
  parent   Department? @relation("DeptTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Department[] @relation("DeptTree")
  manager  Employee?   @relation("DeptManager", fields: [managerId], references: [id], onDelete: SetNull)
  employees Employee[] @relation("DeptEmployees")

  @@unique([companyId, code])
  @@index([companyId])
  @@index([parentId])
}

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACT
  INTERN
}

enum EmployeeStatus {
  ACTIVE
  ON_LEAVE
  TERMINATED
  RETIRED
}

model Employee {
  id             String         @id @default(uuid()) @db.Uuid
  companyId      String         @db.Uuid
  departmentId   String?        @db.Uuid
  employeeNumber String         @db.VarChar(20)
  firstName      String         @db.VarChar(50)
  lastName       String         @db.VarChar(50)
  email          String         @unique
  hireDate       DateTime       @db.Date
  terminationDate DateTime?     @db.Date
  employmentType EmploymentType @default(FULL_TIME)
  status         EmployeeStatus @default(ACTIVE)
  salary         Decimal?       @db.Decimal(12, 2)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  company    Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
  department Department? @relation("DeptEmployees", fields: [departmentId], references: [id], onDelete: SetNull)
  managedDepartments Department[] @relation("DeptManager")
  attendances Attendance[]
  leaveRequests LeaveRequest[]

  @@unique([companyId, employeeNumber])
  @@index([companyId])
  @@index([departmentId])
  @@index([status])
}

model Location {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @db.Uuid
  name      String  @db.VarChar(100)
  address   String  @db.Text
  city      String  @db.VarChar(100)
  country   String  @db.VarChar(2)
  timezone  String  @db.VarChar(50)
  isHQ      Boolean @default(false)

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
}

enum LeaveType {
  VACATION
  SICK
  PERSONAL
  MATERNITY
  PATERNITY
  UNPAID
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELED
}

model LeaveRequest {
  id         String      @id @default(uuid()) @db.Uuid
  employeeId String      @db.Uuid
  type       LeaveType
  status     LeaveStatus @default(PENDING)
  startDate  DateTime    @db.Date
  endDate    DateTime    @db.Date
  reason     String?     @db.Text
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId])
  @@index([status])
}

model Attendance {
  id         String    @id @default(uuid()) @db.Uuid
  employeeId String    @db.Uuid
  date       DateTime  @db.Date
  clockIn    DateTime? @db.Timestamp
  clockOut   DateTime? @db.Timestamp
  hoursWorked Decimal? @db.Decimal(4, 2)
  notes      String?

  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([employeeId, date])
  @@index([employeeId])
  @@index([date])
}`;

  const result = importPrisma(HR_SCHEMA);

  it('imports all 6 models without errors', () => {
    expect(result.errors).toEqual([]);
    expect(result.tables).toHaveLength(6);
  });

  it('has 4 enums correctly mapped', () => {
    const emp = findTable(result.tables, 'Employee');
    expect(findCol(emp, 'employmentType').enumValues).toEqual(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
    expect(findCol(emp, 'status').enumValues).toEqual(['ACTIVE', 'ON_LEAVE', 'TERMINATED', 'RETIRED']);

    const leave = findTable(result.tables, 'LeaveRequest');
    expect(findCol(leave, 'type').enumValues).toEqual(['VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY', 'UNPAID']);
    expect(findCol(leave, 'status').enumValues).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED']);
  });

  it('Department has self-referencing tree + manager FK + company FK', () => {
    const dept = findTable(result.tables, 'Department');
    const company = findTable(result.tables, 'Company');
    const emp = findTable(result.tables, 'Employee');

    // 3 FKs: company, parent(self), manager(employee)
    expect(dept.foreignKeys).toHaveLength(3);
    expect(hasFKTo(dept, company)).toBe(true);
    expect(hasFKTo(dept, dept)).toBe(true); // self-ref
    expect(hasFKTo(dept, emp)).toBe(true); // manager

    // Self-ref uses SetNull
    const selfFk = dept.foreignKeys.find(fk => fk.referencedTableId === dept.id)!;
    expect(selfFk.onDelete).toBe('SET NULL');
  });

  it('Employee has composite unique [companyId, employeeNumber]', () => {
    const emp = findTable(result.tables, 'Employee');
    expect(hasUniqueKey(emp, ['companyId', 'employeeNumber'])).toBe(true);
  });

  it('Attendance has composite unique [employeeId, date]', () => {
    const att = findTable(result.tables, 'Attendance');
    expect(hasUniqueKey(att, ['employeeId', 'date'])).toBe(true);
  });

  it('Date columns use @db.Date → DATE type', () => {
    const emp = findTable(result.tables, 'Employee');
    expect(findCol(emp, 'hireDate').type).toBe('DATE');
    expect(findCol(emp, 'terminationDate').type).toBe('DATE');

    const att = findTable(result.tables, 'Attendance');
    expect(findCol(att, 'date').type).toBe('DATE');
  });

  it('Timestamp columns use @db.Timestamp → TIMESTAMP type', () => {
    const att = findTable(result.tables, 'Attendance');
    expect(findCol(att, 'clockIn').type).toBe('TIMESTAMP');
    expect(findCol(att, 'clockOut').type).toBe('TIMESTAMP');
  });

  it('Country is VarChar(2) for ISO code', () => {
    const loc = findTable(result.tables, 'Location');
    const country = findCol(loc, 'country');
    expect(country.type).toBe('VARCHAR');
    expect(country.length).toBe(2);
  });

  it('Budget has Decimal(15,2) for large amounts', () => {
    const dept = findTable(result.tables, 'Department');
    const budget = findCol(dept, 'budget');
    expect(budget.type).toBe('DECIMAL');
    expect(budget.length).toBe(15);
    expect(budget.scale).toBe(2);
    expect(budget.nullable).toBe(true);
  });

  it('total FK count across all tables is correct', () => {
    const totalFKs = result.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    // Company: 0, Department: 3 (company+self+manager), Employee: 2 (company+dept),
    // Location: 1, LeaveRequest: 1, Attendance: 1
    expect(totalFKs).toBe(8);
  });

  it('round-trips preserving all models and FK count', () => {
    const exported = exportPrisma(toSchema(result.tables));
    const reimported = importPrisma(exported);
    expect(reimported.errors).toEqual([]);
    expect(reimported.tables).toHaveLength(6);

    const totalFKs2 = reimported.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    expect(totalFKs2).toBe(8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 16: Prisma → DDL cross-format with advanced types
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Prisma → PostgreSQL DDL with advanced types', () => {
  it('converts UUID + Decimal + Timestamp correctly', () => {
    const schema = `
model Payment {
  id        String   @id @default(uuid()) @db.Uuid
  amount    Decimal  @db.Decimal(10, 2)
  paidAt    DateTime @db.Timestamp
  note      String?  @db.Text
}`;
    const result = importPrisma(schema);
    const ddl = exportDDL(toSchema(result.tables), 'postgresql');
    expect(ddl).toContain('UUID');
    expect(ddl).toContain('DECIMAL(10,2)');
    expect(ddl).toContain('TIMESTAMP');
    expect(ddl).toContain('TEXT');
  });
});
