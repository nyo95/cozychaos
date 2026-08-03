import { describe, expect, it } from 'vitest';
import { CONFIG, type ServerMessage } from '@cozy/shared';
import { Room } from './room.js';

/**
 * Full-match smoke test — the closest thing to sitting down and playing.
 *
 * Unit tests prove pieces behave; this proves a *session* works. Two players
 * join, reposition during Setup, draw a rune each Turn, aim, and let the
 * authoritative server resolve, until somebody wins. It exists because every
 * defect in AUDIT-MECHANICS-S19 passed the unit suite: M-01 (matches that never
 * end) and M-02 (wind deciding Rounds) are only visible when you play a whole
 * match, not a single Resolve.
 *
 * Kept deterministic (fixed seed, fixed policy, fake clock) so a failure here
 * is reproducible rather than flaky.
 */

const TICK_MS = 1000 / 30;

class Client {
  readonly messages: ServerMessage[] = [];
  readonly acks: Extract<ServerMessage, { type: 'ack' }>[] = [];
  readonly send = (message: ServerMessage): void => {
    this.messages.push(message);
    if (message.type === 'ack') this.acks.push(message);
  };
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i]!.type === type) return this.messages[i] as Extract<ServerMessage, { type: T }>;
    }
    return null;
  }
}

/** A rune of the requested length, drawn from the caster toward mid-arena. */
function stroke(slot: 0 | 1, length: number, turn: number) {
  const dir = slot === 0 ? 1 : -1;
  const startX = slot === 0 ? -0.34 : 0.34;
  const arc = 0.12 * Math.sin(turn * 1.7 + slot);
  return Array.from({ length: 32 }, (_, i) => {
    const t = i / 31;
    return { x: startX + dir * length * t, y: 0.28 + arc * Math.sin(Math.PI * t) };
  });
}

/**
 * A simple but non-degenerate policy: alternate a light dart, a mid rune, and a
 * heavy screen; drift during Setup; jump sometimes. Identical degenerate play
 * is exactly the M-01 stalemate, so playing it here would test the cap rather
 * than the game.
 */
function inkLengthFor(slot: 0 | 1, turn: number): number {
  const cycle = (turn + slot) % 3;
  return cycle === 0 ? 0.42 : cycle === 1 ? 0.95 : 1.5;
}

function moveFor(slot: 0 | 1, turn: number): { direction: -1 | 0 | 1; jump: boolean } {
  const cycle = (turn * 2 + slot) % 4;
  if (cycle === 0) return { direction: slot === 0 ? 1 : -1, jump: false };
  if (cycle === 1) return { direction: 0, jump: true };
  if (cycle === 2) return { direction: slot === 0 ? -1 : 1, jump: false };
  return { direction: 0, jump: false };
}

interface Playthrough {
  readonly turnsPlayed: number;
  readonly roundsDecided: number;
  readonly winner: 0 | 1 | null;
  readonly stars: readonly number[];
  readonly frames: number;
  readonly setupFrames: number;
  readonly reveals: number;
  readonly acceptedInputs: number;
  readonly rejectedInputs: readonly string[];
  readonly simulatedMs: number;
  readonly log: readonly string[];
}

function playMatch(seed: number, maxMs = 12 * 60 * 1000): Playthrough {
  const room = new Room('PLAY', seed);
  const a = new Client();
  const b = new Client();
  room.join('Ana', a.send);
  room.join('Bo', b.send);

  let now = 0;
  let lastPhase = '';
  let turnsPlayed = 0;
  let roundsDecided = 0;
  const log: string[] = [];

  while (now < maxMs) {
    room.tick(now);
    const view = a.last('room')?.room;
    if (view && view.phase !== lastPhase) {
      const previous = lastPhase;
      lastPhase = view.phase;

      if (view.phase === 'setup') {
        for (const slot of [0, 1] as const) {
          const intent = moveFor(slot, view.turn);
          room.submitMove(slot, intent.direction, intent.jump);
        }
      }
      if (view.phase === 'draw') {
        turnsPlayed++;
        for (const slot of [0, 1] as const) {
          room.submitStroke(slot, stroke(slot, inkLengthFor(slot, view.turn), view.turn));
        }
      }
      if (view.phase === 'cast') {
        for (const slot of [0, 1] as const) {
          const lift = 0.25 + 0.2 * ((view.turn + slot) % 3);
          room.submitCast(slot, { x: slot === 0 ? 1 : -1, y: lift });
        }
      }
      if (previous === 'resolve' && view.phase === 'score') {
        const score = a.last('score');
        if (score && score.knockouts.length > 0) {
          roundsDecided++;
          log.push(
            `round ${roundsDecided} decided on turn ${view.turn} — KO slot ` +
              `${score.knockouts.join(' & ')} · stars ` +
              `${view.players.map((p) => p.stars).join('-')}`,
          );
        }
      }
      if (view.winner !== null) {
        log.push(`winner: slot ${view.winner}`);
        break;
      }
    }
    now += TICK_MS;
  }

  const finalView = a.last('room')?.room ?? null;
  const allAcks = [...a.acks, ...b.acks];
  return {
    turnsPlayed,
    roundsDecided,
    winner: finalView?.winner ?? null,
    stars: finalView?.players.map((p) => p.stars) ?? [],
    frames: a.messages.filter((m) => m.type === 'frame').length,
    setupFrames: a.messages.filter((m) => m.type === 'setupFrame').length,
    reveals: a.messages.filter((m) => m.type === 'reveal').length,
    acceptedInputs: allAcks.filter((ack) => ack.accepted).length,
    rejectedInputs: allAcks.filter((ack) => !ack.accepted).map((ack) => ack.reason ?? 'unknown'),
    simulatedMs: now,
    log,
  };
}

describe('a whole match is playable end to end', () => {
  const run = playMatch(20260803);

  it('reaches a winner instead of running forever (M-01)', () => {
    expect(run.winner).not.toBeNull();
    expect(run.roundsDecided).toBeGreaterThanOrEqual(CONFIG.scoring.starsToWin);
  });

  it('awards the winning number of Stars to exactly one player', () => {
    const winners = run.stars.filter((s) => s >= CONFIG.scoring.starsToWin);
    expect(winners).toHaveLength(1);
  });

  it('finishes inside a session a person would actually sit through', () => {
    // PRD §5: 3-5 minutes is the target; 12 is the hard ceiling this asserts.
    expect(run.simulatedMs).toBeLessThan(12 * 60 * 1000);
  });

  it('shows the player everything it simulates', () => {
    expect(run.reveals).toBeGreaterThan(0);
    expect(run.frames).toBeGreaterThan(0);
    // M-04: movement is worthless if the client never sees it.
    expect(run.setupFrames).toBeGreaterThan(0);
  });

  it('acknowledges every input it accepts (M-03)', () => {
    expect(run.acceptedInputs).toBeGreaterThan(0);
    expect(run.rejectedInputs).toEqual([]);
  });

  it('keeps the worst-case Turn inside the PRD budget', () => {
    const p = CONFIG.phases;
    const worstCaseS =
      (p.setupMs + p.drawMs + p.castMs + p.revealMs + p.resolveMaxMs + p.scoreMs) / 1000;
    expect(worstCaseS).toBeLessThanOrEqual(22);
  });

  it('plays out the same way twice from the same seed', () => {
    const again = playMatch(20260803);
    expect(again.winner).toBe(run.winner);
    expect(again.turnsPlayed).toBe(run.turnsPlayed);
    expect(again.stars).toEqual(run.stars);
  });

  it('does not favour a seat across many seeds', () => {
    // The wind field is provably mirror-equivariant (windFairness.test.ts), but
    // that proves the *simulator* is even-handed, not that a whole match is.
    // Scoring, phase order, and the Turn cap could each smuggle in a bias.
    const results = [11, 23, 47, 91, 108, 233, 512, 777].map((seed) => playMatch(seed, 8 * 60 * 1000));
    const decided = results.filter((r) => r.winner !== null);
    expect(decided.length).toBe(results.length);
    const slotZeroWins = decided.filter((r) => r.winner === 0).length;
    // With a fixed asymmetric policy an exact 50/50 is not expected; a shutout
    // in either direction would be.
    expect(slotZeroWins).toBeGreaterThan(0);
    expect(slotZeroWins).toBeLessThan(decided.length);
  });

  it('reports the playthrough', () => {
    // Not an assertion — this is the line a human reads after a change.
    console.log(
      `\n  MATCH: ${run.turnsPlayed} turns, ${run.roundsDecided} rounds, ` +
        `${(run.simulatedMs / 1000).toFixed(0)}s, stars ${run.stars.join('-')}, ` +
        `winner slot ${run.winner}\n  ${run.log.join('\n  ')}\n`,
    );
    expect(run.turnsPlayed).toBeGreaterThan(0);
  });
});
