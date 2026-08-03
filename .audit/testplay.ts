/**
 * Headless testplay: a whole match, through the real Room, over the real
 * protocol, on a fake clock.
 *
 * This is not a unit test. It plays: two "players" join, walk during Setup,
 * draw a rune each Turn, aim, and let the authoritative server resolve. What it
 * checks is what a person would notice in a session — does a Round finish, do
 * Stars get awarded, does the match reach a winner, does anything the HUD would
 * show contradict itself.
 *
 * Run: npx tsx .audit/testplay.ts   (or node after a shared build — see below)
 */
import { Room } from '../server/src/room.js';
import { CONFIG } from '../shared/src/index.js';

const TICK_MS = 1000 / 30;

class Client {
  constructor(slot) {
    this.slot = slot;
    this.messages = [];
    this.acks = [];
    this.send = (message) => {
      this.messages.push(message);
      if (message.type === 'ack') this.acks.push(message);
    };
  }
  last(type) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) return this.messages[i];
    }
    return null;
  }
}

/** A rune of the requested length, drawn from the caster toward mid-arena. */
function stroke(slot, length, turn) {
  const dir = slot === 0 ? 1 : -1;
  const startX = slot === 0 ? -0.34 : 0.34;
  const arc = 0.12 * Math.sin(turn * 1.7 + slot);
  return Array.from({ length: 32 }, (_, i) => {
    const t = i / 31;
    return { x: startX + dir * length * t, y: 0.28 + arc * Math.sin(Math.PI * t) };
  });
}

/**
 * Both players play a simple but non-degenerate policy: alternate between a
 * light dart and a heavier screen, drift a little during Setup, jump sometimes.
 * Degenerate identical play is what M-01 was about; this is closer to people.
 */
function inkLengthFor(slot, turn) {
  const cycle = (turn + slot) % 3;
  return cycle === 0 ? 0.42 : cycle === 1 ? 0.95 : 1.5;
}

function moveFor(slot, turn) {
  const cycle = (turn * 2 + slot) % 4;
  if (cycle === 0) return { direction: slot === 0 ? 1 : -1, jump: false };
  if (cycle === 1) return { direction: 0, jump: true };
  if (cycle === 2) return { direction: slot === 0 ? -1 : 1, jump: false };
  return { direction: 0, jump: false };
}

const room = new Room('PLAY', 20260803);
const a = new Client(0);
const b = new Client(1);
room.join('Ana', a.send);
room.join('Bo', b.send);

let now = 0;
let lastPhase = '';
let turnsPlayed = 0;
let roundsSeen = 0;
const log = [];
const problems = [];

const MAX_MS = 12 * 60 * 1000;
while (now < MAX_MS) {
  room.tick(now);
  const view = a.last('room')?.room;
  if (view && view.phase !== lastPhase) {
    const previous = lastPhase;
    lastPhase = view.phase;

    if (view.phase === 'setup') {
      for (const slot of [0, 1]) {
        const intent = moveFor(slot, view.turn);
        room.submitMove(slot, intent.direction, intent.jump);
      }
    }

    if (view.phase === 'draw') {
      turnsPlayed++;
      for (const slot of [0, 1]) {
        room.submitStroke(slot, stroke(slot, inkLengthFor(slot, view.turn), view.turn));
      }
    }

    if (view.phase === 'cast') {
      for (const slot of [0, 1]) {
        const lift = 0.25 + 0.2 * ((view.turn + slot) % 3);
        room.submitCast(slot, { x: slot === 0 ? 1 : -1, y: lift });
      }
    }

    if (previous === 'resolve' && view.phase === 'score') {
      const score = a.last('score');
      if (score && score.knockouts.length > 0) {
        roundsSeen++;
        log.push(
          `  round ${roundsSeen} decided on turn ${view.turn} — ` +
            `KO of slot ${score.knockouts.map((k) => k.slot).join(' & ')} · ` +
            `stars ${view.players.map((p) => p.stars).join('–')}`,
        );
      }
    }

    if (view.winner !== null) {
      log.push(`  WINNER: slot ${view.winner} (${view.players[view.winner].name})`);
      break;
    }
  }
  now += TICK_MS;
}

// ── report ────────────────────────────────────────────────────────────────

const finalView = a.last('room')?.room;
const frames = a.messages.filter((m) => m.type === 'frame').length;
const setupFrames = a.messages.filter((m) => m.type === 'setupFrame').length;
const reveals = a.messages.filter((m) => m.type === 'reveal').length;

console.log('=== TESTPLAY: full match, real Room, real protocol ===\n');
console.log(log.join('\n'));
console.log('');
console.log(`  wall-clock simulated : ${(now / 1000).toFixed(1)}s`);
console.log(`  turns played         : ${turnsPlayed}`);
console.log(`  rounds decided       : ${roundsSeen}`);
console.log(`  reveals              : ${reveals}`);
console.log(`  resolve frames sent  : ${frames}`);
console.log(`  setup frames sent    : ${setupFrames}`);
console.log(`  winner               : ${finalView?.winner ?? 'none'}`);
console.log(`  final stars          : ${finalView?.players.map((p) => p.stars).join(' – ')}`);

// ── invariants a player would notice ──────────────────────────────────────

if (finalView?.winner === null || finalView?.winner === undefined) {
  problems.push('match never reached a winner inside 12 simulated minutes');
}
if (roundsSeen < CONFIG.scoring.starsToWin) {
  problems.push(`only ${roundsSeen} rounds decided, need ${CONFIG.scoring.starsToWin} to win`);
}
if (setupFrames === 0) problems.push('no setupFrame broadcast — movement invisible to clients');
if (frames === 0) problems.push('no resolve frames — clash invisible');

const rejected = [...a.acks, ...b.acks].filter((ack) => !ack.accepted);
if (rejected.length > 0) {
  problems.push(`${rejected.length} input(s) rejected: ${[...new Set(rejected.map((r) => r.reason))].join(', ')}`);
}
const accepted = [...a.acks, ...b.acks].filter((ack) => ack.accepted).length;
console.log(`  inputs acked         : ${accepted} accepted, ${rejected.length} rejected`);

const turnLengthS =
  (CONFIG.phases.setupMs + CONFIG.phases.drawMs + CONFIG.phases.castMs +
    CONFIG.phases.revealMs + CONFIG.phases.resolveMaxMs + CONFIG.phases.scoreMs) / 1000;
console.log(`  worst-case Turn      : ${turnLengthS.toFixed(1)}s (PRD budget 22s)`);
if (turnLengthS > 22) problems.push(`Turn budget exceeded: ${turnLengthS.toFixed(1)}s > 22s`);

console.log('');
if (problems.length === 0) {
  console.log('✓ playable: match starts, rounds resolve, a winner emerges, every input acknowledged.');
} else {
  console.log('✗ problems:');
  for (const p of problems) console.log(`   - ${p}`);
  process.exitCode = 1;
}
