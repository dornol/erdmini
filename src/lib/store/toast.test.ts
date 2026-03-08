import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToastType } from './toast.svelte';

/**
 * ToastStore logic tests — validates core toast behavior.
 * Since .svelte.ts uses Svelte 5 runes ($state), we replicate the logic inline.
 */

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

function createToastStore() {
  const toasts: Toast[] = [];
  let nextId = 0;

  function show(message: string, type: ToastType = 'info') {
    const id = nextId++;
    toasts.push({ id, message, type });
    setTimeout(() => remove(id), 3000);
  }

  function remove(id: number) {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx >= 0) toasts.splice(idx, 1);
  }

  return {
    toasts,
    show,
    success: (msg: string) => show(msg, 'success'),
    error: (msg: string) => show(msg, 'error'),
    warning: (msg: string) => show(msg, 'warning'),
    info: (msg: string) => show(msg, 'info'),
    remove,
  };
}

describe('ToastStore', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should add a toast with show()', () => {
    const store = createToastStore();
    store.show('test message', 'info');
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].message).toBe('test message');
    expect(store.toasts[0].type).toBe('info');
  });

  it('should default type to info', () => {
    const store = createToastStore();
    store.show('hello');
    expect(store.toasts[0].type).toBe('info');
  });

  it('should support success() shorthand', () => {
    const store = createToastStore();
    store.success('saved');
    expect(store.toasts[0].type).toBe('success');
    expect(store.toasts[0].message).toBe('saved');
  });

  it('should support error() shorthand', () => {
    const store = createToastStore();
    store.error('failed');
    expect(store.toasts[0].type).toBe('error');
  });

  it('should support warning() shorthand', () => {
    const store = createToastStore();
    store.warning('caution');
    expect(store.toasts[0].type).toBe('warning');
  });

  it('should support info() shorthand', () => {
    const store = createToastStore();
    store.info('note');
    expect(store.toasts[0].type).toBe('info');
  });

  it('should auto-dismiss after 3 seconds', () => {
    const store = createToastStore();
    store.show('temp');
    expect(store.toasts).toHaveLength(1);

    vi.advanceTimersByTime(2999);
    expect(store.toasts).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(store.toasts).toHaveLength(0);
  });

  it('should stack multiple toasts', () => {
    const store = createToastStore();
    store.success('first');
    store.error('second');
    store.warning('third');
    expect(store.toasts).toHaveLength(3);
    expect(store.toasts.map((t) => t.type)).toEqual(['success', 'error', 'warning']);
  });

  it('should auto-dismiss toasts independently', () => {
    const store = createToastStore();
    store.show('a');
    vi.advanceTimersByTime(1000);
    store.show('b');

    vi.advanceTimersByTime(2000); // 3s for 'a', 2s for 'b'
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].message).toBe('b');

    vi.advanceTimersByTime(1000); // 3s for 'b'
    expect(store.toasts).toHaveLength(0);
  });

  it('should remove a specific toast by id', () => {
    const store = createToastStore();
    store.show('a');
    store.show('b');
    store.show('c');
    expect(store.toasts).toHaveLength(3);

    const idToRemove = store.toasts[1].id;
    store.remove(idToRemove);
    expect(store.toasts).toHaveLength(2);
    expect(store.toasts.map((t) => t.message)).toEqual(['a', 'c']);
  });

  it('should handle removing non-existent id gracefully', () => {
    const store = createToastStore();
    store.show('only');
    store.remove(999);
    expect(store.toasts).toHaveLength(1);
  });

  it('should assign unique ids to each toast', () => {
    const store = createToastStore();
    store.show('x');
    store.show('y');
    store.show('z');
    const ids = store.toasts.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('should handle rapid successive toasts', () => {
    const store = createToastStore();
    for (let i = 0; i < 20; i++) {
      store.show(`msg-${i}`);
    }
    expect(store.toasts).toHaveLength(20);

    vi.advanceTimersByTime(3000);
    expect(store.toasts).toHaveLength(0);
  });

  it('should handle manual remove then auto-dismiss without error', () => {
    const store = createToastStore();
    store.show('manual');
    const id = store.toasts[0].id;
    store.remove(id);
    expect(store.toasts).toHaveLength(0);

    // Auto-dismiss fires but toast is already gone — should not error
    vi.advanceTimersByTime(3000);
    expect(store.toasts).toHaveLength(0);
  });
});
