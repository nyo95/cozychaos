import { randomUUID } from 'node:crypto';
import {
  CONFIG,
  applyResolveOutcome,
  applyTurnCap,
  buildRuneBody,
  canMove,
  clamp,
  composeStroke,
  createMatch,
  createSetupBody,
  createTurnEnvironment,
  decayWobble,
  nextPhase,
  runResolve,
  spawnPosition,
  startNextTurn,
  stepSetupMovement,
  NEUTRAL_INTENT,
  type MatchState,
  type MoveIntent,
  type SetupBody,
  type Phase,
  type PlayerSlot,
  type RecipeSummary,
  type ResolveResult,
  type RoomView,
  type ServerMessage,
  type SpellRecipe,
  type Vec2,
} from '../../shared/src/index.js';

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
  readonly kind = 'classic' as const;
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

  // M-04. Live only during Setup: `setupBodies` is non-null exactly while the
  // phase clock is in Setup, so a stray `move` outside the phase has nowhere to
  // land even if the phase check above it were ever removed.
  private setupBodies: [SetupBody, SetupBody] | null = null;
  private moveIntents: [MoveIntent, MoveIntent] = [NEUTRAL_INTENT, NEUTRAL_INTENT];
  private setupSteppedMs = 0;

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

  /**
   * M-03 — accepts a stroke, and says so.
   *
   * Two defects were fixed here. `strokeLimits.submitGraceMs` existed but was
   * never read: a stroke released on the last frame of Draw lost to its own
   * network latency, so a player on a slow connection was quietly playing a
   * shorter Draw phase than their opponent. That contradicts A-03 and PRD §15,
   * which put latency outside the set of things that decide a Turn.
   *
   * And the client displayed "Rune locked" the instant it *sent*, whether or
   * not anything arrived. Now the server acknowledges, and the client only
   * claims a lock it actually has.
   */
  submitStroke(slot: PlayerSlot, points: readonly Vec2[]): void {
    if (!this.acceptsLateInput('draw')) {
      this.sendTo(slot, { type: 'ack', of: 'submit', accepted: false, reason: 'phase-closed' });
      return;
    }
    if (this.submissions[slot].points !== null) {
      this.sendTo(slot, { type: 'ack', of: 'submit', accepted: false, reason: 'already-submitted' });
      return;
    }
    const repaired = repairStroke(points);
    this.submissions[slot] = {
      points: repaired,
      recipe: composeStroke(repaired).recipe,
      castDirection: null,
    };
    this.sendTo(slot, { type: 'ack', of: 'submit', accepted: true });
  }

  submitCast(slot: PlayerSlot, direction: Vec2): void {
    if (!this.acceptsLateInput('cast')) {
      this.sendTo(slot, { type: 'ack', of: 'cast', accepted: false, reason: 'phase-closed' });
      return;
    }
    if (this.submissions[slot].castDirection !== null) {
      this.sendTo(slot, { type: 'ack', of: 'cast', accepted: false, reason: 'already-submitted' });
      return;
    }
    this.submissions[slot].castDirection = direction;
    this.sendTo(slot, { type: 'ack', of: 'cast', accepted: true });
  }

  /**
   * True while `phase` is open, plus the configured grace window after it.
   *
   * The grace is bounded by the *next* phase still being the one that follows,
   * so a stroke can never arrive late enough to be applied to a different Turn.
   * Reveal is what truly locks a submission (PRD §15); grace only covers the
   * gap between a player letting go and the packet landing.
   */
  private acceptsLateInput(phase: 'draw' | 'cast'): boolean {
    if (this.state.phase === phase) return true;
    if (this.state.phase !== nextPhase(phase)) return false;
    const sincePhaseStart = this.lastTickMs - this.phaseStartedMs;
    return sincePhaseStart <= CONFIG.strokeLimits.submitGraceMs;
  }

  private sendTo(slot: PlayerSlot, message: ServerMessage): void {
    const seat = this.seats[slot];
    if (seat && seat.connected) seat.send(message);
  }

  /**
   * Records a movement intent (M-04).
   *
   * Two gates, not one: `canMove` reads `CONFIG.movement.activePhases` so A-03
   * stays a config fact rather than a hard-coded phase name here, and
   * `setupBodies` is only non-null inside Setup. A `move` that arrives late —
   * after the phase clock has moved on — is dropped rather than applied to the
   * next Setup, because applying it would let a laggy client start walking
   * before its opponent could.
   */
  submitMove(slot: PlayerSlot, direction: -1 | 0 | 1, jump: boolean): void {
    if (!canMove(this.state)) return;
    if (this.setupBodies === null) return;
    const previous = this.moveIntents[slot];
    // Jump is edge-triggered and latches until the integrator consumes it, so a
    // press that lands between two ticks is not silently dropped.
    this.moveIntents[slot] = { direction, jump: jump || previous.jump };
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
      this.setupSteppedMs = 0;
      return;
    }

    if (this.state.phase === 'setup') this.stepSetup(nowMs);

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
    if (phase === 'setup') {
      this.clearSubmissions();
      this.beginSetupMovement(nowMs);
    } else {
      this.endSetupMovement();
    }
  }

  /** M-04 — opens the Setup movement window from the authoritative positions. */
  private beginSetupMovement(nowMs: number): void {
    this.setupBodies = [
      createSetupBody(0, this.positions[0]),
      createSetupBody(1, this.positions[1]),
    ];
    this.moveIntents = [NEUTRAL_INTENT, NEUTRAL_INTENT];
    this.setupSteppedMs = 0;
    this.lastTickMs = Math.max(this.lastTickMs, nowMs);
  }

  /**
   * Closes the window and commits the result.
   *
   * Committing here rather than per-tick means `positions` — the value Resolve
   * builds its world from — only ever changes at a phase boundary. A rune is
   * therefore always spawned from where the wizard finished standing, never
   * from a position that was still moving when the stroke was read.
   */
  private endSetupMovement(): void {
    const bodies = this.setupBodies;
    if (bodies === null) return;
    this.positions = [
      { x: bodies[0].x, y: bodies[0].y },
      { x: bodies[1].x, y: bodies[1].y },
    ];
    this.setupBodies = null;
    this.moveIntents = [NEUTRAL_INTENT, NEUTRAL_INTENT];
  }

  /**
   * Integrates held intents against the phase clock, not the wall clock.
   *
   * `setupSteppedMs` tracks how much of the phase has already been simulated so
   * a slow or bunched tick cannot hand the integrator more Setup time than the
   * phase actually contains. Without it, a serverless function resuming from
   * suspension (M-05) would let both wizards sprint the full island in one
   * frame.
   */
  private stepSetup(nowMs: number): void {
    const bodies = this.setupBodies;
    if (bodies === null) return;
    const budget = Math.min(nowMs - this.phaseStartedMs, phaseDuration('setup'));
    const deltaMs = budget - this.setupSteppedMs;
    if (deltaMs <= 0) return;
    this.setupSteppedMs = budget;
    stepSetupMovement(bodies, this.moveIntents, deltaMs / 1000);
    // A consumed jump must not repeat on the next tick; a held direction must.
    this.moveIntents = [
      { direction: this.moveIntents[0].direction, jump: false },
      { direction: this.moveIntents[1].direction, jump: false },
    ];
    this.broadcast({
      type: 'setupFrame',
      positions: [
        { x: bodies[0].x, y: bodies[0].y },
        { x: bodies[1].x, y: bodies[1].y },
      ],
      jumpsLeft: [bodies[0].jumpsLeft, bodies[1].jumpsLeft],
    });
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
      // No knock-out. M-01: a Round that has run this long has no natural exit,
      // so the cap decides it on Wobble before checking for another Turn.
      const capped = applyTurnCap(this.state, [resolve.endWobble[0], resolve.endWobble[1]]);
      if (capped !== null) {
        next = capped;
        this.positions = [spawnPosition(0), spawnPosition(1)];
        this.wobble = [0, 0];
      } else {
        // The Round continues: positions carry over, Wobble carries over minus
        // the per-Turn bleed (M-06).
        next = startNextTurn(this.state);
        this.positions = [resolve.endPositions[0], resolve.endPositions[1]];
        this.wobble = [decayWobble(resolve.endWobble[0]), decayWobble(resolve.endWobble[1])];
      }
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
