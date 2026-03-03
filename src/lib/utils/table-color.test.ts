import { describe, it, expect } from 'vitest';
import { getEffectiveColor } from './table-color';
import { makeColumn, makeTable, makeSchema } from './test-helpers';

describe('getEffectiveColor', () => {
  const col = makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false });

  it('returns table.color when set', () => {
    const table = makeTable({ name: 'test', columns: [col], color: 'blue' });
    const schema = makeSchema([table]);
    expect(getEffectiveColor(table, schema)).toBe('blue');
  });

  it('returns groupColors color when table has group but no color', () => {
    const table = makeTable({ name: 'test', columns: [col], group: 'auth' });
    const schema = makeSchema([table]);
    schema.groupColors = { auth: 'green' };
    expect(getEffectiveColor(table, schema)).toBe('green');
  });

  it('table.color takes priority over groupColors', () => {
    const table = makeTable({ name: 'test', columns: [col], color: 'red', group: 'auth' });
    const schema = makeSchema([table]);
    schema.groupColors = { auth: 'green' };
    expect(getEffectiveColor(table, schema)).toBe('red');
  });

  it('returns undefined when no color and no group', () => {
    const table = makeTable({ name: 'test', columns: [col] });
    const schema = makeSchema([table]);
    expect(getEffectiveColor(table, schema)).toBeUndefined();
  });

  it('returns undefined when group has no color mapping', () => {
    const table = makeTable({ name: 'test', columns: [col], group: 'unknown' });
    const schema = makeSchema([table]);
    schema.groupColors = { auth: 'green' };
    expect(getEffectiveColor(table, schema)).toBeUndefined();
  });
});
