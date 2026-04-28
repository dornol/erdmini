// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { flushSync, tick } from 'svelte';

/**
 * Regression test for the remote-op-undo-pollution bug fixed alongside this test.
 *
 * Bug: applyRemoteOperation used to set `_isRemoteOp = true` then clear it in
 * try/finally, all in a synchronous block. Svelte 5 batches sync state changes
 * and the $effect saw `_isRemoteOp = false` at the time it ran, so it fell
 * through to the "this is a local change" branch and pushed every remote
 * operation onto every peer's undo stack.
 *
 * Fix: callers set the flag and leave it; the effect captures-and-clears it.
 *
 * These tests verify the new pattern works the way useAutoSave relies on:
 * a flag set before a sync mutation IS observable by an effect that runs in
 * the next microtask, as long as the flag is not cleared synchronously.
 */
describe('Svelte 5 effect timing for capture-and-clear flag pattern', () => {
  it('effect observes a flag set true before a sync mutation when the caller does NOT clear it', async () => {
    let dataVersion = $state(0);
    let isRemote = $state(false);
    const observed: { isRemote: boolean; dataVersion: number }[] = [];

    const cleanup = $effect.root(() => {
      $effect(() => {
        observed.push({ isRemote, dataVersion });
        // Mimic useAutoSave: the effect captures the flag, then clears it.
        if (isRemote) isRemote = false;
      });
    });

    flushSync();
    await tick();
    observed.length = 0;

    // Simulates the FIXED applyRemoteOperation: set flag, mutate, return.
    isRemote = true;
    dataVersion = 1;

    flushSync();
    await tick();

    // Effect's first run after the mutation MUST see isRemote=true.
    expect(observed.length).toBeGreaterThanOrEqual(1);
    expect(observed[0].isRemote).toBe(true);
    expect(observed[0].dataVersion).toBe(1);

    cleanup();
  });

  it('effect would NOT observe a flag set true if the caller clears it sync (the old buggy pattern)', async () => {
    let dataVersion = $state(0);
    let isRemote = $state(false);
    const observed: { isRemote: boolean; dataVersion: number }[] = [];

    const cleanup = $effect.root(() => {
      $effect(() => {
        observed.push({ isRemote, dataVersion });
      });
    });

    flushSync();
    await tick();
    observed.length = 0;

    // Simulates the OLD buggy applyRemoteOperation (try/finally):
    isRemote = true;
    dataVersion = 1;
    isRemote = false;

    flushSync();
    await tick();

    // Effect runs once with the *batched final* values — flag is already false.
    // This is the bug we're guarding against: documenting it here makes the
    // intent of the fix obvious to future readers.
    expect(observed).toHaveLength(1);
    expect(observed[0].isRemote).toBe(false);
    expect(observed[0].dataVersion).toBe(1);

    cleanup();
  });
});
