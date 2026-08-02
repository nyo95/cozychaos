import { CONFIG } from '../config/index.js';
import type { AssistLevel, MotifKind } from '../config/types.js';
import { classifyStroke } from './classifier.js';
import type { StrokeFeatures } from './features.js';
import { type Vec2, clamp, length, normalize } from './geometry.js';
import { inkCost } from './mapping.js';
import { segmentMotifs, type MotifOccurrence } from './motifs.js';

export interface ForceComponent {
  readonly kind: MotifKind;
  readonly origin: Vec2;
  readonly direction: Vec2;
  readonly radius: number;
  readonly mass: number;
  readonly strength: number;
  readonly chirality: -1 | 0 | 1;
  readonly activateAtMs: number;
  readonly lifetimeMs: number;
}

export type Heading = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'none';
export type ForceBand = 'ringan' | 'sedang' | 'berat';

export interface RecipeSummary {
  readonly heading: Heading;
  readonly force: ForceBand;
  readonly shape: readonly MotifKind[];
  readonly inkCommitted: number;
  readonly inkReserved: number;
}

export interface SpellRecipe {
  readonly components: readonly ForceComponent[];
  readonly inkCommitted: number;
  readonly inkReserved: number;
  readonly summary: RecipeSummary;
}

export interface StrokeComposition {
  readonly canonical: StrokeFeatures;
  readonly motifs: readonly MotifOccurrence[];
  readonly recipe: SpellRecipe;
}

export interface ComposeStrokeOptions {
  readonly assist: AssistLevel;
}

const DEFAULT_OPTIONS: ComposeStrokeOptions = { assist: 'standard' };

/** Public client/server entry point. Assist can never alter the recipe. */
export function composeStroke(
  raw: readonly Vec2[],
  options: ComposeStrokeOptions = DEFAULT_OPTIONS,
): StrokeComposition {
  const classification = classifyStroke(raw, { assist: options.assist });
  const canonical = classification.canonical;
  const motifs = segmentMotifs(canonical);
  return { canonical, motifs, recipe: composeRecipe(canonical, motifs) };
}

export function composeRecipe(
  canonical: StrokeFeatures,
  motifs: readonly MotifOccurrence[],
): SpellRecipe {
  const inkCommitted = clamp(inkCost(canonical.arcLength), 0, CONFIG.ink.total);
  const inkReserved = CONFIG.ink.total - inkCommitted;
  const weights = motifs.map((motif) => {
    const config = CONFIG.composition.motif[motif.kind];
    return Math.max(motif.arcLength, 1e-6) * config.strengthWeight;
  });
  const totalWeight = Math.max(weights.reduce((sum, weight) => sum + weight, 0), 1e-9);
  const strengthBudget = inkCommitted * CONFIG.composition.strengthPerInk;

  const components = motifs.map((motif, index): ForceComponent => {
    const config = CONFIG.composition.motif[motif.kind];
    return {
      kind: motif.kind,
      origin: motif.center,
      direction: motif.direction,
      radius: clamp(
        motif.size * config.radiusScale,
        CONFIG.composition.minRadius,
        CONFIG.composition.maxRadius,
      ),
      mass: clamp(
        motif.size * config.massScale,
        CONFIG.composition.minMass,
        CONFIG.composition.maxMass,
      ),
      strength: Math.min(
        strengthBudget * (weights[index]! / totalWeight),
        config.maxStrength,
      ),
      chirality: motif.chirality,
      activateAtMs: Math.round(motif.from * CONFIG.composition.spreadMs),
      lifetimeMs: config.lifetimeMs,
    };
  });

  const summary: RecipeSummary = {
    heading: dominantHeading(motifs),
    force: forceBand(inkCommitted, motifs),
    shape: motifs.map((motif) => motif.kind),
    inkCommitted,
    inkReserved,
  };
  return { components, inkCommitted, inkReserved, summary };
}

function dominantHeading(motifs: readonly MotifOccurrence[]): Heading {
  let x = 0;
  let y = 0;
  for (const motif of motifs) {
    if (motif.kind !== 'thrust' && motif.kind !== 'bounce' && motif.kind !== 'wisp') continue;
    const weight = Math.max(motif.arcLength, 1e-6);
    x += motif.direction.x * weight;
    y += motif.direction.y * weight;
  }
  const vector = { x, y };
  if (length(vector) < CONFIG.composition.headingDeadZone) return 'none';
  const direction = normalize(vector);
  const index = ((Math.round(Math.atan2(direction.y, direction.x) / (Math.PI / 4)) % 8) + 8) % 8;
  return (['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'] as const)[index]!;
}

/**
 * The coarse force readout. Derived from committed Ink, not from summed
 * component strength.
 *
 * This is the fix for test property 8 — the readout must not flip under a
 * shaky hand, or the whole "informed commitment" premise collapses into a coin
 * flip (see DESIGN-SPELL-COMPOSITION.md §1). Summed strength jitters by ~1%
 * because per-motif caps clip it, and a zigzag's strength landed exactly on a
 * band edge. Committed Ink is `inkCost(arcLength)` — deterministic and stable —
 * and for any readable stroke it is proportional to strength anyway, so this is
 * still "kekuatan kasar", just measured off the stable quantity.
 *
 * A wisp-only recipe is pinned to Light regardless of Ink: an unreadable
 * scribble that burns the whole meter must still read weak, because its actual
 * resolved strength is capped low. That is the one place committed Ink and
 * delivered force genuinely diverge, and it is handled explicitly.
 */
function forceBand(inkCommitted: number, motifs: readonly MotifOccurrence[]): ForceBand {
  if (motifs.length > 0 && motifs.every((motif) => motif.kind === 'wisp')) return 'ringan';
  const fraction = inkCommitted / CONFIG.ink.total;
  if (fraction >= CONFIG.composition.forceHeavyFraction) return 'berat';
  if (fraction >= CONFIG.composition.forceMediumFraction) return 'sedang';
  return 'ringan';
}
