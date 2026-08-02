import { describe, expect, it } from 'vitest';
import { CONFIG, predictLaunch, type ServerMessage, type Vec2 } from '@cozy/shared';
import { RoomManager } from './rooms.js';
import { Room } from './room.js';

/**
 * The no-desync guarantee (PRD §20) and the full match loop, verified without a
 * socket. Two collectors stand in for two browsers; a fake clock drives the
 * phase machine. Because one authoritative room computes one deterministic
 * Resolve and broadcasts identical frames, the two clients cannot diverge — and
 * these tests are what prove that rather than assert it.
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

const stroke = (from: Vec2, to: Vec2): Vec2[] =>
  Array.from({ length: 20 }, (_, i) => {
    const t = i / 19;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });

/**
 * Drives a room from t=0 to `untilMs` in fixed clock steps, calling `onDraw`
 * once each time a Draw phase begins. Keying submission off the real phase
 * transition — rather than a hardcoded timestamp — is the robust way to drive
 * the loop, since the clock only lands on step boundaries.
 */
function drive(
  room: Room,
  watch: Collector,
  untilMs: number,
  onDraw?: (turn: number) => void,
  onCast?: (turn: number) => void,
): void {
  let lastPhase = '';
  for (let t = 0; t <= untilMs; t += 16) {
    room.tick(t);
    const view = watch.ofType('room').at(-1)?.room;
    if (view && view.phase !== lastPhase) {
      lastPhase = view.phase;
      if (view.phase === 'draw') onDraw?.(view.turn);
      if (view.phase === 'cast') onCast?.(view.turn);
    }
  }
}

const TURN_MS =
  CONFIG.phases.setupMs +
  CONFIG.phases.drawMs +
  CONFIG.phases.castMs +
  CONFIG.phases.revealMs +
  CONFIG.phases.resolveMaxMs +
  CONFIG.phases.scoreMs;

describe('room lifecycle', () => {
  it('seats two players and starts the match', () => {
    const room = new Room('TEST', 42);
    const a = new Collector();
    const b = new Collector();

    expect(room.join('Ana', a.send)).toBe(0);
    expect(room.join('Bo', b.send)).toBe(1);

    expect(a.ofType('welcome')[0]?.slot).toBe(0);
    expect(b.ofType('welcome')[0]?.slot).toBe(1);
    expect(a.ofType('welcome')[0]?.reconnectToken).toBeTruthy();
  });

  it('refuses a third player', () => {
    const room = new Room('FULL', 1);
    room.join('a', new Collector().send);
    room.join('b', new Collector().send);
    expect(room.join('c', new Collector().send)).toBeNull();
  });

  it('uses the real join timestamp instead of skipping Setup in production', () => {
    const room = new Room('CLOCK', 12);
    const a = new Collector();
    const epoch = 1_900_000_000_000;
    room.join('Ana', a.send, undefined, epoch);
    room.join('Bo', new Collector().send, undefined, epoch);

    room.tick(epoch + 100);
    expect(a.ofType('room').at(-1)?.room.phase).toBe('setup');

    room.tick(epoch + CONFIG.phases.setupMs + 1);
    expect(a.ofType('room').at(-1)?.room.phase).toBe('draw');
  });

  it('reveals both runes at the same time (PRD §15)', () => {
    const room = new Room('REV', 7);
    const a = new Collector();
    const b = new Collector();
    room.join('a', a.send);
    room.join('b', b.send);

    drive(room, a, TURN_MS, () => {
      room.submitStroke(0, stroke({ x: -0.2, y: 0.1 }, { x: 0.6, y: 0.1 }));
      room.submitStroke(1, stroke({ x: 0.2, y: 0.1 }, { x: -0.6, y: 0.1 }));
    });

    // Both clients get exactly one reveal, carrying both summaries.
    expect(a.ofType('reveal')).toHaveLength(1);
    expect(a.ofType('reveal')[0]?.summaries).toHaveLength(2);
    expect(b.ofType('reveal')[0]?.summaries[0]).not.toBeNull();
  });

  it('repairs hostile coordinates and overlong strokes before simulation', () => {
    const room = new Room('SAFE', 17);
    const a = new Collector();
    room.join('a', a.send);
    room.join('b', new Collector().send);

    const hostile = Array.from({ length: 80 }, (_, index) => ({
      x: index % 2 === 0 ? 1e308 : -1e308,
      y: index % 3 === 0 ? 1e308 : -1e308,
    }));
    drive(room, a, TURN_MS, () => room.submitStroke(0, hostile));

    const reveal = a.ofType('reveal')[0]?.summaries[0];
    expect(reveal?.inkCommitted).toBeLessThanOrEqual(CONFIG.ink.total);
    for (const frame of a.ofType('frame')) {
      for (const body of frame.snapshot.bodies) {
        expect(Number.isFinite(body.x)).toBe(true);
        expect(Number.isFinite(body.y)).toBe(true);
      }
      for (const particle of frame.snapshot.particles) {
        expect(Number.isFinite(particle.x)).toBe(true);
        expect(Number.isFinite(particle.y)).toBe(true);
      }
    }
  });
});

describe('no desync (PRD §20)', () => {
  it('sends byte-identical frames to both clients', () => {
    const room = new Room('SYNC', 999);
    const a = new Collector();
    const b = new Collector();
    room.join('a', a.send);
    room.join('b', b.send);

    drive(room, a, TURN_MS, () => {
      room.submitStroke(0, stroke({ x: -0.2, y: 0.1 }, { x: 0.7, y: 0.05 }));
      room.submitStroke(1, stroke({ x: 0.2, y: 0.1 }, { x: -0.7, y: 0.05 }));
    });

    const framesA = a.ofType('frame').map((m) => JSON.stringify(m.snapshot));
    const framesB = b.ofType('frame').map((m) => JSON.stringify(m.snapshot));
    expect(framesA.length).toBeGreaterThan(0);
    expect(framesA).toEqual(framesB);
  });

  it('reports the same score to both clients', () => {
    const room = new Room('SCORE', 3);
    const a = new Collector();
    const b = new Collector();
    room.join('a', a.send);
    room.join('b', b.send);

    drive(room, a, TURN_MS * 3, () => {
      // Every Turn, both players draw toward each other.
      room.submitStroke(0, stroke({ x: -0.1, y: 0.1 }, { x: 0.8, y: 0.05 }));
      room.submitStroke(1, stroke({ x: 0.1, y: 0.1 }, { x: -0.8, y: 0.05 }));
    });

    const scoreA = a.ofType('score');
    const scoreB = b.ofType('score');
    expect(scoreA.length).toBeGreaterThan(0);
    expect(scoreA.map((m) => m.stars)).toEqual(scoreB.map((m) => m.stars));
  });
});

describe('match progression', () => {
  it('advances through every phase in order', () => {
    const room = new Room('PHASE', 5);
    const a = new Collector();
    room.join('a', a.send);
    room.join('b', new Collector().send);

    const phases: string[] = [];
    for (let t = 0; t <= TURN_MS + 50; t += 16) {
      room.tick(t);
      const latest = a.ofType('room').at(-1);
      if (latest && phases.at(-1) !== latest.room.phase) phases.push(latest.room.phase);
    }

    // Setup → Draw → Cast → Reveal → Resolve → Score, then back to Setup.
    expect(phases.slice(0, 6)).toEqual(['setup', 'draw', 'cast', 'reveal', 'resolve', 'score']);
  });

  /**
   * This used to assert that one scripted cast, repeated, won a whole match.
   *
   * That premise died with the Session 12 rework, and rightly so. It submitted
   * an 80-point sweep — which is now the heaviest, slowest, shortest-ranged
   * cast in the game and lands at the caster's own feet — and it fired the
   * same angle every Turn at a target that knockback keeps moving. It also
   * fired straight through seeded terrain that a real player answers by
   * lobbing over. Making a fixed script beat physics *and* terrain *and* a
   * moving target three times over would mean tuning the game around the test.
   *
   * So the test is split along the seam it should always have had. Physics has
   * to prove it can produce a Star; the state machine's winner logic is proved
   * separately in `match/state.test.ts` and by the forfeit test below, where it
   * does not depend on ballistics tuning at all.
   */
  it('turns real physics into Stars for the player who lands hits', () => {
    const room = new Room('WIN', 8);
    const a = new Collector();
    room.join('a', a.send);
    room.join('b', new Collector().send);

    // Small rune: Ink buys mass and mass costs reach, so a short stroke is the
    // attacking option now. This doubles as end-to-end proof the dial works.
    const lightRune = Array.from({ length: 10 }, (_, index) => ({
      x: -0.1 + index * 0.012,
      y: index % 2 === 0 ? 0 : 0.01,
    }));
    drive(
      room,
      a,
      TURN_MS * 16,
      () => room.submitStroke(0, lightRune),
      () => {
        // Aim ballistically at wherever the rival has been knocked to, using
        // the same shared prediction the HUD shows the player. Solving for the
        // flat solution of `range = v²·sin(2θ)/g` is exactly the judgement the
        // design asks a human to make.
        const frame = a.ofType('frame').at(-1)?.snapshot;
        const me = frame?.bodies[0]?.x ?? -CONFIG.player.spawnX;
        const foe = frame?.bodies[1]?.x ?? CONFIG.player.spawnX;
        const ink = a.ofType('reveal').at(-1)?.summaries[0]?.inkCommitted ?? 10;
        const ratio = Math.min(1, Math.abs(foe - me) / predictLaunch(ink).maxReach);
        const theta = Math.asin(ratio) / 2;
        room.submitCast(0, { x: Math.cos(theta), y: Math.sin(theta) });
      },
    );

    const stars = a.ofType('score').at(-1)?.stars ?? [0, 0];
    expect(stars[0]).toBeGreaterThanOrEqual(1);
    expect(stars[1]).toBe(0);
  });
});

describe('reconnect (A-06)', () => {
  it('reclaims a slot with the reconnect token', () => {
    const room = new Room('RC', 11);
    const first = new Collector();
    room.join('Ana', first.send);
    room.join('Bo', new Collector().send);
    const token = first.ofType('welcome')[0]!.reconnectToken;

    room.markDisconnected(0);
    const again = new Collector();
    expect(room.join('Ana', again.send, token)).toBe(0);
    expect(again.ofType('welcome')[0]?.slot).toBe(0);
  });

  it('ignores a stale close event after a socket has reclaimed the seat', () => {
    const room = new Room('RACE', 31);
    const oldSocket = new Collector();
    room.join('Ana', oldSocket.send, undefined, 1000);
    room.join('Bo', new Collector().send, undefined, 1000);
    const token = oldSocket.ofType('welcome')[0]!.reconnectToken;

    room.markDisconnected(0, 1200, oldSocket.send);
    const newSocket = new Collector();
    room.join('Ana', newSocket.send, token, 1300);
    room.markDisconnected(0, 1400, oldSocket.send);

    expect(newSocket.ofType('room').at(-1)?.room.players[0]?.connected).toBe(true);
  });

  it('pauses at Setup while a rival is inside the reconnect window', () => {
    const room = new Room('PAUSE', 32);
    const a = new Collector();
    room.join('Ana', a.send, undefined, 1000);
    room.join('Bo', new Collector().send, undefined, 1000);

    room.tick(1000 + CONFIG.phases.setupMs + 1);
    expect(a.ofType('room').at(-1)?.room.phase).toBe('draw');
    const disconnectedAt = 1000 + CONFIG.phases.setupMs + 2;
    room.markDisconnected(1, disconnectedAt);
    for (let time = disconnectedAt + 16; time < disconnectedAt + CONFIG.reconnect.windowMs; time += 16) {
      room.tick(time);
    }

    expect(a.ofType('room').at(-1)?.room.phase).toBe('setup');
    expect(a.ofType('room').at(-1)?.room.phaseRemainingMs).toBe(CONFIG.phases.setupMs);
  });

  it('awards the match when the reconnect window expires', () => {
    const room = new Room('FORFEIT', 33);
    const a = new Collector();
    room.join('Ana', a.send, undefined, 1000);
    room.join('Bo', new Collector().send, undefined, 1000);
    room.markDisconnected(1, 2000);

    room.tick(2000 + CONFIG.reconnect.windowMs);

    const score = a.ofType('score').at(-1);
    expect(score?.winner).toBe(0);
    expect(score?.stars[0]).toBe(CONFIG.scoring.starsToWin);
  });
});

describe('room manager', () => {
  it('creates and finds rooms by code', () => {
    const manager = new RoomManager();
    const room = manager.getOrCreate(undefined);
    expect(room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(manager.getOrCreate(room.code)).toBe(room);
  });

  it('gives each room a distinct seed', () => {
    const manager = new RoomManager();
    const a = manager.getOrCreate('AAAA');
    const b = manager.getOrCreate('BBBB');
    expect(a).not.toBe(b);
  });

  it('retains an empty room for the reconnect window, then reaps it', () => {
    const manager = new RoomManager();
    const room = manager.getOrCreate('HOLD');
    room.join('a', new Collector().send, undefined, 1000);
    room.join('b', new Collector().send, undefined, 1000);
    room.markDisconnected(0, 2000);
    room.markDisconnected(1, 2000);

    manager.tick(2000 + CONFIG.reconnect.windowMs - 1);
    expect(manager.get('HOLD')).toBe(room);

    manager.tick(2000 + CONFIG.reconnect.windowMs);
    expect(manager.get('HOLD')).toBeUndefined();
  });
});
