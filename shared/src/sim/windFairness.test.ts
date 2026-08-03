import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import { buildRuneBody } from '../spells/runeBody.js';
import { composeStroke } from '../spells/composition.js';
import { runResolve } from './resolve.js';
import { spawnPosition } from './world.js';
import { windAccelerationX } from './environment.js';

/**
 * M-02 — the locked fairness invariant.
 *
 * Before this, wind was a global horizontal shove, so a rightward wind helped
 * whoever cast rightward. Mirrored play produced a one-sided knock-out at
 * 0.0 vs 41.3 Wobble: the Round was decided before either player drew, and no
 * amount of skill answers "the wind was against you today".
 *
 * The property tested here is stronger and easier to trust than hand-built
 * "mirrored play": reflect the entire world about x = 0, swap the two seats,
 * and every outcome must reflect and swap with it. If that holds, neither seat
 * can be favoured — the seats are related by exactly that reflection.
 *
 * If a future change breaks this, the wind field has almost certainly stopped
 * being an odd function of x.
 */

const strokeFrom = (x0: number, y0: number, x1: number, y1: number) =>
  Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  });

type Rune = ReturnType<typeof buildRuneBody>;

function rune(owner: 0 | 1, casterPosition: { x: number; y: number }, castDirection: { x: number; y: number }, points: { x: number; y: number }[]): Rune {
  const recipe = composeStroke(points).recipe;
  return buildRuneBody({
    points,
    owner,
    casterPosition,
    castDirection,
    inkCommitted: recipe.inkCommitted,
    inkReserved: recipe.inkReserved,
  });
}

function mirrorRune(blueprint: Rune, newOwner: 0 | 1): Rune {
  return {
    ...blueprint,
    owner: newOwner,
    direction: { x: -blueprint.direction.x, y: blueprint.direction.y },
    particles: blueprint.particles.map((p) => ({
      ...p,
      position: { x: -p.position.x, y: p.position.y },
      velocity: { x: -p.velocity.x, y: p.velocity.y },
    })),
  } as Rune;
}

const OBSTACLES = [
  { kind: 'stalagmite' as const, base: { x: 0.22, y: 0 }, tip: { x: 0.22, y: 0.3 }, halfWidth: 0.12 },
  { kind: 'stalactite' as const, base: { x: -0.4, y: 1.3 }, tip: { x: -0.4, y: 0.9 }, halfWidth: 0.13 },
];

/** Deliberately lopsided — a symmetric scenario would pass trivially. */
function scenario() {
  const rival = { x: 0.42, y: spawnPosition(1).y };
  return {
    positions: [spawnPosition(0), rival] as [{ x: number; y: number }, { x: number; y: number }],
    wobble: [12, 31] as [number, number],
    runes: [
      rune(0, spawnPosition(0), { x: 1, y: 0.4 }, strokeFrom(-0.3, 0.3, 0.55, 0.42)),
      rune(1, rival, { x: -1, y: 0.2 }, strokeFrom(0.2, 0.5, -0.4, 0.28)),
    ] as [Rune, Rune],
    obstacles: OBSTACLES,
  };
}

function mirrored(base: ReturnType<typeof scenario>) {
  return {
    positions: [
      { x: -base.positions[1].x, y: base.positions[1].y },
      { x: -base.positions[0].x, y: base.positions[0].y },
    ] as [{ x: number; y: number }, { x: number; y: number }],
    wobble: [base.wobble[1], base.wobble[0]] as [number, number],
    runes: [mirrorRune(base.runes[1], 0), mirrorRune(base.runes[0], 1)] as [Rune, Rune],
    obstacles: OBSTACLES.map((o) => ({
      ...o,
      base: { x: -o.base.x, y: o.base.y },
      tip: { x: -o.tip.x, y: o.tip.y },
    })),
  };
}

const WIND_SETTINGS = CONFIG.wind.accelerationLevels.flatMap((magnitude) =>
  magnitude === 0 ? [0] : [magnitude, -magnitude],
);

describe('wind is a symmetric field, not a global shove (M-02)', () => {
  it('is an odd function of x, which is what makes it fair', () => {
    for (const x of [-0.9, -0.5, -0.2, 0, 0.2, 0.5, 0.9]) {
      const here = windAccelerationX({ x: 0.42, y: 0 }, x);
      const there = windAccelerationX({ x: 0.42, y: 0 }, -x);
      expect(here + there).toBeCloseTo(0, 12);
    }
  });

  it('is calm at the centre and ramps to full strength', () => {
    expect(windAccelerationX({ x: 0.42, y: 0 }, 0)).toBe(0);
    expect(windAccelerationX({ x: 0.42, y: 0 }, CONFIG.wind.centreSpanX)).toBeCloseTo(0.42, 10);
    // Saturates rather than growing without bound toward the island edge.
    expect(windAccelerationX({ x: 0.42, y: 0 }, 1)).toBeCloseTo(0.42, 10);
  });

  it.each(WIND_SETTINGS)('mirroring the world mirrors the outcome at wind %p', (signed) => {
    const wind = { x: signed, y: Math.abs(signed) * CONFIG.wind.verticalLiftFraction };
    const a = runResolve({ ...scenario(), wind });
    const b = runResolve({ ...mirrored(scenario()), wind });

    expect(a.endWobble[0]).toBeCloseTo(b.endWobble[1], 9);
    expect(a.endWobble[1]).toBeCloseTo(b.endWobble[0], 9);
    expect(a.endPositions[0].x).toBeCloseTo(-b.endPositions[1].x, 9);
    expect(a.endPositions[1].x).toBeCloseTo(-b.endPositions[0].x, 9);
    expect(a.endPositions[0].y).toBeCloseTo(b.endPositions[1].y, 9);
  });

  it('still changes the outcome, or it would be decorative', () => {
    const totals = WIND_SETTINGS.map((signed) => {
      const wind = { x: signed, y: Math.abs(signed) * CONFIG.wind.verticalLiftFraction };
      const r = runResolve({ ...scenario(), wind });
      return r.endWobble[0] + r.endWobble[1];
    });
    const spread = Math.max(...totals) - Math.min(...totals);
    expect(spread).toBeGreaterThan(5);
  });
});
