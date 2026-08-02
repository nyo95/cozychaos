import { CONFIG } from '../config/index.js';
import type { AssistLevel, SpellFamily } from '../config/types.js';
import { extractFeatures, type StrokeFeatures } from './features.js';
import { TAU, type Vec2, clamp01, inverseLerp, lerp } from './geometry.js';

/**
 * Result of reading a drawing. Never a failure: PRD §7.1 guarantees that
 * "Spell tidak boleh gagal total" and that anything unreadable becomes an
 * Arcane Wisp.
 */
export interface Classification {
  readonly family: SpellFamily;
  /** How well the winning family fit, in [0, 1]. */
  readonly confidence: number;
  /** Gap to the runner-up. A small margin means the drawing was ambiguous. */
  readonly margin: number;
  /** Raw fit for every family, for the Spell Lab readout and for tests. */
  readonly scores: Readonly<Record<SpellFamily, number>>;
  /** The family that won on score, before the Wisp confidence floor applied. */
  readonly rawFamily: SpellFamily;
  /** True when the Wisp floor overrode the winner. */
  readonly fellBackToWisp: boolean;
  /**
   * The reading the classifier actually used, at the player's assist level.
   * Diagnostic only — never build a spell from this.
   */
  readonly features: StrokeFeatures;
  /**
   * The same stroke read at Standard assist. **Every gameplay parameter is
   * computed from this**, never from `features`.
   *
   * Draw Assist is an accessibility setting (PRD §14) and PRD §11 forbids any
   * setting from conferring a competitive advantage. Smoothing passes and
   * widened tolerance change the measured corner count, size, and curvature,
   * so building a spell from the assisted reading let High assist hand the
   * same gesture four bounces where Standard gave one — a 26% knockback
   * difference from a menu toggle. Separating the two pipelines is what keeps
   * assist confined to recognition.
   */
  readonly canonical: StrokeFeatures;
  /** Confidence of the canonical reading. The only confidence gameplay sees. */
  readonly canonicalConfidence: number;
}

export interface ClassifyOptions {
  readonly assist: AssistLevel;
}

const DEFAULT_OPTIONS: ClassifyOptions = { assist: 'standard' };

/**
 * Classifies a raw stroke into one of the five spell families.
 *
 * PRD §21 requires this to be a pure function with a test dataset, and PRD
 * §7.4 puts the authoritative call on the server. Because it is pure and
 * shares `CONFIG` with the client (PRD §15), the in-game preview and the
 * server verdict are the same computation.
 *
 * Approach: rather than a decision tree of hard cutoffs, each family gets a
 * continuous fit score built from independent geometric evidence. This matters
 * for PRD §7.4 — a tree makes a drawing that sits one degree past a threshold
 * flip families entirely, which is precisely the "recognition feels like an
 * exam" failure listed in PRD §20. Scores degrade smoothly instead, and the
 * loser of a close call is a near-miss rather than a wrong answer.
 */
export function classifyStroke(
  raw: readonly Vec2[],
  options: ClassifyOptions = DEFAULT_OPTIONS,
): Classification {
  const features = extractFeatures(raw, { assist: options.assist });
  // At Standard assist the two readings are identical, so skip the second pass.
  const canonical =
    options.assist === 'standard' ? features : extractFeatures(raw, { assist: 'standard' });
  return classifyFeatures(features, options, canonical);
}

/**
 * Classifies pre-extracted features. Split out so the server can validate a
 * stroke, extract once, and classify without redoing the geometry.
 *
 * `canonical` must be the Standard-assist reading of the same stroke. It
 * defaults to `features`, which is correct only when the caller is already at
 * Standard assist.
 */
export function classifyFeatures(
  features: StrokeFeatures,
  options: ClassifyOptions = DEFAULT_OPTIONS,
  canonical: StrokeFeatures = features,
): Classification {
  const assist = CONFIG.assist[options.assist];

  if (features.degenerate) {
    return {
      family: 'wisp',
      confidence: 0,
      margin: 0,
      scores: { stroke: 0, loop: 0, spiral: 0, angular: 0, wisp: 1 },
      rawFamily: 'wisp',
      fellBackToWisp: true,
      features,
      canonical,
      canonicalConfidence: 0,
    };
  }

  const evidence = gatherEvidence(features, assist.toleranceScale);
  const scores = scoreFamilies(evidence);

  let rawFamily: SpellFamily = 'stroke';
  let best = -Infinity;
  let second = -Infinity;
  for (const family of FAMILY_ORDER) {
    const score = scores[family];
    if (score > best) {
      second = best;
      best = score;
      rawFamily = family;
    } else if (score > second) {
      second = score;
    }
  }

  const margin = clamp01(best - Math.max(second, 0));

  // A very messy drawing loses confidence, but the penalty is capped so a
  // shaky hand can never be pushed below the floor by shakiness alone —
  // PRD §19 targets fewer than 10% "my drawing wasn't read" complaints.
  const messPenalty = 1 - MAX_MESS_PENALTY * clamp01(features.irregularity / MESS_REFERENCE);
  const confidence = clamp01(best * messPenalty + assist.confidenceBonus);

  const fellBackToWisp = confidence < CONFIG.classifier.wispConfidenceFloor;

  return {
    family: fellBackToWisp ? 'wisp' : rawFamily,
    confidence,
    margin,
    scores,
    rawFamily,
    fellBackToWisp,
    features,
    canonical,
    canonicalConfidence: canonical === features ? confidence : confidenceOf(canonical),
  };
}

/**
 * Confidence of a reading judged at Standard tolerance, with no assist bonus.
 *
 * Used for the one gameplay quantity that reads confidence — launch speed — so
 * that turning assist on cannot make a spell travel faster.
 */
function confidenceOf(features: StrokeFeatures): number {
  if (features.degenerate) return 0;
  const scores = scoreFamilies(gatherEvidence(features, 1));
  const best = Math.max(...Object.values(scores));
  const messPenalty = 1 - MAX_MESS_PENALTY * clamp01(features.irregularity / MESS_REFERENCE);
  return clamp01(best * messPenalty);
}

const FAMILY_ORDER: readonly SpellFamily[] = ['stroke', 'loop', 'spiral', 'angular'];

/** Irregularity at which the mess penalty reaches its maximum. */
const MESS_REFERENCE = 0.25;
/** Largest fraction of confidence that mess alone can remove. */
const MAX_MESS_PENALTY = 0.45;

/** Enclosure at which winding-based signals are trusted at full strength. */
const ENCLOSURE_REFERENCE = 0.28;

/**
 * Independent geometric signals, each normalised to [0, 1].
 *
 * Keeping evidence separate from scoring means a threshold can be retuned
 * without rewriting family logic, and each signal can be asserted on its own
 * in tests.
 */
interface Evidence {
  /** 1 when the endpoints met, 0 when they are far apart. */
  readonly closedness: number;
  readonly openness: number;
  /** 1 for a ruler-straight line, 0 for anything that turns a lot. */
  readonly straightness: number;
  /** 1 when there are clearly several sharp corners. */
  readonly cornerness: number;
  /** Complement of cornerness: 1 when the stroke flows without hard bends. */
  readonly smoothness: number;
  /** 1 for a circle-like outline, 0 for a sliver or a polygon. */
  readonly roundness: number;
  /** 1 when the stroke went round at least once. Overshoot is not penalised. */
  readonly fullRevolution: number;
  /** 1 when the stroke wound well past a single revolution. */
  readonly multiRevolution: number;
  /** 1 when the radius marched steadily in or out, as a real spiral does. */
  readonly radialMarch: number;
  /** 1 when the drawing actually encloses area. Gates the two above. */
  readonly encloses: number;
}

function gatherEvidence(features: StrokeFeatures, tolerance: number): Evidence {
  const thresholds = CONFIG.classifier;
  const winding = Math.abs(features.winding);

  /**
   * Winding and radius spread are only meaningful once the drawing encloses
   * something. On an open line the centroid sits on the stroke, which fakes
   * half a revolution of winding and a huge radius ratio out of nothing.
   */
  const encloses = clamp01(features.enclosure / ENCLOSURE_REFERENCE);

  /**
   * A soft band rather than a hard cutoff. Almost nobody closes a hand-drawn
   * ring exactly, so a small gap should cost a little confidence rather than
   * disqualify the shape outright — that abruptness is the "recognition feels
   * like an exam" failure PRD §20 warns about.
   */
  const closedness =
    1 -
    inverseLerp(
      thresholds.closureRatio * 0.5 * tolerance,
      thresholds.closureRatio * 1.7 * tolerance,
      features.closure,
    );

  const straightness = clamp01(
    1 - features.totalTurning / (thresholds.straightTurningMax * tolerance),
  );

  // Two corners is the minimum for the Angular family; three or more is
  // unambiguous. Ramping between them avoids a cliff at exactly two.
  const cornerness = clamp01((features.cornerCount - thresholds.angularMinCorners + 1) / 2);

  /**
   * Roundness from radial consistency rather than from circularity — see the
   * note on `radiusVariation`. A ring is round when every point sits about the
   * same distance from the centre, whether or not the hand overshot the seam.
   */
  const roundness =
    1 - clamp01(features.radiusVariation / (thresholds.loopRadiusVariationMax * tolerance));

  /**
   * Asks only whether the stroke went round at least once, and does not
   * penalise going further.
   *
   * A symmetric "close to exactly 2π" test would punish the single most common
   * thing a hand does when drawing a ring: carry on a little past the start.
   * Winding well beyond one revolution is handled by `multiRevolution`, which
   * hands the shape to the Vortex family when it is accompanied by a marching
   * radius — so nothing is lost by being generous here.
   */
  const fullRevolution = inverseLerp(
    TAU * thresholds.loopMinRevolutions,
    TAU * 0.95,
    winding,
  );

  /**
   * Starts above one full revolution, not at it. Any closed shape winds
   * exactly 2π by definition, so a ramp starting below that would read every
   * circle and every triangle as partly spiral.
   *
   * Deliberately free of `tolerance`. This is a boundary *between* two
   * families, not a band describing how imperfect a drawing may be, and assist
   * has no business moving it — the question "ring or spiral?" has the same
   * answer whatever a player's motor control is. Scaling it did real damage:
   * dividing the ceiling by 1.45 collapsed the ramp to a width of 0.01 radians,
   * so on High assist every slightly over-drawn ring scored a full
   * `multiRevolution`, which zeroes the Loop score. Rings became unrecognisable
   * on the setting meant to make them easier.
   */
  const multiRevolution = encloses * inverseLerp(TAU * 1.15, thresholds.spiralTurningMin, winding);

  // Requires both a wide radius spread and a monotonic march. A wobbly circle
  // has spread without march; a spiral has both.
  const spread = inverseLerp(1, thresholds.spiralRadiusRatioMin, features.radiusRatio);
  const march = clamp01(Math.abs(features.radiusTrend));
  const radialMarch = clamp01(encloses * spread * lerp(0.55, 1, march));

  return {
    closedness,
    openness: 1 - closedness,
    straightness,
    cornerness,
    smoothness: 1 - cornerness,
    roundness,
    fullRevolution,
    multiRevolution,
    radialMarch,
    encloses,
  };
}

function scoreFamilies(e: Evidence): Record<SpellFamily, number> {
  /**
   * Arc Bolt (PRD §8.1): an open path with no hard corners that does not wrap
   * around itself. A gently curved line is still an Arc Bolt — §8.1 says a
   * curved line simply makes the bolt curve — so straightness only scales the
   * score between 0.6 and 1.0 rather than gating it.
   */
  const stroke = e.openness * e.smoothness * (1 - e.multiRevolution) * lerp(0.6, 1, e.straightness);

  /**
   * Bubble Ward (PRD §8.2): closed, enclosing area, round, and gone round at
   * least once.
   *
   * Roundness scales the score rather than gating it, so an oval or a lumpy
   * ring is still a Bubble Ward — just a less confident one. The
   * `1 - multiRevolution` term is what hands a tightly wound stroke over to
   * the Vortex family instead.
   */
  const loop =
    e.closedness *
    e.encloses *
    e.smoothness *
    lerp(0.35, 1, e.roundness) *
    lerp(0.45, 1, e.fullRevolution) *
    (1 - e.multiRevolution);

  /**
   * Vortex (PRD §8.3): wound past a full revolution *and* marching inward or
   * outward. Both are required — the conjunction is what keeps an over-drawn
   * circle (winding without march) out of this family.
   *
   * Corners are deliberately not consulted. Arc-length resampling places
   * samples far apart in angle near a spiral's tight centre, so a perfectly
   * smooth spiral reports several corners that the hand never drew, and a
   * tighter spiral reports more of them — penalising exactly the drawings that
   * are most clearly Vortexes. Nothing is lost by ignoring corners here: no
   * angular stroke winds more than a revolution around its own centroid with a
   * steadily marching radius, so the two signals above are already sufficient.
   */
  const spiral = e.multiRevolution * e.radialMarch;

  /**
   * Prism Shard (PRD §8.4): several sharp corners. Works open or closed — a
   * drawn triangle is as angular as a drawn zigzag — but an open path scores
   * slightly higher because that is the trick-shot gesture the family is for.
   */
  const angular = e.cornerness * (1 - e.multiRevolution) * lerp(0.75, 1, e.openness);

  /**
   * Arcane Wisp is never scored. It is not a shape the player can aim for; it
   * is the guarantee that an unreadable drawing still produces magic
   * (PRD §8.5). It is selected by the confidence floor, not by winning.
   */
  return { stroke, loop, spiral, angular, wisp: 0 };
}
