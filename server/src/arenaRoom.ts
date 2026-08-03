import { randomUUID } from 'node:crypto';
import {
  ARENA,
  CONFIG,
  createArena,
  queueDodge,
  setConnected,
  setMoveIntent,
  stepArena,
  isInvulnerable,
  type ArenaState,
  type ArenaView,
  type DodgeDir,
  type PlayerSlot,
  type ServerMessage,
} from '../../shared/src/index.js';

/**
 * One Rune Arena room, driven by an authoritative real-time clock
 * (DESIGN-RUNE-ARENA.md §6). The server owns the simulation; clients send
 * intent (`arenaInput`, `arenaDodge`) and render the `arenaState` frames it
 * broadcasts. No rollback: the fixed-step sim runs here and only here.
 *
 * Kept socket-free for the same reason as the classic `Room`: a seat is a name
 * and a `send` function, so the whole loop is unit-testable with a fake clock.
 * The `kind` discriminant lets the ws adapter route messages to the right room.
 */

interface Seat {
  name: string;
  readonly token: string;
  connected: boolean;
  disconnectedAtMs: number | null;
  send: (message: ServerMessage) => void;
}

/** Never simulate more than this much wall time in one tick (M-05 anti-spiral). */
const MAX_CATCHUP_MS = 250;

export class ArenaRoom {
  readonly kind = 'arena' as const;

  private state: ArenaState = createArena();
  private readonly seats: (Seat | null)[] = [null, null];
  private started = false;
  private lastTickMs = 0;
  private accumulatorMs = 0;
  private emptySinceMs: number | null = null;

  constructor(readonly code: string) {}

  get isEmpty(): boolean {
    return this.seats.every((seat) => seat === null || !seat.connected);
  }

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
        this.state = setConnected(this.state, slot as PlayerSlot, true);
        this.sendWelcome(slot as PlayerSlot);
        this.broadcastState();
        return slot as PlayerSlot;
      }
    }

    const found = this.seats.findIndex((seat) => seat === null);
    if (found < 0) return null;
    const slot = found as PlayerSlot;

    this.seats[slot] = {
      name: name || `Wizard ${slot + 1}`,
      token: randomUUID(),
      connected: true,
      disconnectedAtMs: null,
      send,
    };
    this.emptySinceMs = null;
    this.state = setConnected(this.state, slot, true);
    this.sendWelcome(slot);
    this.broadcastState();

    if (this.seats.every((seat) => seat !== null) && !this.started) {
      this.started = true;
    }
    return slot;
  }

  markDisconnected(
    slot: PlayerSlot,
    nowMs = this.lastTickMs,
    expectedSend?: (message: ServerMessage) => void,
  ): void {
    const seat = this.seats[slot];
    if (!seat || (expectedSend !== undefined && seat.send !== expectedSend)) return;
    if (seat.connected) {
      seat.connected = false;
      seat.disconnectedAtMs = nowMs;
      this.state = setConnected(this.state, slot, false);
    }
    if (this.isEmpty && this.emptySinceMs === null) this.emptySinceMs = nowMs;
    this.broadcastState();
  }

  shouldReap(nowMs: number): boolean {
    return this.emptySinceMs !== null && nowMs - this.emptySinceMs >= CONFIG.reconnect.windowMs;
  }

  /** Restart the duel when both players ask. */
  voteRematch(_slot: PlayerSlot, _nowMs = this.lastTickMs): void {
    if (this.state.winner === null) return;
    this.state = createArena();
    for (const slot of [0, 1] as const) {
      this.state = setConnected(this.state, slot, this.seats[slot]?.connected ?? false);
    }
    this.broadcastState();
  }

  // ── Real-time input ────────────────────────────────────────────────────────

  input(slot: PlayerSlot, move: -1 | 0 | 1, jump: boolean): void {
    if (!this.canAct()) return;
    this.state = setMoveIntent(this.state, slot, move, jump);
  }

  dodge(slot: PlayerSlot, dir: DodgeDir): void {
    if (!this.canAct()) return;
    this.state = queueDodge(this.state, slot, dir);
  }

  private canAct(): boolean {
    return this.started && this.state.winner === null;
  }

  // ── Clock ──────────────────────────────────────────────────────────────────

  tick(nowMs: number): void {
    const dt = nowMs - this.lastTickMs;
    this.lastTickMs = nowMs;
    if (dt <= 0) return;

    // Hold the sim until both seats are present and connected (A-06 analogue).
    if (!this.started || !this.allConnected()) {
      this.accumulatorMs = 0;
      return;
    }

    this.accumulatorMs = Math.min(this.accumulatorMs + dt, MAX_CATCHUP_MS);
    let stepped = false;
    while (this.accumulatorMs >= ARENA.stepMs) {
      this.state = stepArena(this.state);
      this.accumulatorMs -= ARENA.stepMs;
      stepped = true;
    }
    if (stepped) this.broadcastState();
  }

  private allConnected(): boolean {
    return this.seats.every((seat) => seat !== null && seat.connected);
  }

  // ── Views ────────────────────────────────────────────────────────────────

  private view(): ArenaView {
    return {
      code: this.code,
      mode: 'arena',
      started: this.started,
      winner: this.state.winner,
      timeMs: this.state.timeMs,
      players: this.state.players.map((p) => ({
        slot: p.slot,
        name: this.seats[p.slot]?.name ?? '—',
        connected: this.seats[p.slot]?.connected ?? false,
        x: p.x,
        y: p.y,
        hp: p.hp,
        facing: p.facing,
        dodging: isInvulnerable(p, this.state.timeMs),
        dodgeDir: p.dodge?.dir ?? null,
      })),
    };
  }

  private sendWelcome(slot: PlayerSlot): void {
    const seat = this.seats[slot];
    if (!seat) return;
    seat.send({
      type: 'arenaWelcome',
      slot,
      code: this.code,
      reconnectToken: seat.token,
      view: this.view(),
    });
  }

  private broadcastState(): void {
    const message: ServerMessage = { type: 'arenaState', view: this.view() };
    for (const seat of this.seats) {
      if (seat && seat.connected) seat.send(message);
    }
  }
}
