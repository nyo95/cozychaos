import type { HazardSpikeConfig, Phase } from '../config/types.js';
import type { PlayerSlot } from '../match/state.js';
import type { Vec2 } from '../spells/geometry.js';
import type { RecipeSummary } from '../spells/composition.js';
import type { Snapshot } from '../sim/world.js';

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

export interface RematchMessage {
  readonly type: 'rematch';
}

export interface LeaveMessage {
  readonly type: 'leave';
}

export type ClientMessage = JoinMessage | SubmitStrokeMessage | CastMessage | RematchMessage | LeaveMessage;

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

export type ServerMessage =
  | WelcomeMessage
  | RoomStateMessage
  | RevealMessage
  | FrameMessage
  | ScoreMessage
  | ErrorMessage;

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
      return {
        ...join,
        ...(typeof message['code'] === 'string' ? { code: message['code'] } : {}),
        ...(typeof message['reconnectToken'] === 'string'
          ? { reconnectToken: message['reconnectToken'] }
          : {}),
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
    case 'rematch':
      return { type: 'rematch' };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}
