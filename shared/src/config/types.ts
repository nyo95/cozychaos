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
export type Phase = 'setup' | 'draw' | 'cast' | 'reveal' | 'resolve' | 'score';

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
  /** Short direction-only gesture after the rune is complete. */
  readonly castMs: number;
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
  /**
   * Ink consumed per unit of normalised arc length.
   *
   * This is measured in arena units, and the Draw camera is zoomed in, so the
   * constant is calibrated against `camera.drawHalfWidth`: the same finger
   * sweep must cost the same Ink whether or not the camera is zoomed. Changing
   * the Draw zoom without rescaling this silently changes the Ink economy.
   */
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
   * Upward share added to every impact, as a fraction of its magnitude.
   * Knockback has to lift a wizard clear of ground friction or it does nothing.
   */
  readonly knockbackLift: number;
  /**
   * Knockback multiplier at `max` Wobble. At zero Wobble the multiplier is
   * 1.0 and it interpolates linearly to this value.
   */
  readonly knockbackMultiplierAtMax: number;
  /** M-06 — Wobble shed at the start of each new Turn. */
  readonly decayPerTurn: number;
}

export interface ScoringConfig {
  /** PRD §5.1 — first to this many Stars wins. */
  readonly starsToWin: number;
  /** PRD §5.1 — both players falling within this window is a double knock-out. */
  readonly doubleKoWindowMs: number;
  /** A-02 — tightened window during Sudden Death so the match converges. */
  readonly doubleKoWindowSuddenDeathMs: number;
  /** M-01 — Turns after which a Round ends on Wobble instead of looping. */
  readonly turnCapPerRound: number;
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
  /**
   * Aim is clamped to this cone around the opponent-facing direction.
   *
   * Wide enough that a near-vertical lob is legal, because a steep lob is how
   * a player turns a rune into a screen that lands in front of themselves.
   * Narrowing this removes the defensive half of the game.
   */
  readonly maxAngleFromOpponent: number;
  /** Forward offset between the wizard and the centre of a spawned rune body. */
  readonly spawnForward: number;
  /**
   * Kinetic energy every cast is launched with, regardless of rune mass.
   *
   * This is the whole offence/defence dial. Speed is `sqrt(2E/m)`, so a heavy
   * rune (lots of Ink) leaves slowly and lands close as a wall, while a light
   * rune leaves fast and reaches the opponent. Ballistic range scales with
   * `v²`, i.e. with `1/m`, so the Ink spent on matter is literally the Ink not
   * available for reach. Cast magnitude never contributes.
   */
  readonly launchEnergy: number;
  /** Clamps keep the `1/sqrt(m)` curve finite at both extremes. */
  readonly minLaunchSpeed: number;
  readonly maxLaunchSpeed: number;
}

/**
 * Camera framing. Shared, not client-local, because Draw zoom rescales the
 * arena distance a stroke covers and therefore feeds back into Ink cost.
 */
export interface CameraConfig {
  /**
   * Locked arena canvas aspect ratio, width / height. Every device renders
   * this exact shape and letterboxes the remainder.
   *
   * This is a fairness constant, not a layout preference. `createViewport`
   * derives `scale` from canvas width alone, so the arena height a player can
   * see — and therefore the Ink a vertical gesture costs — is a pure function
   * of the canvas aspect. Letting the canvas take whatever height the device
   * has left gave a tall phone ~2.9x the vertical Ink cost of a desktop and a
   * different amount of visible arena to aim with. See A-09.
   */
  readonly arenaAspectRatio: number;
  /** Arena half-width visible while both players draw and aim. */
  readonly drawHalfWidth: number;
  /** Arena half-width visible during Reveal, Resolve, and Score. */
  readonly fullHalfWidth: number;
  /** Vertical centre of the Draw framing, in arena units. */
  readonly drawCenterY: number;
  readonly fullCenterY: number;
  /** Horizontal offset from the local wizard toward the arena centre. */
  readonly drawCenterBias: number;
  /** Fraction of the remaining gap closed per second while easing. */
  readonly easePerSecond: number;
}

export interface WindConfig {
  /** Magnitudes selected per Round. Sign chooses inward vs outward (M-02). */
  readonly accelerationLevels: readonly number[];
  /** Small vertical lift keeps wind readable without overpowering gravity. */
  readonly verticalLiftFraction: number;
  /** Ramp distance from calm at the centre to full strength. See M-02. */
  readonly centreSpanX: number;
}

export interface HazardSpikeConfig {
  readonly kind: 'stalactite' | 'stalagmite';
  readonly base: Readonly<{ x: number; y: number }>;
  readonly tip: Readonly<{ x: number; y: number }>;
  readonly halfWidth: number;
}

export interface HazardConfig {
  /** Seeded once per Round; the resulting layout is shared by server and clients. */
  readonly generation: Readonly<{
    readonly minCount: number;
    readonly maxCount: number;
    readonly xRange: readonly [number, number];
    /** Fraction of each horizontal slot available for seeded jitter. */
    readonly slotJitterFraction: number;
    readonly halfWidthRange: readonly [number, number];
    readonly stalagmiteTipYRange: readonly [number, number];
    readonly stalactiteTipYRange: readonly [number, number];
    readonly ceilingY: number;
    /** Ground spikes inside this distance of a spawn become ceiling spikes. */
    readonly spawnClearance: number;
  }>;
  /** Numerical separation after resolving a collision, in arena units. */
  readonly collisionSkin: number;
  readonly spellRestitution: number;
  readonly spellEnergyLossFraction: number;
  readonly playerRestitution: number;
  readonly playerImpact: number;
}

/** All construction and collision tunables for physical rune bodies. */
export interface RuneBodyConfig {
  readonly minParticles: number;
  readonly maxParticles: number;
  readonly particleRadius: number;
  readonly spawnHeight: number;
  readonly minExtent: number;
  readonly maxExtent: number;
  /** Ink → mass. With `aim.launchEnergy` fixed, this also sets launch speed. */
  readonly massPerInk: number;
  /**
   * Floor on mass per particle. Kept small on purpose: if this floor dominates
   * at low Ink, light runes stop being faster than heavy ones and the entire
   * offence/defence dial collapses.
   */
  readonly minimumMass: number;
  /**
   * Ink → magical charge. Energy is the fuel that lets matter still act; it is
   * NOT the knockback quantity. Knockback comes from momentum in `world.ts`.
   */
  readonly energyPerInk: number;
  readonly baseParticleIntegrity: number;
  readonly integrityPerInk: number;
  readonly bondStiffness: number;
  readonly bondDamping: number;
  readonly bondBaseStrength: number;
  readonly bondCollisionRadius: number;
  readonly bondEndCapFraction: number;
  readonly intersectionDistance: number;
  readonly intersectionStrengthBonus: number;
  readonly maxCrossBonds: number;
  readonly breakStrain: number;
  readonly particleRestitution: number;
  /**
   * Relative approach speed × reduced mass → dissipated collision energy. This
   * is the quantity two colliding runes destroy in each other.
   */
  readonly collisionEnergyScale: number;
  /**
   * Multiplier on the mass-weighted share each side loses when opposing runes
   * meet. Each side's share is the *opponent's* fraction of the combined mass,
   * so a heavy rune shrugs off a light one and a light one is shredded. That
   * asymmetry is what makes a heavy rune function as a shield.
   */
  readonly mutualDamageScale: number;
  readonly integrityDamageScale: number;
  /**
   * Fraction of a particle's momentum (`|v| × m`) delivered to a wizard as
   * impulse. Momentum, not energy: mixing the two is dimensionally meaningless
   * and was the reason weak grazes used to knock players about.
   */
  readonly impactTransfer: number;
  /**
   * Charge at which a particle delivers its full momentum. Below this the hit
   * scales down linearly, so spent matter fades out instead of stopping dead.
   */
  readonly energyForFullImpact: number;
  /** Charge burned per unit of impulse delivered to a wizard. */
  readonly energyCostPerImpulse: number;
  /**
   * How matter settles onto the island. Low restitution and high friction are
   * what let a heavy rune come to rest and act as a standing wall instead of
   * skidding away or bouncing off into the void.
   */
  readonly groundRestitution: number;
  readonly groundFriction: number;
  /**
   * Charge lost per ground impact. Small: landed matter has to stay dangerous,
   * or a defensive rune would be inert the moment it touched down.
   */
  readonly groundEnergyLossFraction: number;
  /** Below this downward speed a ground contact is resting, not an impact. */
  readonly groundRestingSpeed: number;
  readonly airDrag: number;
  readonly gravityScale: number;
  readonly hazardIntegrityDamage: number;
  readonly powerlessEnergyThreshold: number;
  readonly particleKillWallMultiplier: number;
  readonly particleCeilingY: number;
  readonly lifetimeMs: number;
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

export interface CombatConfig {
  /** Directional component strength → projectile launch speed. */
  readonly projectileSpeedScale: number;
  /** Minimum projectile travel speed, so a weak thrust still moves. */
  readonly projectileMinSpeed: number;
  /** Component strength → impulse magnitude on a hit, before Wobble scaling. */
  readonly impulseScale: number;
  /** Radial push per second applied by an overlapping Bubble Ward (loop). */
  readonly loopPush: number;
  /** Inward pull per second during a Vortex's pull phase. */
  readonly vortexPull: number;
  /** Outward impulse at the moment a Vortex releases. */
  readonly vortexRelease: number;
  /** Fraction of a Vortex's lifetime spent pulling before it releases. */
  readonly vortexPullFraction: number;
  /** Hits a directional projectile lands before it expires. */
  readonly maxHits: number;
  /** Random heading jitter (radians) applied to an `unstable` projectile. */
  readonly unstableJitter: number;
}

export interface PlayerBodyConfig {
  /** Collision radius of a wizard, in arena units. */
  readonly radius: number;
  /** Body mass. Heavier = harder to knock around at equal Wobble. */
  readonly mass: number;
  /** |X| of each player's spawn point. Player 0 left, player 1 right. */
  readonly spawnX: number;
  /** Restitution against the ground. Low, so landings do not bounce forever. */
  readonly groundRestitution: number;
  /** Horizontal drag per second while grounded, so slides settle. */
  readonly groundFriction: number;
  /** Air drag per second, so launches decay instead of drifting forever. */
  readonly airDrag: number;
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
  readonly camera: CameraConfig;
  readonly wind: WindConfig;
  readonly hazards: HazardConfig;
  readonly runeBody: RuneBodyConfig;
  readonly reconnect: ReconnectConfig;
  readonly strokeLimits: StrokeLimits;
  readonly arena: ArenaConfig;
  readonly player: PlayerBodyConfig;
  readonly combat: CombatConfig;
  readonly simulation: SimulationConfig;
  readonly classifier: ClassifierThresholds;
  readonly assist: Readonly<Record<AssistLevel, AssistConfig>>;
  readonly composition: CompositionConfig;
  readonly spells: Readonly<Record<SpellFamily, SpellDefinition>>;
}
