import { randomUUID } from 'node:crypto';
import {
  CONFIG,
  applyResolveOutcome,
  buildRuneBody,
  clamp,
  composeStroke,
  createMatch,
  createTurnEnvironment,
  nextPhase,
  runResolve,
  spawnPosition,
  startNextTurn,
  type MatchState,
  type Phase,
  type PlayerSlot,
  type RecipeSummary,
  type ResolveResult,
  type RoomView,
  type ServerMessage,
  type SpellRecipe,
  type Vec2,
} from '@cozy/shared';

/**
 * One duel room, driven by an authoritative phase clock. PRD §15 — the server
 * owns phases, stroke reading, scoring, and physics.
 *
 * Deliberately free of any socket dependency: a seat is just a name and a
 * `send` function. That keeps the whole match loop unit-testable with a fake
 * clock and a pair of message collectors, which is how the no-desync guarantee
 * is verified without two real browsers (PRD §20). The WebSocket server is a
 * thin adapter over this.
 */

interface Seat {
  name: string;
  readonly token: string;
  connected: boolean;
  disconnectedAtMs: number | null;
  send: (message: ServerMessage) => void;
}

interface TurnSubmission {
  points: readonly Vec2[] | null;
  recipe: SpellRecipe | null;
  castDirection: Vec2 | null;
}

export class Room {
  private state: MatchState;
  private readonly seats: (Seat | null)[] = [null, null];
  private positions: [Vec2, Vec2] = [spawnPosition(0), spawnPosition(1)];
  private wobble: [number, number] = [0, 0];
  private submissions: [TurnSubmission, TurnSubmission] = [
    { points: null, recipe: null, castDirection: null },
    { points: null, recipe: null, castDirection: null },
  ];
  private started = false;
  private phaseStartedMs = 0;
  private lastTickMs = 0;
  private emptySinceMs: number | null = null;

  private resolve: ResolveResult | null = null;
  private resolveStartedMs = 0;
  private nextFrameIndex = 0;
  private rematchVotes = new Set<PlayerSlot>();

  constructor(
    readonly code: string,
    seed: number,
  ) {
    this.state = createMatch(seed);
  }

  get isEmpty(): boolean {
    return this.seats.every((seat) => seat === null || !seat.connected);
  }

  /** Seats a player, or reclaims a slot on reconnect. Returns the slot or null. */
  join(
    name: string,
    send: (message: ServerMessage) => void,
    token?: string,
    nowMs = this.lastTickMs,
  ): PlayerSlot | null {
    this.lastTickMs = Math.max(this.lastTickMs, nowMs);
    if (token) {
      const slot = this.seats.findIndex((seat) => seat?.token === token);
      if (slot >= 0) {
        const seat = this.seats[slot]!;
        if (
          seat.disconnectedAtMs !== null &&
          nowMs - seat.disconnectedAtMs > CONFIG.reconnect.windowMs
        ) {
          return null;
        }
        seat.connected = true;
        seat.disconnectedAtMs = null;
        seat.send = send;
        this.emptySinceMs = null;
        this.sendWelcome(slot as PlayerSlot);
        this.broadcastRoom();
        return slot as PlayerSlot;
      }
    }

    const slot = this.seats.findIndex((seat) => seat === null) as PlayerSlot | -1;
    if (slot < 0) return null;

    this.seats[slot] = {
      name: name || `Wizard ${slot + 1}`,
      token: makeToken(),
      connected: true,
      disconnectedAtMs: null,
      send,
    };
    this.emptySinceMs = null;
    this.sendWelcome(slot as PlayerSlot);
    this.broadcastRoom();

    if (this.seats.every((seat) => seat !== null) && !this.started) {
      this.start(nowMs);
    }
    return slot as PlayerSlot;
  }

  markDisconnected(
    slot: PlayerSlot,
    nowMs = this.lastTickMs,
    expectedSend?: (message: ServerMessage) => void,
  ): void {
    const seat = this.seats[slot];
    // A late close event from a replaced socket must not disconnect the fresh
    // reconnect that already owns this seat.
    if (!seat || (expectedSend !== undefined && seat.send !== expectedSend)) return;
    if (seat.connected) {
      seat.connected = false;
      seat.disconnectedAtMs = nowMs;
    }
    if (this.isEmpty && this.emptySinceMs === null) this.emptySinceMs = nowMs;
    this.broadcastRoom();
  }

  /** Keeps an empty room alive for the reconnect window instead of reaping it immediately. */
  shouldReap(nowMs: number): boolean {
    return (
      this.emptySinceMs !== null &&
      nowMs - this.emptySinceMs >= CONFIG.reconnect.windowMs
    );
  }

  submitStroke(slot: PlayerSlot, points: readonly Vec2[]): void {
    // Accepted only during Draw, and only once. PRD §15 — locked before Reveal.
    if (this.state.phase !== 'draw') return;
    if (this.submissions[slot].points !== null) return;
    const repaired = repairStroke(points);
    this.submissions[slot] = {
      points: repaired,
      recipe: composeStroke(repaired).recipe,
      castDirection: null,
    };
  }

  submitCast(slot: PlayerSlot, direction: Vec2): void {
    if (this.state.phase !== 'cast') return;
    if (this.submissions[slot].castDirection !== null) return;
    this.submissions[slot].castDirection = direction;
  }

  voteRematch(slot: PlayerSlot, nowMs = this.lastTickMs): void {
    this.lastTickMs = Math.max(this.lastTickMs, nowMs);
    if (this.state.winner === null) return;
    this.rematchVotes.add(slot);
    if (this.rematchVotes.size >= 2) {
      this.rematchVotes.clear();
      this.state = createMatch((this.state.seed * 1103515245 + 12345) >>> 0);
      this.positions = [spawnPosition(0), spawnPosition(1)];
      this.wobble = [0, 0];
      this.clearSubmissions();
      this.start(nowMs);
    }
  }

  /**
   * Advances the match by real time. Called on an interval by the ws server and
   * with a fake clock by tests. All phase transitions and frame emission happen
   * here, so the room has no timers of its own.
   */
  tick(nowMs: number): void {
    this.lastTickMs = nowMs;
    this.resolveReconnectTimeout(nowMs);
    if (!this.started || this.state.winner !== null) return;

    // A-06: finish an in-flight Turn, then hold at Setup until the missing
    // player returns. Resetting the phase start keeps the full Setup duration
    // available once both seats are connected again.
    if (this.state.phase === 'setup' && !this.allPlayersConnected()) {
      this.phaseStartedMs = nowMs;
      return;
    }

    if (this.state.phase === 'resolve') {
      this.streamResolve(nowMs);
      return;
    }

    const elapsed = nowMs - this.phaseStartedMs;
    if (elapsed < phaseDuration(this.state.phase)) return;
    this.advancePhase(nowMs);
  }

  private start(nowMs: number): void {
    this.started = true;
    this.enterPhase('setup', nowMs);
    this.broadcastRoom();
  }

  private advancePhase(nowMs: number): void {
    // Score → Setup carries the already-resolved match state (turn/round/stars
    // were computed when Resolve finished) into the next Turn's Setup.
    if (this.state.phase === 'score') {
      this.enterPhase('setup', nowMs);
      this.broadcastRoom();
      return;
    }

    const upcoming = nextPhase(this.state.phase);
    if (upcoming === 'reveal') this.lockAndReveal();
    if (upcoming === 'resolve') {
      this.beginResolve(nowMs);
      return;
    }

    this.enterPhase(upcoming, nowMs);
    this.broadcastRoom();
  }

  private enterPhase(phase: Phase, nowMs: number): void {
    this.state = { ...this.state, phase, phaseElapsedMs: 0 };
    this.phaseStartedMs = nowMs;
    if (phase === 'setup') this.clearSubmissions();
  }

  /** Both runes are read server-side and revealed together (PRD §15). */
  private lockAndReveal(): void {
    const summaries: (RecipeSummary | null)[] = this.submissions.map((submission) =>
      submission.recipe ? submission.recipe.summary : null,
    );
    this.broadcast({ type: 'reveal', summaries });
  }

  private beginResolve(nowMs: number): void {
    const runes = ([0, 1] as const).map((slot) => {
      const submission = this.submissions[slot];
      const recipe = submission.recipe;
      return buildRuneBody({
        points: submission.points ?? [],
        owner: slot,
        casterPosition: this.positions[slot],
        castDirection: submission.castDirection ?? { x: slot === 0 ? 1 : -1, y: 0 },
        inkCommitted: recipe?.inkCommitted ?? 0,
        inkReserved: recipe?.inkReserved ?? CONFIG.ink.total,
      });
    }) as unknown as Parameters<typeof runResolve>[0]['runes'];
    const environment = createTurnEnvironment(this.state.seed, this.state.round);
    this.resolve = runResolve({
      positions: this.positions,
      wobble: this.wobble,
      runes,
      wind: environment.wind,
      obstacles: environment.obstacles,
    });
    this.enterPhase('resolve', nowMs);
    this.resolveStartedMs = nowMs;
    this.nextFrameIndex = 0;
    this.broadcastRoom();
  }

  private streamResolve(nowMs: number): void {
    const resolve = this.resolve;
    if (!resolve) return;
    const elapsed = nowMs - this.resolveStartedMs;

    while (
      this.nextFrameIndex < resolve.frames.length &&
      resolve.frames[this.nextFrameIndex]!.timeMs <= elapsed
    ) {
      this.broadcast({ type: 'frame', snapshot: resolve.frames[this.nextFrameIndex]! });
      this.nextFrameIndex += 1;
    }

    if (this.nextFrameIndex >= resolve.frames.length && elapsed >= resolve.durationMs) {
      this.finishResolve(nowMs);
    }
  }

  private finishResolve(nowMs: number): void {
    const resolve = this.resolve!;
    const knockouts = resolve.knockouts;

    // `next` is already advanced to the following Turn's Setup (turn/round/stars
    // updated). We hold it in the Score phase for the score pause, then flip it
    // to Setup in advancePhase.
    let next: MatchState;
    if (knockouts.length > 0) {
      next = applyResolveOutcome(this.state, { knockouts });
      // A knock-out ends the Round: positions and Wobble reset (A-01).
      this.positions = [spawnPosition(0), spawnPosition(1)];
      this.wobble = [0, 0];
    } else {
      // No knock-out: the Round continues, positions and Wobble carry over.
      next = startNextTurn(this.state);
      this.positions = [resolve.endPositions[0], resolve.endPositions[1]];
      this.wobble = [resolve.endWobble[0], resolve.endWobble[1]];
    }

    this.state = { ...next, phase: 'score', phaseElapsedMs: 0 };
    this.phaseStartedMs = nowMs;
    this.resolve = null;
    this.clearSubmissions();

    this.broadcast({
      type: 'score',
      stars: this.state.players.map((player) => player.stars),
      knockouts: knockouts.map((knockout) => knockout.slot),
      winner: this.state.winner,
    });
    this.broadcastRoom();
  }

  private clearSubmissions(): void {
    this.submissions = [
      { points: null, recipe: null, castDirection: null },
      { points: null, recipe: null, castDirection: null },
    ];
  }

  private allPlayersConnected(): boolean {
    return this.seats.every((seat) => seat?.connected === true);
  }

  /** A-06: missing the reconnect window concedes the match to the rival. */
  private resolveReconnectTimeout(nowMs: number): void {
    if (!this.started || this.state.winner !== null) return;
    const expired = this.seats.some(
      (seat) =>
        seat !== null &&
        !seat.connected &&
        seat.disconnectedAtMs !== null &&
        nowMs - seat.disconnectedAtMs >= CONFIG.reconnect.windowMs,
    );
    if (!expired) return;

    const connected = this.seats
      .map((seat, slot) => (seat?.connected ? (slot as PlayerSlot) : null))
      .filter((slot): slot is PlayerSlot => slot !== null);
    if (connected.length !== 1) return;

    const winner = connected[0]!;
    const players = this.state.players.map((player) =>
      player.slot === winner ? { ...player, stars: CONFIG.scoring.starsToWin } : player,
    ) as unknown as MatchState['players'];
    this.state = { ...this.state, players, winner };
    this.broadcast({
      type: 'score',
      stars: players.map((player) => player.stars),
      knockouts: [],
      winner,
    });
    this.broadcastRoom();
  }

  private sendWelcome(slot: PlayerSlot): void {
    const seat = this.seats[slot]!;
    seat.send({
      type: 'welcome',
      slot,
      code: this.code,
      reconnectToken: seat.token,
      room: this.roomView(),
    });
  }

  private broadcastRoom(): void {
    this.broadcast({ type: 'room', room: this.roomView() });
  }

  private broadcast(message: ServerMessage): void {
    for (const seat of this.seats) {
      if (seat && seat.connected) seat.send(message);
    }
  }

  private roomView(): RoomView {
    const environment = createTurnEnvironment(this.state.seed, this.state.round);
    const remaining =
      this.state.phase === 'resolve'
        ? Math.max(0, (this.resolve?.durationMs ?? 0) - (this.lastTickMs - this.resolveStartedMs))
        : Math.max(0, phaseDuration(this.state.phase) - (this.lastTickMs - this.phaseStartedMs));
    return {
      code: this.code,
      players: this.seats.map((seat, slot) => ({
        slot: slot as PlayerSlot,
        name: seat?.name ?? '—',
        stars: this.state.players[slot as PlayerSlot].stars,
        connected: seat?.connected ?? false,
      })),
      phase: this.started ? this.state.phase : 'setup',
      turn: this.state.turn,
      round: this.state.round,
      phaseRemainingMs: remaining,
      suddenDeath: this.state.suddenDeath,
      winner: this.state.winner,
      wind: environment.wind,
      obstacles: environment.obstacles,
    };
  }

}

function phaseDuration(phase: Phase): number {
  const p = CONFIG.phases;
  return phase === 'setup'
    ? p.setupMs
    : phase === 'draw'
      ? p.drawMs
      : phase === 'cast'
        ? p.castMs
      : phase === 'reveal'
        ? p.revealMs
        : phase === 'resolve'
          ? p.resolveMaxMs
          : p.scoreMs;
}

function makeToken(): string {
  // A reconnect credential is security entropy, not gameplay randomness.
  // `randomUUID` is deliberately outside the seeded simulation stream.
  return randomUUID();
}

/**
 * Repairs an untrusted polyline before any classifier or motif work runs.
 * The protocol already caps point count and rejects non-finite values; this
 * second boundary caps coordinates and walks only the configured maximum arc
 * length. A modified client therefore cannot inject enormous geometry or buy
 * extra force. Valid browser strokes pass through unchanged.
 */
function repairStroke(points: readonly Vec2[]): readonly Vec2[] {
  if (points.length === 0) return points;
  const coordinateLimit = CONFIG.arena.killWallX;
  const bounded = points.map((point) => ({
    x: clamp(point.x, -coordinateLimit, coordinateLimit),
    y: clamp(point.y, -coordinateLimit, coordinateLimit),
  }));
  const repaired: Vec2[] = [bounded[0]!];
  let remaining = CONFIG.strokeLimits.maxLength;

  for (let index = 1; index < bounded.length && remaining > 0; index += 1) {
    const previous = repaired[repaired.length - 1]!;
    const next = bounded[index]!;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength <= remaining) {
      repaired.push(next);
      remaining -= segmentLength;
      continue;
    }
    const fraction = remaining / segmentLength;
    repaired.push({ x: previous.x + dx * fraction, y: previous.y + dy * fraction });
    break;
  }
  return repaired;
}
