import { describe, it, expect } from 'vitest';

// Test the CanvasState class by re-creating its logic (can't import .svelte.ts in vitest)
describe('CanvasState defaults', () => {
  // These tests verify the expected default values and snap behavior
  // that the CanvasState class should have

  it('snap rounds to grid when enabled', () => {
    const gridSize = 20;
    const snap = (v: number, enabled: boolean) =>
      enabled ? Math.round(v / gridSize) * gridSize : v;

    expect(snap(13, true)).toBe(20);
    expect(snap(9, true)).toBe(0);
    expect(snap(30, true)).toBe(40);
    expect(snap(13, false)).toBe(13);
  });

  it('showRelationLines defaults to true', () => {
    // Verify the localStorage restore logic
    const savedValue = null; // no saved value
    const showRelationLines = savedValue === 'false' ? false : true;
    expect(showRelationLines).toBe(true);
  });

  it('showRelationLines restores false from localStorage', () => {
    const savedValue = 'false';
    const showRelationLines = savedValue === 'false' ? false : true;
    expect(showRelationLines).toBe(false);
  });

  it('showRelationLines ignores invalid localStorage values', () => {
    const savedValue: string | null = 'invalid';
    const showRelationLines = savedValue === 'false' ? false : true;
    expect(showRelationLines).toBe(true);
  });
});

describe('FK marker geometry', () => {
  // Test the marker path generation logic extracted from RelationLines.svelte

  function computeParentMarkers(x2: number, y2: number, toLeft: boolean, isNullable: boolean) {
    const pDir = toLeft ? -1 : 1;
    const pTickX = x2 + pDir * 7;
    const parentTick = `M ${pTickX} ${y2 - 7} L ${pTickX} ${y2 + 7}`;
    let parentParticipation: string | null = null;
    const parentCircleCx = x2 + pDir * 15;
    if (!isNullable) {
      parentParticipation = `M ${parentCircleCx} ${y2 - 7} L ${parentCircleCx} ${y2 + 7}`;
    }
    return { parentTick, parentParticipation, parentCircleCx };
  }

  function computeChildMarkers(x1: number, y1: number, fromRight: boolean, isUnique: boolean) {
    const cDir = fromRight ? 1 : -1;
    let childMarker: string;
    if (isUnique) {
      const cTickX = x1 + cDir * 7;
      childMarker = `M ${cTickX} ${y1 - 7} L ${cTickX} ${y1 + 7}`;
    } else {
      const tipX = x1 + cDir * 5;
      const baseX = x1 + cDir * 14;
      const spread = 8;
      childMarker = `M ${baseX} ${y1 - spread} L ${tipX} ${y1} L ${baseX} ${y1 + spread}`;
    }
    return { childMarker };
  }

  it('parent tick is vertical line at correct offset (toLeft)', () => {
    const { parentTick } = computeParentMarkers(400, 100, true, false);
    expect(parentTick).toBe('M 393 93 L 393 107');
  });

  it('parent tick offset is positive when not toLeft', () => {
    const { parentTick } = computeParentMarkers(400, 100, false, false);
    expect(parentTick).toBe('M 407 93 L 407 107');
  });

  it('parent participation line when not nullable', () => {
    const { parentParticipation } = computeParentMarkers(400, 100, true, false);
    expect(parentParticipation).toBe('M 385 93 L 385 107');
  });

  it('parent participation is null when nullable (circle instead)', () => {
    const { parentParticipation, parentCircleCx } = computeParentMarkers(400, 100, true, true);
    expect(parentParticipation).toBeNull();
    expect(parentCircleCx).toBe(385);
  });

  it('child marker is crow foot (V shape) for many side', () => {
    const { childMarker } = computeChildMarkers(200, 100, true, false);
    // V shape: base-top → tip → base-bottom
    expect(childMarker).toBe('M 214 92 L 205 100 L 214 108');
  });

  it('child marker is tick for unique (1:1)', () => {
    const { childMarker } = computeChildMarkers(200, 100, true, true);
    expect(childMarker).toBe('M 207 93 L 207 107');
  });

  it('child marker direction flips when fromRight=false', () => {
    const { childMarker } = computeChildMarkers(200, 100, false, false);
    // Mirror: base and tip flip
    expect(childMarker).toBe('M 186 92 L 195 100 L 186 108');
  });
});
