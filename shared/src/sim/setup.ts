import { CONFIG } from '../config/index.js';
import type { PlayerSlot } from '../match/state.js';
import type { Vec2 } from '../spells/geometry.js';

/**
 * Authoritative movement for the Setup phase (M-04, PRD §9 as amended by A-03).
 *
 * A-03 pays for locking movement during Resolve with a promise of positioning
 * during Setup. Until now that promise was unfunded: `canMove()` existed,
 * `movement.speed` / `jumpImpulse` / `jumpsPerSetup` existed, and nothing read
 * any of them. Setup was three seconds of nothing.
 *
 * ## Why intent, not position
 *
 * The client sends *what the player is holding down* — a direction and whether
 * jump was pressed — and the server integrates it. The client never sends a
 * position and never predicts one, so there is nothing to reconcile and no way
 * to walk somewhere the server disagrees with.
 *
 * The latency cost is honest and bounded: a slow connection loses the round
 * trip at the moment the player presses or releases, not a share of the speed.
 * At 200 ms RTT that is ~6.7% of a 3000 ms Setup. The alternative — trusting a
 * client-sent displacement — makes distance a function of ping, which is the
 * exact failure A-03 and PRD §15 exist to prevent.
 *
 * ## Why a separate integrator from `stepWorld`
 *
 * `stepWorld` simulates rune particles, bonds, and collisions against an
 * obstacle field. None of that exists during Setup, and running it would mean
 * the Setup clock and the Resolve clock share tuning that only one of them
 * needs. This is deliberately the smallest integrator that can be correct:
 * gravity, one impulse, ground contact, and bounds.
 */

/** What a player is holding this instant. Purely an intent — never a position. */
export interface MoveIntent {
  /** -1 left, 0 neither, +1 right. Both keys held reads as 0 at the client. */
  readonly direction: -1 | 0 | 1;
  /** True on the tick the player pressed jump. The server consumes it once. */
  readonly jump: boolean;
}

export const NEUTRAL_INTENT: MoveIntent = Object.freeze({ direction: 0, jump: false });

/** Mutable per-player Setup state. Lives in the room across a Setup phase. */
export interface SetupBody {
  readonly slot: PlayerSlot;
  x: number;
  y: number;
  vy: number;
  /** Counts down from `movement.jumpsPerSetup`; reset when Setup begins. */
  jumpsLeft: number;
}

/**
 * The furthest a wizard may stand from centre.
 *
 * Walking off the island would be a self-inflicted knock-out, and PRD §5.2
 * makes knock-out something that happens *to* you. Clamping is also what keeps
 * `spawnX` meaningful: the duel geometry stays a duel.
 */
export const SETUP_BOUND = CONFIG.arena.halfWidth - CONFIG.player.radius;

/**
 * Resting height of a grounded wizard — the *centre*, so it sits one radius
 * above the surface.
 *
 * Deliberately the same expression as `world.ts:496`. If Setup rested a wizard
 * at a different height than Resolve, every Turn would begin by teleporting
 * both players a radius up or down, and the Resolve integrator would open with
 * a phantom ground impact.
 */
export const SETUP_GROUND_Y = CONFIG.arena.groundY + CONFIG.player.radius;

/** Minimum centre-to-centre gap. Wizards push apart rather than overlap. */
const MIN_SEPARATION = CONFIG.player.radius * 2;

export function createSetupBody(slot: PlayerSlot, position: Vec2): SetupBody {
  return {
    slot,
    x: position.x,
    y: position.y,
    vy: 0,
    jumpsLeft: CONFIG.movement.jumpsPerSetup,
  };
}

/**
 * Advances both wizards by `deltaSeconds`.
 *
 * Deterministic and side-effect free apart from mutating the two bodies, so the
 * server can run it on its tick and a test can run it with a fake clock and get
 * the same answer. Order of operations is fixed — horizontal, then vertical,
 * then contact, then separation — because resolving separation before ground
 * contact lets a wizard be pushed into the floor and pop out next tick.
 */
/**
 * Fixed integration slice.
 *
 * Movement is sub-stepped rather than integrated with whatever delta the caller
 * happens to supply, so a room ticking at 30 Hz and a room resuming from a
 * suspended function with one 3-second delta reach the *same* position. An
 * earlier version simply clamped the delta; that stopped the teleport but
 * silently threw away the rest of the movement, which is worse — the player
 * pressed right for three seconds and the server moved them 0.055 units.
 */
const STEP_SECONDS = 1 / 120;

/** Hard ceiling on work per call, so a pathological delta cannot stall a tick. */
const MAX_SLICES = 512;

export function stepSetupMovement(
  bodies: readonly [SetupBody, SetupBody],
  intents: readonly [MoveIntent, MoveIntent],
  deltaSeconds: number,
): void {
  let remaining = Math.max(0, deltaSeconds);
  if (remaining === 0) return;

  // Jump is edge-triggered: it must fire on the first slice only, or a single
  // press would be re-applied on every slice of a bunched delta.
  let sliceIntents = intents;
  for (let slice = 0; slice < MAX_SLICES && remaining > 1e-9; slice++) {
    const dt = Math.min(STEP_SECONDS, remaining);
    remaining -= dt;
    integrate(bodies, sliceIntents, dt);
    if (sliceIntents[0].jump || sliceIntents[1].jump) {
      sliceIntents = [
        { direction: sliceIntents[0].direction, jump: false },
        { direction: sliceIntents[1].direction, jump: false },
      ];
    }
  }
}

function integrate(
  bodies: readonly [SetupBody, SetupBody],
  intents: readonly [MoveIntent, MoveIntent],
  dt: number,
): void {
  const gravity = CONFIG.arena.gravity;
  const before: [number, number] = [bodies[0]!.x, bodies[1]!.x];

  for (let i = 0; i < 2; i++) {
    const body = bodies[i]!;
    const intent = intents[i]!;
    const grounded = body.y <= SETUP_GROUND_Y + 1e-6 && body.vy <= 0;

    // Horizontal is velocity-controlled, not force-controlled: releasing the
    // key stops the wizard immediately. Momentum here would make a 3-second
    // Setup feel like ice, and every frame of overshoot is a frame the player
    // spends fighting the control instead of choosing a position.
    body.x += intent.direction * CONFIG.movement.speed * dt;

    if (intent.jump && grounded && body.jumpsLeft > 0) {
      body.vy = CONFIG.movement.jumpImpulse;
      body.jumpsLeft -= 1;
    }

    body.vy += gravity * dt;
    body.y += body.vy * dt;

    if (body.y <= SETUP_GROUND_Y) {
      body.y = SETUP_GROUND_Y;
      body.vy = 0;
    }

    body.x = clamp(body.x, -SETUP_BOUND, SETUP_BOUND);
  }

  separate(bodies[0]!, bodies[1]!, before);
}

/**
 * Stops wizards from overlapping — by blocking the mover, not by shoving.
 *
 * The first version split the overlap evenly between both bodies. That quietly
 * invented a mechanic the PRD never describes: because one Setup is long enough
 * to cross the arena (`maxSetupTravel()` = 1.65 against a 1.10 gap), a player
 * holding one direction could body-check a stationary opponent all the way to
 * the island edge, every Turn, with no counterplay. Positioning is supposed to
 * be *your* lever on *your* position.
 *
 * So each body is rolled back in proportion to how far it moved this slice. A
 * player who stood still is not displaced at all; two players walking into each
 * other are each rolled back equally, which keeps the mirror-fairness property
 * the Sesi 19 audit confirmed.
 *
 * Vertical overlap is ignored — a wizard mid-jump passes over the other, which
 * is the only reason to jump at all.
 */
function separate(a: SetupBody, b: SetupBody, before: readonly [number, number]): void {
  if (Math.abs(a.y - b.y) > CONFIG.player.radius) return;
  const gap = b.x - a.x;
  const overlap = MIN_SEPARATION - Math.abs(gap);
  if (overlap <= 0) return;

  const movedA = Math.abs(a.x - before[0]);
  const movedB = Math.abs(b.x - before[1]);
  const total = movedA + movedB;
  // Neither moved (e.g. a clamp pushed them together): fall back to an even
  // split so they cannot stay interpenetrated.
  const shareA = total > 1e-12 ? movedA / total : 0.5;
  const direction = gap >= 0 ? 1 : -1;

  a.x = clamp(a.x - overlap * shareA * direction, -SETUP_BOUND, SETUP_BOUND);
  b.x = clamp(b.x + overlap * (1 - shareA) * direction, -SETUP_BOUND, SETUP_BOUND);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Furthest horizontal distance a wizard can cover in one Setup phase.
 *
 * Exported because it is a design fact worth asserting in tests rather than
 * rediscovering in a playtest: at the shipped constants this is larger than the
 * gap between spawns, which means a player can cross the arena in one Setup.
 */
export function maxSetupTravel(): number {
  return (CONFIG.movement.speed * CONFIG.phases.setupMs) / 1000;
}
