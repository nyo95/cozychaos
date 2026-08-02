import { CONFIG } from '../config/index.js';
import type { Phase } from '../config/types.js';

/**
 * Match state and its transitions.
 *
 * The vocabulary here is the one fixed by PRD-AMENDMENTS A-01, which resolved
 * the ambiguous use of "ronde" in the PRD:
 *
 *   Turn  — one Setup→Draw→Reveal→Resolve→Score cycle, 15–22 seconds.
 *   Round — plays out over several Turns and ends in a knock-out, worth 1 Star.
 *   Match — first to 3 Stars.
 *
 * The distinction is load-bearing. Wobble resets per Round, not per Turn; if
 * it reset every Turn it would never accumulate and no knock-out could ever
 * happen. Ink resets per Turn.
 */

export type PlayerSlot = 0 | 1;

export interface PlayerState {
  readonly slot: PlayerSlot;
  /** Stars won. First to `CONFIG.scoring.starsToWin` takes the match. */
  readonly stars: number;
  /** Accumulates across Turns; cleared when a Round ends. PRD §5.3, A-01. */
  readonly wobble: number;
  /** Refilled at the start of every Turn. PRD §7.2, A-01. */
  readonly ink: number;
  /** True once this player's stroke is locked for the current Turn. */
  readonly hasSubmitted: boolean;
  /** True while awaiting reconnect. A-06. */
  readonly disconnected: boolean;
}

export interface MatchState {
  readonly phase: Phase;
  /** Milliseconds elapsed within the current phase. */
  readonly phaseElapsedMs: number;
  /** Index of the current Turn within the current Round, from 0. */
  readonly turn: number;
  /** Index of the current Round within the match, from 0. */
  readonly round: number;
  readonly players: readonly [PlayerState, PlayerState];
  /** A-02 — set when both players would otherwise reach the winning score. */
  readonly suddenDeath: boolean;
  /** Slot of the winner, or null while the match is live. */
  readonly winner: PlayerSlot | null;
  /** Seed for every random draw in this match. PRD §15. */
  readonly seed: number;
}

/** Outcome of the Resolve phase, handed to the state machine by the simulation. */
export interface ResolveOutcome {
  /** Slots knocked out during Resolve, with the time each one happened. */
  readonly knockouts: readonly { readonly slot: PlayerSlot; readonly atMs: number }[];
}

export function createPlayer(slot: PlayerSlot): PlayerState {
  return {
    slot,
    stars: 0,
    wobble: CONFIG.wobble.initial,
    ink: CONFIG.ink.total,
    hasSubmitted: false,
    disconnected: false,
  };
}

export function createMatch(seed: number): MatchState {
  return {
    phase: 'setup',
    phaseElapsedMs: 0,
    turn: 0,
    round: 0,
    players: [createPlayer(0), createPlayer(1)],
    suddenDeath: false,
    winner: null,
    seed,
  };
}

/** Configured duration of a phase. Resolve may end early once physics settle. */
export function phaseDurationMs(phase: Phase): number {
  const p = CONFIG.phases;
  switch (phase) {
    case 'setup':
      return p.setupMs;
    case 'draw':
      return p.drawMs;
    case 'cast':
      return p.castMs;
    case 'reveal':
      return p.revealMs;
    case 'resolve':
      return p.resolveMaxMs;
    case 'score':
      return p.scoreMs;
  }
}

/** PRD §9 as amended by A-03: movement is legal during Setup only. */
export function canMove(state: MatchState): boolean {
  return CONFIG.movement.activePhases.includes(state.phase);
}

/**
 * Applies the result of a Resolve phase to the score.
 *
 * A-02 lives here. A double knock-out normally awards a Star to both players,
 * but if that award would put both at the winning score the match would end in
 * an undefined tie. In that case no Star is given and the match enters Sudden
 * Death: one more Round, first knock-out wins, with a tighter double-KO window
 * so it converges instead of repeating forever.
 */
export function applyResolveOutcome(state: MatchState, outcome: ResolveOutcome): MatchState {
  if (state.winner !== null) return state;
  if (outcome.knockouts.length === 0) return state;

  const window = state.suddenDeath
    ? CONFIG.scoring.doubleKoWindowSuddenDeathMs
    : CONFIG.scoring.doubleKoWindowMs;

  const sorted = [...outcome.knockouts].sort((a, b) => a.atMs - b.atMs);
  const first = sorted[0]!;
  const other = sorted.find((k) => k.slot !== first.slot);
  const isDouble = other !== undefined && other.atMs - first.atMs <= window;

  // A knocked-out player loses the Round, so the Star goes to the opponent.
  const awards: PlayerSlot[] = isDouble ? [0, 1] : [first.slot === 0 ? 1 : 0];

  const wouldBothWin =
    isDouble &&
    state.players.every((p) => p.stars + 1 >= CONFIG.scoring.starsToWin);

  if (wouldBothWin) {
    return startNextRound({ ...state, suddenDeath: true });
  }

  const players = state.players.map((player) =>
    awards.includes(player.slot) ? { ...player, stars: player.stars + 1 } : player,
  ) as unknown as readonly [PlayerState, PlayerState];

  const winner = findWinner(players, state.suddenDeath);
  if (winner !== null) {
    return { ...state, players, winner };
  }
  return startNextRound({ ...state, players });
}

/**
 * In Sudden Death a single Star settles it. In normal play the winner is the
 * first to reach the target — and because A-02 prevents both from crossing it
 * on the same Resolve, there is never a tie to break.
 */
function findWinner(
  players: readonly [PlayerState, PlayerState],
  suddenDeath: boolean,
): PlayerSlot | null {
  const target = CONFIG.scoring.starsToWin;
  const reached = players.filter((p) => p.stars >= target);
  if (reached.length === 1) return reached[0]!.slot;
  if (suddenDeath && reached.length === 0) {
    const leader = players[0]!.stars === players[1]!.stars ? null : players[0]!.stars > players[1]!.stars ? 0 : 1;
    return leader;
  }
  return null;
}

/**
 * Starts a new Round: Wobble clears (A-01) and both wizards return to their
 * starting positions (PRD §5.1). The Turn counter restarts because Turns are
 * numbered within a Round.
 */
export function startNextRound(state: MatchState): MatchState {
  return {
    ...state,
    phase: 'setup',
    phaseElapsedMs: 0,
    turn: 0,
    round: state.round + 1,
    players: state.players.map((player) => ({
      ...player,
      wobble: CONFIG.wobble.initial,
      ink: CONFIG.ink.total,
      hasSubmitted: false,
    })) as unknown as readonly [PlayerState, PlayerState],
  };
}

/**
 * Starts a new Turn within the current Round.
 *
 * Ink refills; Wobble deliberately does not. That single asymmetry is what
 * makes knock-outs reachable inside a 3–5 minute match (A-01).
 */
export function startNextTurn(state: MatchState): MatchState {
  return {
    ...state,
    phase: 'setup',
    phaseElapsedMs: 0,
    turn: state.turn + 1,
    players: state.players.map((player) => ({
      ...player,
      ink: CONFIG.ink.total,
      hasSubmitted: false,
    })) as unknown as readonly [PlayerState, PlayerState],
  };
}

/** Knockback multiplier for a player's current Wobble. PRD §5.3. */
export function knockbackMultiplier(wobble: number): number {
  const { max, knockbackMultiplierAtMax } = CONFIG.wobble;
  const t = max <= 0 ? 0 : Math.min(1, Math.max(0, wobble / max));
  return 1 + (knockbackMultiplierAtMax - 1) * t;
}

/** Adds Wobble from an impact, capped at the configured ceiling. PRD §5.3. */
export function addWobble(player: PlayerState, impulse: number): PlayerState {
  const gained = impulse * CONFIG.wobble.gainPerImpulse;
  return { ...player, wobble: Math.min(CONFIG.wobble.max, player.wobble + gained) };
}

/** The next phase in the Turn cycle. Score wraps back to Setup. PRD §6. */
export function nextPhase(phase: Phase): Phase {
  switch (phase) {
    case 'setup':
      return 'draw';
    case 'draw':
      return 'cast';
    case 'cast':
      return 'reveal';
    case 'reveal':
      return 'resolve';
    case 'resolve':
      return 'score';
    case 'score':
      return 'setup';
  }
}
