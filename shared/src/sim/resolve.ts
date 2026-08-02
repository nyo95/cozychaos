import { CONFIG } from '../config/index.js';
import type { PlayerSlot } from '../match/state.js';
import type { HazardSpikeConfig } from '../config/types.js';
import type { RuneBodyBlueprint } from '../spells/runeBody.js';
import type { Vec2 } from '../spells/geometry.js';
import {
  createResolveWorld,
  isSettled,
  spawnPosition,
  stepWorld,
  worldSnapshot,
  type Snapshot,
} from './world.js';

export interface ResolveInput {
  readonly positions: readonly [Vec2, Vec2];
  readonly wobble: readonly [number, number];
  readonly runes: readonly [RuneBodyBlueprint, RuneBodyBlueprint];
  readonly wind: Vec2;
  readonly obstacles: readonly HazardSpikeConfig[];
  readonly lowGravity?: boolean;
}

export interface ResolveResult {
  /** One snapshot per emitted frame, at `CONFIG.simulation.snapshotHz`. */
  readonly frames: readonly Snapshot[];
  /** Knock-outs in the order they happened, for the scoring state machine. */
  readonly knockouts: readonly { readonly slot: PlayerSlot; readonly atMs: number }[];
  /** Final body positions, carried into the next Turn (A-01). */
  readonly endPositions: readonly [Vec2, Vec2];
  /** Final Wobble, carried into the next Turn. */
  readonly endWobble: readonly [number, number];
  readonly durationMs: number;
}

/**
 * Runs a full Resolve deterministically and returns the frame stream.
 *
 * The server calls this once per Turn and streams `frames` to both clients;
 * because the whole thing is a pure function of `ResolveInput`, both clients
 * receive byte-identical frames and a replay can be rebuilt from the input
 * alone (PRD §15). It also runs headlessly in tests, which is how the
 * no-desync guarantee is checked without two real browsers.
 */
export function runResolve(input: ResolveInput): ResolveResult {
  const world = createResolveWorld(input);
  const stepMs = CONFIG.simulation.fixedTimestepMs;
  const maxSteps = Math.ceil(CONFIG.phases.resolveMaxMs / stepMs);
  const stepsPerSnapshot = Math.max(
    1,
    Math.round(1000 / CONFIG.simulation.snapshotHz / stepMs),
  );

  const frames: Snapshot[] = [worldSnapshot(world)];
  let settledFor = 0;

  for (let step = 0; step < maxSteps; step++) {
    stepWorld(world);

    if (step % stepsPerSnapshot === 0) frames.push(worldSnapshot(world));

    // End early once things have settled for the configured window, but always
    // let any in-flight knock-out resolve first.
    if (isSettled(world)) {
      settledFor += 1;
      if (settledFor >= CONFIG.simulation.settleFrames) break;
    } else {
      settledFor = 0;
    }
    if (world.bodies.every((body) => !body.alive)) break;
  }

  const last = worldSnapshot(world);
  if (frames[frames.length - 1] !== last) frames.push(last);

  return {
    frames,
    knockouts: [...world.knockouts],
    endPositions: [
      { x: world.bodies[0].x, y: world.bodies[0].y },
      { x: world.bodies[1].x, y: world.bodies[1].y },
    ],
    endWobble: [world.bodies[0].wobble, world.bodies[1].wobble],
    durationMs: world.timeMs,
  };
}

export { spawnPosition };
