import { CONFIG } from '../config/index.js';
import type { HazardSpikeConfig } from '../config/types.js';
import { normalize, type Vec2 } from '../spells/geometry.js';

export type Triangle = readonly [Vec2, Vec2, Vec2];

export interface CircleTriangleContact {
  /** Unit vector pointing out of the static triangle. */
  readonly normal: Vec2;
  /** Distance the circle centre must move along `normal` to clear it. */
  readonly penetration: number;
}

export interface SweptTriangleContact {
  readonly point: Vec2;
  readonly normal: Vec2;
  readonly time: number;
}

/** The renderer and physics both treat every cave spike as this exact triangle. */
export function spikeTriangle(spike: HazardSpikeConfig): Triangle {
  return [
    { x: spike.base.x - spike.halfWidth, y: spike.base.y },
    { x: spike.base.x + spike.halfWidth, y: spike.base.y },
    spike.tip,
  ];
}

/** Full circle-vs-triangle overlap, including faces far away from the tip. */
export function circleTriangleContact(
  centre: Vec2,
  radius: number,
  triangle: Triangle,
): CircleTriangleContact | null {
  const inside = pointInTriangle(centre, triangle);
  let closest = triangle[0];
  let closestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < triangle.length; index += 1) {
    const start = triangle[index]!;
    const end = triangle[(index + 1) % triangle.length]!;
    const point = closestPointOnSegment(centre, start, end);
    const dx = centre.x - point.x;
    const dy = centre.y - point.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < closestDistanceSquared) {
      closest = point;
      closestDistanceSquared = distanceSquared;
    }
  }

  const gap = Math.sqrt(closestDistanceSquared);
  if (!inside && gap >= radius) return null;
  const centroid = triangleCentroid(triangle);
  const normal = inside
    ? normalize(
      { x: closest.x - centre.x, y: closest.y - centre.y },
      normalize({ x: closest.x - centroid.x, y: closest.y - centroid.y }, { x: 0, y: 1 }),
    )
    : normalize(
      { x: centre.x - closest.x, y: centre.y - closest.y },
      normalize({ x: centre.x - centroid.x, y: centre.y - centroid.y }, { x: 0, y: 1 }),
    );
  return {
    normal,
    penetration: inside ? radius + gap : radius - gap,
  };
}

/**
 * Continuous centre-line check. The regular circle contact handles ordinary
 * frames; this catches a very fast particle that enters and leaves a whole
 * triangle between two fixed simulation steps.
 */
export function sweepPointThroughTriangle(
  from: Vec2,
  to: Vec2,
  triangle: Triangle,
): SweptTriangleContact | null {
  const velocity = { x: to.x - from.x, y: to.y - from.y };
  const centroid = triangleCentroid(triangle);
  let earliest: SweptTriangleContact | null = null;

  for (let index = 0; index < triangle.length; index += 1) {
    const start = triangle[index]!;
    const end = triangle[(index + 1) % triangle.length]!;
    const hit = segmentIntersection(from, to, start, end);
    if (!hit) continue;
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    let normal = normalize({ x: edge.y, y: -edge.x }, { x: 0, y: 1 });
    if ((centroid.x - midpoint.x) * normal.x + (centroid.y - midpoint.y) * normal.y > 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    // Crossing outward is not a new collision; it can only happen if another
    // contact already placed the body inside the triangle.
    if (velocity.x * normal.x + velocity.y * normal.y >= 0) continue;
    if (earliest === null || hit.time < earliest.time) {
      earliest = { point: hit.point, normal, time: hit.time };
    }
  }
  return earliest;
}

export interface MovingCircle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Resolves position and velocity against one immovable, indestructible spike. */
export function bounceMovingCircleOffSpike(
  circle: MovingCircle,
  previous: Vec2,
  radius: number,
  restitution: number,
  spike: HazardSpikeConfig,
): { readonly bounced: boolean; readonly normal: Vec2; readonly incomingSpeed: number } | null {
  const triangle = spikeTriangle(spike);
  const contact = circleTriangleContact(circle, radius, triangle);
  let normal: Vec2;

  if (contact) {
    normal = contact.normal;
    const correction = contact.penetration + CONFIG.hazards.collisionSkin;
    circle.x += normal.x * correction;
    circle.y += normal.y * correction;
  } else {
    const swept = sweepPointThroughTriangle(previous, circle, triangle);
    if (!swept) return null;
    normal = swept.normal;
    const clearance = radius + CONFIG.hazards.collisionSkin;
    circle.x = swept.point.x + normal.x * clearance;
    circle.y = swept.point.y + normal.y * clearance;
  }

  const incoming = circle.vx * normal.x + circle.vy * normal.y;
  if (incoming >= 0) return { bounced: false, normal, incomingSpeed: 0 };
  circle.vx -= (1 + restitution) * incoming * normal.x;
  circle.vy -= (1 + restitution) * incoming * normal.y;
  return { bounced: true, normal, incomingSpeed: Math.abs(incoming) };
}

function pointInTriangle(point: Vec2, triangle: Triangle): boolean {
  const [a, b, c] = triangle;
  const d1 = crossPoints(point, a, b);
  const d2 = crossPoints(point, b, c);
  const d3 = crossPoints(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function crossPoints(point: Vec2, start: Vec2, end: Vec2): number {
  return (point.x - end.x) * (start.y - end.y) -
    (start.x - end.x) * (point.y - end.y);
}

function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return start;
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const amount = Math.max(0, Math.min(1, projection));
  return { x: start.x + dx * amount, y: start.y + dy * amount };
}

function triangleCentroid(triangle: Triangle): Vec2 {
  return {
    x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3,
    y: (triangle[0].y + triangle[1].y + triangle[2].y) / 3,
  };
}

function segmentIntersection(
  from: Vec2,
  to: Vec2,
  edgeStart: Vec2,
  edgeEnd: Vec2,
): { readonly point: Vec2; readonly time: number } | null {
  const movement = { x: to.x - from.x, y: to.y - from.y };
  const edge = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
  const denominator = cross(movement, edge);
  if (Math.abs(denominator) <= Number.EPSILON) return null;
  const offset = { x: edgeStart.x - from.x, y: edgeStart.y - from.y };
  const time = cross(offset, edge) / denominator;
  const edgeTime = cross(offset, movement) / denominator;
  if (time < 0 || time > 1 || edgeTime < 0 || edgeTime > 1) return null;
  return {
    point: { x: from.x + movement.x * time, y: from.y + movement.y * time },
    time,
  };
}

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}
