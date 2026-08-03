import type { PlayerSlot } from '../match/state.js';
import { ARENA } from './config.js';

/**
 * The Rune Arena simulation — pure, deterministic, transport-free.
 *
 * Same discipline as `shared/src/sim` and `shared/src/match`: all the rules
 * live here as pure functions so they can be unit-tested without a socket, and
 * so the server (authoritative) and the client (prediction, later) run the
 * exact same code. The server owns the real instance; see `server/src/arenaRoom`.
 *
 * Fase A scope: movement inside a locked half-arena, jumping, the dodge with its
 * i-frames, and HP with a win check. Casting jurus and their projectiles arrive
 * in Fase C; the hooks (`applyDamage`, mana) are shaped so they slot in without
 * reworking this module.
 */

export type DodgeDir = 'left' | 'right' | 'up' | 'down';

/** An in-progress dodge. Present from the dodge start until its cooldown ends. */
export interface DodgeState {
  readonly dir: DodgeDir;
  readonly startedMs: number;
  /** Body ignores incoming damage while `timeMs < iframeUntilMs`. */
  readonly iframeUntilMs: number;
  /** No new dodge may start while `timeMs < cooldownUntilMs`. */
  readonly cooldownUntilMs: number;
}

export interface ArenaPlayer {
  readonly slot: PlayerSlot;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly hp: number;
  /** Which way the wizard looks. Always toward centre — they cannot cross it. */
  readonly facing: -1 | 1;
  /** Held movement intent, integrated each step. */
  readonly moveIntent: -1 | 0 | 1;
  /** Edge-triggered; consumed by the next step if grounded. */
  readonly jumpQueued: boolean;
  /** Edge-triggered dodge request; consumed by the next step if allowed. */
  readonly dodgeQueued: DodgeDir | null;
  readonly dodge: DodgeState | null;
  readonly connected: boolean;
}

export interface ArenaState {
  readonly timeMs: number;
  readonly players: readonly [ArenaPlayer, ArenaPlayer];
  /** Slot of the winner once someone hits 0 HP, else null. */
  readonly winner: PlayerSlot | null;
}

/** The x-interval a slot is confined to, so it can never cross centre. */
export function halfBounds(slot: PlayerSlot): { readonly min: number; readonly max: number } {
  const inner = ARENA.centerDeadzone + ARENA.radius;
  const outer = ARENA.halfWidth - ARENA.radius;
  return slot === 0 ? { min: -outer, max: -inner } : { min: inner, max: outer };
}

function spawnPlayer(slot: PlayerSlot): ArenaPlayer {
  return {
    slot,
    x: slot === 0 ? -ARENA.spawnX : ARENA.spawnX,
    y: ARENA.groundY + ARENA.radius,
    vx: 0,
    vy: 0,
    grounded: true,
    hp: ARENA.hp,
    facing: slot === 0 ? 1 : -1,
    moveIntent: 0,
    jumpQueued: false,
    dodgeQueued: null,
    dodge: null,
    connected: true,
  };
}

export function createArena(): ArenaState {
  return { timeMs: 0, players: [spawnPlayer(0), spawnPlayer(1)], winner: null };
}

/** True while a dodge's i-frames are active — the body shrugs off damage. */
export function isInvulnerable(player: ArenaPlayer, timeMs: number): boolean {
  return player.dodge !== null && timeMs < player.dodge.iframeUntilMs;
}

function canDodge(player: ArenaPlayer, timeMs: number): boolean {
  return player.dodge === null || timeMs >= player.dodge.cooldownUntilMs;
}

// ── Input setters (pure; the room applies these before stepping) ─────────────

function withPlayer(
  state: ArenaState,
  slot: PlayerSlot,
  change: (player: ArenaPlayer) => ArenaPlayer,
): ArenaState {
  const players = state.players.map((p) => (p.slot === slot ? change(p) : p)) as unknown as readonly [
    ArenaPlayer,
    ArenaPlayer,
  ];
  return { ...state, players };
}

export function setMoveIntent(
  state: ArenaState,
  slot: PlayerSlot,
  direction: -1 | 0 | 1,
  jump: boolean,
): ArenaState {
  return withPlayer(state, slot, (p) => ({
    ...p,
    moveIntent: direction,
    jumpQueued: p.jumpQueued || jump,
  }));
}

export function queueDodge(state: ArenaState, slot: PlayerSlot, dir: DodgeDir): ArenaState {
  return withPlayer(state, slot, (p) => ({ ...p, dodgeQueued: dir }));
}

export function setConnected(state: ArenaState, slot: PlayerSlot, connected: boolean): ArenaState {
  return withPlayer(state, slot, (p) => ({ ...p, connected }));
}

/**
 * Applies damage to a slot, honouring dodge i-frames. Returns the state
 * unchanged if the target is invulnerable or already at 0. Sets `winner` when
 * the hit empties the bar. The damage source (a cast jurus) lands in Fase C;
 * this is the sink it will call into.
 */
export function applyDamage(state: ArenaState, slot: PlayerSlot, amount: number): ArenaState {
  if (state.winner !== null) return state;
  const target = state.players[slot];
  if (isInvulnerable(target, state.timeMs) || target.hp <= 0) return state;

  const hp = Math.max(0, target.hp - Math.max(0, amount));
  const next = withPlayer(state, slot, (p) => ({ ...p, hp }));
  if (hp <= 0) {
    const winner: PlayerSlot = slot === 0 ? 1 : 0;
    return { ...next, winner };
  }
  return next;
}

// ── Simulation ───────────────────────────────────────────────────────────────

/** Advances the simulation by one fixed step. Call repeatedly to cover elapsed time. */
export function stepArena(state: ArenaState): ArenaState {
  if (state.winner !== null) return { ...state, timeMs: state.timeMs + ARENA.stepMs };
  const timeMs = state.timeMs + ARENA.stepMs;
  const players = state.players.map((p) => stepPlayer(p, timeMs)) as unknown as readonly [
    ArenaPlayer,
    ArenaPlayer,
  ];
  return { ...state, timeMs, players };
}

function stepPlayer(player: ArenaPlayer, timeMs: number): ArenaPlayer {
  const dt = ARENA.stepMs / 1000;
  const groundY = ARENA.groundY + ARENA.radius;

  let { x, y, vx, vy, grounded, dodge } = player;

  // Start a queued dodge if one is pending and the cooldown allows it.
  const startingDodge = player.dodgeQueued !== null && canDodge(player, timeMs);
  if (startingDodge) {
    const dir = player.dodgeQueued!;
    dodge = {
      dir,
      startedMs: timeMs,
      iframeUntilMs: timeMs + ARENA.dodge.iframeMs,
      cooldownUntilMs: timeMs + ARENA.dodge.cooldownMs,
    };
    if (dir === 'left') vx = -ARENA.dodge.dashSpeed;
    else if (dir === 'right') vx = ARENA.dodge.dashSpeed;
    else if (dir === 'up' && grounded) vy = ARENA.dodge.hopImpulse;
    // 'down' is a crouch: the i-frames do the work, no impulse.
  }

  const inDash =
    dodge !== null && timeMs < dodge.iframeUntilMs && (dodge.dir === 'left' || dodge.dir === 'right');

  // Horizontal control. A dash carries its own momentum and ignores intent so a
  // held key cannot cancel the sidestep; otherwise ground control is direct.
  if (inDash) {
    vx *= Math.max(0, 1 - ARENA.airDrag * dt);
  } else if (grounded) {
    vx = player.moveIntent * ARENA.moveSpeed;
  } else {
    vx += player.moveIntent * ARENA.moveSpeed * ARENA.airControl * dt * 10;
    vx *= Math.max(0, 1 - ARENA.airDrag * dt);
    const cap = ARENA.moveSpeed;
    vx = Math.max(-cap, Math.min(cap, vx));
  }

  // Jump: edge-triggered, only off the ground.
  if (player.jumpQueued && grounded) {
    vy = ARENA.jumpImpulse;
    grounded = false;
  }

  // Integrate.
  vy += ARENA.gravity * dt;
  x += vx * dt;
  y += vy * dt;

  // Ground.
  if (y <= groundY) {
    y = groundY;
    vy = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  // Confine to this slot's half — the fairness rule of DESIGN §5.
  const bounds = halfBounds(player.slot);
  if (x < bounds.min) {
    x = bounds.min;
    if (vx < 0) vx = 0;
  } else if (x > bounds.max) {
    x = bounds.max;
    if (vx > 0) vx = 0;
  }

  // Drop a finished dodge once its cooldown has elapsed, so state does not grow.
  if (dodge !== null && timeMs >= dodge.cooldownUntilMs) dodge = null;

  return {
    ...player,
    x,
    y,
    vx,
    vy,
    grounded,
    dodge,
    jumpQueued: false,
    dodgeQueued: null,
  };
}
