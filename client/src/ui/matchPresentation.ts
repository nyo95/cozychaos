import { CONFIG, type LaunchPrediction } from '@cozy/shared';

export type CommitmentTone = 'fast' | 'balanced' | 'heavy';

/** Semantic copy derived only from the authoritative launch prediction. */
export function commitmentReadout(launch: LaunchPrediction): {
  readonly label: string;
  readonly detail: string;
  readonly tone: CommitmentTone;
} {
  const gap = CONFIG.player.spawnX * 2;
  if (launch.maxReach < gap * 0.55) {
    return { label: 'HEAVY · SHORT RANGE', detail: 'Lands close · holds ground', tone: 'heavy' };
  }
  if (launch.maxReach < gap * 1.05) {
    return { label: 'BALANCED', detail: 'Screens the space ahead', tone: 'balanced' };
  }
  return { label: 'FAST · LONG RANGE', detail: 'Light enough to reach your rival', tone: 'fast' };
}

/**
 * Strength names, derived from the configured levels rather than copied.
 *
 * T-04: these thresholds used to be the literals 0.22 and 0.35 written here in
 * the renderer. They happened to bucket `[0, 0.16, 0.28, 0.42]` correctly, so
 * nothing failed — but M-02 changed the wind and any future retune would have
 * mislabelled it silently, with no test to catch it. The names now follow the
 * data: the non-zero levels in ascending order get the ascending names.
 */
const STRENGTH_NAMES = ['Light', 'Steady', 'Strong'] as const;

function strengthName(magnitude: number): string {
  const levels = CONFIG.wind.accelerationLevels
    .map((level) => Math.abs(level))
    .filter((level) => level > 0)
    .sort((a, b) => a - b);
  if (levels.length === 0) return STRENGTH_NAMES[0];
  let index = levels.findIndex((level) => magnitude <= level + 1e-9);
  if (index < 0) index = levels.length - 1;
  // Spread the available names across however many levels exist.
  const scaled = Math.round((index / Math.max(1, levels.length - 1)) * (STRENGTH_NAMES.length - 1));
  return STRENGTH_NAMES[Math.min(STRENGTH_NAMES.length - 1, Math.max(0, scaled))]!;
}

/**
 * Wind copy for the HUD.
 *
 * M-02 changed what the sign means. It is no longer "blows right" vs "blows
 * left" — that was the unfair global shove. It is now a radial field:
 * positive pushes outward from the centre, negative draws inward. Both players
 * read the same word and both are affected identically, which is the point.
 *
 * `direction` drives the arrow glyph: +1 outward (arrows diverging), -1 inward
 * (arrows converging), 0 calm.
 */
export function windReadout(x: number): { readonly label: string; readonly direction: -1 | 0 | 1 } {
  if (Math.abs(x) < 1e-4) return { label: 'Calm', direction: 0 };
  const strength = strengthName(Math.abs(x));
  return {
    label: x > 0 ? `${strength} · pushing out` : `${strength} · drawing in`,
    direction: x > 0 ? 1 : -1,
  };
}

/**
 * Wobble as a fraction of each of three pips.
 *
 * T-03: the HUD used a single 0–3 level and `:nth-child`, so Wobble 34 and 66
 * looked identical — even though `knockbackMultiplierAtMax` makes that gap
 * decide how far the next hit throws you. Three pips are kept because PRD §12
 * requires information to have a *shape*, not only a colour, but each pip now
 * fills continuously.
 */
export function wobblePipFills(wobble: number): readonly [number, number, number] {
  const fraction = Math.max(0, Math.min(1, wobble / CONFIG.wobble.max));
  const scaled = fraction * 3;
  return [0, 1, 2].map((index) => Math.max(0, Math.min(1, scaled - index))) as unknown as readonly [
    number,
    number,
    number,
  ];
}

/** Coarse level, still used for the colour ramp and for screen readers. */
export function wobbleLevel(wobble: number): 0 | 1 | 2 | 3 {
  const fraction = Math.max(0, Math.min(1, wobble / CONFIG.wobble.max));
  return Math.min(3, Math.ceil(fraction * 3)) as 0 | 1 | 2 | 3;
}
