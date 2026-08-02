import { CONFIG } from '../config/index.js';
import type { FeatureMapping, SpellDefinition, SpellFamily } from '../config/types.js';
import type { Classification } from './classifier.js';
import type { StrokeFeatures } from './features.js';
import {
  type Vec2,
  add,
  clamp,
  clamp01,
  distance,
  inverseLerp,
  lerp,
  normalize,
  scale,
  sub,
} from './geometry.js';

/**
 * A fully-specified spell, ready for the simulation to instantiate.
 *
 * Deliberately contains no geometry and no drawing data: the simulation needs
 * numbers, not strokes. PRD §21 — "Renderer tidak boleh menentukan skor atau
 * collision", and by the same logic the simulation should not have to re-read
 * a drawing.
 */
export interface SpellInstance {
  readonly family: SpellFamily;
  readonly name: string;
  /** World position where the spell appears. */
  readonly origin: Vec2;
  /** Unit direction of travel. Zero-length for stationary families. */
  readonly direction: Vec2;
  readonly speed: number;
  readonly radius: number;
  readonly mass: number;
  readonly knockback: number;
  /** Lateral acceleration (Arc Bolt) or swirl rate (Vortex). */
  readonly spin: number;
  /** +1 counter-clockwise, -1 clockwise, 0 for none. PRD §8.3. */
  readonly chirality: -1 | 0 | 1;
  readonly bounces: number;
  readonly lifetimeMs: number;
  readonly gravityScale: number;
  /**
   * Small bounded jitter from an untidy drawing, in [-1, 1] scaled by the
   * family's `maxIrregularityVariance`. PRD §7.4 — variance is capped so that
   * losing never feels random.
   */
  readonly variance: number;
  /** True when the centroid was pulled back to `maxCastRadius` (A-05). */
  readonly originClamped: boolean;
  /** Family-specific values copied through from the definition. */
  readonly extra: Readonly<Record<string, number>>;
}

export interface MappingContext {
  /** Where the casting wizard stands, in arena units. */
  readonly casterPosition: Vec2;
  /**
   * Deterministic value in [0, 1) drawn from the match seed.
   * PRD §21 — "Semua randomness berasal dari seeded random." Passed in rather
   * than generated here so this function stays pure.
   */
  readonly seededUnit: number;
  /** PRD §9 — the one MVP arena modifier. */
  readonly lowGravity?: boolean;
}

/** Projects a value through a configured input range onto an output range. */
export function applyMapping(mapping: FeatureMapping, value: number): number {
  return lerp(mapping.outMin, mapping.outMax, inverseLerp(mapping.inMin, mapping.inMax, value));
}

/**
 * Turns a classified drawing into a concrete spell.
 *
 * This is where PRD §7.3's table becomes code: shape picks the family,
 * direction picks the aim, size picks mass and radius, curvature picks spin,
 * corners pick bounces, and untidiness picks a small bounded wobble.
 *
 * Pure — every input including randomness is an argument, so the server's
 * result and a replayed result are bit-identical (PRD §15).
 */
export function mapToSpell(
  classification: Classification,
  context: MappingContext,
): SpellInstance {
  const definition = CONFIG.spells[classification.family];
  const features = classification.features;

  const origin = resolveOrigin(definition, features, context);
  const direction = resolveDirection(definition, features);

  const radius = applyMapping(definition.sizeToRadius, features.size);
  const mass = applyMapping(definition.sizeToMass, features.size);
  const spin = applyMapping(definition.curvatureToSpin, spinInput(definition, features));
  const bounces = Math.round(applyMapping(definition.cornersToBounces, features.cornerCount));

  // Centred on zero so an untidy drawing is as likely to help as to hurt.
  // PRD §7.4: irregularity adds character, never a systematic penalty.
  const variance =
    (context.seededUnit * 2 - 1) *
    definition.maxIrregularityVariance *
    clamp01(features.irregularity / 0.2);

  // Confidence scales speed only, never knockback. A hesitant reading makes a
  // slightly lazier spell, not a weaker one — PRD §7.4, "Kerapian memberi
  // kontrol, bukan damage mentah."
  const confidenceScale = lerp(0.85, 1, classification.confidence);

  const gravityScale = definition.gravityScale * (context.lowGravity ? CONFIG.arena.lowGravityMultiplier : 1);

  return {
    family: definition.family,
    name: definition.name,
    origin: origin.position,
    direction,
    speed: definition.baseSpeed * confidenceScale * (1 + variance),
    radius: radius * (1 + variance * 0.5),
    mass,
    knockback: definition.baseKnockback + bounces * (definition.extra['knockbackPerBounce'] ?? 0),
    spin,
    chirality: features.chirality,
    bounces,
    lifetimeMs: definition.lifetimeMs,
    gravityScale,
    variance,
    originClamped: origin.clamped,
    extra: definition.extra,
  };
}

/**
 * A-05: open families launch from the caster, closed families appear at the
 * centroid of the drawing. A centroid beyond `maxCastRadius` is pulled back to
 * the edge of that radius rather than rejected, because PRD §7.1 forbids a
 * drawing from producing nothing.
 */
function resolveOrigin(
  definition: SpellDefinition,
  features: StrokeFeatures,
  context: MappingContext,
): { position: Vec2; clamped: boolean } {
  if (definition.spawn === 'caster') {
    return { position: context.casterPosition, clamped: false };
  }

  const offset = sub(features.centroid, context.casterPosition);
  const reach = distance(features.centroid, context.casterPosition);
  const maxReach = CONFIG.aim.maxCastRadius;

  if (reach <= maxReach) {
    return { position: features.centroid, clamped: false };
  }
  const capped = add(context.casterPosition, scale(normalize(offset), maxReach));
  return { position: capped, clamped: true };
}

/**
 * PRD §7.3 — "Arah stroke utama menentukan arah cast", refined by A-04 and
 * A-05. Closed families have no meaningful travel direction: a Bubble Ward
 * sits where it was drawn and a Vortex pulls inward from every side.
 */
function resolveDirection(definition: SpellDefinition, features: StrokeFeatures): Vec2 {
  if (definition.spawn === 'centroid') return { x: 0, y: 0 };
  return features.direction;
}

/**
 * Which drawn quantity feeds spin, per family.
 *
 * Arc Bolt and Prism Shard curve according to how bowed the line was, so they
 * read path curvature. Vortex spins according to how tightly it was wound, so
 * it reads revolutions instead — PRD §8.3 ties swirl to the spiral itself.
 */
function spinInput(definition: SpellDefinition, features: StrokeFeatures): number {
  if (definition.family === 'spiral') {
    return clamp(Math.abs(features.winding) / (Math.PI * 4), 0, 1);
  }
  return features.curvature;
}

/**
 * Ink cost of a stroke. PRD §7.2 — length costs ink, and ink is what caps
 * spell size. Hand speed is absent by construction: `arcLength` is measured
 * after resampling, so a slow careful hand and a fast one pay the same.
 */
export function inkCost(arcLength: number): number {
  const { costToStart, costPerUnitLength } = CONFIG.ink;
  return costToStart + arcLength * costPerUnitLength;
}

/**
 * Longest stroke still affordable with `remainingInk`.
 * The drawing UI uses this to stop the line exactly when ink runs out
 * (PRD §7.2: "Ketika tinta habis, stroke otomatis selesai").
 */
export function affordableLength(remainingInk: number): number {
  const { costToStart, costPerUnitLength } = CONFIG.ink;
  return Math.max(0, (remainingInk - costToStart) / costPerUnitLength);
}
