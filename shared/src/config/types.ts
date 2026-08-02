/**
 * Config type definitions.
 *
 * PRD §21: "Konfigurasi spell dan match harus data-driven, bukan tersebar
 * sebagai magic numbers." Every tunable value in the game is described by a
 * type here and given a value in the sibling modules. No gameplay module may
 * hardcode a number that belongs in this file.
 */

/** The five spell families. PRD §8. */
export type SpellFamily = 'stroke' | 'loop' | 'spiral' | 'angular' | 'wisp';

/** Internal geometric primitives used by wild spell composition. */
export type MotifKind = 'thrust' | 'loop' | 'spiral' | 'bounce' | 'unstable' | 'wisp';

/** Match phases within a single Turn. PRD §6. */
export type Phase = 'setup' | 'draw' | 'reveal' | 'resolve' | 'score';

/**
 * Where a spell is spawned. PRD-AMENDMENTS A-05.
 * - `caster`: at the caster's position, travelling along the stroke direction.
 * - `centroid`: at the drawing's centroid, clamped to `maxCastRadius`.
 */
export type SpawnMode = 'caster' | 'centroid';

/** Drawing assist level. PRD §14. */
export type AssistLevel = 'standard' | 'high';

export interface PhaseConfig {
  /** PRD §6.1 — players may reposition. Movement is only legal here (A-03). */
  readonly setupMs: number;
  /** PRD §6.2 — world freezes, both players draw in secret. */
  readonly drawMs: number;
  /** PRD §6.3 — both runes shown as visual anticipation. */
  readonly revealMs: number;
  /** PRD §6.4 — maximum simulation time; resolve may end early when settled. */
  readonly resolveMaxMs: number;
  /** PRD §6.5 — award Stars, reset if a knock-out happened. */
  readonly scoreMs: number;
}

export interface InkConfig {
  /**
   * Total ink available per Turn. Unitless; consumed per unit of normalised
   * stroke length. PRD §7.2, scope fixed by A-01.
   */
  readonly total: number;
  /** Ink consumed per unit of normalised arc length. */
  readonly costPerUnitLength: number;
  /** Ink charged the moment a stroke begins, to discourage stroke spam. */
  readonly costToStart: number;
  /**
   * Below this fraction of total ink the meter warns the player.
   * Presentation-only; has no gameplay effect.
   */
  readonly warnFraction: number;
}

export interface WobbleConfig {
  /**
   * A-01: Wobble accumulates across Turns and only resets when a Round ends
   * with a knock-out. This is the mechanism that makes knock-outs reachable.
   */
  readonly resetScope: 'round';
  /** Wobble value at the start of a Round. */
  readonly initial: number;
  /** Hard ceiling, so knockback cannot diverge. */
  readonly max: number;
  /** Wobble added per unit of impact impulse absorbed. */
  readonly gainPerImpulse: number;
  /**
   * Knockback multiplier at `max` Wobble. At zero Wobble the multiplier is
   * 1.0 and it interpolates linearly to this value.
   */
  readonly knockbackMultiplierAtMax: number;
  /** Wobble bled off per second while a player is grounded and idle. */
  readonly decayPerSecond: number;
}

export interface ScoringConfig {
  /** PRD §5.1 — first to this many Stars wins. */
  readonly starsToWin: number;
  /** PRD §5.1 — both players falling within this window is a double knock-out. */
  readonly doubleKoWindowMs: number;
  /** A-02 — tightened window during Sudden Death so the match converges. */
  readonly doubleKoWindowSuddenDeathMs: number;
}

export interface MovementConfig {
  /**
   * A-03 — movement is legal only during Setup. Allowing it during Resolve
   * would reintroduce latency as a deciding factor and break the claim that a
   * replay is reconstructible from `seed + initial state + two strokes`.
   */
  readonly activePhases: readonly Phase[];
  /** Horizontal speed in arena units per second. */
  readonly speed: number;
  /** Upward impulse of the single short jump. PRD §9. */
  readonly jumpImpulse: number;
  /** Jumps allowed per Setup phase. PRD §9 — "satu lompatan pendek". */
  readonly jumpsPerSetup: number;
}

export interface AimConfig {
  /**
   * A-04 — the rune canvas is a transparent overlay on the arena viewport with
   * a 1:1 mapping. Drawing up-and-right sends the spell up-and-right.
   */
  readonly frame: 'arena-overlay';
  /**
   * Maximum distance from the caster at which a centroid-spawned spell may
   * appear, in normalised arena units. Centroids beyond this are clamped to
   * the edge rather than rejected — PRD §7.1 forbids total failure.
   */
  readonly maxCastRadius: number;
}

export interface ReconnectConfig {
  /** A-06 — grace period before the match is forfeited. */
  readonly windowMs: number;
  /**
   * Reconnect pauses at a Turn boundary rather than mid-Resolve, so the
   * simulation is never interrupted halfway through.
   */
  readonly pauseAt: 'turn-boundary';
}

export interface StrokeLimits {
  /**
   * PRD §15 — the server caps point count, stroke length, size and submit
   * time. These are validation limits, not gameplay tuning: a stroke that
   * violates them is repaired (clamped/decimated), never rejected.
   */
  readonly maxPoints: number;
  /** Points below this count cannot describe a shape; they become a Wisp. */
  readonly minPoints: number;
  /**
   * Smallest gap, in arena units, between two consecutive captured samples.
   *
   * A 1000 Hz pointer with coalesced events emits samples a fraction of a pixel
   * apart. They add no shape information, but they do multiply the work of
   * every downstream pass, so they are dropped at the source rather than
   * decimated later.
   */
  readonly minSampleSpacing: number;
  /** Maximum normalised arc length accepted before truncation. */
  readonly maxLength: number;
  /**
   * Smallest bounding-box diagonal, in arena units, that counts as a drawing.
   * Anything smaller becomes an Arcane Wisp — see the note in `features.ts`
   * about why a tiny stroke must not buy a full-strength spell.
   */
  readonly minSize: number;
  /** Grace period past the Draw deadline before a submission is discarded. */
  readonly submitGraceMs: number;
  /** Number of points a stroke is resampled to before feature extraction. */
  readonly resampleCount: number;
}

export interface ArenaConfig {
  /** Half-width of the safe island in normalised units. PRD §5.2. */
  readonly halfWidth: number;
  /** Vertical position of the island surface. */
  readonly groundY: number;
  /** Falling below this Y is a knock-out. PRD §5.2. */
  readonly killFloorY: number;
  /** Leaving beyond this |X| is a knock-out. PRD §5.2. */
  readonly killWallX: number;
  /** Downward acceleration, arena units per second squared. */
  readonly gravity: number;
  /** PRD §9 — the only MVP modifier: everything floats longer. */
  readonly lowGravityMultiplier: number;
}

export interface SimulationConfig {
  /** PRD §20 — fixed timestep is required to prevent desync. */
  readonly fixedTimestepMs: number;
  /** Simulation steps the server may run to catch up in one tick. */
  readonly maxStepsPerTick: number;
  /** Snapshots sent to clients per second. PRD §15. */
  readonly snapshotHz: number;
  /**
   * Resolve ends early once total kinetic energy stays below this for
   * `settleFrames` consecutive steps — keeps Turns snappy.
   */
  readonly settleEnergyThreshold: number;
  readonly settleFrames: number;
}

/**
 * How a drawn feature maps onto a spell parameter. PRD §7.3.
 * Every mapping is an explicit input range projected onto an output range,
 * so tuning never requires touching classifier or simulation code.
 */
export interface FeatureMapping {
  readonly inMin: number;
  readonly inMax: number;
  readonly outMin: number;
  readonly outMax: number;
}

export interface SpellDefinition {
  readonly family: SpellFamily;
  /** Player-facing name. PRD §8. */
  readonly name: string;
  /** One-line description shown in the Spell Journal. PRD §11. */
  readonly blurb: string;
  /** A-05 — where the spell appears. */
  readonly spawn: SpawnMode;
  /** Lifetime of the spawned entity in milliseconds. */
  readonly lifetimeMs: number;
  /** Base mass before size scaling. */
  readonly baseMass: number;
  /** Base radius in normalised arena units, before size scaling. */
  readonly baseRadius: number;
  /** Knockback impulse applied on contact, before Wobble multiplier. */
  readonly baseKnockback: number;
  /** Launch speed for projectile families; zero for stationary spells. */
  readonly baseSpeed: number;
  /** How strongly gravity acts on this spell. 0 = floats. */
  readonly gravityScale: number;
  /** Drawing size -> spell radius. PRD §7.3. */
  readonly sizeToRadius: FeatureMapping;
  /** Drawing size -> spell mass. PRD §7.3. */
  readonly sizeToMass: FeatureMapping;
  /** Drawing curvature -> spin or path curvature. PRD §7.3. */
  readonly curvatureToSpin: FeatureMapping;
  /** Corner count -> bounces. PRD §8.4, hard-capped. */
  readonly cornersToBounces: FeatureMapping;
  /**
   * PRD §7.4 — irregularity produces visual wobble and small bounded variance,
   * never a large damage swing. This is the ceiling on that variance.
   */
  readonly maxIrregularityVariance: number;
  /** Family-specific extras, kept as data so new spells need no core changes. */
  readonly extra: Readonly<Record<string, number>>;
}

export interface ClassifierThresholds {
  /**
   * Gap between stroke endpoints, relative to the stroke's bounding box
   * diagonal, below which the shape counts as closed.
   */
  readonly closureRatio: number;
  /** Total absolute turning below this (radians) means "essentially straight". */
  readonly straightTurningMax: number;
  /** Total turning within this band of 2π means "one clean revolution". */
  readonly loopTurningTolerance: number;
  /** Total turning above this means the stroke wound inwards — a spiral. */
  readonly spiralTurningMin: number;
  /**
   * Ratio between the largest and smallest radius from the centroid, above
   * which a winding stroke is a spiral rather than a loop.
   */
  readonly spiralRadiusRatioMin: number;
  /** Turn at a resampled point above this angle (radians) counts as a corner. */
  readonly cornerAngleMin: number;
  /**
   * How many resampled points sit between a corner sample and its neighbours.
   * Scales with `resampleCount`: it must span a fixed fraction of the stroke,
   * not a fixed number of samples, or changing the resample rate silently
   * changes how sensitive corner detection is to hand tremor.
   */
  readonly cornerWindow: number;
  /** Corners must be at least this far apart (in resampled index) to count. */
  readonly cornerMinSeparation: number;
  /** Fewest corners needed for the Angular family. */
  readonly angularMinCorners: number;
  /**
   * Radial variation (std dev over mean) at which a closed shape stops reading
   * as round. Used instead of circularity because it is immune to overshoot.
   */
  readonly loopRadiusVariationMax: number;
  /** Revolutions below which a closed shape has not really gone round. */
  readonly loopMinRevolutions: number;
  /** Confidence below which any classification falls back to Wisp. PRD §7.1. */
  readonly wispConfidenceFloor: number;
}

export interface AssistConfig {
  /**
   * PRD §14 — assist relaxes thresholds; it never changes damage.
   * Multiplier applied to tolerance bands. Higher = more forgiving.
   */
  readonly toleranceScale: number;
  /** Extra smoothing passes over the raw stroke before feature extraction. */
  readonly smoothingPasses: number;
  /** Confidence bonus added before the Wisp floor is applied. */
  readonly confidenceBonus: number;
}

export interface MotifPhysicsConfig {
  /** Relative claim on the conserved strength budget. */
  readonly strengthWeight: number;
  /** Absolute ceiling; notably keeps the Wisp fallback weak. */
  readonly maxStrength: number;
  /** Local drawn size is multiplied by this before radius clamping. */
  readonly radiusScale: number;
  /** Local drawn size is multiplied by this before mass clamping. */
  readonly massScale: number;
  readonly lifetimeMs: number;
}

/** Tunables for DESIGN-SPELL-COMPOSITION.md. */
export interface CompositionConfig {
  readonly maxMotifs: number;
  readonly minLoopSpanFraction: number;
  readonly minOpenRunFraction: number;
  readonly minMotifSize: number;
  readonly spiralRadiusTrendMin: number;
  readonly spiralMinRevolutions: number;
  readonly unstableIntersectionCount: number;
  readonly unstableWindowFraction: number;
  readonly intersectionEpsilon: number;
  /** Near-crossing tolerance measured in average resampled point gaps. */
  readonly intersectionProximitySteps: number;
  readonly spiralScanStride: number;
  readonly spreadMs: number;
  readonly strengthPerInk: number;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly minMass: number;
  readonly maxMass: number;
  readonly forceMediumFraction: number;
  readonly forceHeavyFraction: number;
  readonly headingDeadZone: number;
  readonly motif: Readonly<Record<MotifKind, MotifPhysicsConfig>>;
}

export interface GameConfig {
  readonly phases: PhaseConfig;
  readonly ink: InkConfig;
  readonly wobble: WobbleConfig;
  readonly scoring: ScoringConfig;
  readonly movement: MovementConfig;
  readonly aim: AimConfig;
  readonly reconnect: ReconnectConfig;
  readonly strokeLimits: StrokeLimits;
  readonly arena: ArenaConfig;
  readonly simulation: SimulationConfig;
  readonly classifier: ClassifierThresholds;
  readonly assist: Readonly<Record<AssistLevel, AssistConfig>>;
  readonly composition: CompositionConfig;
  readonly spells: Readonly<Record<SpellFamily, SpellDefinition>>;
}
