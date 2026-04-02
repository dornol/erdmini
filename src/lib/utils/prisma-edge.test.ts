/**
 * Integration tests for Prisma import/export — edge cases including @ignore,
 * @@ignore, Unsupported types, billing schemas, CMS, advanced defaults,
 * @updatedAt, enum @map, HR schemas, and cross-format DDL export.
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
    expect(ddl).toContain('NUMERIC(10,2)');
    expect(ddl).toContain('TIMESTAMP');
    expect(ddl).toContain('TEXT');
  });
});
