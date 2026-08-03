import { describe, expect, it } from 'vitest';
import { ARENA } from './config.js';
import {
  type ArenaState,
  applyDamage,
  createArena,
  halfBounds,
  isInvulnerable,
  queueDodge,
  setMoveIntent,
  stepArena,
} from './state.js';

/** Steps the simulation `n` fixed frames. */
function advance(state: ArenaState, n: number): ArenaState {
  let next = state;
  for (let i = 0; i < n; i += 1) next = stepArena(next);
  return next;
}

/** Roughly the frames covered by `ms` of real time. */
function framesFor(ms: number): number {
  return Math.ceil(ms / ARENA.stepMs) + 1;
}

describe('createArena', () => {
  it('spawns both wizards on their own side, at full HP, facing centre', () => {
    const s = createArena();
    expect(s.players[0].x).toBeLessThan(0);
    expect(s.players[1].x).toBeGreaterThan(0);
    expect(s.players[0].facing).toBe(1);
    expect(s.players[1].facing).toBe(-1);
    expect(s.players[0].hp).toBe(ARENA.hp);
    expect(s.players[1].hp).toBe(ARENA.hp);
    expect(s.winner).toBeNull();
  });
});

describe('half-arena lock (DESIGN §5)', () => {
  it('never lets slot 0 cross the centre no matter how long it walks right', () => {
    let s = setMoveIntent(createArena(), 0, 1, false);
    s = advance(s, 600); // ten seconds of walking into the wall
    expect(s.players[0].x).toBeLessThanOrEqual(halfBounds(0).max);
    expect(s.players[0].x).toBeLessThan(0);
  });

  it('never lets slot 1 cross the centre no matter how long it walks left', () => {
    let s = setMoveIntent(createArena(), 1, -1, false);
    s = advance(s, 600);
    expect(s.players[1].x).toBeGreaterThanOrEqual(halfBounds(1).min);
    expect(s.players[1].x).toBeGreaterThan(0);
  });

  it('keeps a player inside its outer wall too', () => {
    let s = setMoveIntent(createArena(), 0, -1, false);
    s = advance(s, 600);
    expect(s.players[0].x).toBeGreaterThanOrEqual(halfBounds(0).min);
  });
});

describe('jump', () => {
  it('leaves the ground then returns to it under gravity', () => {
    let s = setMoveIntent(createArena(), 0, 0, true);
    s = stepArena(s);
    expect(s.players[0].grounded).toBe(false);
    expect(s.players[0].y).toBeGreaterThan(ARENA.groundY + ARENA.radius);

    s = advance(s, framesFor(2000));
    expect(s.players[0].grounded).toBe(true);
    expect(s.players[0].y).toBeCloseTo(ARENA.groundY + ARENA.radius, 5);
  });

  it('is edge-triggered: a single queued jump does not repeat', () => {
    let s = setMoveIntent(createArena(), 0, 0, true);
    s = advance(s, framesFor(2000)); // land again
    // Intent still holds direction 0 but jump was consumed; should stay grounded.
    s = advance(s, 5);
    expect(s.players[0].grounded).toBe(true);
  });
});

describe('dodge', () => {
  it('grants i-frames for the window, then they expire', () => {
    let s = queueDodge(createArena(), 0, 'left');
    s = stepArena(s);
    expect(isInvulnerable(s.players[0], s.timeMs)).toBe(true);

    s = advance(s, framesFor(ARENA.dodge.iframeMs));
    expect(isInvulnerable(s.players[0], s.timeMs)).toBe(false);
  });

  it('sidesteps: a left dodge moves the body left', () => {
    const start = createArena().players[0].x;
    let s = queueDodge(createArena(), 0, 'left');
    s = advance(s, 6);
    expect(s.players[0].x).toBeLessThan(start);
  });

  it('cannot be re-triggered during cooldown', () => {
    let s = queueDodge(createArena(), 0, 'left');
    s = advance(s, 3);
    const firstStart = s.players[0].dodge?.startedMs;
    // Try again mid-cooldown.
    s = queueDodge(s, 0, 'right');
    s = advance(s, 3);
    expect(s.players[0].dodge?.startedMs).toBe(firstStart);
  });

  it('allows a new dodge once the cooldown has elapsed', () => {
    let s = queueDodge(createArena(), 0, 'left');
    const firstStart = stepArena(s).players[0].dodge?.startedMs;
    s = advance(s, framesFor(ARENA.dodge.cooldownMs));
    s = queueDodge(s, 0, 'right');
    s = stepArena(s);
    expect(s.players[0].dodge?.startedMs).not.toBe(firstStart);
    expect(s.players[0].dodge?.dir).toBe('right');
  });
});

describe('applyDamage', () => {
  it('reduces HP and declares the opponent winner at 0', () => {
    let s = applyDamage(createArena(), 1, 30);
    expect(s.players[1].hp).toBe(ARENA.hp - 30);
    expect(s.winner).toBeNull();

    s = applyDamage(s, 1, ARENA.hp);
    expect(s.players[1].hp).toBe(0);
    expect(s.winner).toBe(0);
  });

  it('is ignored while the target is dodging', () => {
    let s = queueDodge(createArena(), 0, 'right');
    s = stepArena(s);
    expect(isInvulnerable(s.players[0], s.timeMs)).toBe(true);
    const before = s.players[0].hp;
    s = applyDamage(s, 0, 40);
    expect(s.players[0].hp).toBe(before);
  });

  it('freezes the simulation once there is a winner', () => {
    let s = applyDamage(createArena(), 1, ARENA.hp);
    expect(s.winner).toBe(0);
    const t = s.timeMs;
    s = setMoveIntent(s, 1, 1, true);
    s = stepArena(s);
    // Time advances for timeouts but bodies do not move.
    expect(s.timeMs).toBeGreaterThan(t);
    expect(s.players[1].x).toBe(createArena().players[1].x);
  });
});
