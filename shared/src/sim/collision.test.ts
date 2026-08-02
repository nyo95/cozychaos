import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import type { HazardSpikeConfig } from '../config/types.js';
import {
  bounceMovingCircleOffSpike,
  circleTriangleContact,
  spikeTriangle,
} from './collision.js';
import { createTurnEnvironment } from './environment.js';

const spike: HazardSpikeConfig = {
  kind: 'stalagmite',
  base: { x: 0, y: 0 },
  tip: { x: 0, y: 0.4 },
  halfWidth: 0.2,
};

describe('static cave obstacle collision', () => {
  it('collides with the full triangular face, not only a circle around the tip', () => {
    const contact = circleTriangleContact(
      { x: -0.17, y: 0.1 },
      CONFIG.runeBody.particleRadius,
      spikeTriangle(spike),
    );
    expect(contact).not.toBeNull();
    expect(Math.hypot(-0.17 - spike.tip.x, 0.1 - spike.tip.y)).toBeGreaterThan(0.3);
  });

  it('reflects a spell particle from a triangular face', () => {
    const particle = { x: -0.17, y: 0.1, vx: 1, vy: 0 };
    const collision = bounceMovingCircleOffSpike(
      particle,
      { x: -0.2, y: 0.1 },
      CONFIG.runeBody.particleRadius,
      CONFIG.hazards.spellRestitution,
      spike,
    );
    expect(collision?.bounced).toBe(true);
    expect(particle.vx).toBeLessThan(0);
  });

  it('prevents a fast particle from tunnelling through a whole obstacle', () => {
    const particle = { x: 0.4, y: 0.1, vx: 20, vy: 0 };
    const collision = bounceMovingCircleOffSpike(
      particle,
      { x: -0.4, y: 0.1 },
      CONFIG.runeBody.particleRadius,
      CONFIG.hazards.spellRestitution,
      spike,
    );
    expect(collision?.bounced).toBe(true);
    expect(particle.vx).toBeLessThan(0);
    expect(particle.x).toBeLessThan(0);
  });

  it('never mutates or damages the obstacle when resolving a bounce', () => {
    const before = JSON.stringify(spike);
    const particle = { x: -0.17, y: 0.1, vx: 1, vy: 0 };
    bounceMovingCircleOffSpike(
      particle,
      { x: -0.2, y: 0.1 },
      CONFIG.runeBody.particleRadius,
      CONFIG.hazards.spellRestitution,
      spike,
    );
    expect(JSON.stringify(spike)).toBe(before);
  });
});

describe('seeded obstacle layouts', () => {
  it('is identical for the same match seed and Round', () => {
    expect(createTurnEnvironment(12345, 2).obstacles)
      .toEqual(createTurnEnvironment(12345, 2).obstacles);
  });

  it('changes across seeds and Rounds while respecting tuning bounds', () => {
    const first = createTurnEnvironment(12345, 2).obstacles;
    const nextRound = createTurnEnvironment(12345, 3).obstacles;
    const otherMatch = createTurnEnvironment(54321, 2).obstacles;
    expect(nextRound).not.toEqual(first);
    expect(otherMatch).not.toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(CONFIG.hazards.generation.minCount);
    expect(first.length).toBeLessThanOrEqual(CONFIG.hazards.generation.maxCount);
    for (const obstacle of first) {
      expect(obstacle.base.x).toBeGreaterThanOrEqual(CONFIG.hazards.generation.xRange[0]);
      expect(obstacle.base.x).toBeLessThanOrEqual(CONFIG.hazards.generation.xRange[1]);
      if (obstacle.kind === 'stalagmite') {
        expect(Math.abs(obstacle.base.x - CONFIG.player.spawnX))
          .toBeGreaterThanOrEqual(CONFIG.hazards.generation.spawnClearance);
        expect(Math.abs(obstacle.base.x + CONFIG.player.spawnX))
          .toBeGreaterThanOrEqual(CONFIG.hazards.generation.spawnClearance);
      }
    }
  });
});
