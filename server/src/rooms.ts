import { randomInt } from 'node:crypto';
import type { RoomMode, ServerMessage } from '../../shared/src/index.js';
import { Room } from './room.js';
import { ArenaRoom } from './arenaRoom.js';

/** Either flavour of room. The `kind` discriminant lets callers narrow safely. */
export type AnyRoom = Room | ArenaRoom;

/**
 * Owns the set of live rooms and hands out room codes.
 *
 * Kept separate from both the socket layer and the match logic so it can be
 * driven in tests: create a room, join two fake seats, tick a clock. A room's
 * mode is decided when it is first created (classic drawing duel vs. real-time
 * Rune Arena); joining an existing code joins whatever mode that room already is.
 */
export class RoomManager {
  private readonly rooms = new Map<string, AnyRoom>();
  private seq = 0;

  /** Finds an existing room, or creates one under the given code in the given mode. */
  getOrCreate(code: string | undefined, mode: RoomMode = 'classic'): AnyRoom {
    const normalised = (code ?? '').trim().toUpperCase();
    if (normalised && this.rooms.has(normalised)) return this.rooms.get(normalised)!;

    const finalCode = normalised || this.freshCode();
    const room: AnyRoom = mode === 'arena' ? new ArenaRoom(finalCode) : new Room(finalCode, this.nextSeed());
    this.rooms.set(finalCode, room);
    return room;
  }

  get(code: string): AnyRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Advances every room and reaps the empty ones. */
  tick(nowMs: number): void {
    for (const [code, room] of this.rooms) {
      room.tick(nowMs);
      if (room.shouldReap(nowMs)) this.rooms.delete(code);
    }
  }

  get size(): number {
    return this.rooms.size;
  }

  private freshCode(): string {
    // Ambiguous characters (0/O, 1/I) left out so codes are easy to read aloud.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  private nextSeed(): number {
    // Distinct, reproducible-per-process seeds. PRD §21 — no wall-clock in the
    // seed so a replay of a room is stable given its creation order.
    this.seq += 1;
    return (this.seq * 2654435761) >>> 0;
  }
}

export type { ServerMessage };
