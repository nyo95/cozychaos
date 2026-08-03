import { describe, expect, it } from 'vitest';
import { ARENA, CONFIG, type ServerMessage } from '@cozy/shared';
import { ArenaRoom } from './arenaRoom.js';

/**
 * The Rune Arena skeleton, verified without a socket (mirrors `room.test.ts`).
 * Two collectors stand in for two browsers; a fake clock drives the real-time
 * loop. One authoritative room steps the fixed-timestep sim and broadcasts
 * identical `arenaState` frames, so the two clients cannot diverge.
 */
class Collector {
  readonly messages: ServerMessage[] = [];
  readonly send = (message: ServerMessage): void => {
    this.messages.push(message);
  };
  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
}

/** Drives the room from t=0 to `untilMs` in fixed clock steps. */
function drive(room: ArenaRoom, fromMs: number, untilMs: number): void {
  for (let t = fromMs; t <= untilMs; t += 16) room.tick(t);
}

describe('arena room lifecycle', () => {
  it('seats two players and welcomes each with its own slot', () => {
    const room = new ArenaRoom('TEST');
    const a = new Collector();
    const b = new Collector();

    expect(room.join('Ana', a.send, undefined, 0)).toBe(0);
    expect(room.join('Bo', b.send, undefined, 0)).toBe(1);

    expect(a.ofType('arenaWelcome')[0]?.slot).toBe(0);
    expect(b.ofType('arenaWelcome')[0]?.slot).toBe(1);
    expect(room.kind).toBe('arena');
  });

  it('refuses a third seat', () => {
    const room = new ArenaRoom('FULL');
    room.join('Ana', new Collector().send, undefined, 0);
    room.join('Bo', new Collector().send, undefined, 0);
    expect(room.join('Cy', new Collector().send, undefined, 0)).toBeNull();
  });

  it('holds the simulation until both seats are connected', () => {
    const room = new ArenaRoom('WAIT');
    const a = new Collector();
    room.join('Ana', a.send, undefined, 0);

    drive(room, 0, 500);
    // A lone player must not advance the clock.
    const last = a.ofType('arenaState').at(-1)?.view;
    expect(last?.timeMs ?? 0).toBe(0);
  });

  it('advances the sim once both are in and broadcasts frames to both', () => {
    const room = new ArenaRoom('LIVE');
    const a = new Collector();
    const b = new Collector();
    room.join('Ana', a.send, undefined, 0);
    room.join('Bo', b.send, undefined, 0);

    drive(room, 0, 500);

    const va = a.ofType('arenaState').at(-1)?.view;
    const vb = b.ofType('arenaState').at(-1)?.view;
    expect(va?.timeMs).toBeGreaterThan(0);
    // Identical authoritative state on both clients — the no-desync guarantee.
    expect(va?.timeMs).toBe(vb?.timeMs);
    expect(va?.started).toBe(true);
  });
});

describe('arena room input', () => {
  it('confines a player to its own half no matter how long it walks inward', () => {
    const room = new ArenaRoom('HALF');
    const a = new Collector();
    const b = new Collector();
    room.join('Ana', a.send, undefined, 0);
    room.join('Bo', b.send, undefined, 0);

    room.input(0, 1, false); // slot 0 walks right, toward centre
    drive(room, 0, 4000);

    const p0 = a.ofType('arenaState').at(-1)?.view.players[0];
    expect(p0?.x).toBeLessThan(0);
  });

  it('reports a dodge in the broadcast state', () => {
    const room = new ArenaRoom('ROLL');
    const a = new Collector();
    room.join('Ana', a.send, undefined, 0);
    room.join('Bo', new Collector().send, undefined, 0);

    room.tick(16);
    room.dodge(0, 'left');
    room.tick(32);

    const dodgingFrame = a
      .ofType('arenaState')
      .some((m) => m.view.players[0]?.dodging === true);
    expect(dodgingFrame).toBe(true);
  });
});

describe('arena room reaping', () => {
  it('keeps the room alive for the reconnect window, then reaps it', () => {
    const room = new ArenaRoom('GONE');
    const a = new Collector();
    const b = new Collector();
    room.join('Ana', a.send, undefined, 0);
    room.join('Bo', b.send, undefined, 0);

    room.markDisconnected(0, 1000, a.send);
    room.markDisconnected(1, 1000, b.send);

    expect(room.shouldReap(1000 + CONFIG.reconnect.windowMs - 1)).toBe(false);
    expect(room.shouldReap(1000 + CONFIG.reconnect.windowMs)).toBe(true);
  });
});
