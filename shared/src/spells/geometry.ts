/**
 * Pure 2D geometry helpers used by the stroke pipeline.
 *
 * PRD §21: "Stroke classifier harus pure function." Nothing in this file reads
 * clocks, randomness, or global state. Given the same points it returns the
 * same numbers on client and server, which is what makes the client-side
 * preview (PRD §14) agree with the server's authoritative result (PRD §7.4).
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const TAU = Math.PI * 2;

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 2D cross product (z component). Sign gives turn direction. */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Returns a unit vector, or `fallback` when the input has no direction. */
export function normalize(a: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const len = length(a);
  if (len < 1e-9) return fallback;
  return { x: a.x / len, y: a.y / len };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Maps `value` from [inMin, inMax] onto [0, 1], clamped. */
export function inverseLerp(inMin: number, inMax: number, value: number): number {
  if (Math.abs(inMax - inMin) < 1e-12) return 0;
  return clamp01((value - inMin) / (inMax - inMin));
}

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
  /** Diagonal length — the scale-invariant measure of "how big is this drawing". */
  readonly diagonal: number;
}

export function boundingBox(points: readonly Vec2[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, diagonal: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, minY, maxX, maxY, width, height, diagonal: Math.hypot(width, height) };
}

export function centroid(points: readonly Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/** Total arc length walked along the polyline. */
export function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1]!, points[i]!);
  }
  return total;
}

/**
 * Removes consecutive duplicate points.
 *
 * Mice emit repeated coordinates when held still, and a run of identical
 * points produces undefined tangents. Dropping them is a correctness fix, not
 * a stylistic one.
 */
export function dedupe(points: readonly Vec2[], epsilon = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last === undefined || distance(last, p) > epsilon) out.push(p);
  }
  return out;
}

/**
 * Reduces a polyline to at most `maxPoints`, keeping both endpoints.
 *
 * PRD §15 requires the server to cap the number of points a client may submit.
 * The cap has to be enforced before any geometry runs, not merely declared:
 * corner detection and turning are O(n) per stroke and a high-polling pointer
 * with coalesced events can emit thousands of samples in a seven-second Draw
 * phase, so an unenforced limit is both a fairness hole and a way for one
 * client to make the server do arbitrary work.
 *
 * Uniform index selection rather than curve-aware simplification: the stroke is
 * resampled by arc length immediately afterwards anyway, and a shape-aware
 * reduction here would make the result depend on which points survived, which
 * is exactly the hand-speed sensitivity PRD §7.1 rules out.
 */
export function decimate(points: readonly Vec2[], maxPoints: number): readonly Vec2[] {
  if (maxPoints < 2) throw new Error('decimate requires maxPoints >= 2');
  if (points.length <= maxPoints) return points;

  const out: Vec2[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * (points.length - 1)) / (maxPoints - 1));
    out.push(points[index]!);
  }
  return out;
}

/**
 * Resamples the polyline into exactly `count` points spaced evenly by arc
 * length.
 *
 * PRD §7.1: "Stroke dinormalisasi agar mouse cepat dan lambat tetap adil."
 * A slow hand emits many points per centimetre and a fast hand emits few;
 * after this step both describe the same shape with the same point density,
 * so hand speed cannot influence classification.
 */
export function resample(points: readonly Vec2[], count: number): Vec2[] {
  if (count < 2) throw new Error('resample requires count >= 2');
  const src = dedupe(points);
  if (src.length === 0) return [];
  if (src.length === 1) return Array.from({ length: count }, () => src[0]!);

  const total = pathLength(src);
  if (total < 1e-9) return Array.from({ length: count }, () => src[0]!);

  const step = total / (count - 1);
  const out: Vec2[] = [src[0]!];
  let distanceAlong = 0;
  let index = 1;
  let current = src[0]!;

  while (out.length < count && index < src.length) {
    const next = src[index]!;
    const segment = distance(current, next);
    if (distanceAlong + segment >= step) {
      const t = (step - distanceAlong) / segment;
      const point = { x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t };
      out.push(point);
      current = point;
      distanceAlong = 0;
    } else {
      distanceAlong += segment;
      current = next;
      index++;
    }
  }

  // Floating point drift can leave us one short; pin the final point exactly.
  while (out.length < count) out.push(src[src.length - 1]!);
  out[count - 1] = src[src.length - 1]!;
  return out;
}

/**
 * Moving-average smoothing that keeps the endpoints pinned.
 *
 * Endpoints carry meaning — the start is where the stroke was launched from
 * and the end sets the aim — so they must not drift inward. PRD §14 exposes
 * the pass count as the Draw Assist setting.
 */
export function smooth(points: readonly Vec2[], passes: number): Vec2[] {
  if (points.length < 3 || passes <= 0) return [...points];
  let current = [...points];
  for (let pass = 0; pass < passes; pass++) {
    const next: Vec2[] = [current[0]!];
    for (let i = 1; i < current.length - 1; i++) {
      const a = current[i - 1]!;
      const b = current[i]!;
      const c = current[i + 1]!;
      next.push({ x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 });
    }
    next.push(current[current.length - 1]!);
    current = next;
  }
  return current;
}

/**
 * Smallest distance from the stroke's end back to its own earlier course,
 * looking only at the first `fraction` of the path.
 *
 * This answers "did this drawing come back around on itself" better than the
 * gap between the two endpoints does. A hand-drawn ring almost always
 * overshoots slightly past where it started; the endpoints then sit some way
 * apart along the arc even though the shape is unmistakably closed, and an
 * endpoint-gap test would call it open. Measuring to the nearest earlier point
 * returns ~0 for an overshoot, which is the answer a human would give.
 *
 * `fraction` must stay small — it defines "the beginning of the stroke", not
 * "most of the stroke". Searching a wide span makes every open path look
 * closed: on a straight line the nearest point within the first 60% is the one
 * at the 60% mark, a mere 40% of the length away, so the line reports itself as
 * partly closed. A quarter of the path is wide enough to absorb the overshoot
 * a hand actually produces and narrow enough that an open stroke stays open.
 */
export function pathClosure(points: readonly Vec2[], fraction = 0.25): number {
  if (points.length < 3) return Infinity;
  const last = points[points.length - 1]!;
  const limit = Math.max(1, Math.floor(points.length * fraction));
  let best = Infinity;
  for (let i = 0; i < limit; i++) {
    const d = distance(last, points[i]!);
    if (d < best) best = d;
  }
  return best;
}

/** Signed area via the shoelace formula, treating the path as implicitly closed. */
export function signedArea(points: readonly Vec2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Isoperimetric quotient: `4πA / P²`.
 *
 * 1.0 for a perfect circle, ~0.785 for a square, ~0.60 for an equilateral
 * triangle, near 0 for a thin sliver. This is what separates Bubble Ward
 * (round) from Prism Shard (angular) among closed shapes.
 */
export function circularity(points: readonly Vec2[]): number {
  const area = Math.abs(signedArea(points));
  const closedPerimeter =
    pathLength(points) + (points.length > 1 ? distance(points[points.length - 1]!, points[0]!) : 0);
  if (closedPerimeter < 1e-9) return 0;
  return clamp01((4 * Math.PI * area) / (closedPerimeter * closedPerimeter));
}

/**
 * Signed angle from `a` to `b` in (-π, π].
 * Used both for path turning and for winding around the centroid.
 */
export function signedAngleBetween(a: Vec2, b: Vec2): number {
  const la = length(a);
  const lb = length(b);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cosine = clamp(dot(a, b) / (la * lb), -1, 1);
  const magnitude = Math.acos(cosine);
  return cross(a, b) < 0 ? -magnitude : magnitude;
}

/**
 * Total absolute turning along the path, in radians.
 *
 * 0 for a straight line, ~2π once around a circle, and large for a zigzag.
 * This measures how much the *heading* rotated, which is a different quantity
 * from winding (below) — a zigzag turns a lot but winds around nothing, and
 * that distinction is what keeps a zigzag out of the Loop family.
 *
 * Turning is measured between points `window` apart rather than between
 * adjacent samples, and only every `window`-th vertex is sampled so nothing is
 * counted twice. This is not an optimisation — it is required for correctness.
 * Adjacent-sample turning is dominated by sensor noise: a hand tremor of a
 * fraction of a millimetre reverses the direction between two neighbouring
 * samples and contributes nearly π radians, so a lightly shaky straight line
 * measures as more curved than a circle. Measuring across a window ignores
 * tremor and reports the turning a human would actually see.
 */
export function totalAbsoluteTurning(points: readonly Vec2[], window = 3): number {
  const w = Math.max(1, Math.floor(window));
  let total = 0;
  for (let i = w; i < points.length - w; i += w) {
    const incoming = sub(points[i]!, points[i - w]!);
    const outgoing = sub(points[i + w]!, points[i]!);
    total += Math.abs(signedAngleBetween(incoming, outgoing));
  }
  return total;
}

/**
 * How much of its bounding box the drawing actually encloses, in [0, 1].
 *
 * ~0.79 for a circle, 1.0 for a square, ~0.5 for a triangle, and ~0 for a
 * line or an open arc.
 *
 * This exists to gate the winding-based signals. Winding and radius spread are
 * measured relative to the centroid, and for a straight line the centroid sits
 * *on* the stroke — so the points sweep from one side of it to the other and
 * report half a revolution of winding and an enormous radius ratio, both pure
 * artefacts. Enclosure asks "is there a shape here at all" before those
 * signals are allowed to mean anything.
 */
export function enclosure(points: readonly Vec2[]): number {
  const box = boundingBox(points);
  const boxArea = box.width * box.height;
  if (boxArea < 1e-12) return 0;
  return clamp01(Math.abs(signedArea(points)) / boxArea);
}

/**
 * Signed winding angle accumulated around `center`, in radians.
 *
 * ±2π for one revolution, ±4π for two. The sign is the chirality, which
 * PRD §8.3 uses to decide which way a Vortex spins.
 */
export function windingAngle(points: readonly Vec2[], center: Vec2): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += signedAngleBetween(sub(points[i - 1]!, center), sub(points[i]!, center));
  }
  return total;
}

/**
 * Net direction of travel: the length-weighted mean of unit tangents.
 *
 * PRD-AMENDMENTS A-05 requires this instead of a naive start-to-end vector,
 * because tremor at the endpoints of a short stroke can swing a start-to-end
 * vector by tens of degrees. Averaging tangents makes the aim reflect the
 * whole gesture.
 */
export function principalDirection(points: readonly Vec2[], fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  let sx = 0;
  let sy = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = sub(points[i]!, points[i - 1]!);
    const len = length(segment);
    if (len < 1e-9) continue;
    sx += segment.x / len;
    sy += segment.y / len;
  }
  return normalize({ x: sx, y: sy }, fallback);
}

export interface CornerOptions {
  /** How far apart the sampled neighbours are. Wider ignores more tremor. */
  readonly window?: number;
  /**
   * When true, indices wrap around so the seam between the last and first
   * point is examined too. Without this, a drawn triangle reports only two of
   * its three corners — the third falls exactly on the seam — and a triangle
   * with two corners scores as a weak Prism Shard instead of a clear one.
   */
  readonly closed?: boolean;
}

/**
 * Indices of significant corners, after non-maximum suppression.
 *
 * Detection is a plain absolute threshold on windowed turning. An earlier
 * version also required each corner to stand out against a percentile of the
 * stroke's own turning, meaning to stop a tightly wound spiral — whose inner
 * samples turn as sharply as real corners — from reporting corners. That test
 * was abandoned because it was not monotonic in corner count: on a dense
 * zigzag the corners themselves dominate the distribution and lift the
 * baseline above the corners it was measuring, so a nine-corner sawtooth
 * reported zero corners and cast an Arc Bolt while an eleven-corner one
 * reported all eleven. A rule that fails at nine and works at eleven is worse
 * than no rule.
 *
 * The spiral case is instead handled where it belongs: the Vortex family is
 * identified by winding and a marching radius, and does not consult corners at
 * all.
 */
export function detectCorners(
  points: readonly Vec2[],
  angleThreshold: number,
  minSeparation: number,
  options: CornerOptions = {},
): number[] {
  const window = options.window ?? 4;
  const closed = options.closed ?? false;
  const n = points.length;
  if (n < 2 * window + 1) return [];

  const turns: Array<{ index: number; angle: number }> = [];
  const start = closed ? 0 : window;
  const end = closed ? n : n - window;
  for (let i = start; i < end; i++) {
    const before = points[closed ? (i - window + n) % n : i - window]!;
    const after = points[closed ? (i + window) % n : i + window]!;
    const here = points[i]!;
    turns.push({ index: i, angle: Math.abs(signedAngleBetween(sub(here, before), sub(after, here))) });
  }

  const candidates = turns.filter((t) => t.angle >= angleThreshold);

  // Strongest corner wins its neighbourhood, so one sharp bend is not counted
  // three times just because adjacent samples also exceeded the threshold.
  candidates.sort((a, b) => b.angle - a.angle);
  const accepted: number[] = [];
  for (const candidate of candidates) {
    const clear = accepted.every((index) => {
      const direct = Math.abs(index - candidate.index);
      const separation = closed ? Math.min(direct, n - direct) : direct;
      return separation >= minSeparation;
    });
    if (clear) accepted.push(candidate.index);
  }
  return accepted.sort((a, b) => a - b);
}

/** Value at the given percentile (0–1) of a numeric array. Does not mutate. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[index]!;
}
