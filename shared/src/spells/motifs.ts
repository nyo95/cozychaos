import { CONFIG } from '../config/index.js';
import type { MotifKind } from '../config/types.js';
import type { StrokeFeatures } from './features.js';
import {
  TAU,
  type Vec2,
  boundingBox,
  centroid,
  cross,
  detectCorners,
  distance,
  normalize,
  pathLength,
  principalDirection,
  sub,
  windingAngle,
} from './geometry.js';

export interface MotifOccurrence {
  readonly kind: MotifKind;
  readonly from: number;
  readonly to: number;
  readonly center: Vec2;
  readonly direction: Vec2;
  readonly size: number;
  readonly chirality: -1 | 0 | 1;
  readonly arcLength: number;
}

interface Intersection {
  readonly exact: boolean;
  readonly first: number;
  readonly second: number;
  readonly from: number;
  readonly to: number;
  readonly point: Vec2;
}

interface LocalMetrics {
  readonly center: Vec2;
  readonly direction: Vec2;
  readonly size: number;
  readonly arcLength: number;
  readonly winding: number;
  readonly radiusTrend: number;
}

/** Finds local primitives inside one canonical Standard-assist reading. */
export function segmentMotifs(features: StrokeFeatures): readonly MotifOccurrence[] {
  if (features.degenerate || features.points.length < 2) return [wisp(features)];

  const points = features.points;
  const intersections = findIntersections(points);
  const unstable = findUnstable(points, intersections);
  const occupied: Array<{ from: number; to: number }> = [];
  const motifs: MotifOccurrence[] = [];

  if (unstable !== null) {
    motifs.push(unstable);
    occupied.push({ from: unstable.from, to: unstable.to });
  }

  for (const hit of intersections.sort((a, b) => a.to - a.from - (b.to - b.from))) {
    const from = hit.from / (points.length - 1);
    const to = hit.to / (points.length - 1);
    if (to - from < CONFIG.composition.minLoopSpanFraction) continue;
    if (overlapFraction({ from, to }, occupied) > 0.72) continue;

    const span = sliceAtIntersection(points, hit);
    const metrics = localMetrics(span);
    if (metrics.size < CONFIG.composition.minMotifSize) continue;
    const kind: MotifKind =
      Math.abs(metrics.radiusTrend) >= CONFIG.composition.spiralRadiusTrendMin
        ? 'spiral'
        : 'loop';
    const motif = occurrence(kind, from, to, metrics);
    motifs.push(motif);
    occupied.push({ from, to });
  }

  // An expanding spiral does not geometrically intersect itself. Winding plus
  // monotonic radial movement is therefore the only deliberate exception to
  // the self-intersection-first rule in the design contract.
  if (!motifs.some((motif) => motif.kind === 'spiral')) {
    const spiral = findWindingSpan(points);
    // A loop plus a long tail can make the whole stroke's radius look
    // monotonic. Never let the winding fallback swallow an already-proven
    // self-intersection motif; it exists only for genuinely intersection-free
    // Archimedean coils.
    if (spiral !== null && overlapFraction(spiral, occupied) < 0.1) {
      motifs.push(spiral);
      occupied.push({ from: spiral.from, to: spiral.to });
    }
  }

  for (const run of complement(occupied)) {
    if (run.to - run.from < CONFIG.composition.minOpenRunFraction) continue;
    motifs.push(...openRunMotifs(points, run.from, run.to));
  }

  if (motifs.length === 0) return [wisp(features)];
  return limitMotifs(motifs).sort((a, b) => a.from - b.from || a.to - b.to);
}

function findIntersections(points: readonly Vec2[]): Intersection[] {
  const hits: Intersection[] = [];
  const lastSegment = points.length - 2;
  const minimumSeparation = Math.max(
    2,
    Math.ceil(CONFIG.composition.minLoopSpanFraction * (points.length - 1)),
  );
  const proximity =
    (pathLength(points) / Math.max(1, points.length - 1)) *
    CONFIG.composition.intersectionProximitySteps;
  for (let first = 0; first <= lastSegment; first++) {
    for (let second = first + minimumSeparation; second <= lastSegment; second++) {
      const exact = segmentIntersection(
        points[first]!,
        points[first + 1]!,
        points[second]!,
        points[second + 1]!,
      );
      const hit =
        exact ??
        nearSegmentIntersection(
          points[first]!,
          points[first + 1]!,
          points[second]!,
          points[second + 1]!,
          proximity,
        );
      if (hit === null) continue;
      const from = first + hit.t;
      const to = second + hit.u;
      const duplicate = hits.some(
        (other) =>
          (Math.abs(other.from - from) < 0.75 && Math.abs(other.to - to) < 0.75) ||
          (exact === null && !other.exact && distance(other.point, hit.point) < proximity * 1.5),
      );
      if (!duplicate) hits.push({ exact: exact !== null, first, second, from, to, point: hit.point });
    }
  }
  return hits;
}

function nearSegmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
  maximumDistance: number,
): { readonly t: number; readonly u: number; readonly point: Vec2 } | null {
  const candidates = [
    pointToSegment(a, c, d, 0, 'first'),
    pointToSegment(b, c, d, 1, 'first'),
    pointToSegment(c, a, b, 0, 'second'),
    pointToSegment(d, a, b, 1, 'second'),
  ].sort((left, right) => left.distance - right.distance);
  const best = candidates[0]!;
  if (best.distance > maximumDistance) return null;
  return { t: best.t, u: best.u, point: best.point };
}

function pointToSegment(
  point: Vec2,
  start: Vec2,
  end: Vec2,
  endpointParameter: number,
  endpointOn: 'first' | 'second',
): { readonly distance: number; readonly t: number; readonly u: number; readonly point: Vec2 } {
  const segment = sub(end, start);
  const denominator = segment.x * segment.x + segment.y * segment.y;
  const projection = denominator < 1e-12
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * segment.x + (point.y - start.y) * segment.y) / denominator));
  const nearest = { x: start.x + segment.x * projection, y: start.y + segment.y * projection };
  return {
    distance: distance(point, nearest),
    t: endpointOn === 'first' ? endpointParameter : projection,
    u: endpointOn === 'first' ? projection : endpointParameter,
    point: { x: (point.x + nearest.x) / 2, y: (point.y + nearest.y) / 2 },
  };
}

function segmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { readonly t: number; readonly u: number; readonly point: Vec2 } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= CONFIG.composition.intersectionEpsilon) return null;
  const offset = sub(c, a);
  const t = cross(offset, s) / denominator;
  const u = cross(offset, r) / denominator;
  const epsilon = CONFIG.composition.intersectionEpsilon;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
  return { t, u, point: { x: a.x + r.x * t, y: a.y + r.y * t } };
}

function sliceAtIntersection(points: readonly Vec2[], hit: Intersection): Vec2[] {
  const span: Vec2[] = [hit.point];
  for (let index = hit.first + 1; index <= hit.second; index++) span.push(points[index]!);
  span.push(hit.point);
  return span;
}

function localMetrics(points: readonly Vec2[]): LocalMetrics {
  const center = centroid(points);
  const radii = points.map((point) => distance(point, center));
  return {
    center,
    direction: principalDirection(points),
    size: boundingBox(points).diagonal,
    arcLength: pathLength(points),
    winding: windingAngle(points, center),
    radiusTrend: correlation(radii),
  };
}

function correlation(values: readonly number[]): number {
  if (values.length < 3) return 0;
  const meanIndex = (values.length - 1) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let covariance = 0;
  let indexVariance = 0;
  let valueVariance = 0;
  for (let index = 0; index < values.length; index++) {
    const dx = index - meanIndex;
    const dy = values[index]! - mean;
    covariance += dx * dy;
    indexVariance += dx * dx;
    valueVariance += dy * dy;
  }
  const denominator = Math.sqrt(indexVariance * valueVariance);
  return denominator < 1e-12 ? 0 : covariance / denominator;
}

function occurrence(
  kind: MotifKind,
  from: number,
  to: number,
  metrics: LocalMetrics,
): MotifOccurrence {
  const chirality: -1 | 0 | 1 =
    Math.abs(metrics.winding) < TAU / 3 ? 0 : metrics.winding > 0 ? 1 : -1;
  return {
    kind,
    from,
    to,
    center: metrics.center,
    direction: metrics.direction,
    size: metrics.size,
    chirality,
    arcLength: metrics.arcLength,
  };
}

function findUnstable(
  points: readonly Vec2[],
  intersections: readonly Intersection[],
): MotifOccurrence | null {
  const required = CONFIG.composition.unstableIntersectionCount;
  // Proximity repairs a hand-drawn seam but must not manufacture instability.
  // UNSTABLE is reserved for several real crossings at distinct locations.
  const exact = intersections.filter((hit) => hit.exact);
  if (exact.length < required) return null;
  const normalized = exact
    .map((hit) => ({ hit, middle: ((hit.from + hit.to) / 2) / (points.length - 1) }))
    .sort((a, b) => a.middle - b.middle);

  for (let start = 0; start <= normalized.length - required; start++) {
    const cluster = normalized.slice(start, start + required);
    if (cluster[cluster.length - 1]!.middle - cluster[0]!.middle > CONFIG.composition.unstableWindowFraction) {
      continue;
    }
    const from = Math.min(...cluster.map(({ hit }) => hit.from)) / (points.length - 1);
    const to = Math.max(...cluster.map(({ hit }) => hit.to)) / (points.length - 1);
    const span = sliceNormalized(points, from, to);
    return occurrence('unstable', from, to, localMetrics(span));
  }
  return null;
}

function findWindingSpan(points: readonly Vec2[]): MotifOccurrence | null {
  const minimumPoints = Math.max(12, CONFIG.classifier.cornerWindow * 3);
  const stride = CONFIG.composition.spiralScanStride;
  let best: { readonly score: number; readonly motif: MotifOccurrence } | null = null;
  const candidates: Array<[number, number]> = [[0, points.length - 1]];
  for (let start = stride; start <= points.length - minimumPoints; start += stride) {
    candidates.push([start, points.length - 1]);
  }
  for (let end = minimumPoints - 1; end < points.length - 1; end += stride) {
    candidates.push([0, end]);
  }

  for (const [start, end] of candidates) {
    const span = points.slice(start, end + 1);
    const metrics = localMetrics(span);
    const revolutions = Math.abs(metrics.winding) / TAU;
    const trend = Math.abs(metrics.radiusTrend);
    if (
      revolutions < CONFIG.composition.spiralMinRevolutions ||
      trend < CONFIG.composition.spiralRadiusTrendMin ||
      metrics.size < CONFIG.composition.minMotifSize
    ) {
      continue;
    }
    const motif = occurrence(
      'spiral',
      start / (points.length - 1),
      end / (points.length - 1),
      metrics,
    );
    const score = revolutions * trend * motif.arcLength;
    if (best === null || score > best.score) best = { score, motif };
  }
  return best?.motif ?? null;
}

function complement(occupied: readonly { from: number; to: number }[]): Array<{ from: number; to: number }> {
  const merged = [...occupied]
    .sort((a, b) => a.from - b.from)
    .reduce<Array<{ from: number; to: number }>>((out, span) => {
      const last = out[out.length - 1];
      if (last === undefined || span.from > last.to) out.push({ ...span });
      else last.to = Math.max(last.to, span.to);
      return out;
    }, []);
  const runs: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.from > cursor) runs.push({ from: cursor, to: span.from });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < 1) runs.push({ from: cursor, to: 1 });
  return runs;
}

function openRunMotifs(points: readonly Vec2[], from: number, to: number): MotifOccurrence[] {
  const start = Math.max(0, Math.floor(from * (points.length - 1)));
  const end = Math.min(points.length - 1, Math.ceil(to * (points.length - 1)));
  const span = points.slice(start, end + 1);
  if (span.length < 2) return [];
  const metrics = localMetrics(span);
  const cornerIndices = detectCorners(
    span,
    CONFIG.classifier.cornerAngleMin,
    CONFIG.classifier.cornerMinSeparation,
    { window: CONFIG.classifier.cornerWindow },
  );
  const motifs: MotifOccurrence[] = [];
  const bounceWindow = CONFIG.classifier.cornerWindow;
  let bounceLength = 0;
  for (const localIndex of cornerIndices) {
    const localFrom = Math.max(0, localIndex - bounceWindow);
    const localTo = Math.min(span.length - 1, localIndex + bounceWindow);
    const local = span.slice(localFrom, localTo + 1);
    const bounceMetrics = localMetrics(local);
    bounceLength += bounceMetrics.arcLength;
    motifs.push(
      occurrence(
        'bounce',
        (start + localFrom) / (points.length - 1),
        (start + localTo) / (points.length - 1),
        bounceMetrics,
      ),
    );
  }
  motifs.push({
    ...occurrence('thrust', from, to, metrics),
    arcLength: Math.max(metrics.arcLength - Math.min(bounceLength, metrics.arcLength * 0.8), 1e-6),
  });
  return motifs;
}

function sliceNormalized(points: readonly Vec2[], from: number, to: number): Vec2[] {
  const start = Math.max(0, Math.floor(from * (points.length - 1)));
  const end = Math.min(points.length - 1, Math.ceil(to * (points.length - 1)));
  return points.slice(start, end + 1);
}

function overlapFraction(
  span: { readonly from: number; readonly to: number },
  others: readonly { readonly from: number; readonly to: number }[],
): number {
  const length = Math.max(span.to - span.from, 1e-9);
  let overlap = 0;
  for (const other of others) overlap += Math.max(0, Math.min(span.to, other.to) - Math.max(span.from, other.from));
  return Math.min(1, overlap / length);
}

function limitMotifs(input: readonly MotifOccurrence[]): MotifOccurrence[] {
  const motifs = [...input];
  while (motifs.length > CONFIG.composition.maxMotifs) {
    let weakest = 0;
    for (let index = 1; index < motifs.length; index++) {
      const power = motifs[index]!.arcLength * Math.max(motifs[index]!.size, 0.01);
      const weakestPower = motifs[weakest]!.arcLength * Math.max(motifs[weakest]!.size, 0.01);
      if (power < weakestPower) weakest = index;
    }
    const source = motifs[weakest]!;
    let nearest = -1;
    let separation = Infinity;
    for (let index = 0; index < motifs.length; index++) {
      if (index === weakest || motifs[index]!.kind !== source.kind) continue;
      const gap = Math.abs((motifs[index]!.from + motifs[index]!.to) / 2 - (source.from + source.to) / 2);
      if (gap < separation) {
        separation = gap;
        nearest = index;
      }
    }
    if (nearest < 0) motifs.splice(weakest, 1);
    else {
      const target = motifs[nearest]!;
      const totalArc = target.arcLength + source.arcLength;
      motifs[nearest] = {
        ...target,
        from: Math.min(target.from, source.from),
        to: Math.max(target.to, source.to),
        center: {
          x: (target.center.x * target.arcLength + source.center.x * source.arcLength) / totalArc,
          y: (target.center.y * target.arcLength + source.center.y * source.arcLength) / totalArc,
        },
        direction: normalize({
          x: target.direction.x * target.arcLength + source.direction.x * source.arcLength,
          y: target.direction.y * target.arcLength + source.direction.y * source.arcLength,
        }),
        size: Math.max(target.size, source.size),
        arcLength: totalArc,
      };
      motifs.splice(weakest, 1);
    }
  }
  return motifs;
}

function wisp(features: StrokeFeatures): MotifOccurrence {
  return {
    kind: 'wisp',
    from: 0,
    to: 1,
    center: features.centroid,
    direction: features.direction,
    size: features.size,
    chirality: 0,
    arcLength: features.arcLength,
  };
}
