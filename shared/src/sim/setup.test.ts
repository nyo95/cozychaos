import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import {
  NEUTRAL_INTENT,
  SETUP_BOUND,
  SETUP_GROUND_Y,
  createSetupBody,
  maxSetupTravel,
  stepSetupMovement,
  type MoveIntent,
  type SetupBody,
} from './setup.js';
import { spawnPosition } from './world.js';

const HOLD_RIGHT: MoveIntent = { direction: 1, jump: false };
const HOLD_LEFT: MoveIntent = { direction: -1, jump: false };
const JUMP: MoveIntent = { direction: 0, jump: true };

function pair(): [SetupBody, SetupBody] {
  return [createSetupBody(0, spawnPosition(0)), createSetupBody(1, spawnPosition(1))];
}

/** Runs a whole Setup phase at the server's real 30 Hz tick. */
function runSetup(intents: readonly [MoveIntent, MoveIntent], ms = CONFIG.phases.setupMs): [SetupBody, SetupBody] {
  const bodies = pair();
  const step = 1 / 30;
  for (let t = 0; t < ms / 1000 - 1e-9; t += step) {
    stepSetupMovement(bodies, intents, step);
  }
  return bodies;
}

describe('setup movement', () => {
  it('does nothing on a neutral intent', () => {
    const bodies = runSetup([NEUTRAL_INTENT, NEUTRAL_INTENT]);
    expect(bodies[0].x).toBeCloseTo(spawnPosition(0).x, 10);
    expect(bodies[1].x).toBeCloseTo(spawnPosition(1).x, 10);
    expect(bodies[0].y).toBe(SETUP_GROUND_Y);
  });

  it('rests at the same height the Resolve world uses', () => {
    // A mismatch here would teleport both wizards at every phase handover.
    expect(SETUP_GROUND_Y).toBe(spawnPosition(0).y);
  });

  it('moves at the configured speed, not a renderer-local constant', () => {
    // One second of held input, delivered as real 30 Hz ticks. Handing the
    // integrator a 1-second delta in a single call would hit the delta clamp,
    // which is the behaviour asserted separately below.
    const bodies = pair();
    for (let i = 0; i < 30; i++) stepSetupMovement(bodies, [HOLD_RIGHT, NEUTRAL_INTENT], 1 / 30);
    expect(bodies[0].x - spawnPosition(0).x).toBeCloseTo(CONFIG.movement.speed, 10);
  });

  it('is mirror-symmetric between slots', () => {
    // The one property the Sesi 19 audit confirmed the simulator already had.
    // Movement must not be the thing that breaks it.
    const bodies = runSetup([HOLD_RIGHT, HOLD_LEFT]);
    expect(bodies[0].x).toBeCloseTo(-bodies[1].x, 10);
  });

  it('clamps to the island instead of letting a player walk off', () => {
    // PRD §5.2: knock-out is something that happens to you, never self-inflicted.
    const bodies = runSetup([HOLD_RIGHT, HOLD_RIGHT], 20_000);
    expect(bodies[0].x).toBeLessThanOrEqual(SETUP_BOUND + 1e-9);
    expect(bodies[1].x).toBeLessThanOrEqual(SETUP_BOUND + 1e-9);
    expect(SETUP_BOUND).toBeLessThan(CONFIG.arena.halfWidth);
  });

  it('spends exactly the configured number of jumps', () => {
    const bodies = pair();
    for (let i = 0; i < 5; i++) stepSetupMovement(bodies, [JUMP, NEUTRAL_INTENT], 1 / 30);
    expect(bodies[0].jumpsLeft).toBe(0);
    expect(CONFIG.movement.jumpsPerSetup).toBe(1);
  });

  it('returns a jumping wizard to the ground', () => {
    const bodies = pair();
    stepSetupMovement(bodies, [JUMP, NEUTRAL_INTENT], 1 / 30);
    expect(bodies[0].y).toBeGreaterThan(SETUP_GROUND_Y);
    for (let i = 0; i < 120; i++) stepSetupMovement(bodies, [NEUTRAL_INTENT, NEUTRAL_INTENT], 1 / 30);
    expect(bodies[0].y).toBe(SETUP_GROUND_Y);
    expect(bodies[0].vy).toBe(0);
  });

  it('cannot jump again in mid-air', () => {
    const bodies = pair();
    stepSetupMovement(bodies, [JUMP, NEUTRAL_INTENT], 1 / 30);
    const apexAttempt = bodies[0].vy;
    stepSetupMovement(bodies, [JUMP, NEUTRAL_INTENT], 1 / 30);
    expect(bodies[0].vy).toBeLessThan(apexAttempt);
  });

  it('keeps wizards from overlapping, and does so symmetrically', () => {
    const bodies = pair();
    for (let i = 0; i < 200; i++) {
      stepSetupMovement(bodies, [HOLD_RIGHT, HOLD_LEFT], 1 / 30);
    }
    expect(bodies[1].x - bodies[0].x).toBeGreaterThanOrEqual(CONFIG.player.radius * 2 - 1e-9);
    // Neither slot wins the shoving match.
    expect(bodies[0].x).toBeCloseTo(-bodies[1].x, 10);
  });

  it('is deterministic for the same intents and timestep', () => {
    const a = runSetup([HOLD_RIGHT, JUMP]);
    const b = runSetup([HOLD_RIGHT, JUMP]);
    expect(a[0].x).toBe(b[0].x);
    expect(a[1].y).toBe(b[1].y);
  });

  it('gives the same result for one big delta as for many small ones', () => {
    // A suspended serverless function can hand us a multi-second delta (M-05).
    // Sub-stepping means that must not change the outcome. An earlier version
    // clamped the delta instead, which stopped the teleport but threw the rest
    // of the movement away.
    const fine = runSetup([HOLD_RIGHT, NEUTRAL_INTENT]);
    const coarse = pair();
    stepSetupMovement(coarse, [HOLD_RIGHT, NEUTRAL_INTENT], CONFIG.phases.setupMs / 1000);
    expect(coarse[0].x).toBeCloseTo(fine[0].x, 6);
  });

  it('does not let a walking wizard shove a stationary one', () => {
    // Positioning is your lever on your own position. One Setup is long enough
    // to cross the arena, so a transferable shove would be a free body-check
    // every Turn with no counterplay.
    const bodies = pair();
    const idleStart = bodies[1].x;
    for (let i = 0; i < 300; i++) stepSetupMovement(bodies, [HOLD_RIGHT, NEUTRAL_INTENT], 1 / 30);
    expect(bodies[1].x).toBeCloseTo(idleStart, 6);
    expect(bodies[1].x - bodies[0].x).toBeGreaterThanOrEqual(CONFIG.player.radius * 2 - 1e-6);
  });

  it('documents that one Setup is long enough to cross the arena', () => {
    // Not an assertion that this is correct — an assertion that it is known.
    // 0.55 u/s x 3 s = 1.65 units against a 1.10-unit gap between spawns.
    // Flagged for tuning in changelog Sesi 21; see maxSetupTravel().
    const gap = CONFIG.player.spawnX * 2;
    expect(maxSetupTravel()).toBeGreaterThan(gap);
  });
});
