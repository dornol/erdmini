/** FK line smart routing — grouping, spreading, obstacle avoidance, self-ref loops */

export interface AABB {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FKLineInput {
  id: string;
  sourceTableId: string;
  targetTableId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fromRight: boolean;
  toLeft: boolean;
}

export interface FKLineRoute {
  path: string;
  labelX: number;
  labelY: number;
}

const SPREAD_STEP = 20;
const OBSTACLE_PADDING = 10;
const MAX_AVOIDANCE_ITERATIONS = 3;
const MAX_SHIFT = 200;
const SAMPLE_COUNT = 9; // t = 0.1 .. 0.9

// ─── Helpers ──────────────────────────────────────────────

export function sampleCubicBezier(
  P0: { x: number; y: number },
  P1: { x: number; y: number },
  P2: { x: number; y: number },
  P3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * P0.x + 3 * uu * t * P1.x + 3 * u * tt * P2.x + ttt * P3.x,
    y: uuu * P0.y + 3 * uu * t * P1.y + 3 * u * tt * P2.y + ttt * P3.y,
  };
}

export function pointInAABB(px: number, py: number, box: AABB, padding: number): boolean {
  return (
    px >= box.x - padding &&
    px <= box.x + box.w + padding &&
    py >= box.y - padding &&
    py <= box.y + box.h + padding
  );
}

// ─── Base bezier (same as previous computeBezier) ─────────

function baseBezierParams(
  x1: number, y1: number, x2: number, y2: number,
  fromRight: boolean, toLeft: boolean,
) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const straight = Math.min(20, Math.max(8, dx * 0.25));
  const dirS = fromRight ? 1 : -1;
  const dirT = toLeft ? -1 : 1;
  const sx1 = x1 + dirS * straight;
  const sx2 = x2 + dirT * straight;
  const curveDx = Math.abs(sx2 - sx1);
  const offset = Math.max(40, Math.min(150, Math.max(curveDx * 0.4, dy * 0.4)));
  const cx1 = sx1 + dirS * offset;
  const cx2 = sx2 + dirT * offset;
  return { sx1, sx2, cx1, cx2, dirS, dirT };
}

function buildPath(
  x1: number, y1: number, x2: number, y2: number,
  sx1: number, sx2: number, cx1: number, cy1: number, cx2: number, cy2: number,
): string {
  return `M ${x1} ${y1} L ${sx1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${sx2} ${y2} L ${x2} ${y2}`;
}

function computeLabel(
  sx1: number, y1: number, cx1: number, cy1: number,
  cx2: number, cy2: number, sx2: number, y2: number,
): { labelX: number; labelY: number } {
  // Midpoint of cubic bezier at t=0.5
  const P0 = { x: sx1, y: y1 };
  const P1 = { x: cx1, y: cy1 };
  const P2 = { x: cx2, y: cy2 };
  const P3 = { x: sx2, y: y2 };
  const mid = sampleCubicBezier(P0, P1, P2, P3, 0.5);
  return { labelX: mid.x, labelY: mid.y };
}

// ─── Smart bezier with spread offset ──────────────────────

export function computeSmartBezier(
  x1: number, y1: number, x2: number, y2: number,
  fromRight: boolean, toLeft: boolean,
  spreadOffset: number,
  obstacles: AABB[],
  sourceTableId: string,
  targetTableId: string,
): FKLineRoute {
  const { sx1, sx2, cx1, cx2 } = baseBezierParams(x1, y1, x2, y2, fromRight, toLeft);

  // Apply spread offset to control point Y values
  let cy1 = y1 + spreadOffset;
  let cy2 = y2 + spreadOffset;

  // Filter obstacles: exclude source and target tables
  const relevantObstacles = obstacles.filter(
    (o) => o.id !== sourceTableId && o.id !== targetTableId,
  );

  // Obstacle avoidance iterations
  for (let iter = 0; iter < MAX_AVOIDANCE_ITERATIONS; iter++) {
    const P0 = { x: sx1, y: y1 };
    const P1 = { x: cx1, y: cy1 };
    const P2 = { x: cx2, y: cy2 };
    const P3 = { x: sx2, y: y2 };

    let maxShift = 0;
    let shiftDir = 0;

    for (let s = 1; s <= SAMPLE_COUNT; s++) {
      const t = s / (SAMPLE_COUNT + 1);
      const pt = sampleCubicBezier(P0, P1, P2, P3, t);

      for (const obs of relevantObstacles) {
        if (pointInAABB(pt.x, pt.y, obs, OBSTACLE_PADDING)) {
          const midY = (y1 + y2) / 2;
          const obsCenterY = obs.y + obs.h / 2;
          // Dodge away from obstacle center
          const dir = obsCenterY > midY ? -1 : 1;
          // How much to shift: at least enough to clear the box
          const needed = dir > 0
            ? (obs.y + obs.h + OBSTACLE_PADDING) - pt.y + 20
            : pt.y - (obs.y - OBSTACLE_PADDING) + 20;
          if (needed > maxShift) {
            maxShift = needed;
            shiftDir = dir;
          }
        }
      }
    }

    if (maxShift === 0) break;

    const shift = Math.min(maxShift, MAX_SHIFT) * shiftDir;
    cy1 += shift;
    cy2 += shift;
  }

  const path = buildPath(x1, y1, x2, y2, sx1, sx2, cx1, cy1, cx2, cy2);
  const { labelX, labelY } = computeLabel(sx1, y1, cx1, cy1, cx2, cy2, sx2, y2);

  return { path, labelX, labelY };
}

// ─── Self-referencing loop ────────────────────────────────

export function computeSelfRefLoop(
  x1: number, y1: number, x2: number, y2: number,
  loopIndex: number,
): FKLineRoute {
  // Match original computeBezier geometry: gap=8, base offset=40
  // Each additional self-ref loop extends further right
  const gap = 8;
  const baseOffset = 40;
  const loopStep = 25;
  const offset = baseOffset + loopIndex * loopStep;

  const exitX = x1 + gap;   // short straight segment out
  const enterX = x2 + gap;  // short straight segment back
  const apexX = x1 + gap + offset; // control point X (rightward bulge)

  // Single cubic bezier — clean U-shape
  const path = `M ${x1} ${y1} L ${exitX} ${y1} C ${apexX} ${y1}, ${apexX} ${y2}, ${enterX} ${y2} L ${x2} ${y2}`;

  // Label at t=0.5 of the cubic portion
  const P0 = { x: exitX, y: y1 };
  const P1 = { x: apexX, y: y1 };
  const P2 = { x: apexX, y: y2 };
  const P3 = { x: enterX, y: y2 };
  const mid = sampleCubicBezier(P0, P1, P2, P3, 0.5);

  return { path, labelX: mid.x, labelY: mid.y };
}

// ─── Main entry point ─────────────────────────────────────

export function routeFKLines(
  lines: FKLineInput[],
  obstacles: AABB[],
): Map<string, FKLineRoute> {
  const result = new Map<string, FKLineRoute>();

  // Separate self-referencing lines
  const selfRefLines: FKLineInput[] = [];
  const normalLines: FKLineInput[] = [];

  for (const line of lines) {
    if (line.sourceTableId === line.targetTableId) {
      selfRefLines.push(line);
    } else {
      normalLines.push(line);
    }
  }

  // ── Self-referencing loops ──
  // Group by table ID to assign loopIndex
  const selfRefGroups = new Map<string, FKLineInput[]>();
  for (const line of selfRefLines) {
    const group = selfRefGroups.get(line.sourceTableId) ?? [];
    group.push(line);
    selfRefGroups.set(line.sourceTableId, group);
  }

  for (const [, group] of selfRefGroups) {
    for (let i = 0; i < group.length; i++) {
      const line = group[i];
      result.set(line.id, computeSelfRefLoop(
        line.x1, line.y1, line.x2, line.y2, i,
      ));
    }
  }

  // ── Group normal lines for spreading ──
  const groups = new Map<string, FKLineInput[]>();
  for (const line of normalLines) {
    const key = `${line.sourceTableId}:${line.fromRight ? 'R' : 'L'}:${line.targetTableId}:${line.toLeft ? 'L' : 'R'}`;
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }

  for (const [, group] of groups) {
    // Sort by Y midpoint for consistent spread assignment
    group.sort((a, b) => {
      const midA = (a.y1 + a.y2) / 2;
      const midB = (b.y1 + b.y2) / 2;
      return midA - midB;
    });

    const N = group.length;
    for (let i = 0; i < N; i++) {
      const line = group[i];
      const spreadOffset = (i - (N - 1) / 2) * SPREAD_STEP;

      result.set(line.id, computeSmartBezier(
        line.x1, line.y1, line.x2, line.y2,
        line.fromRight, line.toLeft,
        spreadOffset,
        obstacles,
        line.sourceTableId,
        line.targetTableId,
      ));
    }
  }

  return result;
}
