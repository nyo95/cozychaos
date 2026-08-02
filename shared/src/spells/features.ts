import { CONFIG } from '../config/index.js';
import type { AssistLevel } from '../config/types.js';
import {
  TAU,
  type Vec2,
  boundingBox,
  centroid,
  circularity,
  decimate,
  clamp01,
  detectCorners,
  distance,
  enclosure,
  length,
  pathClosure,
  pathLength,
  percentile,
  principalDirection,
  resample,
  smooth,
  sub,
  totalAbsoluteTurning,
  windingAngle,
} from './geometry.js';

/**
 * Everything the game knows about a drawing, reduced to numbers.
 *
 * This is the boundary between "how the player drew" and "what the game does".
 * The classifier reads only this, and the parameter mapper reads only this —
 * neither ever touches raw mouse points. That keeps both testable with
 * synthetic data and keeps hand speed out of the result entirely.
 */
export interface StrokeFeatures {
  /** Evenly-spaced points after smoothing. Length is `resampleCount`. */
  readonly points: readonly Vec2[];
  /** Number of points the player actually produced, before resampling. */
  readonly rawPointCount: number;
  /** Arc length in arena units. Drives ink cost. PRD §7.2. */
  readonly arcLength: number;
  /** Bounding-box diagonal in arena units — "how big is this drawing". */
  readonly size: number;
  /** Geometric centre. The spawn point for closed families (A-05). */
  readonly centroid: Vec2;
  /**
   * How far the stroke's end finished from its own earlier course, relative to
   * the drawing's size. Near 0 means the shape came back around on itself.
   * Tolerant of overshoot, unlike a plain endpoint-to-endpoint gap.
   */
  readonly closure: number;
  /** Plain endpoint-to-endpoint gap, relative to size. Used for the seam test. */
  readonly endpointGap: number;
  /** True when `closure` is below the configured threshold. */
  readonly isClosed: boolean;
  /** Total rotation of the heading, in radians. 0 = perfectly straight. */
  readonly totalTurning: number;
  /** Signed revolutions around the centroid. Sign is the chirality. */
  readonly winding: number;
  /** +1 counter-clockwise, -1 clockwise, 0 when there is no meaningful spin. */
  readonly chirality: -1 | 0 | 1;
  /** Isoperimetric quotient. 1 = perfect circle. */
  readonly circularity: number;
  /**
   * Fraction of the bounding box the drawing encloses. ~0 for a line.
   * Gates every winding-based signal, since those are meaningless for a
   * drawing whose centroid lies on the stroke itself.
   */
  readonly enclosure: number;
  /**
   * Ratio between the 90th and 10th percentile radius from the centroid.
   * ~1 for a circle, large for a spiral. Percentiles rather than min/max so a
   * single stray point cannot fake a spiral.
   */
  readonly radiusRatio: number;
  /**
   * Standard deviation of the radius divided by its mean. ~0 for a ring of any
   * kind, large for a sliver or a spiral.
   *
   * This — not `circularity` — is what decides roundness. Circularity divides
   * by perimeter squared, so a ring drawn a third of a turn past its starting
   * point sees its perimeter grow while its area does not, and its circularity
   * collapses even though the shape is still a perfect circle. Overshoot is
   * what hands do, so a roundness test must be blind to it. Radial consistency
   * is.
   */
  readonly radiusVariation: number;
  /**
   * How steadily the radius grows or shrinks along the stroke, in [-1, 1].
   * A true spiral marches monotonically in or out; a wobbly circle does not.
   */
  readonly radiusTrend: number;
  /** Indices of significant corners within `points`. */
  readonly corners: readonly number[];
  readonly cornerCount: number;
  /** Mean turning per unit length, normalised to [0, 1]. */
  readonly curvature: number;
  /** Net direction of travel as a unit vector. The aim for open families. */
  readonly direction: Vec2;
  /**
   * Mean deviation from a heavily smoothed version of the same stroke,
   * relative to size. PRD §7.3 maps this to visual wobble and small,
   * strictly bounded variance — never to raw damage.
   */
  readonly irregularity: number;
  /** True when the stroke is too small or too short to describe any shape. */
  readonly degenerate: boolean;
}

/** Everything that changes how a stroke is read. Passed explicitly so the
 * pipeline stays a pure function of its inputs. */
export interface FeatureOptions {
  readonly assist: AssistLevel;
}

const DEFAULT_OPTIONS: FeatureOptions = { assist: 'standard' };

/** Fraction of `closureRatio` below which the seam may be scanned for corners. */
const TIGHT_CLOSURE_FRACTION = 0.35;

/**
 * Turns raw pointer samples into `StrokeFeatures`.
 *
 * Pure: same points in, same numbers out, on client and on server.
 * PRD §14 relies on this — the thin aim preview shown while drawing is the
 * client running this exact function, so the preview cannot disagree with the
 * server's authoritative reading.
 */
export function extractFeatures(
  input: readonly Vec2[],
  options: FeatureOptions = DEFAULT_OPTIONS,
): StrokeFeatures {
  const limits = CONFIG.strokeLimits;
  const assist = CONFIG.assist[options.assist];

  // PRD §15's point cap, enforced here so that client and server apply it
  // identically and no caller can forget it.
  const raw = decimate(input, limits.maxPoints);

  // A stroke with too few samples cannot describe a shape. Report it as
  // degenerate rather than throwing: PRD §7.1 forbids total failure, so the
  // classifier will turn this into an Arcane Wisp.
  if (raw.length < limits.minPoints) {
    return degenerateFeatures(raw);
  }

  const rawLength = pathLength(raw);
  const rawBox = boundingBox(raw);

  /**
   * A drawing smaller than `minSize` carries no readable intent, and treating
   * it as a real spell would be exploitable: ink cost scales with length
   * (PRD §7.2), so a three-pixel flick would buy a full-strength Arc Bolt for
   * almost nothing and make the Ink Meter — the system that is supposed to cap
   * spell size — irrelevant. Such strokes become an Arcane Wisp, which honours
   * PRD §7.1's promise that every mark produces magic without making the
   * cheapest possible mark the strongest play.
   */
  if (rawLength < 1e-6 || rawBox.diagonal < limits.minSize) {
    return degenerateFeatures(raw);
  }

  const resampled = resample(raw, limits.resampleCount);
  const points = smooth(resampled, assist.smoothingPasses);

  const box = boundingBox(points);
  const size = box.diagonal;
  const arcLength = Math.min(pathLength(points), limits.maxLength);
  const center = centroid(points);

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const endpointGap = size > 1e-9 ? distance(first, last) / size : 0;
  const closure = size > 1e-9 ? Math.min(pathClosure(points) / size, endpointGap) : 0;
  const closureThreshold = CONFIG.classifier.closureRatio * assist.toleranceScale;
  const isClosed = closure < closureThreshold;

  const totalTurning = totalAbsoluteTurning(points, CONFIG.classifier.cornerWindow);
  const winding = windingAngle(points, center);
  // Below a third of a revolution the sign is noise, not intent.
  const chirality: -1 | 0 | 1 = Math.abs(winding) < TAU / 3 ? 0 : winding > 0 ? 1 : -1;

  const radii = points.map((p) => length(sub(p, center)));
  const lowRadius = Math.max(percentile(radii, 0.1), size * 0.02);
  const highRadius = Math.max(percentile(radii, 0.9), lowRadius);
  const radiusRatio = highRadius / lowRadius;

  const meanRadius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  const radiusVariance =
    radii.reduce((sum, r) => sum + (r - meanRadius) ** 2, 0) / radii.length;
  const radiusVariation = meanRadius > 1e-9 ? Math.sqrt(radiusVariance) / meanRadius : 1;

  /**
   * Wraparound corner detection is only safe when the endpoints genuinely met.
   *
   * Wrapping treats the last point as adjacent to the first, so any remaining
   * gap between them becomes a phantom sharp bend at the seam. A ring left even
   * slightly open would then report two corners the player never drew and be
   * classified as a Prism Shard. This deliberately uses the raw endpoint gap
   * rather than `closure`: `closure` is tolerant of overshoot, which is right
   * for asking "is this a ring" but wrong for asking "may I join these two
   * points", since an overshooting stroke does not close its seam at all.
   */
  const tightlyClosed = endpointGap < CONFIG.classifier.closureRatio * TIGHT_CLOSURE_FRACTION;

  /**
   * The corner threshold is deliberately *not* scaled by assist.
   *
   * It is a boundary between families rather than a measure of how imperfect a
   * drawing may be, and moving it in either direction simply trades one family
   * for another. Raising it — which is what multiplying by the tolerance scale
   * did — put the bar at 100°, above the 90° of an ordinary zigzag, and erased
   * the Angular family on High assist: a clean three-corner zigzag came back
   * as an Arc Bolt. Lowering it instead made noisy rings sprout corners and
   * cost the Loop family just as much.
   *
   * Assist earns its keep on this stroke through smoothing, which removes the
   * tremor that would otherwise fake corners, and through the tolerance bands
   * that genuinely describe imperfection: closure, straightness, and radial
   * consistency.
   */
  const corners = detectCorners(
    points,
    CONFIG.classifier.cornerAngleMin,
    CONFIG.classifier.cornerMinSeparation,
    { closed: tightlyClosed, window: CONFIG.classifier.cornerWindow },
  );

  // Normalised so a half-revolution of total turning reads as 1.0. Beyond that
  // the value saturates; heavily wound strokes are described by `winding`.
  const curvature = clamp01(totalTurning / Math.PI);

  return {
    points,
    rawPointCount: raw.length,
    arcLength,
    size,
    centroid: center,
    closure,
    endpointGap,
    isClosed,
    totalTurning,
    winding,
    chirality,
    circularity: circularity(points),
    enclosure: enclosure(points),
    radiusRatio,
    radiusVariation,
    radiusTrend: computeRadiusTrend(radii),
    corners,
    cornerCount: corners.length,
    curvature,
    direction: principalDirection(points),
    irregularity: computeIrregularity(resampled, size),
    degenerate: false,
  };
}

/**
 * Pearson correlation between radius and position along the stroke.
 *
 * +1 means the radius grew steadily (an outward spiral), -1 means it shrank
 * steadily (an inward spiral), and ~0 means it stayed put (a circle). This is
 * the signal that stops a slightly over-drawn circle from being read as a
 * Vortex.
 */
function computeRadiusTrend(radii: readonly number[]): number {
  const n = radii.length;
  if (n < 3) return 0;

  const meanIndex = (n - 1) / 2;
  let meanRadius = 0;
  for (const r of radii) meanRadius += r;
  meanRadius /= n;

  let covariance = 0;
  let varianceIndex = 0;
  let varianceRadius = 0;
  for (let i = 0; i < n; i++) {
    const di = i - meanIndex;
    const dr = radii[i]! - meanRadius;
    covariance += di * dr;
    varianceIndex += di * di;
    varianceRadius += dr * dr;
  }
  const denominator = Math.sqrt(varianceIndex * varianceRadius);
  if (denominator < 1e-12) return 0;
  return Math.max(-1, Math.min(1, covariance / denominator));
}

/**
 * How far the stroke strays from its own smoothed self, relative to its size.
 *
 * Scale-relative on purpose: a 2mm wobble in a tiny sigil is sloppy, the same
 * wobble in a large sweep is not. PRD §7.4 requires the penalty for a shaky
 * hand to stay small and bounded.
 */
function computeIrregularity(resampled: readonly Vec2[], size: number): number {
  if (size < 1e-9 || resampled.length < 3) return 0;
  const reference = smooth(resampled, 4);
  let total = 0;
  for (let i = 0; i < resampled.length; i++) {
    total += distance(resampled[i]!, reference[i]!);
  }
  return clamp01(total / resampled.length / size);
}

/** Features for a stroke that carries no shape information at all. */
function degenerateFeatures(raw: readonly Vec2[]): StrokeFeatures {
  const center = centroid(raw);
  const points = raw.length > 0 ? [...raw] : [center];
  return {
    points,
    rawPointCount: raw.length,
    arcLength: pathLength(raw),
    size: boundingBox(raw).diagonal,
    centroid: center,
    closure: 0,
    endpointGap: 0,
    isClosed: false,
    totalTurning: 0,
    winding: 0,
    chirality: 0,
    circularity: 0,
    enclosure: 0,
    radiusRatio: 1,
    radiusVariation: 1,
    radiusTrend: 0,
    corners: [],
    cornerCount: 0,
    curvature: 0,
    direction: principalDirection(raw),
    irregularity: 0,
    degenerate: true,
  };
}
