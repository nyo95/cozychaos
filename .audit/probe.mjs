/* Audit probe — match pacing, wobble accumulation, dropped-stroke impact. */
import {
  CONFIG,
  applyResolveOutcome,
  buildRuneBody,
  composeStroke,
  createMatch,
  createTurnEnvironment,
  runResolve,
  spawnPosition,
  startNextTurn,
} from '../shared/dist/index.js';

const P = CONFIG.phases;
const TURN_MS = P.setupMs + P.drawMs + P.castMs + P.revealMs + P.resolveMaxMs + P.scoreMs;

function line(len) {
  const pts = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: -0.3 + t * len, y: 0.3 });
  }
  return pts;
}

function mkRune(slot, pos, aim, len) {
  const pts = line(len);
  const recipe = composeStroke(pts).recipe;
  return buildRuneBody({
    points: pts,
    owner: slot,
    casterPosition: pos,
    castDirection: aim,
    inkCommitted: recipe.inkCommitted,
    inkReserved: recipe.inkReserved,
  });
}

function playMatch(seed, strokeLen, aim, label, verbose) {
  let state = createMatch(seed);
  let positions = [spawnPosition(0), spawnPosition(1)];
  let wobble = [0, 0];
  let turns = 0;
  const trace = [];

  while (state.winner === null && turns < 300) {
    const env = createTurnEnvironment(state.seed, state.round);
    const runes = [
      mkRune(0, positions[0], aim[0], strokeLen[0]),
      mkRune(1, positions[1], aim[1], strokeLen[1]),
    ];
    const r = runResolve({ positions, wobble, runes, wind: env.wind, obstacles: env.obstacles });
    turns++;
    trace.push(
      `T${turns} rnd${state.round} wob=[${r.endWobble[0].toFixed(1)},${r.endWobble[1].toFixed(1)}] ` +
      `x=[${r.endPositions[0].x.toFixed(2)},${r.endPositions[1].x.toFixed(2)}] ko=${r.knockouts.length} dur=${r.durationMs}`,
    );
    if (r.knockouts.length > 0) {
      state = applyResolveOutcome(state, { knockouts: [...r.knockouts] });
      positions = [spawnPosition(0), spawnPosition(1)];
      wobble = [0, 0];
    } else {
      state = startNextTurn(state);
      positions = [r.endPositions[0], r.endPositions[1]];
      wobble = [r.endWobble[0], r.endWobble[1]];
    }
  }
  console.log(`\n=== ${label} (seed ${seed}) ===`);
  if (verbose) console.log(trace.slice(0, 30).join('\n'));
  console.log(
    `stars=${state.players.map((p) => p.stars).join('-')} winner=${state.winner} turns=${turns} ` +
    `matchTime=${((turns * TURN_MS) / 1000).toFixed(0)}s  (PRD budget 180-300s)`,
  );
  return turns;
}

console.log(`Turn length: ${TURN_MS} ms (PRD 15000-22000)`);
for (const L of [0.4, 0.6, 0.8, 1.2, 1.8, 2.5]) {
  const rec = composeStroke(line(L)).recipe;
  console.log(`  stroke len ${L} -> ink ${rec.inkCommitted.toFixed(1)} force=${rec.summary.force} shape=${rec.summary.shape.join(',')}`);
}

const a0 = { x: 1, y: 0.35 };
const a1 = { x: -1, y: 0.35 };

for (const seed of [1, 7, 12345]) playMatch(seed, [0.8, 0.8], [a0, a1], 'both aimed, mid ink', seed === 1);
playMatch(3, [0.35, 0.35], [a0, a1], 'both light/fast darts', true);
playMatch(3, [2.2, 2.2], [a0, a1], 'both heavy walls', false);

// Asymmetry: one player drops their stroke (latency gate) every Turn.
playMatch(5, [0.8, 0.0001], [a0, a1], 'slot1 stroke dropped every Turn', false);

{
  const env = createTurnEnvironment(99, 0);
  const positions = [spawnPosition(0), spawnPosition(1)];
  const runes = [
    mkRune(0, positions[0], a0, 0.8),
    buildRuneBody({ points: [], owner: 1, casterPosition: positions[1], castDirection: a1, inkCommitted: 0, inkReserved: CONFIG.ink.total }),
  ];
  const r = runResolve({ positions, wobble: [0, 0], runes, wind: env.wind, obstacles: env.obstacles });
  console.log(`\n=== empty submission (slot1 sends nothing) ===`);
  console.log(`slot1 particles=${runes[1].particles.length} mass=${runes[1].mass} endWobble=[${r.endWobble[0].toFixed(1)},${r.endWobble[1].toFixed(1)}]`);
}

// Wobble decay check: config claims decayPerSecond 1.5 — does anything apply it?
{
  const env = createTurnEnvironment(1, 0);
  const positions = [spawnPosition(0), spawnPosition(1)];
  const runes = [mkRune(0, positions[0], a0, 0.8), mkRune(1, positions[1], a1, 0.8)];
  const r = runResolve({ positions, wobble: [50, 50], runes, wind: env.wind, obstacles: env.obstacles });
  console.log(`\n=== wobble decay ===`);
  console.log(`config.wobble.decayPerSecond=${CONFIG.wobble.decayPerSecond}; started 50/50 -> ended ${r.endWobble.map(w=>w.toFixed(2)).join('/')} over ${r.durationMs}ms`);
  console.log(`expected if decay applied: ~${(50 - 1.5 * r.durationMs / 1000).toFixed(2)}`);
}
