import { CONFIG } from '../config/index.js';
import { createRandom, deriveSeed } from '../match/random.js';
import type { HazardSpikeConfig } from '../config/types.js';
import type { Vec2 } from '../spells/geometry.js';

export interface TurnEnvironment {
  readonly wind: Vec2;
  /** Static, indestructible triangle colliders for this whole Round. */
  readonly obstacles: readonly HazardSpikeConfig[];
}

/**
 * Pure, seeded environment selection. Wind and obstacles stay stable per Round.
 *
 * M-02 — `wind.x` is no longer "push everything right by this much". It is the
 * signed strength of a radial field: positive blows outward from the centre,
 * negative draws inward. `windAccelerationX` turns it into a force at a point.
 */
export function createTurnEnvironment(seed: number, round: number): TurnEnvironment {
  const windRng = createRandom(deriveSeed(seed, `wind:${round}`));
  const levels = CONFIG.wind.accelerationLevels;
  const magnitude = levels[Math.min(levels.length - 1, Math.floor(windRng.next() * levels.length))] ?? 0;
  // Sign now chooses outward vs inward rather than right vs left. Both are
  // symmetric, so neither slot is favoured by the draw.
  const sign = windRng.next() < 0.5 ? -1 : 1;
  const x = magnitude * sign;
  return {
    wind: { x, y: Math.abs(x) * CONFIG.wind.verticalLiftFraction },
    obstacles: createObstacles(seed, round),
  };
}

/**
 * Horizontal wind acceleration at a point.
 *
 * Odd in `x` by construction — `f(-x) = -f(x)` — which is the whole reason the
 * field is fair: mirroring the arena negates every horizontal force, so
 * mirrored play produces mirrored outcomes. `sim/world.test.ts` locks that as
 * an invariant; if this stops being odd, that test is the one that fails.
 */
export function windAccelerationX(wind: Vec2, x: number): number {
  const span = CONFIG.wind.centreSpanX;
  if (span <= 0) return wind.x >= 0 ? wind.x : -wind.x;
  const ramp = Math.max(-1, Math.min(1, x / span));
  return wind.x * ramp;
}

function createObstacles(seed: number, round: number): readonly HazardSpikeConfig[] {
  const rng = createRandom(deriveSeed(seed, `obstacles:${round}`));
  const generation = CONFIG.hazards.generation;
  const countRange = generation.maxCount - generation.minCount + 1;
  const count = generation.minCount + Math.floor(rng.next() * countRange);
  const [xMin, xMax] = generation.xRange;
  const slotWidth = (xMax - xMin) / count;
  const [widthMin, widthMax] = generation.halfWidthRange;
  const obstacles: HazardSpikeConfig[] = [];
  const startsWithStalagmite = rng.next() < 0.5;

  for (let index = 0; index < count; index += 1) {
    const jitter = (rng.next() - 0.5) * generation.slotJitterFraction;
    const x = xMin + slotWidth * (index + 0.5 + jitter);
    let kind: HazardSpikeConfig['kind'] =
      (index % 2 === 0) === startsWithStalagmite ? 'stalagmite' : 'stalactite';
    if (
      kind === 'stalagmite' &&
      (Math.abs(x - CONFIG.player.spawnX) < generation.spawnClearance ||
        Math.abs(x + CONFIG.player.spawnX) < generation.spawnClearance)
    ) {
      kind = 'stalactite';
    }
    const halfWidth = lerp(widthMin, widthMax, rng.next());
    const tipYRange = kind === 'stalagmite'
      ? generation.stalagmiteTipYRange
      : generation.stalactiteTipYRange;
    const baseY = kind === 'stalagmite' ? CONFIG.arena.groundY : generation.ceilingY;
    obstacles.push(Object.freeze({
      kind,
      base: Object.freeze({ x, y: baseY }),
      tip: Object.freeze({ x, y: lerp(tipYRange[0], tipYRange[1], rng.next()) }),
      halfWidth,
    }));
  }
  return Object.freeze(obstacles);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
