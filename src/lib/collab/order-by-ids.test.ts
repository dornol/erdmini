import { expect, it } from 'vitest';
import { orderByIds } from './order-by-ids';

it('applies the accepted order while preserving object identity and the input array', () => {
  const a = { id: 'a', metadata: 'Keep A' }, b = { id: 'b', metadata: 'Keep B' };
  const source = [a, b];
  const result = orderByIds(source, ['b', 'a']);
  expect(result).toEqual([b, a]);
  expect(result[0]).toBe(b);
  expect(result[1]).toBe(a);
  expect(source).toEqual([a, b]);
});

it('ignores deleted IDs without recreating them and retains newly added objects', () => {
  const source = [{ id: 'a' }, { id: 'b' }, { id: 'new' }];
  expect(orderByIds(source, ['deleted', 'b', 'a'])).toEqual([source[1], source[0], source[2]]);
});

it('does not duplicate a column when an order repeats its ID', () => {
  const source = [{ id: 'a' }, { id: 'b' }];
  expect(orderByIds(source, ['b', 'b', 'a', 'a'])).toEqual([source[1], source[0]]);
});

it('preserves all current objects for an empty or entirely obsolete order', () => {
  const source = [{ id: 'a' }, { id: 'b' }];
  expect(orderByIds(source, [])).toEqual(source);
  expect(orderByIds(source, ['deleted'])).toEqual(source);
  expect(orderByIds([], ['deleted'])).toEqual([]);
});
