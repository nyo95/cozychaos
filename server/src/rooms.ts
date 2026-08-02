import { randomInt } from 'node:crypto';
import type { ServerMessage } from '../../shared/src/index.js';
import { Room } from './room.js';

/**
 * Owns the set of live rooms and hands out room codes.
 *
 * Kept separate from both the socket layer and the match logic so it can be
 * driven in tests: create a room, join two fake seats, tick a clock.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private seq = 0;

  /** Finds an existing room, or creates one under the given code. */
  getOrCreate(code: string | undefined): Room {
    const normalised = (code ?? '').trim().toUpperCase();
    if (normalised && this.rooms.has(normalised)) return this.rooms.get(normalised)!;

    const finalCode = normalised || this.freshCode();
    const room = new Room(finalCode, this.nextSeed());
    this.rooms.set(finalCode, room);
    return room;
  }

  get(code: string): Room | undefined {
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
