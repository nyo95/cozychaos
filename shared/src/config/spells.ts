import type { SpellDefinition, SpellFamily } from './types.js';

/**
 * Spell definitions. PRD §8, spawn rules from PRD-AMENDMENTS A-05.
 *
 * PRD §21: "Spell dibuat dari data definition; penambahan spell tidak
 * memerlukan perubahan core match loop." Adding a sixth family means adding an
 * entry here and a renderer entry — nothing in the match loop or simulation
 * changes.
 *
 * Arena units: the island half-width is 1.0, so a radius of 0.05 is a small
 * bubble and 0.25 is a large one.
 */

/** PRD §8.1 — fast, easy to aim. The bread-and-butter spell. */
const ARC_BOLT: SpellDefinition = {
  family: 'stroke',
  name: 'Arc Bolt',
  blurb: 'A straight line becomes a dart. Curve the line and the dart curves too.',
  spawn: 'caster',
  lifetimeMs: 2400,
  baseMass: 1.0,
  baseRadius: 0.045,
  baseKnockback: 1.0,
  baseSpeed: 1.9,
  gravityScale: 0.15,
  sizeToRadius: { inMin: 0.15, inMax: 1.0, outMin: 0.03, outMax: 0.075 },
  sizeToMass: { inMin: 0.15, inMax: 1.0, outMin: 0.6, outMax: 1.6 },
  // Curvature becomes lateral acceleration, so a bowed line arcs around cover.
  curvatureToSpin: { inMin: 0.0, inMax: 1.0, outMin: 0.0, outMax: 2.2 },
  cornersToBounces: { inMin: 0, inMax: 2, outMin: 0, outMax: 1 },
  maxIrregularityVariance: 0.08,
  extra: {
    /** Fraction of knockback kept after the first hit, so it can graze twice. */
    pierceRetention: 0.55,
    maxHits: 2,
  },
};

/** PRD §8.2 — defence and displacement. Size comes from the drawn loop. */
const BUBBLE_WARD: SpellDefinition = {
  family: 'loop',
  name: 'Bubble Ward',
  blurb: 'A closed ring becomes a bubble. It soaks one hit, then rolls away.',
  spawn: 'centroid',
  lifetimeMs: 5200,
  baseMass: 0.7,
  baseRadius: 0.11,
  baseKnockback: 0.55,
  baseSpeed: 0.0,
  gravityScale: 0.35,
  sizeToRadius: { inMin: 0.1, inMax: 1.0, outMin: 0.06, outMax: 0.26 },
  sizeToMass: { inMin: 0.1, inMax: 1.0, outMin: 0.35, outMax: 1.5 },
  curvatureToSpin: { inMin: 0.0, inMax: 1.0, outMin: 0.0, outMax: 1.0 },
  cornersToBounces: { inMin: 0, inMax: 4, outMin: 0, outMax: 0 },
  maxIrregularityVariance: 0.1,
  extra: {
    /** PRD §8.2 — "dapat menyerap satu benturan". */
    absorbCharges: 1,
    /** Very bouncy, so it keeps rolling around the island. */
    restitution: 0.82,
    /** A player caught inside is carried with the bubble for this long. */
    captureMs: 900,
  },
};

/** PRD §8.3 — space control. Pulls, then throws. */
const VORTEX: SpellDefinition = {
  family: 'spiral',
  name: 'Vortex',
  blurb: 'A winding spiral pulls everything inward, then flings it outward.',
  spawn: 'centroid',
  lifetimeMs: 2800,
  baseMass: 0.0,
  baseRadius: 0.22,
  baseKnockback: 1.35,
  baseSpeed: 0.0,
  gravityScale: 0.0,
  sizeToRadius: { inMin: 0.1, inMax: 1.0, outMin: 0.14, outMax: 0.42 },
  sizeToMass: { inMin: 0.1, inMax: 1.0, outMin: 0.0, outMax: 0.0 },
  // More winding = faster swirl. PRD §8.3: "Arah spiral menentukan arah putaran."
  curvatureToSpin: { inMin: 0.0, inMax: 1.0, outMin: 1.0, outMax: 3.4 },
  cornersToBounces: { inMin: 0, inMax: 4, outMin: 0, outMax: 0 },
  maxIrregularityVariance: 0.09,
  extra: {
    /** Inward acceleration applied to bodies inside the radius. */
    pullStrength: 2.6,
    /** Fraction of lifetime spent pulling before the release. */
    pullPhaseFraction: 0.72,
    /** Outward impulse at the moment of release. */
    releaseImpulse: 2.1,
  },
};

/** PRD §8.4 — trick shot. Corner count drives bounce count, hard-capped. */
const PRISM_SHARD: SpellDefinition = {
  family: 'angular',
  name: 'Prism Shard',
  blurb: 'Sharp corners become bounces. Bank it off a wall and around a bubble.',
  spawn: 'caster',
  lifetimeMs: 3600,
  baseMass: 1.1,
  baseRadius: 0.04,
  baseKnockback: 1.25,
  baseSpeed: 1.7,
  gravityScale: 0.08,
  sizeToRadius: { inMin: 0.15, inMax: 1.0, outMin: 0.028, outMax: 0.065 },
  sizeToMass: { inMin: 0.15, inMax: 1.0, outMin: 0.7, outMax: 1.7 },
  curvatureToSpin: { inMin: 0.0, inMax: 1.0, outMin: 0.0, outMax: 0.8 },
  // PRD §8.4 — "dengan batas yang tetap". Four bounces is the ceiling.
  cornersToBounces: { inMin: 2, inMax: 6, outMin: 1, outMax: 4 },
  maxIrregularityVariance: 0.07,
  extra: {
    /** Speed kept after each bounce, so it eventually dies out. */
    bounceRetention: 0.94,
    /** Knockback gained per bounce — rewards a successful bank shot. */
    knockbackPerBounce: 0.12,
    restitution: 1.0,
  },
};

/**
 * PRD §8.5 — the fallback that guarantees the core promise:
 * "Setiap coretan menjadi sihir. Tidak ada gambar yang sia-sia."
 *
 * Deliberately weaker than the four families but never useless, and never
 * embarrassing — it is meant to read as charming, not as a failure state.
 */
const ARCANE_WISP: SpellDefinition = {
  family: 'wisp',
  name: 'Arcane Wisp',
  blurb: 'Whatever you drew, it took the hint. A small nudge with a mind of its own.',
  spawn: 'caster',
  lifetimeMs: 3000,
  baseMass: 0.5,
  baseRadius: 0.05,
  baseKnockback: 0.5,
  baseSpeed: 1.1,
  gravityScale: 0.05,
  sizeToRadius: { inMin: 0.1, inMax: 1.0, outMin: 0.035, outMax: 0.07 },
  sizeToMass: { inMin: 0.1, inMax: 1.0, outMin: 0.3, outMax: 0.8 },
  curvatureToSpin: { inMin: 0.0, inMax: 1.0, outMin: 0.5, outMax: 2.0 },
  cornersToBounces: { inMin: 0, inMax: 6, outMin: 0, outMax: 2 },
  // Highest variance of any family — the wobbliest, funniest spell.
  maxIrregularityVariance: 0.18,
  extra: {
    /** Amplitude of the drifting sine wave that makes it wander. */
    wanderAmplitude: 0.55,
    wanderFrequency: 2.4,
  },
};

export const SPELLS: Readonly<Record<SpellFamily, SpellDefinition>> = Object.freeze({
  stroke: ARC_BOLT,
  loop: BUBBLE_WARD,
  spiral: VORTEX,
  angular: PRISM_SHARD,
  wisp: ARCANE_WISP,
});
