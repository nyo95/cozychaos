import { CONFIG } from '../config/index.js';
import { createRandom, deriveSeed } from '../match/random.js';
import type { HazardSpikeConfig } from '../config/types.js';
import type { Vec2 } from '../spells/geometry.js';

export interface TurnEnvironment {
  readonly wind: Vec2;
  /** Static, indestructible triangle colliders for this whole Round. */
  readonly obstacles: readonly HazardSpikeConfig[];
}

/** Pure, seeded environment selection. Wind and obstacles stay stable per Round. */
export function createTurnEnvironment(seed: number, round: number): TurnEnvironment {
  const windRng = createRandom(deriveSeed(seed, `wind:${round}`));
  const levels = CONFIG.wind.accelerationLevels;
  const magnitude = levels[Math.min(levels.length - 1, Math.floor(windRng.next() * levels.length))] ?? 0;
  const sign = windRng.next() < 0.5 ? -1 : 1;
  const x = magnitude * sign;
  return {
    wind: { x, y: Math.abs(x) * CONFIG.wind.verticalLiftFraction },
    obstacles: createObstacles(seed, round),
  };
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
