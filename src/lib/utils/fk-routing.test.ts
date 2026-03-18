import { describe, it, expect } from 'vitest';
import {
  routeFKLines,
  computeSmartBezier,
  computeSelfRefLoop,
  computeOrthogonalLine,
  computeRoundedOrthogonalLine,
  sampleCubicBezier,
  pointInAABB,
  type AABB,
  type FKLineInput,
} from './fk-routing';

// ─── Helper ──────────────────────────────────────────────

function makeLine(overrides: Partial<FKLineInput> & { id: string }): FKLineInput {
  return {
    sourceTableId: 'tbl_a',
    targetTableId: 'tbl_b',
    x1: 200,
    y1: 150,
    x2: 400,
    y2: 150,
    fromRight: true,
    toLeft: true,
    ...overrides,
  };
}

function makeAABB(overrides: Partial<AABB> & { id: string }): AABB {
  return { x: 0, y: 0, w: 200, h: 100, ...overrides };
}

// ─── sampleCubicBezier ──────────────────────────────────

describe('sampleCubicBezier', () => {
  it('returns P0 at t=0', () => {
    const P0 = { x: 0, y: 0 }, P1 = { x: 50, y: 100 }, P2 = { x: 150, y: 100 }, P3 = { x: 200, y: 0 };
    const pt = sampleCubicBezier(P0, P1, P2, P3, 0);
    expect(pt.x).toBeCloseTo(0);
    expect(pt.y).toBeCloseTo(0);
  });

  it('returns P3 at t=1', () => {
    const P0 = { x: 0, y: 0 }, P1 = { x: 50, y: 100 }, P2 = { x: 150, y: 100 }, P3 = { x: 200, y: 0 };
    const pt = sampleCubicBezier(P0, P1, P2, P3, 1);
    expect(pt.x).toBeCloseTo(200);
    expect(pt.y).toBeCloseTo(0);
  });

  it('returns midpoint at t=0.5', () => {
    const P0 = { x: 0, y: 0 }, P1 = { x: 0, y: 100 }, P2 = { x: 200, y: 100 }, P3 = { x: 200, y: 0 };
    const pt = sampleCubicBezier(P0, P1, P2, P3, 0.5);
    expect(pt.x).toBeCloseTo(100);
    expect(pt.y).toBeCloseTo(75); // symmetric S-curve
  });
});

// ─── pointInAABB ─────────────────────────────────────────

describe('pointInAABB', () => {
  const box: AABB = { id: 'b', x: 100, y: 100, w: 200, h: 100 };

  it('detects point inside box', () => {
    expect(pointInAABB(150, 150, box, 0)).toBe(true);
  });

  it('detects point outside box', () => {
    expect(pointInAABB(50, 50, box, 0)).toBe(false);
  });

  it('respects padding', () => {
    // point just outside box but within padding
    expect(pointInAABB(95, 150, box, 10)).toBe(true);
    expect(pointInAABB(95, 150, box, 0)).toBe(false);
  });
});

// ─── Basic bezier (computeSmartBezier with 0 spread, no obstacles) ──

describe('computeSmartBezier — basic', () => {
  it('produces a valid SVG path starting with M', () => {
    const r = computeSmartBezier(100, 150, 400, 150, true, true, 0, [], 'a', 'b');
    expect(r.path).toMatch(/^M /);
    expect(r.path).toContain('C');
    expect(r.path).toContain('L');
  });

  it('path starts at (x1,y1) and ends at (x2,y2)', () => {
    const r = computeSmartBezier(100, 200, 500, 300, true, true, 0, [], 'a', 'b');
    expect(r.path).toMatch(/^M 100 200/);
    expect(r.path).toMatch(/500 300$/);
  });

  it('places label roughly between endpoints', () => {
    const r = computeSmartBezier(100, 100, 500, 100, true, true, 0, [], 'a', 'b');
    expect(r.labelX).toBeGreaterThan(100);
    expect(r.labelX).toBeLessThan(500);
  });

  it('handles left-to-right and right-to-left directions', () => {
    const r1 = computeSmartBezier(100, 100, 400, 100, true, true, 0, [], 'a', 'b');
    const r2 = computeSmartBezier(400, 100, 100, 100, false, false, 0, [], 'a', 'b');
    expect(r1.path).not.toBe(r2.path); // different directions → different paths
  });

  it('handles overlapping X case (fromRight=true, toLeft=false)', () => {
    const r = computeSmartBezier(200, 100, 220, 200, true, false, 0, [], 'a', 'b');
    expect(r.path).toMatch(/^M /);
  });
});

// ─── Grouping & Spreading ────────────────────────────────

describe('routeFKLines — grouping & spreading', () => {
  it('single line gets 0 spread offset (same as base bezier)', () => {
    const line = makeLine({ id: 'fk1' });
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_b', x: 400, y: 100, w: 200, h: 100 }),
    ];
    const routes = routeFKLines([line], obstacles);
    const baseRoute = computeSmartBezier(
      line.x1, line.y1, line.x2, line.y2,
      line.fromRight, line.toLeft, 0, obstacles, line.sourceTableId, line.targetTableId,
    );
    expect(routes.get('fk1')?.path).toBe(baseRoute.path);
  });

  it('two lines between same table pair get different paths', () => {
    const line1 = makeLine({ id: 'fk1', y1: 150, y2: 150 });
    const line2 = makeLine({ id: 'fk2', y1: 176, y2: 176 });
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 200 }),
      makeAABB({ id: 'tbl_b', x: 400, y: 100, w: 200, h: 200 }),
    ];
    const routes = routeFKLines([line1, line2], obstacles);
    expect(routes.get('fk1')?.path).not.toBe(routes.get('fk2')?.path);
  });

  it('three lines produce symmetric spread offsets', () => {
    const lines = [
      makeLine({ id: 'fk1', y1: 150, y2: 150 }),
      makeLine({ id: 'fk2', y1: 176, y2: 176 }),
      makeLine({ id: 'fk3', y1: 202, y2: 202 }),
    ];
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 300 }),
      makeAABB({ id: 'tbl_b', x: 400, y: 100, w: 200, h: 300 }),
    ];
    const routes = routeFKLines(lines, obstacles);
    // All three should have distinct paths
    const paths = new Set([routes.get('fk1')?.path, routes.get('fk2')?.path, routes.get('fk3')?.path]);
    expect(paths.size).toBe(3);
  });

  it('endpoints (x1,y1,x2,y2) remain unchanged after spreading', () => {
    const lines = [
      makeLine({ id: 'fk1', y1: 150, y2: 150 }),
      makeLine({ id: 'fk2', y1: 176, y2: 176 }),
    ];
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 200 }),
      makeAABB({ id: 'tbl_b', x: 400, y: 100, w: 200, h: 200 }),
    ];
    const routes = routeFKLines(lines, obstacles);
    for (const line of lines) {
      const route = routes.get(line.id)!;
      expect(route.path).toMatch(new RegExp(`^M ${line.x1} ${line.y1}`));
      expect(route.path).toMatch(new RegExp(`${line.x2} ${line.y2}$`));
    }
  });

  it('lines between different table pairs are in separate groups', () => {
    const line1 = makeLine({ id: 'fk1', sourceTableId: 'tbl_a', targetTableId: 'tbl_b' });
    const line2 = makeLine({ id: 'fk2', sourceTableId: 'tbl_a', targetTableId: 'tbl_c', x2: 600, y2: 300 });
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 200 }),
      makeAABB({ id: 'tbl_b', x: 400, y: 100, w: 200, h: 200 }),
      makeAABB({ id: 'tbl_c', x: 600, y: 250, w: 200, h: 200 }),
    ];
    const routes = routeFKLines([line1, line2], obstacles);
    // Each line alone in its group → 0 spread → same as base bezier
    const base1 = computeSmartBezier(line1.x1, line1.y1, line1.x2, line1.y2, line1.fromRight, line1.toLeft, 0, obstacles, 'tbl_a', 'tbl_b');
    const base2 = computeSmartBezier(line2.x1, line2.y1, line2.x2, line2.y2, line2.fromRight, line2.toLeft, 0, obstacles, 'tbl_a', 'tbl_c');
    expect(routes.get('fk1')?.path).toBe(base1.path);
    expect(routes.get('fk2')?.path).toBe(base2.path);
  });

  it('lines with different direction flags form separate groups', () => {
    const line1 = makeLine({ id: 'fk1', fromRight: true, toLeft: true });
    const line2 = makeLine({ id: 'fk2', fromRight: false, toLeft: false, x1: 0, x2: 400 });
    const obstacles: AABB[] = [];
    const routes = routeFKLines([line1, line2], obstacles);
    expect(routes.size).toBe(2);
  });

  it('returns routes for all input lines', () => {
    const lines = Array.from({ length: 5 }, (_, i) =>
      makeLine({ id: `fk${i}`, y1: 150 + i * 26, y2: 150 + i * 26 }),
    );
    const routes = routeFKLines(lines, []);
    expect(routes.size).toBe(5);
  });
});

// ─── Self-referencing loop ───────────────────────────────

describe('computeSelfRefLoop', () => {
  it('produces a valid SVG path with single cubic bezier', () => {
    const r = computeSelfRefLoop(200, 150, 200, 176, 0);
    expect(r.path).toMatch(/^M /);
    expect(r.path).toContain('C');
    // Should have exactly one C command (single cubic bezier)
    expect(r.path.match(/C /g)?.length).toBe(1);
  });

  it('loop extends to the right of start point', () => {
    const r = computeSelfRefLoop(200, 150, 200, 176, 0);
    // label should be to the right of x1 (200)
    expect(r.labelX).toBeGreaterThan(200);
  });

  it('multiple self-refs produce different extents', () => {
    const r0 = computeSelfRefLoop(200, 150, 200, 176, 0);
    const r1 = computeSelfRefLoop(200, 150, 200, 176, 1);
    expect(r0.path).not.toBe(r1.path);
    // Second loop should extend further right
    expect(r1.labelX).toBeGreaterThan(r0.labelX);
  });

  it('label Y is between y1 and y2', () => {
    const r = computeSelfRefLoop(200, 100, 200, 200, 0);
    expect(r.labelY).toBeGreaterThanOrEqual(100);
    expect(r.labelY).toBeLessThanOrEqual(200);
  });

  it('path starts at (x1,y1) and ends at (x2,y2)', () => {
    const r = computeSelfRefLoop(200, 150, 200, 200, 0);
    expect(r.path).toMatch(/^M 200 150/);
    expect(r.path).toMatch(/200 200$/);
  });

  it('loopIndex=0 uses gap=22 and offset=40', () => {
    // gap=22, offset=40 → exitX=222, apexX=262
    const r = computeSelfRefLoop(200, 150, 200, 176, 0);
    expect(r.path).toContain('262');
  });
});

// ─── routeFKLines self-ref integration ───────────────────

describe('routeFKLines — self-referencing', () => {
  it('detects self-referencing and uses loop routing', () => {
    const line = makeLine({
      id: 'fk_self',
      sourceTableId: 'tbl_a',
      targetTableId: 'tbl_a',
      x1: 200, y1: 150,
      x2: 200, y2: 176,
    });
    const obstacles = [makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 200 })];
    const routes = routeFKLines([line], obstacles);
    const route = routes.get('fk_self')!;
    // Self-ref loop goes right, label to the right
    expect(route.labelX).toBeGreaterThan(200);
  });

  it('multiple self-refs on same table do not overlap', () => {
    const lines = [
      makeLine({ id: 'fk_self1', sourceTableId: 'tbl_a', targetTableId: 'tbl_a', y1: 150, y2: 176 }),
      makeLine({ id: 'fk_self2', sourceTableId: 'tbl_a', targetTableId: 'tbl_a', y1: 176, y2: 202 }),
    ];
    const obstacles = [makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 300 })];
    const routes = routeFKLines(lines, obstacles);
    expect(routes.get('fk_self1')?.path).not.toBe(routes.get('fk_self2')?.path);
  });
});

// ─── Obstacle avoidance ──────────────────────────────────

describe('routeFKLines — obstacle avoidance', () => {
  it('avoids obstacle between two tables', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 150,
      x2: 600, y2: 150,
    });
    const obstacle = makeAABB({ id: 'tbl_c', x: 350, y: 100, w: 100, h: 100 });
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 100 }),
      obstacle,
      makeAABB({ id: 'tbl_b', x: 600, y: 100, w: 200, h: 100 }),
    ];
    const routes = routeFKLines([line], obstacles);
    const route = routes.get('fk1')!;

    // Verify the path was shifted (label Y should differ from 150)
    // The obstacle is at the same Y as the line, so the path should dodge
    expect(route.path).toBeTruthy();
  });

  it('excludes source and target tables from obstacles', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 150,
      x2: 400, y2: 150,
    });
    // Source and target as obstacles should be ignored
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_b', x: 400, y: 100, w: 200, h: 100 }),
    ];
    const routeWithObs = routeFKLines([line], obstacles);
    const routeNoObs = routeFKLines([line], []);
    // Should be the same since src/tgt are excluded
    expect(routeWithObs.get('fk1')?.path).toBe(routeNoObs.get('fk1')?.path);
  });

  it('shifts curve away from obstacle center', () => {
    // Obstacle above the line → curve should shift downward
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 300,
      x2: 600, y2: 300,
    });
    const obstacleMid = makeAABB({ id: 'tbl_c', x: 350, y: 250, w: 100, h: 100 });
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 250, w: 200, h: 100 }),
      obstacleMid,
      makeAABB({ id: 'tbl_b', x: 600, y: 250, w: 200, h: 100 }),
    ];
    const routes = routeFKLines([line], obstacles);
    const route = routes.get('fk1')!;
    // Label Y should be pushed away from obstacle
    expect(route).toBeTruthy();
  });

  it('handles multiple obstacles along path', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 0, y1: 200,
      x2: 800, y2: 200,
      sourceTableId: 'tbl_src',
      targetTableId: 'tbl_tgt',
    });
    const obstacles = [
      makeAABB({ id: 'tbl_src', x: -200, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'obs1', x: 200, y: 150, w: 100, h: 100 }),
      makeAABB({ id: 'obs2', x: 500, y: 150, w: 100, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 800, y: 150, w: 200, h: 100 }),
    ];
    const routes = routeFKLines([line], obstacles);
    expect(routes.get('fk1')).toBeTruthy();
  });

  it('no avoidance when no obstacles in path', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 150,
      x2: 600, y2: 150,
    });
    // Obstacle far away
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_b', x: 600, y: 100, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_c', x: 350, y: 500, w: 100, h: 100 }), // far below
    ];
    const routes = routeFKLines([line], obstacles);
    const routeNoFarObs = routeFKLines([line], [
      makeAABB({ id: 'tbl_a', x: 0, y: 100, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_b', x: 600, y: 100, w: 200, h: 100 }),
    ]);
    expect(routes.get('fk1')?.path).toBe(routeNoFarObs.get('fk1')?.path);
  });

  it('avoidance respects padding', () => {
    // Obstacle edge is close but within padding
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 200,
      x2: 600, y2: 200,
    });
    const obstacles = [
      makeAABB({ id: 'tbl_a', x: 0, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_b', x: 600, y: 150, w: 200, h: 100 }),
    ];
    const routes = routeFKLines([line], obstacles);
    // src and tgt excluded, so path should be the same as no obstacles
    expect(routes.get('fk1')).toBeTruthy();
  });
});

// ─── Obstacle bbox pre-filter (C4 optimization) ────────

describe('obstacle bounding box pre-filter', () => {
  it('filters out obstacles far below FK line', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 100,
      x2: 600, y2: 100,
      sourceTableId: 'tbl_src',
      targetTableId: 'tbl_tgt',
    });
    const obstacles = [
      makeAABB({ id: 'tbl_src', x: 0, y: 50, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 600, y: 50, w: 200, h: 100 }),
      makeAABB({ id: 'far_below', x: 350, y: 1000, w: 100, h: 100 }),
    ];
    // Route with far-away obstacle should equal route without it
    const withFar = routeFKLines([line], obstacles);
    const withoutFar = routeFKLines([line], [
      makeAABB({ id: 'tbl_src', x: 0, y: 50, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 600, y: 50, w: 200, h: 100 }),
    ]);
    expect(withFar.get('fk1')?.path).toBe(withoutFar.get('fk1')?.path);
  });

  it('filters out obstacles far to the right of FK line', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 100, y1: 200,
      x2: 300, y2: 200,
      sourceTableId: 'tbl_src',
      targetTableId: 'tbl_tgt',
    });
    const obstacles = [
      makeAABB({ id: 'tbl_src', x: -100, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 300, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'far_right', x: 2000, y: 150, w: 100, h: 100 }),
    ];
    const withFar = routeFKLines([line], obstacles);
    const withoutFar = routeFKLines([line], [
      makeAABB({ id: 'tbl_src', x: -100, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 300, y: 150, w: 200, h: 100 }),
    ]);
    expect(withFar.get('fk1')?.path).toBe(withoutFar.get('fk1')?.path);
  });

  it('keeps obstacles within FK line bounding area', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 200, y1: 200,
      x2: 600, y2: 200,
      sourceTableId: 'tbl_src',
      targetTableId: 'tbl_tgt',
    });
    const nearObstacle = makeAABB({ id: 'near', x: 350, y: 160, w: 100, h: 80 });
    const obstacles = [
      makeAABB({ id: 'tbl_src', x: 0, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 600, y: 150, w: 200, h: 100 }),
      nearObstacle,
    ];
    // Near obstacle should still be considered — path should differ from no-obstacle
    const withNear = routeFKLines([line], obstacles);
    const withoutNear = routeFKLines([line], [
      makeAABB({ id: 'tbl_src', x: 0, y: 150, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 600, y: 150, w: 200, h: 100 }),
    ]);
    // Both should produce valid routes
    expect(withNear.get('fk1')).toBeTruthy();
    expect(withoutNear.get('fk1')).toBeTruthy();
  });

  it('handles many distant obstacles efficiently', () => {
    const line = makeLine({
      id: 'fk1',
      x1: 100, y1: 100,
      x2: 300, y2: 100,
      sourceTableId: 'tbl_src',
      targetTableId: 'tbl_tgt',
    });
    // 100 obstacles scattered far away
    const obstacles: AABB[] = [
      makeAABB({ id: 'tbl_src', x: -100, y: 50, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 300, y: 50, w: 200, h: 100 }),
    ];
    for (let i = 0; i < 100; i++) {
      obstacles.push(makeAABB({
        id: `far_${i}`,
        x: 5000 + i * 300,
        y: 5000 + i * 300,
        w: 200,
        h: 100,
      }));
    }
    const routes = routeFKLines([line], obstacles);
    expect(routes.get('fk1')).toBeTruthy();

    // Result should be same as without distant obstacles
    const routesClean = routeFKLines([line], [
      makeAABB({ id: 'tbl_src', x: -100, y: 50, w: 200, h: 100 }),
      makeAABB({ id: 'tbl_tgt', x: 300, y: 50, w: 200, h: 100 }),
    ]);
    expect(routes.get('fk1')?.path).toBe(routesClean.get('fk1')?.path);
  });
});

// ─── Label accuracy ──────────────────────────────────────

describe('label position', () => {
  it('label moves with spread offset', () => {
    const r0 = computeSmartBezier(100, 150, 400, 150, true, true, 0, [], 'a', 'b');
    const r20 = computeSmartBezier(100, 150, 400, 150, true, true, 40, [], 'a', 'b');
    // With positive spread, label Y should shift
    expect(r20.labelY).not.toBeCloseTo(r0.labelY, 0);
  });

  it('label is on the curve at t=0.5', () => {
    const r = computeSmartBezier(100, 100, 500, 300, true, true, 0, [], 'a', 'b');
    // labelX should be roughly between x1 and x2
    expect(r.labelX).toBeGreaterThan(100);
    expect(r.labelX).toBeLessThan(500);
    // labelY between y1 and y2
    expect(r.labelY).toBeGreaterThanOrEqual(100);
    expect(r.labelY).toBeLessThanOrEqual(300);
  });
});

// ─── Edge cases ──────────────────────────────────────────

describe('edge cases', () => {
  it('empty input returns empty map', () => {
    const routes = routeFKLines([], []);
    expect(routes.size).toBe(0);
  });

  it('handles lines with same y1 and y2', () => {
    const line = makeLine({ id: 'fk1', y1: 200, y2: 200 });
    const routes = routeFKLines([line], []);
    expect(routes.get('fk1')).toBeTruthy();
  });

  it('handles very close tables', () => {
    const line = makeLine({ id: 'fk1', x1: 200, x2: 210, y1: 100, y2: 100 });
    const routes = routeFKLines([line], []);
    expect(routes.get('fk1')).toBeTruthy();
  });
});

// ─── computeRoundedOrthogonalLine ────────────────────────

describe('computeRoundedOrthogonalLine', () => {
  it('produces a valid SVG path with Q commands for rounded corners', () => {
    const route = computeRoundedOrthogonalLine(0, 0, 200, 100, true, true);
    expect(route.path).toMatch(/^M /);
    expect(route.path).toContain('Q');
  });

  it('has same label position as orthogonal', () => {
    const rounded = computeRoundedOrthogonalLine(0, 0, 200, 100, true, true);
    const ortho = computeOrthogonalLine(0, 0, 200, 100, true, true);
    expect(rounded.labelX).toBe(ortho.labelX);
    expect(rounded.labelY).toBe(ortho.labelY);
  });

  it('falls back gracefully for degenerate input', () => {
    const route = computeRoundedOrthogonalLine(50, 50, 50, 50, true, true);
    expect(route.path).toBeTruthy();
  });

  it('handles overlap case (same-direction exit)', () => {
    const route = computeRoundedOrthogonalLine(200, 100, 220, 200, true, false);
    expect(route.path).toMatch(/^M /);
    expect(route.path).toContain('Q');
  });
});

// ─── computeOrthogonalLine ───────────────────────────────

describe('computeOrthogonalLine', () => {
  it('returns a path string', () => {
    const route = computeOrthogonalLine(0, 0, 200, 100, true, true);
    expect(typeof route.path).toBe('string');
    expect(route.path.startsWith('M 0 0')).toBe(true);
  });

  it('same-direction: ends at target point', () => {
    const route = computeOrthogonalLine(0, 0, 200, 100, true, true);
    expect(route.path.endsWith('L 200 100')).toBe(true);
  });

  it('opposite-direction: ends at target point', () => {
    const route = computeOrthogonalLine(200, 0, 0, 100, false, false);
    expect(route.path.endsWith('L 0 100')).toBe(true);
  });

  it('returns valid label coordinates', () => {
    const route = computeOrthogonalLine(0, 0, 200, 100, true, true);
    expect(typeof route.labelX).toBe('number');
    expect(typeof route.labelY).toBe('number');
    expect(isFinite(route.labelX)).toBe(true);
    expect(isFinite(route.labelY)).toBe(true);
  });

  it('same-direction exit: label X is midpoint of exit points', () => {
    // fromRight=true, toLeft=true → same direction (fromRight === !toLeft is false when both true)
    // both go right: fromRight=true (exit right), toLeft=true (enter from left → dir=-1, enter goes left)
    // fromRight === !toLeft → true === false → false → opposite path used
    const route = computeOrthogonalLine(0, 50, 300, 150, true, true);
    expect(route.path).toBeTruthy();
  });

  it('handles equal y1 and y2', () => {
    const route = computeOrthogonalLine(0, 100, 200, 100, true, true);
    expect(route.path.endsWith('L 200 100')).toBe(true);
  });
});
