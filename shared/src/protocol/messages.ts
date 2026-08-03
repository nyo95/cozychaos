import type { HazardSpikeConfig, Phase } from '../config/types.js';
import type { PlayerSlot } from '../match/state.js';
import type { Vec2 } from '../spells/geometry.js';
import type { RecipeSummary } from '../spells/composition.js';
import type { Snapshot } from '../sim/world.js';
import type { DodgeDir } from '../arena/state.js';

/**
 * Which game a room runs. `classic` is the turn-based drawing duel; `arena` is
 * the real-time Rune Arena sub-game (DESIGN-RUNE-ARENA.md). A room's mode is
 * fixed by whoever creates it; a player joining by code joins whatever it is.
 */
export type RoomMode = 'classic' | 'arena';

/**
 * The client/server wire protocol. PRD §15 — the server is authoritative for
 * phases, stroke reading, scoring, and physics; the client sends normalised
 * strokes and receives snapshots.
 *
 * Everything is a discriminated union on `type`, so a single switch handles a
 * message and TypeScript proves every case is covered on both ends. Client and
 * server import these exact types, which is the "shared schema" PRD §15 and §21
 * require.
 */

/** Public view of a player, safe to send to the opponent. */
export interface PlayerView {
  readonly slot: PlayerSlot;
  readonly name: string;
  readonly stars: number;
  readonly connected: boolean;
}

/** Full room state, broadcast whenever it changes. */
export interface RoomView {
  readonly code: string;
  readonly players: readonly PlayerView[];
  readonly phase: Phase;
  readonly turn: number;
  readonly round: number;
  /** Milliseconds left in the current phase, for the client countdown. */
  readonly phaseRemainingMs: number;
  readonly suddenDeath: boolean;
  readonly winner: PlayerSlot | null;
  readonly wind: Vec2;
  /** Authoritative, seeded, immutable obstacle layout for the current Round. */
  readonly obstacles: readonly HazardSpikeConfig[];
}

// ── Client → Server ────────────────────────────────────────────────────────

export interface JoinMessage {
  readonly type: 'join';
  readonly name: string;
  /** Omitted or empty to create a fresh room. */
  readonly code?: string;
  /** Presented on reconnect to reclaim a slot. A-06. */
  readonly reconnectToken?: string;
  /** Which game to create. Only read when creating a fresh room; defaults to classic. */
  readonly mode?: RoomMode;
}

/**
 * A submitted stroke. Points are in normalised arena coordinates (A-04), never
 * pixels, so screen size cannot affect the result (PRD §15). The server reads
 * and scores it — the client's own reading is only a preview.
 */
export interface SubmitStrokeMessage {
  readonly type: 'submit';
  readonly points: readonly Vec2[];
}

/** Direction-only second gesture. Magnitude is ignored server-side. */
export interface CastMessage {
  readonly type: 'cast';
  readonly direction: Vec2;
}

/**
 * Held-direction movement intent for the Setup phase (M-04, A-08).
 *
 * This carries *intent*, never position. The server integrates it, so a client
 * cannot claim to be somewhere it could not have walked to, and there is no
 * client-side prediction to reconcile.
 *
 * Sent on change rather than per frame: the server holds the last intent until
 * the next one arrives, so a dropped repeat does not stop a player mid-stride.
 * The cost of that choice is that a lost *release* keeps a player walking until
 * the next message or the end of Setup — which is why the client also sends a
 * neutral intent when the phase ends and when the window loses focus.
 */
export interface MoveMessage {
  readonly type: 'move';
  /** -1 left, 0 neither, +1 right. Anything else is rejected at the boundary. */
  readonly direction: -1 | 0 | 1;
  /** Edge-triggered. The server consumes one jump and ignores repeats. */
  readonly jump: boolean;
}

export interface RematchMessage {
  readonly type: 'rematch';
}

export interface LeaveMessage {
  readonly type: 'leave';
}

/**
 * Real-time movement intent for the Rune Arena duel. Like `MoveMessage` this is
 * intent, not position — the server integrates it — but it is legal for the
 * whole duel, not just a Setup window, and the server owns confinement to the
 * player's half of the arena.
 */
export interface ArenaInputMessage {
  readonly type: 'arenaInput';
  readonly move: -1 | 0 | 1;
  readonly jump: boolean;
}

/** A swipe-triggered dodge in the Rune Arena (Tekken mapping, DESIGN §4). */
export interface ArenaDodgeMessage {
  readonly type: 'arenaDodge';
  readonly dir: DodgeDir;
}

export type ClientMessage =
  | JoinMessage
  | SubmitStrokeMessage
  | CastMessage
  | MoveMessage
  | RematchMessage
  | LeaveMessage
  | ArenaInputMessage
  | ArenaDodgeMessage;

// ── Server → Client ────────────────────────────────────────────────────────

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly slot: PlayerSlot;
  readonly code: string;
  /** Presented on a later reconnect to reclaim this slot. */
  readonly reconnectToken: string;
  readonly room: RoomView;
}

export interface RoomStateMessage {
  readonly type: 'room';
  readonly room: RoomView;
}

/** Both runes are revealed at once so neither player can react (PRD §15). */
export interface RevealMessage {
  readonly type: 'reveal';
  readonly summaries: readonly (RecipeSummary | null)[];
}

/** One physics frame during Resolve. The client interpolates between these. */
export interface FrameMessage {
  readonly type: 'frame';
  readonly snapshot: Snapshot;
}

/**
 * Authoritative wizard positions during Setup (M-04).
 *
 * A separate, tiny message rather than fields on `RoomView`: the room view
 * carries the obstacle layout and player roster, and re-broadcasting all of
 * that at tick rate to animate two moving dots would be wasteful. It also keeps
 * `RoomView` a "changes rarely" message, which is what the client's diffing
 * assumes.
 *
 * The client renders these directly and never integrates its own. That is the
 * whole point: what you see is where the server says you are.
 */
export interface SetupFrameMessage {
  readonly type: 'setupFrame';
  readonly positions: readonly [Vec2, Vec2];
  /** Remaining jumps per slot, so the HUD can grey out a spent jump button. */
  readonly jumpsLeft: readonly [number, number];
}

/**
 * M-03 — the server's answer to a `submit` or `cast`.
 *
 * Without this the client showed "Rune locked" the moment it called `send()`,
 * which is a claim about a socket, not about the match. A stroke dropped for
 * arriving after the phase closed looked identical to one that was accepted,
 * and the player only found out at Reveal when nothing of theirs appeared.
 */
export interface AckMessage {
  readonly type: 'ack';
  readonly of: 'submit' | 'cast';
  readonly accepted: boolean;
  /** Present only when `accepted` is false. */
  readonly reason?: 'phase-closed' | 'already-submitted';
}

export interface ScoreMessage {
  readonly type: 'score';
  readonly stars: readonly number[];
  readonly knockouts: readonly PlayerSlot[];
  readonly winner: PlayerSlot | null;
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly reason: string;
}

// ── Rune Arena (real-time sub-game) ──────────────────────────────────────────

/** Public per-player view for the Rune Arena, broadcast at tick rate. */
export interface ArenaPlayerView {
  readonly slot: PlayerSlot;
  readonly name: string;
  readonly connected: boolean;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly facing: -1 | 1;
  /** True while dodge i-frames are active — the client shows the dodge pose. */
  readonly dodging: boolean;
  readonly dodgeDir: DodgeDir | null;
}

/** Full Rune Arena state for one frame. Analogous to `RoomView` for classic. */
export interface ArenaView {
  readonly code: string;
  readonly mode: 'arena';
  readonly started: boolean;
  readonly winner: PlayerSlot | null;
  readonly timeMs: number;
  readonly players: readonly ArenaPlayerView[];
}

export interface ArenaWelcomeMessage {
  readonly type: 'arenaWelcome';
  readonly slot: PlayerSlot;
  readonly code: string;
  readonly reconnectToken: string;
  readonly view: ArenaView;
}

export interface ArenaStateMessage {
  readonly type: 'arenaState';
  readonly view: ArenaView;
}

export type ServerMessage =
  | WelcomeMessage
  | RoomStateMessage
  | RevealMessage
  | FrameMessage
  | SetupFrameMessage
  | AckMessage
  | ScoreMessage
  | ErrorMessage
  | ArenaWelcomeMessage
  | ArenaStateMessage;

// ── Runtime validation ───────────────────────────────────────────────────────

/**
 * Parses and validates an inbound client message.
 *
 * The server must never trust the wire. PRD §15 requires it to cap point count,
 * stroke length, and submit time; the point-count cap is enforced here at the
 * boundary, and the rest in the room. Returns null for anything malformed
 * rather than throwing, so one bad client cannot crash the room.
 */
export function parseClientMessage(raw: string, maxPoints: number): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const message = value as Record<string, unknown>;

  switch (message['type']) {
    case 'join': {
      if (typeof message['name'] !== 'string') return null;
      const join: JoinMessage = { type: 'join', name: message['name'].slice(0, 24) };
      const mode = message['mode'];
      return {
        ...join,
        ...(typeof message['code'] === 'string' ? { code: message['code'] } : {}),
        ...(typeof message['reconnectToken'] === 'string'
          ? { reconnectToken: message['reconnectToken'] }
          : {}),
        ...(mode === 'classic' || mode === 'arena' ? { mode } : {}),
      };
    }
    case 'submit': {
      if (!Array.isArray(message['points'])) return null;
      const points: Vec2[] = [];
      for (const raw of message['points'] as unknown[]) {
        if (points.length >= maxPoints) break;
        if (typeof raw !== 'object' || raw === null) continue;
        const point = raw as Record<string, unknown>;
        if (typeof point['x'] !== 'number' || typeof point['y'] !== 'number') continue;
        if (!Number.isFinite(point['x']) || !Number.isFinite(point['y'])) continue;
        points.push({ x: point['x'], y: point['y'] });
      }
      return { type: 'submit', points };
    }
    case 'cast': {
      const rawDirection = message['direction'];
      if (typeof rawDirection !== 'object' || rawDirection === null) return null;
      const direction = rawDirection as Record<string, unknown>;
      if (typeof direction['x'] !== 'number' || typeof direction['y'] !== 'number') return null;
      if (!Number.isFinite(direction['x']) || !Number.isFinite(direction['y'])) return null;
      return { type: 'cast', direction: { x: direction['x'], y: direction['y'] } };
    }
    case 'move': {
      // Direction is an enum on the wire, not a number to be scaled. Accepting
      // an arbitrary float here would let a client walk at any speed it liked,
      // which is exactly the geometry cheat `repairStroke` closes for strokes.
      const direction = message['direction'];
      if (direction !== -1 && direction !== 0 && direction !== 1) return null;
      if (typeof message['jump'] !== 'boolean') return null;
      return { type: 'move', direction, jump: message['jump'] };
    }
    case 'arenaInput': {
      const move = message['move'];
      if (move !== -1 && move !== 0 && move !== 1) return null;
      if (typeof message['jump'] !== 'boolean') return null;
      return { type: 'arenaInput', move, jump: message['jump'] };
    }
    case 'arenaDodge': {
      const dir = message['dir'];
      if (dir !== 'left' && dir !== 'right' && dir !== 'up' && dir !== 'down') return null;
      return { type: 'arenaDodge', dir };
    }
    case 'rematch':
      return { type: 'rematch' };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}
