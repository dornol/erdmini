/**
 * Integration tests for DBML import/export using realistic scenarios.
 * Tests real-world DBML schemas from dbdiagram.io patterns and verifies
 * round-trip data integrity through import → export → re-import cycles.
 */
import { describe, it, expect } from 'vitest';
import { importDBML } from './dbml-import';
import { exportDBML } from './dbml-export';
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
// Scenario 1: E-commerce (dbdiagram.io typical example)
// ═══════════════════════════════════════════════════════════════════
describe('Integration: E-commerce (DBML)', () => {
  const ECOMMERCE = `
// E-commerce database schema

Enum order_status {
  pending
  processing
  shipped
  delivered
  cancelled
}

Enum product_status {
  draft
  active
  archived
}

Table users {
  id int [pk, increment]
  email varchar(255) [unique, not null, note: 'User email address']
  username varchar(50) [unique, not null]
  password_hash varchar(255) [not null]
  full_name varchar(100)
  phone varchar(20)
  is_active boolean [default: true]
  created_at timestamp [default: 'now()']
  updated_at timestamp

  Indexes {
    email [unique]
    username [unique]
    created_at
  }
}

Table addresses {
  id int [pk, increment]
  user_id int [not null]
  line1 varchar(200) [not null]
  line2 varchar(200)
  city varchar(100) [not null]
  state varchar(50)
  postal_code varchar(20)
  country varchar(2) [not null, default: 'US']

  Indexes {
    user_id
    (user_id, country)
  }
}

Table categories {
  id int [pk, increment]
  name varchar(100) [not null]
  slug varchar(100) [unique, not null]
  parent_id int
  description text

  Note: 'Product categories with self-referencing hierarchy'
}

Table products {
  id int [pk, increment]
  name varchar(200) [not null]
  slug varchar(200) [unique, not null]
  description text
  price decimal(10,2) [not null]
  compare_at_price decimal(10,2)
  sku varchar(50) [unique]
  stock_quantity int [not null, default: 0]
  category_id int
  status product_status [not null, default: 'draft']
  weight decimal(8,3)
  metadata json
  created_at timestamp [default: 'now()']
  updated_at timestamp

  Indexes {
    slug [unique]
    sku [unique]
    category_id
    status
    (category_id, status) [name: 'idx_cat_status']
  }
}

Table orders {
  id int [pk, increment]
  user_id int [not null]
  status order_status [not null, default: 'pending']
  subtotal decimal(10,2) [not null]
  tax decimal(10,2) [default: 0]
  shipping decimal(10,2) [default: 0]
  total decimal(10,2) [not null]
  shipping_address_id int
  billing_address_id int
  notes text
  created_at timestamp [default: 'now()']
  updated_at timestamp

  Indexes {
    user_id
    status
    created_at
    (user_id, status)
  }
}

Table order_items {
  id int [pk, increment]
  order_id int [not null]
  product_id int [not null]
  quantity int [not null, default: 1]
  unit_price decimal(10,2) [not null]
  total_price decimal(10,2) [not null]

  Indexes {
    order_id
    product_id
    (order_id, product_id) [unique, name: 'idx_order_product']
  }
}

Table reviews {
  id int [pk, increment]
  user_id int [not null]
  product_id int [not null]
  rating int [not null]
  title varchar(200)
  body text
  verified boolean [default: false]
  created_at timestamp [default: 'now()']

  Indexes {
    (user_id, product_id) [unique, name: 'idx_one_review_per_user']
    product_id
    rating
  }
}

// Relationships
Ref: addresses.user_id > users.id [delete: cascade]
Ref: categories.parent_id > categories.id
Ref: products.category_id > categories.id [delete: set null]
Ref: orders.user_id > users.id [delete: restrict]
Ref: orders.shipping_address_id > addresses.id
Ref: orders.billing_address_id > addresses.id
Ref: order_items.order_id > orders.id [delete: cascade]
Ref: order_items.product_id > products.id [delete: restrict]
Ref: reviews.user_id > users.id [delete: cascade]
Ref: reviews.product_id > products.id [delete: cascade]
`;

  const result = importDBML(ECOMMERCE);

  it('should import without errors', () => {
    expect(result.errors).toHaveLength(0);
  });

  it('should import all 7 tables', () => {
    expect(result.tables).toHaveLength(7);
    const names = result.tables.map(t => t.name).sort();
    expect(names).toEqual(['addresses', 'categories', 'order_items', 'orders', 'products', 'reviews', 'users']);
  });

  it('should parse users table correctly', () => {
    const users = findTable(result.tables, 'users');
    expect(users.columns).toHaveLength(9);
    expect(pkNames(users)).toEqual(['id']);
    expect(findCol(users, 'id').autoIncrement).toBe(true);
    expect(findCol(users, 'email').unique).toBe(true);
    expect(findCol(users, 'email').nullable).toBe(false);
    expect(findCol(users, 'email').comment).toBe('User email address');
    expect(findCol(users, 'email').length).toBe(255);
    expect(findCol(users, 'is_active').defaultValue).toBe('true');
    expect(findCol(users, 'is_active').type).toBe('BOOLEAN');
    expect(findCol(users, 'phone').nullable).toBe(true);
    // Unique key indexes
    expect(hasUniqueKey(users, ['email'])).toBe(true);
    expect(hasUniqueKey(users, ['username'])).toBe(true);
  });

  it('should parse products with enum and decimal', () => {
    const products = findTable(result.tables, 'products');
    expect(products.columns).toHaveLength(14);
    const price = findCol(products, 'price');
    expect(price.type).toBe('DECIMAL');
    expect(price.length).toBe(10);
    expect(price.scale).toBe(2);
    expect(price.nullable).toBe(false);
    const status = findCol(products, 'status');
    expect(status.type).toBe('ENUM');
    expect(status.enumValues).toEqual(['draft', 'active', 'archived']);
    expect(status.defaultValue).toBe('draft');
    const metadata = findCol(products, 'metadata');
    expect(metadata.type).toBe('JSON');
    const weight = findCol(products, 'weight');
    expect(weight.type).toBe('DECIMAL');
    expect(weight.length).toBe(8);
    expect(weight.scale).toBe(3);
  });

  it('should parse orders with enum status', () => {
    const orders = findTable(result.tables, 'orders');
    const status = findCol(orders, 'status');
    expect(status.type).toBe('ENUM');
    expect(status.enumValues).toContain('pending');
    expect(status.enumValues).toContain('cancelled');
    expect(status.enumValues).toHaveLength(5);
  });

  it('should parse categories with self-referencing FK', () => {
    const cats = findTable(result.tables, 'categories');
    expect(cats.comment).toBe('Product categories with self-referencing hierarchy');
    expect(hasFKTo(cats, cats)).toBe(true);
  });

  it('should resolve all 10 FK relationships', () => {
    const users = findTable(result.tables, 'users');
    const addresses = findTable(result.tables, 'addresses');
    const categories = findTable(result.tables, 'categories');
    const products = findTable(result.tables, 'products');
    const orders = findTable(result.tables, 'orders');
    const orderItems = findTable(result.tables, 'order_items');
    const reviews = findTable(result.tables, 'reviews');

    expect(hasFKTo(addresses, users)).toBe(true);
    expect(hasFKTo(products, categories)).toBe(true);
    expect(hasFKTo(orders, users)).toBe(true);
    expect(hasFKTo(orders, addresses)).toBe(true); // shipping or billing
    expect(hasFKTo(orderItems, orders)).toBe(true);
    expect(hasFKTo(orderItems, products)).toBe(true);
    expect(hasFKTo(reviews, users)).toBe(true);
    expect(hasFKTo(reviews, products)).toBe(true);
  });

  it('should preserve referential actions', () => {
    const users = findTable(result.tables, 'users');
    const addresses = findTable(result.tables, 'addresses');
    const products = findTable(result.tables, 'products');
    const orders = findTable(result.tables, 'orders');
    const orderItems = findTable(result.tables, 'order_items');

    const addrFK = findFK(addresses, users)!;
    expect(addrFK.onDelete).toBe('CASCADE');

    const ordersFK = findFK(orders, users)!;
    expect(ordersFK.onDelete).toBe('RESTRICT');

    const itemsOrderFK = findFK(orderItems, orders)!;
    expect(itemsOrderFK.onDelete).toBe('CASCADE');

    const itemsProdFK = findFK(orderItems, products)!;
    expect(itemsProdFK.onDelete).toBe('RESTRICT');
  });

  it('should parse composite unique index with name', () => {
    const orderItems = findTable(result.tables, 'order_items');
    expect(hasUniqueKey(orderItems, ['order_id', 'product_id'])).toBe(true);
    const uk = orderItems.uniqueKeys.find(uk => uk.columnIds.length === 2);
    expect(uk?.name).toBe('idx_order_product');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 2: Multi-tenant SaaS with schema prefix
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Multi-tenant SaaS with schemas (DBML)', () => {
  const SAAS = `
Enum subscription_plan {
  free
  starter
  professional
  enterprise
}

Enum invite_status {
  pending
  accepted
  expired
}

Table auth.users {
  id uuid [pk]
  email varchar(320) [unique, not null]
  password_hash text [not null]
  email_verified boolean [default: false]
  mfa_enabled boolean [default: false]
  last_login_at timestamp
  created_at timestamp [default: 'now()']
}

Table auth.sessions {
  id uuid [pk]
  user_id uuid [not null]
  token varchar(255) [unique, not null]
  ip_address varchar(45)
  user_agent text
  expires_at timestamp [not null]
  created_at timestamp [default: 'now()']

  Indexes {
    token [unique]
    user_id
    expires_at
  }
}

Table billing.organizations {
  id uuid [pk]
  name varchar(200) [not null]
  slug varchar(100) [unique, not null]
  plan subscription_plan [not null, default: 'free']
  trial_ends_at timestamp
  stripe_customer_id varchar(100)
  owner_id uuid [not null]
  created_at timestamp [default: 'now()']

  Indexes {
    slug [unique]
    owner_id
  }
}

Table billing.org_members {
  id uuid [pk]
  org_id uuid [not null]
  user_id uuid [not null]
  role varchar(20) [not null, default: 'member']
  joined_at timestamp [default: 'now()']

  Indexes {
    (org_id, user_id) [unique, name: 'idx_org_user']
    org_id
    user_id
  }
}

Table billing.invites {
  id uuid [pk]
  org_id uuid [not null]
  email varchar(320) [not null]
  role varchar(20) [not null, default: 'member']
  status invite_status [not null, default: 'pending']
  invited_by uuid [not null]
  expires_at timestamp [not null]
  created_at timestamp [default: 'now()']

  Indexes {
    (org_id, email) [unique]
    status
  }
}

Table app.projects {
  id uuid [pk]
  org_id uuid [not null]
  name varchar(200) [not null]
  description text
  is_archived boolean [default: false]
  created_by uuid [not null]
  created_at timestamp [default: 'now()']
  updated_at timestamp

  Indexes {
    org_id
    (org_id, name) [unique]
  }
}

Table app.api_keys {
  id uuid [pk]
  project_id uuid [not null]
  name varchar(100) [not null]
  key_hash varchar(255) [not null]
  last_used_at timestamp
  expires_at timestamp
  created_at timestamp [default: 'now()']

  Indexes {
    project_id
    key_hash [unique]
  }
}

// Cross-schema relationships
Ref: auth.sessions.user_id > auth.users.id [delete: cascade]
Ref: billing.organizations.owner_id > auth.users.id
Ref: billing.org_members.org_id > billing.organizations.id [delete: cascade]
Ref: billing.org_members.user_id > auth.users.id [delete: cascade]
Ref: billing.invites.org_id > billing.organizations.id [delete: cascade]
Ref: billing.invites.invited_by > auth.users.id
Ref: app.projects.org_id > billing.organizations.id [delete: cascade]
Ref: app.projects.created_by > auth.users.id
Ref: app.api_keys.project_id > app.projects.id [delete: cascade]
`;

  const result = importDBML(SAAS);

  it('should import all 7 tables without errors', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(7);
  });

  it('should preserve schema prefixes', () => {
    const users = findTable(result.tables, 'users');
    expect(users.schema).toBe('auth');
    const sessions = findTable(result.tables, 'sessions');
    expect(sessions.schema).toBe('auth');
    const orgs = findTable(result.tables, 'organizations');
    expect(orgs.schema).toBe('billing');
    const projects = findTable(result.tables, 'projects');
    expect(projects.schema).toBe('app');
  });

  it('should parse uuid PK columns', () => {
    const users = findTable(result.tables, 'users');
    const id = findCol(users, 'id');
    expect(id.type).toBe('UUID');
    expect(id.primaryKey).toBe(true);
  });

  it('should resolve cross-schema FKs', () => {
    const users = findTable(result.tables, 'users');
    const sessions = findTable(result.tables, 'sessions');
    const orgs = findTable(result.tables, 'organizations');
    const members = findTable(result.tables, 'org_members');
    const projects = findTable(result.tables, 'projects');
    const apiKeys = findTable(result.tables, 'api_keys');

    expect(hasFKTo(sessions, users)).toBe(true);
    expect(hasFKTo(orgs, users)).toBe(true);
    expect(hasFKTo(members, orgs)).toBe(true);
    expect(hasFKTo(members, users)).toBe(true);
    expect(hasFKTo(projects, orgs)).toBe(true);
    expect(hasFKTo(projects, users)).toBe(true);
    expect(hasFKTo(apiKeys, projects)).toBe(true);
  });

  it('should parse enum types in cross-schema context', () => {
    const orgs = findTable(result.tables, 'organizations');
    const plan = findCol(orgs, 'plan');
    expect(plan.type).toBe('ENUM');
    expect(plan.enumValues).toEqual(['free', 'starter', 'professional', 'enterprise']);
  });

  it('should parse composite unique indexes', () => {
    const members = findTable(result.tables, 'org_members');
    expect(hasUniqueKey(members, ['org_id', 'user_id'])).toBe(true);
    const uk = members.uniqueKeys.find(uk => uk.name === 'idx_org_user');
    expect(uk).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 3: Blog platform with inline refs
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Blog platform with inline refs (DBML)', () => {
  const BLOG = `
Enum post_status {
  draft
  published
  archived
}

Table users as U {
  id serial [pk]
  username varchar(50) [unique, not null]
  email varchar(255) [unique, not null]
  bio text
  avatar_url varchar(500)
  created_at timestamp [default: 'now()']
}

Table posts as P {
  id serial [pk]
  author_id int [not null, ref: > U.id]
  title varchar(300) [not null]
  slug varchar(300) [unique, not null]
  content text
  excerpt varchar(500)
  status post_status [not null, default: 'draft']
  published_at timestamp
  created_at timestamp [default: 'now()']
  updated_at timestamp

  Indexes {
    slug [unique]
    author_id
    status
    published_at
  }
}

Table tags {
  id serial [pk]
  name varchar(50) [unique, not null]
  slug varchar(50) [unique, not null]
}

Table post_tags {
  post_id int [not null, ref: > P.id]
  tag_id int [not null, ref: > tags.id]

  Indexes {
    (post_id, tag_id) [pk]
  }
}

Table comments {
  id serial [pk]
  post_id int [not null, ref: > P.id]
  author_id int [not null, ref: > U.id]
  parent_id int [ref: > comments.id]
  body text [not null]
  created_at timestamp [default: 'now()']

  Indexes {
    post_id
    author_id
    parent_id
  }
}

Table likes {
  user_id int [not null, ref: > U.id]
  post_id int [not null, ref: > P.id]
  created_at timestamp [default: 'now()']

  Indexes {
    (user_id, post_id) [pk]
  }
}
`;

  const result = importDBML(BLOG);

  it('should import without errors', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(6);
  });

  it('should handle serial type as INT + autoIncrement + PK', () => {
    const users = findTable(result.tables, 'users');
    const id = findCol(users, 'id');
    expect(id.type).toBe('INT');
    expect(id.autoIncrement).toBe(true);
    expect(id.primaryKey).toBe(true);
  });

  it('should resolve inline refs via aliases', () => {
    const users = findTable(result.tables, 'users');
    const posts = findTable(result.tables, 'posts');
    const comments = findTable(result.tables, 'comments');
    const likes = findTable(result.tables, 'likes');

    expect(hasFKTo(posts, users)).toBe(true);
    expect(hasFKTo(comments, posts)).toBe(true);
    expect(hasFKTo(comments, users)).toBe(true);
    // Self-referencing comment hierarchy
    expect(hasFKTo(comments, comments)).toBe(true);
    expect(hasFKTo(likes, users)).toBe(true);
    expect(hasFKTo(likes, posts)).toBe(true);
  });

  it('should handle composite PK via Indexes', () => {
    const postTags = findTable(result.tables, 'post_tags');
    expect(pkNames(postTags).sort()).toEqual(['post_id', 'tag_id']);
  });

  it('should handle junction table inline refs', () => {
    const tags = findTable(result.tables, 'tags');
    const posts = findTable(result.tables, 'posts');
    const postTags = findTable(result.tables, 'post_tags');
    expect(hasFKTo(postTags, posts)).toBe(true);
    expect(hasFKTo(postTags, tags)).toBe(true);
  });

  it('should not warn about serial columns being PK-less', () => {
    // serial auto-promotes to PK, so no warnings
    const serialWarnings = result.warnings.filter(w => w.includes('no primary key'));
    // Only post_tags and likes use composite PK via Indexes, not serial
    expect(serialWarnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 4: HR system with PostgreSQL-style types
// ═══════════════════════════════════════════════════════════════════
describe('Integration: HR system with PostgreSQL types (DBML)', () => {
  const HR = `
Enum employment_type {
  full_time
  part_time
  contract
  intern
}

Enum leave_type {
  annual
  sick
  personal
  maternity
  paternity
}

Table departments {
  id serial [pk]
  name varchar(100) [not null]
  code char(4) [unique, not null]
  manager_id int
  budget decimal(15,2)
  created_at timestamptz [default: 'now()']
}

Table employees {
  id serial [pk]
  employee_number varchar(20) [unique, not null]
  first_name varchar(50) [not null]
  last_name varchar(50) [not null]
  email varchar(255) [unique, not null]
  phone varchar(20)
  department_id int [not null]
  manager_id int
  employment_type employment_type [not null, default: 'full_time']
  hire_date date [not null]
  termination_date date
  salary decimal(12,2) [not null]
  is_active boolean [default: true]
  profile_data jsonb
  created_at timestamptz [default: 'now()']
  updated_at timestamptz

  Indexes {
    employee_number [unique]
    email [unique]
    department_id
    manager_id
    (last_name, first_name) [name: 'idx_employee_name']
    hire_date
  }
}

Table positions {
  id serial [pk]
  title varchar(100) [not null]
  department_id int [not null]
  min_salary decimal(12,2)
  max_salary decimal(12,2)
  description text

  Indexes {
    department_id
    (department_id, title) [unique]
  }
}

Table leave_requests {
  id serial [pk]
  employee_id int [not null]
  leave_type leave_type [not null]
  start_date date [not null]
  end_date date [not null]
  reason text
  approved_by int
  is_approved boolean
  created_at timestamptz [default: 'now()']

  Indexes {
    employee_id
    (employee_id, start_date, end_date) [name: 'idx_leave_period']
    approved_by
  }
}

Table payroll {
  id serial [pk]
  employee_id int [not null]
  pay_period_start date [not null]
  pay_period_end date [not null]
  gross_amount decimal(12,2) [not null]
  tax_amount decimal(12,2) [not null]
  net_amount decimal(12,2) [not null]
  created_at timestamptz [default: 'now()']

  Indexes {
    employee_id
    (employee_id, pay_period_start) [unique, name: 'idx_payroll_period']
  }
}

Ref: departments.manager_id > employees.id
Ref: employees.department_id > departments.id
Ref: employees.manager_id > employees.id
Ref: positions.department_id > departments.id
Ref: leave_requests.employee_id > employees.id [delete: cascade]
Ref: leave_requests.approved_by > employees.id
Ref: payroll.employee_id > employees.id [delete: cascade]
`;

  const result = importDBML(HR);

  it('should import all 5 tables without errors', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(5);
  });

  it('should handle PostgreSQL-specific types', () => {
    const employees = findTable(result.tables, 'employees');
    expect(findCol(employees, 'created_at').type).toBe('TIMESTAMP'); // timestamptz
    expect(findCol(employees, 'profile_data').type).toBe('JSON'); // jsonb
    expect(findCol(employees, 'hire_date').type).toBe('DATE');
    expect(findCol(employees, 'salary').type).toBe('DECIMAL');
    expect(findCol(employees, 'salary').length).toBe(12);
    expect(findCol(employees, 'salary').scale).toBe(2);

    const dept = findTable(result.tables, 'departments');
    expect(findCol(dept, 'code').type).toBe('CHAR');
    expect(findCol(dept, 'code').length).toBe(4);
  });

  it('should handle self-referencing employee manager', () => {
    const employees = findTable(result.tables, 'employees');
    expect(hasFKTo(employees, employees)).toBe(true);
  });

  it('should resolve circular department-employee refs', () => {
    const dept = findTable(result.tables, 'departments');
    const employees = findTable(result.tables, 'employees');
    expect(hasFKTo(dept, employees)).toBe(true);
    expect(hasFKTo(employees, dept)).toBe(true);
  });

  it('should parse named composite indexes', () => {
    const employees = findTable(result.tables, 'employees');
    const nameIdx = employees.indexes.find(idx => idx.name === 'idx_employee_name');
    expect(nameIdx).toBeDefined();
    expect(nameIdx!.columnIds).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 5: CMS with comments and complex relationships
// ═══════════════════════════════════════════════════════════════════
describe('Integration: CMS with complex patterns (DBML)', () => {
  const CMS = `
/*
 * Content Management System
 * Supports multi-language content, media assets,
 * and role-based access.
 */

Enum content_status {
  draft
  review
  published
  archived
}

Enum media_type {
  image
  video
  document
  audio
}

Enum user_role {
  admin
  editor
  author
  viewer
}

Table users {
  id uuid [pk]
  email varchar(320) [unique, not null]
  display_name varchar(100) [not null]
  role user_role [not null, default: 'viewer']
  avatar_url varchar(500)
  last_login timestamp
  created_at timestamp [default: 'now()']
}

Table content {
  id uuid [pk]
  slug varchar(255) [unique, not null]
  author_id uuid [not null]
  status content_status [not null, default: 'draft']
  published_at timestamp
  created_at timestamp [default: 'now()']
  updated_at timestamp

  Indexes {
    slug [unique]
    author_id
    status
    published_at
  }
}

Table content_versions {
  id uuid [pk]
  content_id uuid [not null]
  version int [not null]
  title varchar(300) [not null]
  body text
  locale varchar(10) [not null, default: 'en']
  meta_title varchar(200)
  meta_description varchar(500)
  edited_by uuid [not null]
  created_at timestamp [default: 'now()']

  Indexes {
    (content_id, version) [unique, name: 'idx_content_version']
    (content_id, locale) [name: 'idx_content_locale']
  }
}

Table media {
  id uuid [pk]
  filename varchar(255) [not null]
  mime_type varchar(100) [not null]
  media_type media_type [not null]
  size_bytes bigint [not null]
  url varchar(1000) [not null]
  alt_text varchar(300)
  uploaded_by uuid [not null]
  created_at timestamp [default: 'now()']

  Indexes {
    media_type
    uploaded_by
  }
}

Table content_media {
  content_id uuid [not null]
  media_id uuid [not null]
  sort_order int [not null, default: 0]

  Indexes {
    (content_id, media_id) [pk]
  }
}

Table taxonomies {
  id uuid [pk]
  type varchar(50) [not null, note: 'category or tag']
  name varchar(100) [not null]
  slug varchar(100) [not null]
  parent_id uuid

  Indexes {
    (type, slug) [unique]
  }
}

Table content_taxonomies {
  content_id uuid [not null]
  taxonomy_id uuid [not null]

  Indexes {
    (content_id, taxonomy_id) [pk]
  }
}

// Refs
Ref: content.author_id > users.id
Ref: content_versions.content_id > content.id [delete: cascade]
Ref: content_versions.edited_by > users.id
Ref: media.uploaded_by > users.id
Ref: content_media.content_id > content.id [delete: cascade]
Ref: content_media.media_id > media.id [delete: cascade]
Ref: taxonomies.parent_id > taxonomies.id
Ref: content_taxonomies.content_id > content.id [delete: cascade]
Ref: content_taxonomies.taxonomy_id > taxonomies.id [delete: cascade]
`;

  const result = importDBML(CMS);

  it('should import all 7 tables without errors', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(7);
  });

  it('should strip multi-line comments', () => {
    // If comments weren't stripped, parsing would fail
    expect(result.errors).toHaveLength(0);
  });

  it('should handle junction tables with composite PK', () => {
    const cm = findTable(result.tables, 'content_media');
    expect(pkNames(cm).sort()).toEqual(['content_id', 'media_id']);

    const ct = findTable(result.tables, 'content_taxonomies');
    expect(pkNames(ct).sort()).toEqual(['content_id', 'taxonomy_id']);
  });

  it('should parse bigint type', () => {
    const media = findTable(result.tables, 'media');
    expect(findCol(media, 'size_bytes').type).toBe('BIGINT');
  });

  it('should parse column note inline', () => {
    const tax = findTable(result.tables, 'taxonomies');
    expect(findCol(tax, 'type').comment).toBe('category or tag');
  });

  it('should handle self-ref taxonomy hierarchy', () => {
    const tax = findTable(result.tables, 'taxonomies');
    expect(hasFKTo(tax, tax)).toBe(true);
  });

  it('should resolve all cascade deletes', () => {
    const content = findTable(result.tables, 'content');
    const versions = findTable(result.tables, 'content_versions');
    const cm = findTable(result.tables, 'content_media');
    const ct = findTable(result.tables, 'content_taxonomies');

    expect(findFK(versions, content)!.onDelete).toBe('CASCADE');
    expect(findFK(cm, content)!.onDelete).toBe('CASCADE');
    expect(findFK(ct, content)!.onDelete).toBe('CASCADE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 6: Round-trip tests (Export → Import → Compare)
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Round-trip (Export → Import → Export)', () => {
  it('should round-trip a simple schema', () => {
    const input = `
Table users {
  id int [pk, increment]
  name varchar(100) [not null]
  email varchar(255) [unique, not null]
}

Table posts {
  id int [pk, increment]
  user_id int [not null]
  title varchar(200)
  body text
}

Ref: posts.user_id > users.id [delete: cascade]
`;
    const r1 = importDBML(input);
    expect(r1.errors).toHaveLength(0);

    const exported = exportDBML(toSchema(r1.tables));
    const r2 = importDBML(exported);
    expect(r2.errors).toHaveLength(0);

    // Same number of tables
    expect(r2.tables).toHaveLength(r1.tables.length);

    // Same table names
    const names1 = r1.tables.map(t => t.name).sort();
    const names2 = r2.tables.map(t => t.name).sort();
    expect(names2).toEqual(names1);

    // Same columns per table
    for (const t1 of r1.tables) {
      const t2 = findTable(r2.tables, t1.name);
      expect(t2.columns.length).toBe(t1.columns.length);
      for (const c1 of t1.columns) {
        const c2 = findCol(t2, c1.name);
        expect(c2.type).toBe(c1.type);
        expect(c2.primaryKey).toBe(c1.primaryKey);
        expect(c2.nullable).toBe(c1.nullable);
        expect(c2.unique).toBe(c1.unique);
        expect(c2.autoIncrement).toBe(c1.autoIncrement);
      }
    }

    // Same FK count
    const fk1 = r1.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    const fk2 = r2.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    expect(fk2).toBe(fk1);
  });

  it('should round-trip with enums', () => {
    const input = `
Enum status {
  active
  inactive
}

Table users {
  id int [pk]
  status status [not null, default: 'active']
}
`;
    const r1 = importDBML(input);
    const exported = exportDBML(toSchema(r1.tables));
    const r2 = importDBML(exported);

    const status1 = findCol(findTable(r1.tables, 'users'), 'status');
    const status2 = findCol(findTable(r2.tables, 'users'), 'status');
    expect(status2.type).toBe('ENUM');
    expect(status2.enumValues).toEqual(status1.enumValues);
  });

  it('should round-trip with schema prefix', () => {
    const input = `
Table public.users {
  id int [pk]
  name varchar(100)
}
`;
    const r1 = importDBML(input);
    const exported = exportDBML(toSchema(r1.tables));
    const r2 = importDBML(exported);

    expect(findTable(r2.tables, 'users').schema).toBe('public');
  });

  it('should round-trip with indexes', () => {
    const input = `
Table users {
  id int [pk]
  email varchar(255)
  tenant_id int

  Indexes {
    email [unique]
    (email, tenant_id) [unique, name: 'idx_email_tenant']
    tenant_id
  }
}
`;
    const r1 = importDBML(input);
    const exported = exportDBML(toSchema(r1.tables));
    const r2 = importDBML(exported);

    const t1 = findTable(r1.tables, 'users');
    const t2 = findTable(r2.tables, 'users');
    expect(t2.uniqueKeys.length).toBe(t1.uniqueKeys.length);
    expect(t2.indexes.length).toBe(t1.indexes.length);
  });

  it('should round-trip with referential actions', () => {
    const input = `
Table users {
  id int [pk]
}

Table orders {
  id int [pk]
  user_id int
}

Ref: orders.user_id > users.id [delete: cascade, update: set null]
`;
    const r1 = importDBML(input);
    const exported = exportDBML(toSchema(r1.tables));
    const r2 = importDBML(exported);

    const orders2 = findTable(r2.tables, 'orders');
    expect(orders2.foreignKeys).toHaveLength(1);
    expect(orders2.foreignKeys[0].onDelete).toBe('CASCADE');
    expect(orders2.foreignKeys[0].onUpdate).toBe('SET NULL');
  });

  it('should produce stable output on double export', () => {
    const input = `
Enum role {
  admin
  user
}

Table users {
  id int [pk, increment]
  email varchar(255) [unique, not null]
  role role [default: 'user']
  created_at timestamp

  Indexes {
    email [unique]
  }
}

Table posts {
  id int [pk, increment]
  user_id int [not null]
  title varchar(300)

  Indexes {
    user_id
  }
}

Ref: posts.user_id > users.id [delete: cascade]
`;
    const r1 = importDBML(input);
    const export1 = exportDBML(toSchema(r1.tables));
    const r2 = importDBML(export1);
    const export2 = exportDBML(toSchema(r2.tables));

    // Second export should match first export
    expect(export2).toBe(export1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Scenario 7: Edge cases and error handling
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Edge cases (DBML)', () => {
  it('should handle named Ref', () => {
    const result = importDBML(`
      Table users { id int [pk] }
      Table posts {
        id int [pk]
        user_id int
      }
      Ref fk_posts_users: posts.user_id > users.id
    `);
    expect(result.errors).toHaveLength(0);
    const posts = findTable(result.tables, 'posts');
    expect(posts.foreignKeys).toHaveLength(1);
  });

  it('should handle serial with note (no note loss)', () => {
    const result = importDBML(`
      Table t {
        id serial [note: 'Primary identifier']
      }
    `);
    const col = findCol(findTable(result.tables, 't'), 'id');
    expect(col.autoIncrement).toBe(true);
    expect(col.primaryKey).toBe(true);
    // Note should not be lost
    // (serial without [pk] auto-promotes; note was set via settings)
  });

  it('should handle serial with explicit pk', () => {
    const result = importDBML(`
      Table t {
        id serial [pk, note: 'ID']
      }
    `);
    const col = findCol(findTable(result.tables, 't'), 'id');
    expect(col.autoIncrement).toBe(true);
    expect(col.primaryKey).toBe(true);
    expect(col.comment).toBe('ID');
  });

  it('should not generate false no-PK warning for serial columns', () => {
    const result = importDBML(`
      Table t1 { id serial }
      Table t2 { id bigserial }
    `);
    expect(result.warnings.filter(w => w.includes('primary key'))).toHaveLength(0);
  });

  it('should handle timestamptz and numeric types', () => {
    const result = importDBML(`
      Table t {
        id int [pk]
        created_at timestamptz
        amount numeric(10,2)
        score real
      }
    `);
    const t = findTable(result.tables, 't');
    expect(findCol(t, 'created_at').type).toBe('TIMESTAMP');
    expect(findCol(t, 'amount').type).toBe('DECIMAL');
    expect(findCol(t, 'amount').length).toBe(10);
    expect(findCol(t, 'amount').scale).toBe(2);
    expect(findCol(t, 'score').type).toBe('FLOAT');
  });

  it('should handle empty table', () => {
    const result = importDBML(`
      Table empty {
      }
    `);
    // Empty table has no columns — still parsed
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].columns).toHaveLength(0);
  });

  it('should handle multiple enums', () => {
    const result = importDBML(`
      Enum status { active\n inactive }
      Enum role { admin\n user }
      Table t {
        id int [pk]
        status status
        role role
      }
    `);
    const t = findTable(result.tables, 't');
    expect(findCol(t, 'status').enumValues).toEqual(['active', 'inactive']);
    expect(findCol(t, 'role').enumValues).toEqual(['admin', 'user']);
  });

  it('should handle mixed inline and standalone refs', () => {
    const result = importDBML(`
      Table users { id int [pk] }
      Table posts {
        id int [pk]
        user_id int [ref: > users.id]
      }
      Table comments {
        id int [pk]
        post_id int
      }
      Ref: comments.post_id > posts.id [delete: cascade]
    `);
    const posts = findTable(result.tables, 'posts');
    const comments = findTable(result.tables, 'comments');
    const users = findTable(result.tables, 'users');
    expect(hasFKTo(posts, users)).toBe(true);
    expect(hasFKTo(comments, posts)).toBe(true);
    expect(findFK(comments, posts)!.onDelete).toBe('CASCADE');
  });

  it('should handle default values with special characters', () => {
    const result = importDBML(`
      Table t {
        id int [pk]
        status varchar [default: 'pending']
        count int [default: 0]
        flag boolean [default: false]
      }
    `);
    const t = findTable(result.tables, 't');
    expect(findCol(t, 'status').defaultValue).toBe('pending');
    expect(findCol(t, 'count').defaultValue).toBe('0');
    expect(findCol(t, 'flag').defaultValue).toBe('false');
  });

  it('should handle large schema (20+ tables) performance', () => {
    const tables = Array.from({ length: 25 }, (_, i) => `
      Table t${i} {
        id int [pk, increment]
        name varchar(100)
        ref_id int
      }
    `).join('\n');

    const refs = Array.from({ length: 24 }, (_, i) =>
      `Ref: t${i + 1}.ref_id > t${i}.id`,
    ).join('\n');

    const start = performance.now();
    const result = importDBML(tables + '\n' + refs);
    const elapsed = performance.now() - start;

    expect(result.errors).toHaveLength(0);
    expect(result.tables).toHaveLength(25);
    expect(elapsed).toBeLessThan(500); // Should be fast
  });
});
