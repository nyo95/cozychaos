import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import {
  addWobble,
  applyResolveOutcome,
  canMove,
  createMatch,
  knockbackMultiplier,
  nextPhase,
  phaseDurationMs,
  startNextRound,
  startNextTurn,
  type MatchState,
  type PlayerSlot,
} from './state.js';
import { createRandom, deriveSeed } from './random.js';

/**
 * These tests exist because of the PRD audit. Each one pins down a defect that
 * PRD v0.1 left open — see PRD-AMENDMENTS.md. They are the guard against the
 * amendments being quietly undone later by a "simplification".
 */

const withStars = (state: MatchState, a: number, b: number): MatchState => ({
  ...state,
  players: [
    { ...state.players[0], stars: a },
    { ...state.players[1], stars: b },
  ],
});

describe('A-01 — Wobble resets per Round, never per Turn', () => {
  it('keeps Wobble across a Turn boundary', () => {
    // The defect: PRD §5.3 says Wobble resets "at the start of a ronde", and
    // "ronde" also names the 15–22s phase cycle. Read that way, Wobble is
    // wiped every ~20 seconds, knockback never escalates, and no knock-out can
    // ever occur — the match cannot end.
    let state = createMatch(1);
    state = {
      ...state,
      players: [addWobble(state.players[0], 3), state.players[1]],
    };
    const carried = state.players[0].wobble;
    expect(carried).toBeGreaterThan(0);

    const next = startNextTurn(state);
    expect(next.players[0].wobble).toBe(carried);
    expect(next.turn).toBe(state.turn + 1);
  });

  it('clears Wobble when a Round ends', () => {
    let state = createMatch(1);
    state = { ...state, players: [addWobble(state.players[0], 5), state.players[1]] };
    const next = startNextRound(state);
    expect(next.players[0].wobble).toBe(CONFIG.wobble.initial);
    expect(next.round).toBe(state.round + 1);
    expect(next.turn).toBe(0);
  });

  it('refills ink every Turn', () => {
    let state = createMatch(1);
    state = {
      ...state,
      players: [{ ...state.players[0], ink: 5 }, state.players[1]],
    };
    expect(startNextTurn(state).players[0].ink).toBe(CONFIG.ink.total);
  });

  it('leaves enough Turns per Round for Wobble to matter', () => {
    // The arithmetic that proves the amendment was necessary: a 3–5 minute
    // match divided into 15–22 second Turns leaves only a handful of Turns per
    // Star, so Wobble has to accumulate across them.
    const turnMs =
      CONFIG.phases.setupMs +
      CONFIG.phases.drawMs +
      CONFIG.phases.revealMs +
      CONFIG.phases.resolveMaxMs +
      CONFIG.phases.scoreMs;
    expect(turnMs).toBeLessThanOrEqual(22_000);

    const turnsPerMatch = 300_000 / turnMs;
    const turnsPerRound = turnsPerMatch / CONFIG.scoring.starsToWin;
    expect(turnsPerRound).toBeGreaterThan(2);
  });

  it('escalates knockback as Wobble climbs', () => {
    expect(knockbackMultiplier(0)).toBe(1);
    expect(knockbackMultiplier(CONFIG.wobble.max)).toBe(CONFIG.wobble.knockbackMultiplierAtMax);
    expect(knockbackMultiplier(CONFIG.wobble.max / 2)).toBeGreaterThan(1);
  });

  it('caps Wobble so knockback cannot diverge', () => {
    let player = createMatch(1).players[0];
    for (let i = 0; i < 100; i++) player = addWobble(player, 10);
    expect(player.wobble).toBe(CONFIG.wobble.max);
  });
});

describe('A-02 — a double knock-out can never produce a tie', () => {
  const ko = (slot: PlayerSlot, atMs: number) => ({ slot, atMs });

  it('awards a Star to the surviving player on a single knock-out', () => {
    const state = applyResolveOutcome(createMatch(1), { knockouts: [ko(0, 100)] });
    expect(state.players[1].stars).toBe(1);
    expect(state.players[0].stars).toBe(0);
  });

  it('awards a Star to both on a simultaneous knock-out', () => {
    const state = applyResolveOutcome(createMatch(1), { knockouts: [ko(0, 100), ko(1, 200)] });
    expect(state.players[0].stars).toBe(1);
    expect(state.players[1].stars).toBe(1);
  });

  it('treats a knock-out outside the window as sequential', () => {
    const late = CONFIG.scoring.doubleKoWindowMs + 50;
    const state = applyResolveOutcome(createMatch(1), { knockouts: [ko(0, 0), ko(1, late)] });
    expect(state.players[1].stars).toBe(1);
    expect(state.players[0].stars).toBe(0);
  });

  it('enters Sudden Death instead of tying at match point', () => {
    // The defect: PRD §5.1 awards a Star to both players on a double
    // knock-out, and §5.1 also declares first-to-3 the win condition. At 2–2 a
    // double knock-out makes it 3–3, a state the PRD has no rule for.
    const atMatchPoint = withStars(createMatch(1), 2, 2);
    const result = applyResolveOutcome(atMatchPoint, { knockouts: [ko(0, 100), ko(1, 150)] });

    expect(result.winner).toBeNull();
    expect(result.suddenDeath).toBe(true);
    expect(result.players[0].stars).toBe(2);
    expect(result.players[1].stars).toBe(2);
  });

  it('uses a tighter window in Sudden Death so it converges', () => {
    expect(CONFIG.scoring.doubleKoWindowSuddenDeathMs).toBeLessThan(
      CONFIG.scoring.doubleKoWindowMs,
    );

    const sudden = { ...withStars(createMatch(1), 2, 2), suddenDeath: true };
    const gap = CONFIG.scoring.doubleKoWindowSuddenDeathMs + 10;
    const result = applyResolveOutcome(sudden, { knockouts: [ko(0, 0), ko(1, gap)] });
    expect(result.winner).toBe(1);
  });

  it('always reaches a single winner, never a tie', () => {
    // Exhaustive over every reachable score and knock-out shape.
    for (let a = 0; a < CONFIG.scoring.starsToWin; a++) {
      for (let b = 0; b < CONFIG.scoring.starsToWin; b++) {
        for (const knockouts of [
          [ko(0, 0)],
          [ko(1, 0)],
          [ko(0, 0), ko(1, 10)],
          [ko(1, 0), ko(0, 10)],
        ]) {
          const result = applyResolveOutcome(withStars(createMatch(1), a, b), { knockouts });
          const bothWon = result.players.every((p) => p.stars >= CONFIG.scoring.starsToWin);
          expect(bothWon, `from ${a}-${b}`).toBe(false);
        }
      }
    }
  });

  it('ignores further outcomes once the match is decided', () => {
    const decided = applyResolveOutcome(withStars(createMatch(1), 2, 0), { knockouts: [ko(1, 0)] });
    expect(decided.winner).toBe(0);
    expect(applyResolveOutcome(decided, { knockouts: [ko(0, 0)] })).toEqual(decided);
  });

  it('leaves the score alone when nobody fell', () => {
    const state = createMatch(1);
    expect(applyResolveOutcome(state, { knockouts: [] })).toEqual(state);
  });
});

describe('A-03 — Resolve is a pure simulation', () => {
  it('allows movement only during Setup', () => {
    // The defect: PRD §15 claims latency cannot decide a Turn and that a replay
    // needs only seed, initial state and two strokes. PRD §9 allowed movement
    // during Resolve, which is live input — it makes both claims false.
    const state = createMatch(1);
    expect(canMove({ ...state, phase: 'setup' })).toBe(true);
    for (const phase of ['draw', 'reveal', 'resolve', 'score'] as const) {
      expect(canMove({ ...state, phase }), phase).toBe(false);
    }
  });
});

describe('phase cycle (PRD §6)', () => {
  it('cycles Setup → Draw → Reveal → Resolve → Score → Setup', () => {
    expect(nextPhase('setup')).toBe('draw');
    expect(nextPhase('draw')).toBe('reveal');
    expect(nextPhase('reveal')).toBe('resolve');
    expect(nextPhase('resolve')).toBe('score');
    expect(nextPhase('score')).toBe('setup');
  });

  it('keeps a Turn inside the 15–22 second budget', () => {
    const total = (['setup', 'draw', 'reveal', 'resolve', 'score'] as const)
      .map(phaseDurationMs)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(15_000);
    expect(total).toBeLessThanOrEqual(22_000);
  });
});

describe('seeded randomness (PRD §21)', () => {
  it('produces the same stream for the same seed', () => {
    const a = createRandom(1234);
    const b = createRandom(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const sameCount = Array.from({ length: 50 }, () => (a.next() === b.next() ? 1 : 0)).reduce(
      (x: number, y: number) => x + y,
      0,
    );
    expect(sameCount).toBe(0);
  });

  it('stays within [0, 1)', () => {
    const random = createRandom(99);
    for (let i = 0; i < 5000; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives each subsystem an independent stream from one match seed', () => {
    // So that adding a random visual effect cannot shift the numbers the
    // simulation draws and desync a replay.
    expect(deriveSeed(42, 'physics')).not.toBe(deriveSeed(42, 'vfx'));
    expect(deriveSeed(42, 'physics')).toBe(deriveSeed(42, 'physics'));
  });
});
