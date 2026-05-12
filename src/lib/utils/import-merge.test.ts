import { describe, expect, it } from 'vitest';
import type { Table } from '$lib/types/erd';
import { mergeImportedTables } from './import-merge';

function table(id: string, name: string, columnNames: string[], position = { x: 0, y: 0 }): Table {
  return {
    id,
    name,
    columns: columnNames.map((colName) => ({
      id: `${id}_${colName}`,
      name: colName,
      type: 'INT',
      nullable: true,
      primaryKey: false,
      unique: false,
      autoIncrement: false,
    })),
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position,
  };
}

describe('mergeImportedTables', () => {
  it('preserves canvas metadata when overwriting duplicate tables', () => {
    const existing = table('old_users', 'users', ['id', 'email'], { x: 320, y: 180 });
    existing.color = '#ffcc00';
    existing.group = 'Billing';
    existing.locked = true;

    const imported = table('new_users', 'users', ['id', 'email', 'name'], { x: 0, y: 0 });
    const result = mergeImportedTables([existing], [imported], ['users'], 'overwrite');

    expect(result.tables).toHaveLength(1);
    expect(result.layoutTableIds).toEqual([]);
    expect(result.tables[0].id).toBe('old_users');
    expect(result.tables[0].position).toEqual({ x: 320, y: 180 });
    expect(result.tables[0].color).toBe('#ffcc00');
    expect(result.tables[0].group).toBe('Billing');
    expect(result.tables[0].locked).toBe(true);
    expect(result.tables[0].columns.map((col) => col.name)).toEqual(['id', 'email', 'name']);
    expect(result.tables[0].columns.map((col) => col.id)).toEqual(['old_users_id', 'old_users_email', 'new_users_name']);
  });

  it('remaps existing foreign keys to overwritten table columns by name', () => {
    const users = table('old_users', 'users', ['id'], { x: 10, y: 20 });
    const orders = table('orders', 'orders', ['id', 'user_id']);
    orders.foreignKeys = [{
      id: 'fk_orders_users',
      columnIds: ['orders_user_id'],
      referencedTableId: 'old_users',
      referencedColumnIds: ['old_users_id'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    }];

    const importedUsers = table('new_users', 'users', ['id', 'email']);
    const result = mergeImportedTables([users, orders], [importedUsers], ['users'], 'overwrite');
    const mergedOrders = result.tables.find((t) => t.name === 'orders')!;

    expect(result.tables.find((t) => t.name === 'users')!.id).toBe('old_users');
    expect(mergedOrders.foreignKeys[0].referencedTableId).toBe('old_users');
    expect(mergedOrders.foreignKeys[0].referencedColumnIds).toEqual(['old_users_id']);
  });

  it('keeps overwritten tables out of layout while adding new imported tables', () => {
    const users = table('old_users', 'users', ['id'], { x: 40, y: 80 });
    users.group = 'Core';
    users.color = '#abc123';

    const importedUsers = table('new_users', 'users', ['id', 'email']);
    const importedOrders = table('new_orders', 'orders', ['id', 'user_id']);
    importedOrders.foreignKeys = [{
      id: 'fk_orders_users',
      columnIds: ['new_orders_user_id'],
      referencedTableId: 'new_users',
      referencedColumnIds: ['new_users_id'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    }];

    const result = mergeImportedTables([users], [importedUsers, importedOrders], ['users'], 'overwrite');
    const mergedUsers = result.tables.find((t) => t.name === 'users')!;
    const orders = result.tables.find((t) => t.name === 'orders')!;

    expect(result.tables.map((t) => t.name)).toEqual(['users', 'orders']);
    expect(result.layoutTableIds).toEqual(['new_orders']);
    expect(mergedUsers.id).toBe('old_users');
    expect(mergedUsers.position).toEqual({ x: 40, y: 80 });
    expect(mergedUsers.group).toBe('Core');
    expect(mergedUsers.color).toBe('#abc123');
    expect(orders.foreignKeys[0].referencedTableId).toBe('old_users');
    expect(orders.foreignKeys[0].referencedColumnIds).toEqual(['old_users_id']);
  });

  it('reuses matching FK, unique key, and index ids when overwriting', () => {
    const users = table('old_users', 'users', ['id', 'email', 'org_id']);
    users.uniqueKeys = [{ id: 'old_uk', columnIds: ['old_users_email', 'old_users_org_id'], name: 'uq_users_email_org' }];
    users.indexes = [{ id: 'old_idx', columnIds: ['old_users_email'], name: 'idx_users_email', unique: false }];
    users.foreignKeys = [{
      id: 'old_fk',
      columnIds: ['old_users_org_id'],
      referencedTableId: 'orgs',
      referencedColumnIds: ['orgs_id'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    }];
    const orgs = table('orgs', 'orgs', ['id']);

    const importedUsers = table('new_users', 'users', ['id', 'email', 'org_id']);
    importedUsers.uniqueKeys = [{ id: 'new_uk', columnIds: ['new_users_email', 'new_users_org_id'], name: 'uq_users_email_org' }];
    importedUsers.indexes = [{ id: 'new_idx', columnIds: ['new_users_email'], name: 'idx_users_email', unique: false }];
    importedUsers.foreignKeys = [{
      id: 'new_fk',
      columnIds: ['new_users_org_id'],
      referencedTableId: 'orgs',
      referencedColumnIds: ['orgs_id'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    }];

    const result = mergeImportedTables([orgs, users], [importedUsers], ['users'], 'overwrite');
    const mergedUsers = result.tables.find((t) => t.name === 'users')!;

    expect(mergedUsers.uniqueKeys[0]).toMatchObject({
      id: 'old_uk',
      columnIds: ['old_users_email', 'old_users_org_id'],
    });
    expect(mergedUsers.indexes[0]).toMatchObject({
      id: 'old_idx',
      columnIds: ['old_users_email'],
    });
    expect(mergedUsers.foreignKeys[0]).toMatchObject({
      id: 'old_fk',
      columnIds: ['old_users_org_id'],
      referencedColumnIds: ['orgs_id'],
    });
  });

  it('relinks new imported tables to skipped existing duplicates', () => {
    const users = table('old_users', 'users', ['id']);
    const importedUsers = table('new_users', 'users', ['id']);
    const importedOrders = table('orders', 'orders', ['id', 'user_id']);
    importedOrders.foreignKeys = [{
      id: 'fk_orders_users',
      columnIds: ['orders_user_id'],
      referencedTableId: 'new_users',
      referencedColumnIds: ['new_users_id'],
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    }];

    const result = mergeImportedTables([users], [importedUsers, importedOrders], ['users'], 'skip');
    const orders = result.tables.find((t) => t.name === 'orders')!;

    expect(result.tables.map((t) => t.name)).toEqual(['users', 'orders']);
    expect(result.layoutTableIds).toEqual(['orders']);
    expect(orders.foreignKeys[0].referencedTableId).toBe('old_users');
    expect(orders.foreignKeys[0].referencedColumnIds).toEqual(['old_users_id']);
  });
});
