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
    expect(mergedOrders.foreignKeys[0].referencedColumnIds).toEqual(['new_users_id']);
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
    expect(orders.foreignKeys[0].referencedColumnIds).toEqual(['new_users_id']);
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
