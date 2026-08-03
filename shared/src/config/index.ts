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
  // Conjure → Cast stays within the original 15–22s Turn budget.
  phases: Object.freeze({
    setupMs: 3000,
    drawMs: 6000,
    castMs: 2000,
    revealMs: 1000,
    resolveMaxMs: 7000,
    scoreMs: 2000,
  }),

  // PRD §7.2 — ink caps spell size. A-01 fixes the reset scope to per-Turn.
  ink: Object.freeze({
    total: 100,
    /**
     * The calibration invariant, stated directly instead of as a derivation
     * from a camera the player never draws at:
     *
     *   2 · camera.drawHalfWidth · costPerUnitLength = 75.5
     *
     * i.e. a stroke sweeping the full canvas width during Draw costs 75.5 Ink,
     * and the Ink-40 offence/defence crossover sits at 53% of canvas width.
     * Any change to `drawHalfWidth` must move this number to keep that pair
     * fixed, or the same gesture silently buys different mass.
     *
     * `fullHalfWidth` and `arenaAspectRatio` do NOT enter this equation.
     * Verified in `.audit/probe-framing.mjs`.
     */
    costPerUnitLength: 44.4,
    costToStart: 4,
    warnFraction: 0.25,
  }),

  // A-01 — the correction that makes knock-outs reachable at all.
  wobble: Object.freeze({
    resetScope: 'round' as const,
    initial: 0,
    max: 100,
    // 46, not 13. Impulse is now real momentum (order 0.1-1.0) instead of the
    // energy-times-20 quantity the old code fed in, so the multiplier had to
    // be rescaled with it. Measured: a solid connect is ~24 Wobble, a graze is
    // ~7, a clean full-body strike is ~48.
    gainPerImpulse: 46,
    // Every impact also throws the wizard upward by this fraction of its
    // magnitude. See applyImpact() in world.ts for why knockback has to launch
    // rather than shove.
    knockbackLift: 0.9,
    // At full Wobble a hit throws you 2.6x as far as it would at zero.
    knockbackMultiplierAtMax: 2.6,
    /**
     * M-06 — the comeback bleed, expressed per Turn instead of per second.
     *
     * The old `decayPerSecond: 1.5` was never read by any code, and could not
     * have been: a Turn is ~21 seconds, so per-second decay would shed 31.5
     * Wobble between Turns while a solid connect only adds ~24. Every hit would
     * have been erased before the next one landed, and knock-out — the sole
     * lose condition — would be unreachable.
     *
     * 4 per Turn is about one sixth of a solid connect: enough that a player
     * who survives a few Turns without being hit feels the pressure ease,
     * not enough to undo a landed exchange.
     */
    decayPerTurn: 4,
  }),

  scoring: Object.freeze({
    starsToWin: 3,
    doubleKoWindowMs: 400,
    // A-02 — tightened so Sudden Death converges instead of looping forever.
    doubleKoWindowSuddenDeathMs: 150,
    /**
     * M-01 — safety valve. A Round ends after this many Turns even without a
     * knock-out, and the Star goes to whoever is steadier.
     *
     * Rounds could previously run forever: they end only on knock-out, the
     * environment is seeded per Round, and Wobble is capped — so a repeating
     * Turn repeats indefinitely. Measured in `.audit/probe-stall-m04.mjs`: with
     * both players retreating, 24 of 25 seeds never terminated.
     *
     * 20, not something tighter, because the same measurement shows normal
     * varied play resolves in ~12 Turns. The cap is meant to be invisible to
     * anyone actually trying to hit their opponent, and to catch only the
     * mutual-avoidance case that has no other exit.
     */
    turnCapPerRound: 20,
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
    maxCastRadius: 1.3,
    // ~83°. Widened from 70° because a steep lob is the *defensive* cast: it
    // lands the rune in front of you as a screen instead of sending it across.
    // At 70° the shortest legal shot still travelled too far to shield with.
    maxAngleFromOpponent: 1.45,
    spawnForward: 0.2,
    /**
     * Every cast is launched with the same energy, so `v = sqrt(2E/m)`.
     *
     * Worked example at the tuned constants (opponent sits 1.1 units away,
     * particle gravity 1.088, flat-ground range = v²·sin(2θ)/g):
     *
     *   Ink  10 → mass 0.18 → v 1.73 → max reach 2.75 (fast dart)
     *   Ink  20 → mass 0.22 → v 1.55 → max reach 2.20
     *   Ink  40 → mass 0.44 → v 1.09 → max reach 1.10 (exactly the rival)
     *   Ink  70 → mass 0.77 → v 0.83 → max reach 0.63 (a screen)
     *   Ink 100 → mass 1.10 → v 0.69 → max reach 0.44 (a wall at your feet)
     *
     * The crossover sits at Ink 40. That single number is the offence/defence
     * decision, and it is made by how much you draw — not by a role, a toggle,
     * or a hidden Ward stat.
     *
     * Tuned down from 0.24: at that value the lightest rune reached 4x the
     * arena gap, which left only a razor-flat shot or a lob that punched
     * through the particle ceiling. Aiming needs a usable window in between.
     */
    launchEnergy: 0.263,
    minLaunchSpeed: 0.5,
    maxLaunchSpeed: 2.1,
  }),

  // Shared because Draw zoom feeds back into Ink cost (see ink.costPerUnitLength).
  camera: Object.freeze({
    /**
     * A-09 — 2:3 portrait, identical on every device.
     *
     * Measured alternatives (`.audit/probe-framing.mjs`), all with the Ink
     * economy held fixed:
     *
     *   3:4    kill floor -1.4 sits exactly on the frame edge — a knock-out
     *          would resolve off-screen. Rejected.
     *   2:3    frame y -1.52..1.92, island 87% of canvas width, desktop
     *          letterbox 480x720. Chosen.
     *   9:16   frame y -1.84..2.24 — 0.44 extra units of empty sky above and
     *          below with no gameplay in them.
     *   9:19.5 desktop letterbox collapses to 332x720.
     *
     * Locking this is what makes the arena fair across devices; see the
     * `arenaAspectRatio` doc comment in types.ts.
     */
    arenaAspectRatio: 2 / 3,
    /**
     * Unchanged from the landscape build, and it must stay that way unless
     * `ink.costPerUnitLength` moves with it.
     *
     * The Ink invariant is `2 · drawHalfWidth · costPerUnitLength` = 75.5 Ink
     * for a sweep across the full canvas width. It does not involve
     * `fullHalfWidth`, because nobody draws at the Full camera. Re-framing the
     * Full camera for portrait is therefore pure presentation and does not
     * touch the offence/defence dial.
     */
    drawHalfWidth: 0.85,
    // 1.15, down from 1.45. At 1.45 the 2:3 frame spanned y -1.97..2.37 and the
    // island shrank to 69% of canvas width on a phone. 1.15 is the narrowest
    // framing that still holds the island (±1.0), the crystal ceiling (1.3),
    // and the kill floor (-1.4) with margin.
    fullHalfWidth: 1.15,
    drawCenterY: 0.34,
    fullCenterY: 0.2,
    // Pulls the Draw framing toward mid-arena so the rival stays partly in
    // frame; a player who cannot see the rival cannot aim meaningfully.
    /**
     * 0.45. Two corrections, in order.
     *
     * 0.30 → 0.36 (A-09): the Draw frame's right edge stopped at 0.60 while the
     * rival's physics body reaches `spawnX + radius` = 0.64.
     *
     * 0.36 → 0.45: bounding the rival by the physics body was the wrong test.
     * The renderer paints two things wider than the body — measured in
     * `.audit/probe-framing2.mjs`:
     *
     *   physics body        → 0.640   fits
     *   sprite opaque px    → 0.658   fits by 0.002
     *   Wobble ring         → 0.677   clipped by 0.017
     *
     * The Wobble ring is the game's only lose-condition readout, so clipping it
     * is not cosmetic. 0.36 also left *negative* headroom for drift, and
     * positions carry across Turns — a rival pushed even slightly right left
     * frame entirely. 0.45 buys 0.09 units of headroom.
     *
     * Widening `drawHalfWidth` would also work but costs Ink recalibration
     * (0.90 would force costPerUnitLength to 41.9); bias is free.
     */
    drawCenterBias: 0.45,
    easePerSecond: 6.5,
  }),

  /**
   * Selected deterministically per Round and shown before either player draws.
   *
   * M-02 — wind is a *radial* field, not a global shove.
   *
   * A single global `wind.x` decided Rounds before anyone drew: with perfectly
   * mirrored play, levels 0.28 and 0.42 produced a one-sided knock-out at
   * 0.0 vs 41.3 Wobble, because a rightward wind helps whoever casts rightward.
   * There is no amount of skill that answers "the wind was against you today".
   *
   * The field now points outward from the arena centre (or inward, when the
   * signed magnitude is negative), ramping across `centreSpanX`:
   *
   *   ax(x) = magnitude · clamp(x / centreSpanX, -1, +1)
   *
   * That is an *odd* function of x, so mirroring the world negates the force
   * exactly — which is what makes mirrored play produce mirrored outcomes. It
   * is also a single coherent field in one shared world: the island breathes
   * in or out. No per-player physics, nothing to desync.
   *
   * Tactically it is still the most Gunbound thing on screen, just symmetric:
   * an outward wind carries your rune away and shortens the rival's reach into
   * your half; an inward wind does the reverse. Both players read the same
   * gauge and both must answer it.
   */
  wind: Object.freeze({
    // Signed: negative pulls inward, positive pushes outward. Magnitudes are
    // the same set the global field used, so reach tuning carries over.
    accelerationLevels: Object.freeze([0, 0.16, 0.28, 0.42]),
    verticalLiftFraction: 0.12,
    /**
     * Distance over which the field ramps from zero at the centre to full
     * strength. 0.35, not a hard step at x = 0: a discontinuity would make a
     * rune crossing the midline snap sideways, which reads as a physics bug
     * rather than weather.
     */
    centreSpanX: 0.35,
  }),

  // Cave geometry is generated from this shared data once per Round. The
  // server sends the resulting immutable triangles to both clients.
  hazards: Object.freeze({
    generation: Object.freeze({
      minCount: 3,
      maxCount: 4,
      xRange: Object.freeze([-0.66, 0.66] as const),
      slotJitterFraction: 0.18,
      halfWidthRange: Object.freeze([0.1, 0.16] as const),
      /**
       * Ground crystals top out at 0.36 and floating ones hang no lower than
       * 0.82, leaving a 0.46-unit firing corridor.
       *
       * The old bands (0.42 and 0.58) left a 0.16 gap. Measured on seed 8: a
       * flat cast was hard-blocked for an entire Round, and because a Round
       * only ends on a knock-out, the layout never regenerated — the match
       * could not progress at all. A cave that can deadlock a match is not a
       * hazard, it is a stall.
       *
       * Floating crystals also now hang from 1.3 rather than a 1.02 ceiling,
       * which suits a sky arena better than a cave roof.
       */
      stalagmiteTipYRange: Object.freeze([0.2, 0.36] as const),
      stalactiteTipYRange: Object.freeze([0.82, 1.02] as const),
      ceilingY: 1.3,
      spawnClearance: 0.3,
    }),
    collisionSkin: 0.001,
    spellRestitution: 0.58,
    spellEnergyLossFraction: 0.16,
    playerRestitution: 0.32,
    playerImpact: 0.55,
  }),

  // Meta knobs for rune construction, breakage, and fragments.
  runeBody: Object.freeze({
    minParticles: 6,
    maxParticles: 28,
    particleRadius: 0.035,
    spawnHeight: 0.1125,
    minExtent: 0.18,
    maxExtent: 0.62,
    massPerInk: 0.011,
    /**
     * Absolute floor on total body mass — see `totalMass` in runeBody.ts for
     * why it is not per-particle any more.
     *
     * This number sets the *top* of the reach curve, because reach scales with
     * `1/m`. At 0.27 the lightest possible rune reaches about 1.6x the gap
     * between wizards, which leaves a usable aim window on both the flat and
     * the lofted solution. Lower values (a 4x-gap dart) technically fly
     * further but make every shot a near-miss, which is the "physics feels
     * random" risk PRD §20 lists first.
     */
    minimumMass: 0.27,
    energyPerInk: 0.052,
    baseParticleIntegrity: 0.16,
    integrityPerInk: 0.008,
    bondStiffness: 24,
    bondDamping: 1.7,
    bondBaseStrength: 0.52,
    bondCollisionRadius: 0.018,
    bondEndCapFraction: 0.12,
    intersectionDistance: 0.075,
    intersectionStrengthBonus: 0.65,
    maxCrossBonds: 8,
    breakStrain: 0.72,
    // Runes bounce off each other rather than sticking, so a shield deflects
    // as well as absorbs. "Pantulan" is this number plus mass, not bookkeeping.
    particleRestitution: 0.52,
    collisionEnergyScale: 0.48,
    mutualDamageScale: 1.4,
    integrityDamageScale: 0.24,
    /**
     * Replaces `playerImpactScale: 20`, which multiplied an *energy* value and
     * produced knockback an order of magnitude larger than the momentum that
     * physically caused it.
     *
     * Above 1.0 because a spell is allowed to impart more than its raw kinetic
     * momentum — that is the magic. Calibrated against a measured Resolve: a
     * mid-Ink rune (30 Ink, 13 nodes, total momentum 0.40) landing about half
     * its nodes gives roughly Δv 0.5 and +24 Wobble, so a clean full-body hit
     * is decisive and a graze is not. Knock-outs land in the 2-4 Turn range
     * the 3-5 minute match length in PRD §4.4 needs.
     */
    impactTransfer: 2.6,
    // 0.05, not 0.12. A node of a light rune only carries ~0.065 charge, so a
    // 0.12 threshold halved every light hit — penalising small runes twice,
    // once through mass and again through charge. This gate exists to fade out
    // *spent* matter, not to tax fresh matter for being light.
    energyForFullImpact: 0.05,
    energyCostPerImpulse: 0.22,
    groundRestitution: 0.24,
    groundFriction: 2.6,
    groundEnergyLossFraction: 0.06,
    // Comfortably above the per-step velocity gravity adds (1.088 × 1/60 ≈
    // 0.018), so a settled particle is never mistaken for a landing one.
    groundRestingSpeed: 0.09,
    airDrag: 0.16,
    gravityScale: 0.34,
    hazardIntegrityDamage: 0.09,
    powerlessEnergyThreshold: 0.0001,
    particleKillWallMultiplier: 1.25,
    particleCeilingY: 1.35,
    lifetimeMs: 5200,
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

  // The wizard bodies. Spawns sit inside the island half-width (1.0) so there
  // is room to be pushed toward either edge before a knock-out.
  player: Object.freeze({
    radius: 0.09,
    mass: 1.0,
    spawnX: 0.55,
    groundRestitution: 0.15,
    // 1.4, not 3.2. At 3.2 a grounded wizard shed knockback in under 0.2s and
    // travelled ~0.03 units per hit, which made positional knock-out — the
    // only lose condition in the game — practically unreachable.
    groundFriction: 1.4,
    airDrag: 0.4,
  }),

  // Combat tuning. Provisional — these are the numbers a Physics Toy exists to
  // tune (PRD §18 Stage 1), chosen here so the online slice is playable now.
  combat: Object.freeze({
    projectileSpeedScale: 1.1,
    projectileMinSpeed: 0.9,
    impulseScale: 0.9,
    loopPush: 2.4,
    vortexPull: 2.2,
    vortexRelease: 2.0,
    vortexPullFraction: 0.7,
    maxHits: 2,
    unstableJitter: 0.5,
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
