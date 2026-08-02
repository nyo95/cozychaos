import { SPELLS } from './spells.js';
import type { GameConfig } from './types.js';

export * from './types.js';
export { SPELLS } from './spells.js';

/**
 * The single source of truth for every tunable value in the game.
 *
 * PRD §21 forbids magic numbers scattered through gameplay code, and §15
 * requires that "Server dan client berbagi schema serta konstanta match yang
 * sama" — both sides import this exact object.
 *
 * Arena units: the safe island spans x ∈ [-1, 1], ground sits at y = 0.
 * Time is milliseconds at the match-loop level, seconds inside the simulation.
 */
export const CONFIG: GameConfig = Object.freeze({
  // PRD §6 — 4 + 7 + 1 + 8 + 2 = 22s worst case, matching the stated 15–22s Turn.
  phases: Object.freeze({
    setupMs: 4000,
    drawMs: 7000,
    revealMs: 1000,
    resolveMaxMs: 8000,
    scoreMs: 2000,
  }),

  // PRD §7.2 — ink caps spell size. A-01 fixes the reset scope to per-Turn.
  ink: Object.freeze({
    total: 100,
    costPerUnitLength: 26,
    costToStart: 4,
    warnFraction: 0.25,
  }),

  // A-01 — the correction that makes knock-outs reachable at all.
  wobble: Object.freeze({
    resetScope: 'round' as const,
    initial: 0,
    max: 100,
    gainPerImpulse: 13,
    // At full Wobble a hit throws you 2.6x as far as it would at zero.
    knockbackMultiplierAtMax: 2.6,
    // Slow bleed gives the losing player a route back. PRD §5.3 comeback goal.
    decayPerSecond: 1.5,
  }),

  scoring: Object.freeze({
    starsToWin: 3,
    doubleKoWindowMs: 400,
    // A-02 — tightened so Sudden Death converges instead of looping forever.
    doubleKoWindowSuddenDeathMs: 150,
  }),

  // A-03 — Setup only. Resolve is a pure simulation with no player input.
  movement: Object.freeze({
    activePhases: Object.freeze(['setup'] as const),
    speed: 0.55,
    jumpImpulse: 1.35,
    jumpsPerSetup: 1,
  }),

  // A-04 — the rune canvas is a 1:1 transparent overlay on the arena.
  aim: Object.freeze({
    frame: 'arena-overlay' as const,
    // Roughly two-thirds of the island: far enough to be expressive, close
    // enough that you cannot simply place a Vortex on top of your opponent
    // from across the map without committing to the position.
    maxCastRadius: 1.3,
  }),

  // A-06 — reconnect promoted into MVP scope.
  reconnect: Object.freeze({
    windowMs: 30_000,
    pauseAt: 'turn-boundary' as const,
  }),

  // PRD §15 — server-side limits. Violations are repaired, never rejected.
  strokeLimits: Object.freeze({
    maxPoints: 512,
    minPoints: 4,
    // ~1–2 screen pixels at typical window sizes: below the resolution of any
    // deliberate gesture, well above pointer jitter.
    minSampleSpacing: 0.0025,
    maxLength: 12.0,
    // ~3% of the arena width — below a deliberate gesture, above a twitch.
    minSize: 0.06,
    submitGraceMs: 250,
    // Classification runs once per Turn, not per frame, so resolution is
    // cheaper than accuracy here. 96 keeps corners distinguishable even on a
    // busy zigzag, where 64 starts merging adjacent bends.
    resampleCount: 96,
  }),

  arena: Object.freeze({
    halfWidth: 1.0,
    groundY: 0.0,
    killFloorY: -1.4,
    killWallX: 2.2,
    gravity: -3.2,
    lowGravityMultiplier: 0.55,
  }),

  // PRD §20 — fixed timestep is the anti-desync measure.
  simulation: Object.freeze({
    fixedTimestepMs: 1000 / 60,
    maxStepsPerTick: 5,
    snapshotHz: 20,
    settleEnergyThreshold: 0.004,
    settleFrames: 30,
  }),

  /**
   * Classifier thresholds. PRD §7.4 demands tolerance across motor skill and
   * hardware, so these bands are deliberately generous. Tuning happens here,
   * never inside the classifier itself.
   */
  classifier: Object.freeze({
    // Measured against `closure`, which tolerates overshoot. A ring left open
    // by about a seventh of a revolution still reads as closed.
    closureRatio: 0.38,
    straightTurningMax: 1.6,
    loopTurningTolerance: 2.5,
    // ~1.67 revolutions. Must sit well clear of the 2π that every closed shape
    // winds by definition, or circles and triangles read as partly spiral.
    spiralTurningMin: 10.5,
    spiralRadiusRatioMin: 1.9,
    /**
     * ~69°. Tuned against the synthetic dataset rather than guessed.
     *
     * The only failure mode the classifier has is a shaky straight line being
     * read as a Prism Shard, and this threshold is what controls it. Swept
     * across tremor levels, 50° misreads 10% of shaky lines and 69° misreads
     * none up to heavy tremor; pushing further to 74° starts losing genuine
     * zigzags instead. A drifting hand bends a line by around 55°, while a
     * deliberate corner is 90° or more, so the gap sits here.
     *
     * Erring toward Arc Bolt is also the kinder mistake: a misread line still
     * flies roughly where it was aimed, whereas a misread Prism Shard bounces
     * off somewhere unintended.
     */
    cornerAngleMin: 1.2,
    // Both are ~6% of `resampleCount` (96), i.e. a corner is judged over about
    // a sixteenth of the stroke on either side.
    cornerWindow: 6,
    cornerMinSeparation: 6,
    angularMinCorners: 2,
    // A clean ring sits near 0.02 and a wobbly one near 0.12, so 0.35 leaves
    // ample room for a shaky hand while still rejecting slivers and spirals.
    loopRadiusVariationMax: 0.35,
    loopMinRevolutions: 0.72,
    wispConfidenceFloor: 0.34,
  }),

  // PRD §14 — assist widens tolerance. It never touches damage.
  assist: Object.freeze({
    standard: Object.freeze({
      toleranceScale: 1.0,
      smoothingPasses: 1,
      confidenceBonus: 0.0,
    }),
    high: Object.freeze({
      toleranceScale: 1.45,
      // Two passes, not three. Smoothing removes the tremor that fakes corners
      // on a ring, but it also rounds the real corners of a zigzag, so more is
      // not better: measured across tremor levels, three passes cost the
      // Angular family more than the extra pass gained elsewhere.
      smoothingPasses: 2,
      confidenceBonus: 0.12,
    }),
  }),

  // DESIGN-SPELL-COMPOSITION.md — wild strokes compose bounded primitives.
  composition: Object.freeze({
    maxMotifs: 5,
    minLoopSpanFraction: 0.08,
    minOpenRunFraction: 0.055,
    minMotifSize: 0.045,
    spiralRadiusTrendMin: 0.34,
    spiralMinRevolutions: 1.15,
    unstableIntersectionCount: 3,
    unstableWindowFraction: 0.5,
    intersectionEpsilon: 1e-7,
    intersectionProximitySteps: 1.35,
    spiralScanStride: 4,
    spreadMs: 1250,
    // A full 100-Ink commitment owns a strength budget of 2.5.
    strengthPerInk: 0.025,
    minRadius: 0.035,
    maxRadius: 0.38,
    minMass: 0.2,
    maxMass: 1.8,
    // Force bands read from committed-Ink fraction (see forceBand), so these
    // edges sit in the *gaps* between where real strokes cluster, not on them.
    // Measured clusters: Light shapes land ≤0.36, Medium 0.51–0.61, Heavy ≥0.73.
    // A zigzag commits ~0.36 exactly, so an edge at 0.36 made its readout flip
    // under tremor (property 8). Every fixture now sits ≥0.05 clear of an edge,
    // roughly a 10x margin over observed jitter.
    forceMediumFraction: 0.44,
    forceHeavyFraction: 0.67,
    headingDeadZone: 0.08,
    motif: Object.freeze({
      thrust: Object.freeze({ strengthWeight: 1.0, maxStrength: 2.5, radiusScale: 0.18, massScale: 1.15, lifetimeMs: 2300 }),
      loop: Object.freeze({ strengthWeight: 0.9, maxStrength: 2.1, radiusScale: 0.72, massScale: 1.45, lifetimeMs: 3600 }),
      spiral: Object.freeze({ strengthWeight: 1.05, maxStrength: 2.35, radiusScale: 0.8, massScale: 0.35, lifetimeMs: 3000 }),
      bounce: Object.freeze({ strengthWeight: 0.72, maxStrength: 1.25, radiusScale: 0.2, massScale: 1.3, lifetimeMs: 2600 }),
      unstable: Object.freeze({ strengthWeight: 1.15, maxStrength: 2.2, radiusScale: 0.55, massScale: 0.85, lifetimeMs: 1800 }),
      wisp: Object.freeze({ strengthWeight: 0.35, maxStrength: 0.25, radiusScale: 0.14, massScale: 0.55, lifetimeMs: 1800 }),
    }),
  }),

  spells: SPELLS,
});
