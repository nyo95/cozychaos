import { createRandom } from '../../match/random.js';
import { TAU, type Vec2 } from '../geometry.js';

/**
 * Synthetic stroke generators for the classifier test dataset.
 *
 * PRD §21 requires the classifier to have a test dataset. Real recorded mouse
 * strokes would be better evidence of feel, but they are not reproducible and
 * cannot be swept across noise levels. Synthetic strokes let every test state
 * the exact shape and the exact amount of hand tremor, so a regression points
 * at a specific tolerance rather than at "some drawing broke".
 *
 * Every generator is seeded — PRD §21 forbids unseeded randomness anywhere,
 * and a flaky classifier test would be worse than no test.
 */

export interface StrokeOptions {
  /** Jitter as a fraction of the shape's size. 0 = machine-perfect. */
  readonly noise?: number;
  /** Number of sample points, mimicking a pointer sample rate. */
  readonly samples?: number;
  readonly seed?: number;
}

interface Resolved {
  readonly noise: number;
  readonly samples: number;
  readonly seed: number;
}

function resolve(options: StrokeOptions): Resolved {
  return {
    noise: options.noise ?? 0,
    samples: options.samples ?? 48,
    seed: options.seed ?? 1,
  };
}

/**
 * Applies correlated jitter, not white noise.
 *
 * A human hand drifts: consecutive samples err in the same direction for a
 * while, producing a few slow bends along the stroke. White noise would be
 * smoothed away instantly and would prove nothing about tolerance, while also
 * being the wrong failure to defend against — an unsteady hand produces slow
 * wander, and a noisy sensor produces high-frequency jitter that the resampling
 * step already removes.
 *
 * The retention coefficient sets how slowly the drift wanders. High retention
 * means few, broad bends, which is what a real shaky line looks like.
 */
const DRIFT_RETENTION = 0.9;

function jitter(points: readonly Vec2[], amount: number, scaleRef: number, seed: number): Vec2[] {
  if (amount <= 0) return [...points];
  const random = createRandom(seed);
  const magnitude = amount * scaleRef;
  let driftX = 0;
  let driftY = 0;
  return points.map((p) => {
    driftX = driftX * DRIFT_RETENTION + (random.next() * 2 - 1) * magnitude * 0.35;
    driftY = driftY * DRIFT_RETENTION + (random.next() * 2 - 1) * magnitude * 0.35;
    return { x: p.x + driftX, y: p.y + driftY };
  });
}

/** A straight line. The canonical Arc Bolt input. PRD §8.1. */
export function line(from: Vec2, to: Vec2, options: StrokeOptions = {}): Vec2[] {
  const { noise, samples, seed } = resolve(options);
  const points: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  return jitter(points, noise, span, seed);
}

/**
 * A circular arc. `sweep` in radians: π is a half circle, TAU a full circle.
 * A gentle sweep is still an Arc Bolt (PRD §8.1 — a curved line curves the
 * bolt); a full sweep is a Bubble Ward.
 */
export function arc(
  center: Vec2,
  radius: number,
  startAngle: number,
  sweep: number,
  options: StrokeOptions = {},
): Vec2[] {
  const { noise, samples, seed } = resolve(options);
  const points: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const angle = startAngle + sweep * t;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return jitter(points, noise, radius * 2, seed);
}

/**
 * A closed circle. `overdraw` extends past one revolution, which is what
 * hands actually do — people rarely stop exactly where they started.
 */
export function circle(
  center: Vec2,
  radius: number,
  options: StrokeOptions & { readonly overdraw?: number } = {},
): Vec2[] {
  const sweep = TAU * (1 + (options.overdraw ?? 0));
  return arc(center, radius, 0, sweep, { samples: 64, ...options });
}

/**
 * A spiral winding between two radii. The canonical Vortex input. PRD §8.3.
 * `revolutions` above 1 with a real radius change is what separates this from
 * an over-drawn circle.
 */
export function spiral(
  center: Vec2,
  innerRadius: number,
  outerRadius: number,
  revolutions: number,
  options: StrokeOptions = {},
): Vec2[] {
  const { noise, samples, seed } = resolve(options);
  const points: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const angle = TAU * revolutions * t;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return jitter(points, noise, outerRadius * 2, seed);
}

/**
 * Straight segments through the given vertices, producing sharp corners.
 * The canonical Prism Shard input. PRD §8.4.
 */
export function polyline(vertices: readonly Vec2[], options: StrokeOptions = {}): Vec2[] {
  const { noise, samples, seed } = resolve(options);
  if (vertices.length < 2) return [...vertices];

  const perSegment = Math.max(2, Math.floor(samples / (vertices.length - 1)));
  const points: Vec2[] = [];
  for (let v = 0; v < vertices.length - 1; v++) {
    const a = vertices[v]!;
    const b = vertices[v + 1]!;
    const last = v === vertices.length - 2;
    const count = last ? perSegment : perSegment - 1;
    for (let i = 0; i < count; i++) {
      const t = i / (last ? count - 1 : count);
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  let span = 0;
  for (let i = 1; i < vertices.length; i++) {
    span += Math.hypot(vertices[i]!.x - vertices[i - 1]!.x, vertices[i]!.y - vertices[i - 1]!.y);
  }
  return jitter(points, noise, span / (vertices.length - 1), seed);
}

/** A zigzag with `corners` sharp reversals. Open, angular. */
export function zigzag(
  start: Vec2,
  segmentLength: number,
  corners: number,
  options: StrokeOptions = {},
): Vec2[] {
  const vertices: Vec2[] = [start];
  for (let i = 0; i <= corners; i++) {
    const previous = vertices[vertices.length - 1]!;
    vertices.push({
      x: previous.x + segmentLength,
      y: previous.y + (i % 2 === 0 ? segmentLength : -segmentLength),
    });
  }
  return polyline(vertices, options);
}

/** A closed regular polygon. Angular even though it is closed. PRD §8.4. */
export function polygon(
  center: Vec2,
  radius: number,
  sides: number,
  options: StrokeOptions = {},
): Vec2[] {
  const vertices: Vec2[] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = (TAU * i) / sides - Math.PI / 2;
    vertices.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return polyline(vertices, { samples: 72, ...options });
}

/**
 * A directionless scribble. Not a shape any player is aiming for — this is the
 * input that must become an Arcane Wisp rather than being forced into a family
 * it does not belong to. PRD §8.5.
 */
export function scribble(center: Vec2, extent: number, options: StrokeOptions = {}): Vec2[] {
  const { samples, seed } = resolve(options);
  const random = createRandom(seed);
  const points: Vec2[] = [];
  let x = center.x;
  let y = center.y;
  for (let i = 0; i < samples; i++) {
    x += (random.next() * 2 - 1) * extent * 0.35;
    y += (random.next() * 2 - 1) * extent * 0.35;
    points.push({ x, y });
  }
  return points;
}

/** A near-stationary dab — the shortest input a mouse can produce. */
export function dot(center: Vec2, options: StrokeOptions = {}): Vec2[] {
  const { samples } = resolve(options);
  return Array.from({ length: Math.max(2, Math.min(samples, 6)) }, (_, i) => ({
    x: center.x + i * 0.0005,
    y: center.y,
  }));
}

/** A straight approach followed by a closed loop at the end. */
export function lineWithLoopAtEnd(options: StrokeOptions = {}): Vec2[] {
  const approach = line({ x: -0.9, y: -0.16 }, { x: 0.3, y: -0.16 }, { samples: 34 });
  const loop = arc({ x: 0.3, y: 0 }, 0.16, -Math.PI / 2, TAU, { samples: 48 });
  return jitter([...approach, ...loop.slice(1)], options.noise ?? 0, 1.2, options.seed ?? 1);
}

/** A closed loop followed by a straight exit. */
export function loopThenTail(options: StrokeOptions = {}): Vec2[] {
  const loop = arc({ x: -0.28, y: 0 }, 0.18, -Math.PI / 2, TAU, { samples: 48 });
  const tail = line({ x: -0.28, y: -0.18 }, { x: 0.68, y: 0.12 }, { samples: 30 });
  return jitter([...loop, ...tail.slice(1)], options.noise ?? 0, 1.3, options.seed ?? 1);
}

/** Three deliberate corners leading into a two-turn expanding spiral. */
export function zigzagIntoSpiral(options: StrokeOptions = {}): Vec2[] {
  const zig = polyline(
    [
      { x: -0.75, y: -0.2 },
      { x: -0.58, y: 0.02 },
      { x: -0.4, y: -0.2 },
      { x: -0.22, y: 0.02 },
    ],
    { samples: 36 },
  );
  const coil = spiral({ x: 0.12, y: 0.02 }, 0.05, 0.3, 2.05, { samples: 72 });
  return jitter([...zig, ...coil], options.noise ?? 0, 1.4, options.seed ?? 1);
}

/** A compact pentagram: several self-intersections in a short stroke span. */
export function denseCrossing(options: StrokeOptions = {}): Vec2[] {
  const center = { x: 0, y: 0 };
  const vertices = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + (TAU * index) / 5;
    return { x: center.x + Math.cos(angle) * 0.34, y: center.y + Math.sin(angle) * 0.34 };
  });
  const order = [0, 2, 4, 1, 3, 0];
  return polyline(order.map((index) => vertices[index]!), { samples: 96, ...options });
}
