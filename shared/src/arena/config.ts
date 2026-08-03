import { CONFIG } from '../config/index.js';

/**
 * Tunables for the Rune Arena sub-game (DESIGN-RUNE-ARENA.md).
 *
 * A separate frozen block rather than fields on the global `CONFIG`: Rune Arena
 * is an isolated mode, and keeping its numbers here means tuning it can never
 * shift a value the classic drawing duel reads. Shared spatial facts — arena
 * width, ground line, gravity, body radius — are still sourced from `CONFIG` so
 * the two modes share one physical world, not two that drift apart.
 *
 * Arena units match the rest of the game: the island spans x ∈ [-1, 1], the
 * ground sits at y = 0, time is milliseconds.
 */
export const ARENA = Object.freeze({
  /** Fixed simulation step. Mirrors `CONFIG.simulation.fixedTimestepMs` (60 Hz). */
  stepMs: CONFIG.simulation.fixedTimestepMs,

  /** Starting HP per player. Match ends when one reaches 0 — no rounds, no stars. */
  hp: 100,

  radius: CONFIG.player.radius,
  groundY: CONFIG.arena.groundY,
  halfWidth: CONFIG.arena.halfWidth,
  gravity: CONFIG.arena.gravity,

  /**
   * Half-width of the neutral strip at the centre neither player may enter.
   * This is what keeps the duel symmetric and fair (DESIGN §5): slot 0 is
   * clamped to the left of it, slot 1 to the right, so neither can cross.
   */
  centerDeadzone: 0.12,

  /** Where each wizard starts, mirrored across centre. */
  spawnX: 0.6,

  /** Ground movement is direct and snappy — this is a fighter, not artillery. */
  moveSpeed: 0.9,
  jumpImpulse: 1.7,
  /** Horizontal control authority while airborne, as a fraction of `moveSpeed`. */
  airControl: 0.35,
  airDrag: 1.2,

  dodge: Object.freeze({
    /** Window of invulnerability granted by a dodge. Wide enough to absorb net latency. */
    iframeMs: 300,
    /** Time before another dodge is allowed, measured from the dodge start. */
    cooldownMs: 700,
    /** Horizontal burst applied by a left/right dodge. */
    dashSpeed: 1.6,
    /** Vertical burst applied by an up (hop) dodge. */
    hopImpulse: 1.9,
  }),
} as const);
