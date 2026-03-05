import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeTime, deriveLabel } from './history-labels';
import type { ERDSchema, Table } from '$lib/types/erd';

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeNow(now: number) {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  }

  const BASE = 1_700_000_000_000;

  describe('fine granularity (default)', () => {
    it('returns "now" for less than 5 seconds ago', () => {
      fakeNow(BASE + 3_000);
      expect(relativeTime(BASE)).toBe('now');
    });

    it('returns seconds for 5-59s', () => {
      fakeNow(BASE + 30_000);
      expect(relativeTime(BASE)).toBe('30s');
    });

    it('returns minutes for 60s-59m', () => {
      fakeNow(BASE + 5 * 60_000);
      expect(relativeTime(BASE)).toBe('5m');
    });

    it('returns hours for 1h-23h', () => {
      fakeNow(BASE + 3 * 3_600_000);
      expect(relativeTime(BASE)).toBe('3h');
    });

    it('returns days for 24h+', () => {
      fakeNow(BASE + 2 * 86_400_000);
      expect(relativeTime(BASE)).toBe('2d');
    });

    it('floors partial values', () => {
      fakeNow(BASE + 90_000); // 1m30s
      expect(relativeTime(BASE)).toBe('1m');
    });
  });

  describe('coarse granularity', () => {
    it('returns "< 1m" for less than 60 seconds', () => {
      fakeNow(BASE + 30_000);
      expect(relativeTime(BASE, 'coarse')).toBe('< 1m');
    });

    it('returns "< 1m" for 0 diff', () => {
      fakeNow(BASE);
      expect(relativeTime(BASE, 'coarse')).toBe('< 1m');
    });

    it('returns minutes for 1m-59m', () => {
      fakeNow(BASE + 5 * 60_000);
      expect(relativeTime(BASE, 'coarse')).toBe('5m');
    });

    it('returns hours for 1h-23h', () => {
      fakeNow(BASE + 7 * 3_600_000);
      expect(relativeTime(BASE, 'coarse')).toBe('7h');
    });

    it('returns days for 24h+', () => {
      fakeNow(BASE + 3 * 86_400_000);
      expect(relativeTime(BASE, 'coarse')).toBe('3d');
    });

    it('floors partial minute values', () => {
      fakeNow(BASE + 90_000); // 1m30s → 1m
      expect(relativeTime(BASE, 'coarse')).toBe('1m');
    });
  });

  describe('edge cases', () => {
    it('fine: exactly 5s shows "5s"', () => {
      fakeNow(BASE + 5_000);
      expect(relativeTime(BASE)).toBe('5s');
    });

    it('fine: exactly 60s shows "1m"', () => {
      fakeNow(BASE + 60_000);
      expect(relativeTime(BASE)).toBe('1m');
    });

    it('coarse: exactly 60s shows "1m"', () => {
      fakeNow(BASE + 60_000);
      expect(relativeTime(BASE, 'coarse')).toBe('1m');
    });
  });
});

// Helper to create minimal ERDSchema
function makeSchema(tables: Table[] = [], extras?: Partial<ERDSchema>): ERDSchema {
  return {
    version: '1',
    tables,
    domains: [],
    memos: [],
    groupColors: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extras,
  };
}

function makeTable(id: string, name: string, extras?: Partial<Table>): Table {
  return {
    id,
    name,
    columns: [],
    foreignKeys: [],
    uniqueKeys: [],
    indexes: [],
    position: { x: 0, y: 0 },
    ...extras,
  };
}

describe('deriveLabel', () => {
  it('detects table added', () => {
    const prev = makeSchema([]);
    const cur = makeSchema([makeTable('t1', 'users')]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_add_table', detail: 'users' });
  });

  it('detects table deleted', () => {
    const prev = makeSchema([makeTable('t1', 'users')]);
    const cur = makeSchema([]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_delete_table', detail: 'users' });
  });

  it('detects column added', () => {
    const prev = makeSchema([makeTable('t1', 'users', { columns: [{ id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: false }] })]);
    const cur = makeSchema([makeTable('t1', 'users', { columns: [
      { id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: false },
      { id: 'c2', name: 'email', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
    ] })]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_add_column', detail: 'users.email' });
  });

  it('detects column deleted', () => {
    const prev = makeSchema([makeTable('t1', 'users', { columns: [
      { id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: false },
      { id: 'c2', name: 'email', type: 'VARCHAR', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
    ] })]);
    const cur = makeSchema([makeTable('t1', 'users', { columns: [{ id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: false }] })]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_delete_column', detail: 'users.email' });
  });

  it('detects FK added', () => {
    const prev = makeSchema([makeTable('t1', 'orders'), makeTable('t2', 'users')]);
    const cur = makeSchema([makeTable('t1', 'orders', { foreignKeys: [{ id: 'fk1', columnIds: ['c1'], referencedTableId: 't2', referencedColumnIds: ['c2'], onDelete: 'NO ACTION' as const, onUpdate: 'NO ACTION' as const }] }), makeTable('t2', 'users')]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_add_fk', detail: 'orders → users' });
  });

  it('detects memo added', () => {
    const prev = makeSchema([], { memos: [] });
    const cur = makeSchema([], { memos: [{ id: 'm1', content: 'hello', position: { x: 0, y: 0 }, width: 200, height: 150 }] });
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_add_memo', detail: '' });
  });

  it('detects table rename', () => {
    const prev = makeSchema([makeTable('t1', 'users')]);
    const cur = makeSchema([makeTable('t1', 'accounts')]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_edit_table', detail: 'users → accounts' });
  });

  it('detects column property edit', () => {
    const col = { id: 'c1', name: 'email', type: 'VARCHAR' as const, nullable: false, primaryKey: false, unique: false, autoIncrement: false };
    const prev = makeSchema([makeTable('t1', 'users', { columns: [col] })]);
    const cur = makeSchema([makeTable('t1', 'users', { columns: [{ ...col, nullable: true }] })]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_edit_column', detail: 'users.email' });
  });

  it('detects position change', () => {
    const prev = makeSchema([makeTable('t1', 'users', { position: { x: 0, y: 0 } })]);
    const cur = makeSchema([makeTable('t1', 'users', { position: { x: 100, y: 200 } })]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_layout', detail: '' });
  });

  it('returns fallback for identical schemas', () => {
    const s = makeSchema([makeTable('t1', 'users')]);
    expect(deriveLabel(s, s)).toEqual({ label: 'history_edit', detail: '' });
  });

  it('detects unique key added', () => {
    const prev = makeSchema([makeTable('t1', 'users', { uniqueKeys: [] })]);
    const cur = makeSchema([makeTable('t1', 'users', { uniqueKeys: [{ id: 'uk1', columnIds: ['c1', 'c2'] }] })]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_add_uq', detail: 'users' });
  });

  it('detects index added', () => {
    const prev = makeSchema([makeTable('t1', 'users', { indexes: [] })]);
    const cur = makeSchema([makeTable('t1', 'users', { indexes: [{ id: 'idx1', columnIds: ['c1'], unique: false }] })]);
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_add_idx', detail: 'users' });
  });

  it('detects groupColors change', () => {
    const prev = makeSchema([makeTable('t1', 'users')], { groupColors: {} });
    const cur = makeSchema([makeTable('t1', 'users')], { groupColors: { group1: '#ff0000' } });
    expect(deriveLabel(prev, cur)).toEqual({ label: 'history_edit_table', detail: '' });
  });
});
