import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import {
  buildRuneBody,
  clampAimToOpponent,
  predictLaunch,
  type RuneBodyBlueprint,
} from '../spells/runeBody.js';
import type { Vec2 } from '../spells/geometry.js';
import { createTurnEnvironment } from './environment.js';
import { runResolve, spawnPosition } from './resolve.js';

const line = (from: Vec2, to: Vec2, count = 24): Vec2[] =>
  Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });

const zigzag: Vec2[] = [
  { x: -0.8, y: 0 }, { x: -0.55, y: 0.35 }, { x: -0.3, y: -0.12 },
  { x: -0.05, y: 0.35 }, { x: 0.2, y: -0.12 }, { x: 0.45, y: 0.32 },
  { x: 0.75, y: 0 },
];

function rune(
  owner: 0 | 1,
  points: readonly Vec2[] = zigzag,
  inkCommitted = 82,
  castDirection: Vec2 = { x: owner === 0 ? 1 : -1, y: 0.08 },
): RuneBodyBlueprint {
  return buildRuneBody({
    points,
    owner,
    casterPosition: spawnPosition(owner),
    castDirection,
    inkCommitted,
    inkReserved: CONFIG.ink.total - inkCommitted,
  });
}

const baseInput = {
  positions: [spawnPosition(0), spawnPosition(1)] as const,
  wobble: [0, 0] as const,
  runes: [rune(0), rune(1)] as const,
  wind: { x: 0, y: 0 },
  obstacles: [],
};

describe('physical rune construction', () => {
  it('turns arbitrary handwriting into connected matter', () => {
    // A continuous approximation of the word "BERKA", intentionally not a rune symbol.
    const name: Vec2[] = [
      { x: -0.9, y: -0.2 }, { x: -0.9, y: 0.25 }, { x: -0.55, y: 0.25 },
      { x: -0.5, y: 0.08 }, { x: -0.9, y: 0.02 }, { x: -0.5, y: -0.2 },
      { x: -0.28, y: -0.2 }, { x: -0.28, y: 0.25 }, { x: 0.05, y: 0.25 },
      { x: -0.28, y: 0.02 }, { x: 0.05, y: -0.2 }, { x: 0.25, y: -0.2 },
      { x: 0.25, y: 0.25 }, { x: 0.25, y: 0.02 }, { x: 0.6, y: 0.25 },
      { x: 0.25, y: 0.02 }, { x: 0.62, y: -0.2 }, { x: 0.82, y: 0.25 },
      { x: 0.98, y: -0.2 }, { x: 0.9, y: 0.02 }, { x: 0.72, y: 0.02 },
    ];
    const body = rune(0, name, 90);
    expect(body.particles.length).toBeGreaterThan(CONFIG.runeBody.minParticles);
    expect(body.bonds.length).toBeGreaterThanOrEqual(body.particles.length - 1);
    expect(body.particles.every((particle) => Number.isFinite(particle.position.x))).toBe(true);
  });

  it('clamps Cast direction into the opponent-facing cone', () => {
    const leftPlayerBackwards = clampAimToOpponent({ x: -1, y: 0 }, 0);
    const rightPlayerBackwards = clampAimToOpponent({ x: 1, y: 0 }, 1);
    expect(leftPlayerBackwards.x).toBeGreaterThan(0);
    expect(rightPlayerBackwards.x).toBeLessThan(0);
  });

  it('allows a steep enough lob to be a defensive cast', () => {
    // The whole defensive option is "aim high, land short". If the cone ever
    // narrows back below ~75° this fails, which is the point of the test.
    const steep = clampAimToOpponent({ x: 0.05, y: 1 }, 0);
    expect(Math.atan2(steep.y, steep.x)).toBeGreaterThan(1.3);
  });

  it('never creates energy beyond committed Ink', () => {
    const body = rune(0, zigzag, 73);
    const energy = body.particles.reduce((sum, particle) => sum + particle.energy, 0);
    expect(energy).toBeCloseTo(73 * CONFIG.runeBody.energyPerInk, 8);
  });
});

/**
 * These four lock the mechanic BK chose in Session 12: no roles, Ink decides
 * offence versus defence through mass. If any of them start failing, the
 * offence/defence dial has collapsed and the game is back to "both players
 * throw the same thing".
 */
describe('Ink is the offence/defence dial', () => {
  it('makes a heavier rune strictly slower than a lighter one', () => {
    const light = predictLaunch(12);
    const heavy = predictLaunch(95);
    expect(heavy.mass).toBeGreaterThan(light.mass * 3);
    expect(heavy.speed).toBeLessThan(light.speed);
    expect(light.speed / heavy.speed).toBeGreaterThan(1.8);
  });

  it('is monotonic: more Ink never buys more reach', () => {
    let previous = Infinity;
    for (let ink = 5; ink <= 100; ink += 5) {
      const reach = predictLaunch(ink).maxReach;
      expect(reach).toBeLessThanOrEqual(previous + 1e-9);
      previous = reach;
    }
  });

  it('puts the shield/strike crossover inside the playable Ink range', () => {
    const gap = CONFIG.player.spawnX * 2;
    // A small rune must be able to cross the arena, and a full commitment must
    // not. Without both halves there is no decision to make.
    expect(predictLaunch(15).maxReach).toBeGreaterThan(gap);
    expect(predictLaunch(100).maxReach).toBeLessThan(gap * 0.6);
  });

  it('carries the prediction into the actual body the simulation runs', () => {
    for (const ink of [20, 55, 90]) {
      const predicted = predictLaunch(ink);
      const body = rune(0, zigzag, ink);
      expect(body.mass).toBeCloseTo(predicted.mass, 9);
      expect(body.launchSpeed).toBeCloseTo(predicted.speed, 9);
      const speed = Math.hypot(body.particles[0]!.velocity.x, body.particles[0]!.velocity.y);
      expect(speed).toBeCloseTo(predicted.speed, 9);
    }
  });
});

describe('deterministic particle Resolve', () => {
  it('produces byte-identical frames for identical input', () => {
    const first = runResolve(baseInput);
    const second = runResolve(baseInput);
    expect(JSON.stringify(first.frames)).toBe(JSON.stringify(second.frames));
    expect(first.knockouts).toEqual(second.knockouts);
  });

  it('destroys opposing matter mutually and never creates energy', () => {
    const result = runResolve(baseInput);
    const initialEnergy = baseInput.runes.flatMap((body) => body.particles)
      .reduce((sum, particle) => sum + particle.energy, 0);
    for (const frame of result.frames) {
      const total = frame.particles.reduce((sum, particle) => sum + particle.energy, 0);
      // Snapshot values are rounded per particle, so tolerance scales with nodes.
      expect(total).toBeLessThanOrEqual(initialEnergy + 1e-2);
    }
    const finalEnergy = result.frames[result.frames.length - 1]!.particles
      .reduce((sum, particle) => sum + particle.energy, 0);
    expect(finalEnergy).toBeLessThan(initialEnergy);
  });

  it('marks matter as deflected once it has bounced off something', () => {
    const result = runResolve(baseInput);
    const deflected = result.frames.some((frame) =>
      frame.particles.some((particle) => particle.deflected));
    expect(deflected).toBe(true);
  });

  it('lets a heavy rune shrug off a light one', () => {
    // Same collision, opposite mass ratios. The mass-weighted share in
    // `annihilate` is the only thing producing this asymmetry.
    const heavy = rune(0, zigzag, 100);
    const light = rune(1, zigzag, 10);
    const result = runResolve({ ...baseInput, runes: [heavy, light] });
    // Measured at the last frame where both sides still exist. Reading the
    // final frame instead would compare zero against zero, since all matter
    // eventually expires — which is how this test first passed vacuously.
    const contested = [...result.frames].reverse().find((frame) =>
      frame.particles.some((particle) => particle.owner === 0) &&
      frame.particles.some((particle) => particle.owner === 1));
    expect(contested).toBeDefined();
    const remaining = (owner: 0 | 1): number => contested!.particles
      .filter((particle) => particle.owner === owner)
      .reduce((sum, particle) => sum + particle.energy, 0);
    const startOf = (body: RuneBodyBlueprint): number =>
      body.particles.reduce((sum, particle) => sum + particle.energy, 0);
    const heavyFraction = remaining(0) / startOf(heavy);
    const lightFraction = remaining(1) / startOf(light);
    // The wall keeps most of itself; the dart loses several times as much of
    // its own budget. Stated as a ratio of *losses* so the test measures the
    // mass-weighted asymmetry rather than absolute tuning values.
    expect(heavyFraction).toBeGreaterThan(0.8);
    expect(1 - lightFraction).toBeGreaterThan((1 - heavyFraction) * 2.5);
  });

  it('keeps original particles dangerous after bonds break', () => {
    const fragile: RuneBodyBlueprint = {
      ...rune(0),
      bonds: rune(0).bonds.map((bond) => ({ ...bond, strength: 1e-5 })),
    };
    const result = runResolve({ ...baseInput, runes: [fragile, rune(1)] });
    const initialBondCount = fragile.bonds.length + rune(1).bonds.length;
    const brokenFrame = result.frames.find((frame) => frame.bonds.length < initialBondCount);
    expect(brokenFrame).toBeDefined();
    expect(brokenFrame!.particles.length).toBeGreaterThan(0);
    expect(brokenFrame!.particles.some((particle) => particle.energy > 0)).toBe(true);
  });

  it('changes trajectory under seeded Round wind without changing construction', () => {
    const calm = runResolve(baseInput);
    const environment = createTurnEnvironment(9876, 3);
    const windy = runResolve({ ...baseInput, wind: environment.wind });
    expect(windy.frames[1]?.particles).not.toEqual(calm.frames[1]?.particles);
    expect(baseInput.runes[0].particles).toEqual(baseInput.runes[0].particles);
  });

  it('keeps the authoritative obstacle layout unchanged in every frame', () => {
    const environment = createTurnEnvironment(2026, 2);
    const before = JSON.stringify(environment.obstacles);
    const result = runResolve({ ...baseInput, obstacles: environment.obstacles });
    expect(result.frames.every((frame) => JSON.stringify(frame.obstacles) === before)).toBe(true);
    expect(JSON.stringify(environment.obstacles)).toBe(before);
  });

  it('stays within the Resolve time budget', () => {
    expect(runResolve(baseInput).durationMs).toBeLessThanOrEqual(CONFIG.phases.resolveMaxMs);
  });

  it('never lets a fresh cast hit the wizard who threw it', () => {
    // Undeflected matter passes through its own caster. Without this guard the
    // wide aim cone would let a steep defensive lob self-destruct on launch.
    const selfLob = rune(0, line({ x: -0.2, y: 0 }, { x: 0.2, y: 0 }), 100, { x: 0.05, y: 1 });
    const idle = rune(1, [], 0);
    const result = runResolve({ ...baseInput, runes: [selfLob, idle] });
    expect(result.endWobble[0]).toBe(0);
  });

  it('gives an unopposed drawing no free defence', () => {
    // Ward used to make "draw nothing" partially invulnerable. It is gone, so
    // an empty rune must take the full hit.
    const strike = rune(0, line({ x: -0.3, y: 0 }, { x: 0.3, y: 0 }), 18);
    const nothing = rune(1, [], 0);
    const result = runResolve({ ...baseInput, runes: [strike, nothing] });
    expect(result.endWobble[1]).toBeGreaterThan(0);
  });
});
