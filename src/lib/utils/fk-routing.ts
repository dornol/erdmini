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
  const dirS = fromRight ? 1 : -1;
  const dirT = toLeft ? -1 : 1;
  // Straight segment must clear markers (child circle at 20px, parent at 15px)
  const MARKER_END = 22;
  const facing = (fromRight && toLeft) || (!fromRight && !toLeft);
  const straight = facing ? Math.min(MARKER_END, Math.max(8, dx * 0.4)) : MARKER_END;
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

  // Filter obstacles: exclude source/target tables and those outside FK line bounding box
  const pad = OBSTACLE_PADDING + 60; // generous padding for bezier curves
  const bboxMinX = Math.min(x1, x2) - pad;
  const bboxMaxX = Math.max(x1, x2) + pad;
  const bboxMinY = Math.min(y1, y2) - pad - 100; // extra Y for control point offsets
  const bboxMaxY = Math.max(y1, y2) + pad + 100;
  const relevantObstacles = obstacles.filter(
    (o) => o.id !== sourceTableId && o.id !== targetTableId &&
      o.x + o.w > bboxMinX && o.x < bboxMaxX &&
      o.y + o.h > bboxMinY && o.y < bboxMaxY,
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
  // Clear markers before curve starts (child circle at 20px)
  const gap = 22;
  const baseOffset = 40;
  const loopStep = 25;
  const offset = baseOffset + loopIndex * loopStep;

  const exitX = x1 + gap;
  const enterX = x2 + gap;
  const apexX = exitX + offset;

  // Straight from table edge to exit, curve, straight back to table edge
  const path = `M ${x1} ${y1} L ${exitX} ${y1} C ${apexX} ${y1}, ${apexX} ${y2}, ${enterX} ${y2} L ${x2} ${y2}`;

  // Label at t=0.5 of the cubic portion
  const P0 = { x: exitX, y: y1 };
  const P1 = { x: apexX, y: y1 };
  const P2 = { x: apexX, y: y2 };
  const P3 = { x: enterX, y: y2 };
  const mid = sampleCubicBezier(P0, P1, P2, P3, 0.5);

  return { path, labelX: mid.x, labelY: mid.y };
}

// ─── Orthogonal (right-angle) line ────────────────────────

export function computeOrthogonalLine(
  x1: number, y1: number, x2: number, y2: number,
  fromRight: boolean, toLeft: boolean,
): FKLineRoute {
  const minOffset = 22;
  const cDir = fromRight ? 1 : -1;
  const tDir = toLeft ? -1 : 1;
  const ex1 = x1 + cDir * minOffset;
  const ex2 = x2 + tDir * minOffset;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (fromRight === !toLeft) {
    // Same-direction exit (overlap): route via two exit points + midY
    const dy = Math.abs(y2 - y1);
    const minDetour = 30;
    const midY = dy < minDetour
      ? Math.min(y1, y2) - minDetour   // detour above when rows are close
      : (y1 + y2) / 2;
    path = `M ${x1} ${y1} L ${ex1} ${y1} L ${ex1} ${midY} L ${ex2} ${midY} L ${ex2} ${y2} L ${x2} ${y2}`;
    labelX = (ex1 + ex2) / 2;
    labelY = midY;
  } else {
    // Opposite directions (tables face each other or back-to-back)
    // Clamp exit points to stay within the gap between tables
    const halfGap = Math.max(minOffset, Math.abs(x2 - x1) / 2);
    const safeEx1 = x1 + cDir * Math.min(minOffset, halfGap);
    const safeEx2 = x2 + tDir * Math.min(minOffset, halfGap);
    const dy = Math.abs(y2 - y1);
    const minDetour = 30;
    const midY = dy < minDetour
      ? Math.min(y1, y2) - minDetour
      : (y1 + y2) / 2;
    path = `M ${x1} ${y1} L ${safeEx1} ${y1} L ${safeEx1} ${midY} L ${safeEx2} ${midY} L ${safeEx2} ${y2} L ${x2} ${y2}`;
    labelX = (safeEx1 + safeEx2) / 2;
    labelY = midY;
  }

  return { path, labelX, labelY };
}

// ─── Rounded orthogonal (right-angle with rounded corners) ──

function roundedCorner(
  x1: number, y1: number,
  cx: number, cy: number,
  x2: number, y2: number,
  r: number,
): string {
  // Corner from (x1,y1)→(cx,cy)→(x2,y2) with radius r
  const dx1 = cx - x1, dy1 = cy - y1;
  const dx2 = x2 - cx, dy2 = y2 - cy;
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  const clampR = Math.min(r, len1 / 2, len2 / 2);
  if (clampR < 1) return `L ${cx} ${cy}`;
  const ax = cx - (dx1 / len1) * clampR;
  const ay = cy - (dy1 / len1) * clampR;
  const bx = cx + (dx2 / len2) * clampR;
  const by = cy + (dy2 / len2) * clampR;
  return `L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}

export function computeRoundedOrthogonalLine(
  x1: number, y1: number, x2: number, y2: number,
  fromRight: boolean, toLeft: boolean,
): FKLineRoute {
  // Compute the same waypoints as orthogonal, then round the corners
  const base = computeOrthogonalLine(x1, y1, x2, y2, fromRight, toLeft);

  // Parse waypoints from the orthogonal path (M x y L x y L x y ...)
  const nums = base.path.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 4) return base;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    pts.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) });
  }

  const r = 20;
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    path += roundedCorner(
      pts[i - 1].x, pts[i - 1].y,
      pts[i].x, pts[i].y,
      pts[i + 1].x, pts[i + 1].y,
      r,
    );
  }
  path += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;

  return { path, labelX: base.labelX, labelY: base.labelY };
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
