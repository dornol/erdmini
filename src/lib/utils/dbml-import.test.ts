import { describe, it, expect } from 'vitest';
import { importDBML } from './dbml-import';

describe('importDBML', () => {
  describe('basic table parsing', () => {
    it('should parse a simple table', () => {
      const result = importDBML(`
        Table users {
          id int [pk, increment]
          name varchar(255) [not null]
          email varchar [unique]
        }
      `);
      expect(result.errors).toHaveLength(0);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].name).toBe('users');
      expect(result.tables[0].columns).toHaveLength(3);
    });

    it('should parse multiple tables', () => {
      const result = importDBML(`
        Table users {
          id int [pk]
        }
        Table posts {
          id int [pk]
          title varchar
        }
      `);
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0].name).toBe('users');
      expect(result.tables[1].name).toBe('posts');
    });

    it('should handle table with schema prefix', () => {
      const result = importDBML(`
        Table public.users {
          id int [pk]
          name varchar
        }
      `);
      expect(result.tables[0].name).toBe('users');
      expect(result.tables[0].schema).toBe('public');
    });

    it('should handle table alias', () => {
      const result = importDBML(`
        Table users as U {
          id int [pk]
        }
        Table posts {
          id int [pk]
          user_id int [ref: > U.id]
        }
      `);
      expect(result.tables).toHaveLength(2);
      // FK should resolve via alias
      expect(result.tables[1].foreignKeys).toHaveLength(1);
      expect(result.tables[1].foreignKeys[0].referencedTableId).toBe(result.tables[0].id);
    });
  });

  describe('column type mapping', () => {
    it('should map int type', () => {
      const result = importDBML(`Table t { id int [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('INT');
    });

    it('should map integer type', () => {
      const result = importDBML(`Table t { id integer [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('INT');
    });

    it('should map bigint type', () => {
      const result = importDBML(`Table t { id bigint [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('BIGINT');
    });

    it('should map smallint type', () => {
      const result = importDBML(`Table t { val smallint [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('SMALLINT');
    });

    it('should map varchar with length', () => {
      const result = importDBML(`Table t { name varchar(255) [pk] }`);
      const col = result.tables[0].columns[0];
      expect(col.type).toBe('VARCHAR');
      expect(col.length).toBe(255);
    });

    it('should map char type', () => {
      const result = importDBML(`Table t { code char(3) [pk] }`);
      const col = result.tables[0].columns[0];
      expect(col.type).toBe('CHAR');
      expect(col.length).toBe(3);
    });

    it('should map text type', () => {
      const result = importDBML(`Table t { body text [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('TEXT');
    });

    it('should map boolean types', () => {
      const result = importDBML(`
        Table t {
          a bool [pk]
          b boolean
        }
      `);
      expect(result.tables[0].columns[0].type).toBe('BOOLEAN');
      expect(result.tables[0].columns[1].type).toBe('BOOLEAN');
    });

    it('should map date type', () => {
      const result = importDBML(`Table t { d date [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('DATE');
    });

    it('should map datetime type', () => {
      const result = importDBML(`Table t { d datetime [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('DATETIME');
    });

    it('should map timestamp type', () => {
      const result = importDBML(`Table t { d timestamp [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('TIMESTAMP');
    });

    it('should map decimal with precision and scale', () => {
      const result = importDBML(`Table t { price decimal(10,2) [pk] }`);
      const col = result.tables[0].columns[0];
      expect(col.type).toBe('DECIMAL');
      expect(col.length).toBe(10);
      expect(col.scale).toBe(2);
    });

    it('should map float type', () => {
      const result = importDBML(`Table t { val float [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('FLOAT');
    });

    it('should map double type', () => {
      const result = importDBML(`Table t { val double [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('DOUBLE');
    });

    it('should map json type', () => {
      const result = importDBML(`Table t { data json [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('JSON');
    });

    it('should map jsonb type', () => {
      const result = importDBML(`Table t { data jsonb [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('JSON');
    });

    it('should map uuid type', () => {
      const result = importDBML(`Table t { id uuid [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('UUID');
    });

    it('should map serial to INT with autoIncrement', () => {
      const result = importDBML(`Table t { id serial }`);
      const col = result.tables[0].columns[0];
      expect(col.type).toBe('INT');
      expect(col.autoIncrement).toBe(true);
      expect(col.primaryKey).toBe(true);
    });

    it('should map bigserial to BIGINT with autoIncrement', () => {
      const result = importDBML(`Table t { id bigserial }`);
      const col = result.tables[0].columns[0];
      expect(col.type).toBe('BIGINT');
      expect(col.autoIncrement).toBe(true);
    });

    it('should fallback to VARCHAR for unknown types', () => {
      const result = importDBML(`Table t { val money [pk] }`);
      expect(result.tables[0].columns[0].type).toBe('VARCHAR');
    });
  });

  describe('column settings', () => {
    it('should parse pk setting', () => {
      const result = importDBML(`Table t { id int [pk] }`);
      const col = result.tables[0].columns[0];
      expect(col.primaryKey).toBe(true);
      expect(col.nullable).toBe(false);
    });

    it('should parse not null setting', () => {
      const result = importDBML(`Table t { id int [pk]\n name varchar [not null] }`);
      expect(result.tables[0].columns[1].nullable).toBe(false);
    });

    it('should parse null setting', () => {
      const result = importDBML(`Table t { id int [pk]\n name varchar [null] }`);
      expect(result.tables[0].columns[1].nullable).toBe(true);
    });

    it('should parse unique setting', () => {
      const result = importDBML(`Table t { id int [pk]\n email varchar [unique] }`);
      expect(result.tables[0].columns[1].unique).toBe(true);
    });

    it('should parse increment setting', () => {
      const result = importDBML(`Table t { id int [pk, increment] }`);
      expect(result.tables[0].columns[0].autoIncrement).toBe(true);
    });

    it('should parse default value (numeric)', () => {
      const result = importDBML(`Table t { id int [pk]\n count int [default: 0] }`);
      expect(result.tables[0].columns[1].defaultValue).toBe('0');
    });

    it('should parse default value (string)', () => {
      const result = importDBML(`Table t { id int [pk]\n status varchar [default: 'active'] }`);
      expect(result.tables[0].columns[1].defaultValue).toBe('active');
    });

    it('should parse note', () => {
      const result = importDBML(`Table t { id int [pk]\n name varchar [note: 'User name'] }`);
      expect(result.tables[0].columns[1].comment).toBe('User name');
    });

    it('should parse multiple settings', () => {
      const result = importDBML(`Table t { id int [pk, increment, not null, note: 'Primary key'] }`);
      const col = result.tables[0].columns[0];
      expect(col.primaryKey).toBe(true);
      expect(col.autoIncrement).toBe(true);
      expect(col.nullable).toBe(false);
      expect(col.comment).toBe('Primary key');
    });
  });

  describe('Ref statements', () => {
    it('should parse > (many-to-one) ref', () => {
      const result = importDBML(`
        Table users { id int [pk] }
        Table posts {
          id int [pk]
          user_id int
        }
        Ref: posts.user_id > users.id
      `);
      const posts = result.tables.find((t) => t.name === 'posts')!;
      expect(posts.foreignKeys).toHaveLength(1);
      const fk = posts.foreignKeys[0];
      const users = result.tables.find((t) => t.name === 'users')!;
      expect(fk.referencedTableId).toBe(users.id);
    });

    it('should parse < (one-to-many) ref', () => {
      const result = importDBML(`
        Table users { id int [pk] }
        Table posts {
          id int [pk]
          user_id int
        }
        Ref: users.id < posts.user_id
      `);
      const posts = result.tables.find((t) => t.name === 'posts')!;
      expect(posts.foreignKeys).toHaveLength(1);
    });

    it('should parse - (one-to-one) ref', () => {
      const result = importDBML(`
        Table users { id int [pk] }
        Table profiles {
          id int [pk]
          user_id int
        }
        Ref: profiles.user_id - users.id
      `);
      const profiles = result.tables.find((t) => t.name === 'profiles')!;
      expect(profiles.foreignKeys).toHaveLength(1);
    });

    it('should parse ref with onDelete/onUpdate', () => {
      const result = importDBML(`
        Table users { id int [pk] }
        Table posts {
          id int [pk]
          user_id int
        }
        Ref: posts.user_id > users.id [delete: cascade, update: set null]
      `);
      const fk = result.tables.find((t) => t.name === 'posts')!.foreignKeys[0];
      expect(fk.onDelete).toBe('CASCADE');
      expect(fk.onUpdate).toBe('SET NULL');
    });

    it('should parse inline ref', () => {
      const result = importDBML(`
        Table users { id int [pk] }
        Table posts {
          id int [pk]
          user_id int [ref: > users.id]
        }
      `);
      const posts = result.tables.find((t) => t.name === 'posts')!;
      expect(posts.foreignKeys).toHaveLength(1);
    });

    it('should parse composite FK', () => {
      const result = importDBML(`
        Table t1 {
          a int [pk]
          b int [pk]
        }
        Table t2 {
          id int [pk]
          a int
          b int
        }
        Ref: t2.(a, b) > t1.(a, b)
      `);
      const fk = result.tables.find((t) => t.name === 't2')!.foreignKeys[0];
      expect(fk.columnIds).toHaveLength(2);
      expect(fk.referencedColumnIds).toHaveLength(2);
    });

    it('should warn on unresolved FK', () => {
      const result = importDBML(`
        Table posts {
          id int [pk]
          user_id int
        }
        Ref: posts.user_id > nonexistent.id
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('FK resolve failed');
    });
  });

  describe('Enum parsing', () => {
    it('should parse enum and apply to column', () => {
      const result = importDBML(`
        Enum status_enum {
          active
          inactive
          pending
        }
        Table users {
          id int [pk]
          status status_enum
        }
      `);
      const col = result.tables[0].columns.find((c) => c.name === 'status')!;
      expect(col.type).toBe('ENUM');
      expect(col.enumValues).toEqual(['active', 'inactive', 'pending']);
    });
  });

  describe('Indexes block', () => {
    it('should parse single column unique index', () => {
      const result = importDBML(`
        Table users {
          id int [pk]
          email varchar

          Indexes {
            email [unique]
          }
        }
      `);
      expect(result.tables[0].uniqueKeys).toHaveLength(1);
      expect(result.tables[0].uniqueKeys[0].columnIds).toHaveLength(1);
    });

    it('should parse composite unique index with name', () => {
      const result = importDBML(`
        Table users {
          id int [pk]
          email varchar
          tenant_id int

          Indexes {
            (email, tenant_id) [unique, name: 'idx_email_tenant']
          }
        }
      `);
      const uk = result.tables[0].uniqueKeys[0];
      expect(uk.columnIds).toHaveLength(2);
      expect(uk.name).toBe('idx_email_tenant');
    });

    it('should parse non-unique index', () => {
      const result = importDBML(`
        Table users {
          id int [pk]
          name varchar

          Indexes {
            name
          }
        }
      `);
      expect(result.tables[0].indexes).toHaveLength(1);
      expect(result.tables[0].indexes[0].unique).toBe(false);
    });

    it('should parse composite PK in indexes', () => {
      const result = importDBML(`
        Table order_items {
          order_id int
          item_id int

          Indexes {
            (order_id, item_id) [pk]
          }
        }
      `);
      const cols = result.tables[0].columns;
      expect(cols[0].primaryKey).toBe(true);
      expect(cols[1].primaryKey).toBe(true);
    });
  });

  describe('comments', () => {
    it('should strip single-line comments', () => {
      const result = importDBML(`
        // This is a comment
        Table users {
          id int [pk] // inline comment
          name varchar
        }
      `);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].columns).toHaveLength(2);
    });

    it('should strip multi-line comments', () => {
      const result = importDBML(`
        /* This is
           a multi-line comment */
        Table users {
          id int [pk]
        }
      `);
      expect(result.tables).toHaveLength(1);
    });
  });

  describe('table note', () => {
    it('should parse table Note', () => {
      const result = importDBML(`
        Table users {
          id int [pk]

          Note: 'User accounts table'
        }
      `);
      expect(result.tables[0].comment).toBe('User accounts table');
    });
  });

  describe('error handling', () => {
    it('should return error for empty input', () => {
      const result = importDBML('');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.tables).toHaveLength(0);
    });

    it('should return error for no tables', () => {
      const result = importDBML('// just a comment');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn for table without PK', () => {
      const result = importDBML(`
        Table users {
          name varchar
          email varchar
        }
      `);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('no primary key');
    });
  });

  describe('grid positioning', () => {
    it('should position tables in grid layout', () => {
      const result = importDBML(`
        Table t1 { id int [pk] }
        Table t2 { id int [pk] }
        Table t3 { id int [pk] }
        Table t4 { id int [pk] }
        Table t5 { id int [pk] }
      `);
      // First row
      expect(result.tables[0].position.x).toBe(50);
      expect(result.tables[0].position.y).toBe(50);
      expect(result.tables[1].position.x).toBe(350); // 300 + 50
      // Second row (5th table)
      expect(result.tables[4].position.x).toBe(50);
      expect(result.tables[4].position.y).toBe(270); // 220 + 50
    });
  });

  describe('complex scenario', () => {
    it('should handle a full DBML schema', () => {
      const result = importDBML(`
        Enum order_status {
          pending
          processing
          shipped
          delivered
        }

        Table public.users {
          id int [pk, increment]
          name varchar(100) [not null, note: 'Full name']
          email varchar(255) [unique, not null]
          created_at timestamp [default: 'now()']

          Indexes {
            email [unique]
          }
        }

        Table public.orders {
          id int [pk, increment]
          user_id int [not null]
          status order_status [not null, default: 'pending']
          total decimal(10,2)

          Indexes {
            user_id
            (user_id, status) [name: 'idx_user_status']
          }
        }

        Table public.order_items {
          id int [pk, increment]
          order_id int [not null]
          product_name varchar(200)
          quantity int [default: 1]
          price decimal(10,2)
        }

        Ref: public.orders.user_id > public.users.id [delete: cascade]
        Ref: public.order_items.order_id > public.orders.id [delete: cascade]
      `);

      expect(result.errors).toHaveLength(0);
      expect(result.tables).toHaveLength(3);

      // Users table
      const users = result.tables.find((t) => t.name === 'users')!;
      expect(users.schema).toBe('public');
      expect(users.columns).toHaveLength(4);
      expect(users.columns[0].autoIncrement).toBe(true);
      expect(users.columns[1].comment).toBe('Full name');
      expect(users.uniqueKeys).toHaveLength(1);

      // Orders table
      const orders = result.tables.find((t) => t.name === 'orders')!;
      expect(orders.foreignKeys).toHaveLength(1);
      expect(orders.foreignKeys[0].onDelete).toBe('CASCADE');
      const statusCol = orders.columns.find((c) => c.name === 'status')!;
      expect(statusCol.type).toBe('ENUM');
      expect(statusCol.enumValues).toContain('pending');
      expect(orders.indexes).toHaveLength(2);

      // Order items
      const items = result.tables.find((t) => t.name === 'order_items')!;
      expect(items.foreignKeys).toHaveLength(1);
    });
  });
});
