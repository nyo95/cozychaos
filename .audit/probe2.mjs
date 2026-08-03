/* Probe 2 — mirror symmetry, stall rate, wind fairness. */
import {
  CONFIG, applyResolveOutcome, buildRuneBody, composeStroke, createMatch,
  createTurnEnvironment, runResolve, spawnPosition, startNextTurn,
} from '../shared/dist/index.js';

function line(len) {
  const pts = [];
  for (let i = 0; i < 40; i++) { const t = i / 39; pts.push({ x: -0.3 + t * len, y: 0.3 }); }
  return pts;
}
function mkRune(slot, pos, aim, len) {
  const pts = line(len);
  const r = composeStroke(pts).recipe;
  return buildRuneBody({ points: pts, owner: slot, casterPosition: pos, castDirection: aim,
    inkCommitted: r.inkCommitted, inkReserved: r.inkReserved });
}
const a0 = { x: 1, y: 0.35 }, a1 = { x: -1, y: 0.35 };

// ── 1. Perfect mirror, no wind, no obstacles: is the sim itself unbiased? ──
{
  const pos = [spawnPosition(0), spawnPosition(1)];
  const runes = [mkRune(0, pos[0], a0, 0.8), mkRune(1, pos[1], a1, 0.8)];
  const r = runResolve({ positions: pos, wobble: [0, 0], runes, wind: { x: 0, y: 0 }, obstacles: [] });
  console.log('=== mirror test: no wind, no crystals ===');
  console.log(`endWobble=[${r.endWobble[0].toFixed(3)}, ${r.endWobble[1].toFixed(3)}]`);
  console.log(`endX=[${r.endPositions[0].x.toFixed(4)}, ${r.endPositions[1].x.toFixed(4)}]  (mirror would be exact negatives)`);
  console.log(`ko=${JSON.stringify(r.knockouts)}`);
}

// ── 2. Same, but with a wind of each magnitude ──
console.log('\n=== wind fairness (identical play both sides) ===');
for (const w of CONFIG.wind.accelerationLevels) {
  const pos = [spawnPosition(0), spawnPosition(1)];
  const runes = [mkRune(0, pos[0], a0, 0.8), mkRune(1, pos[1], a1, 0.8)];
  const r = runResolve({ positions: pos, wobble: [0, 0], runes,
    wind: { x: w, y: Math.abs(w) * CONFIG.wind.verticalLiftFraction }, obstacles: [] });
  console.log(`wind ${String(w).padEnd(5)} -> wobble slot0=${r.endWobble[0].toFixed(1)} slot1=${r.endWobble[1].toFixed(1)}  ko=${r.knockouts.map(k=>k.slot).join(',')||'none'}`);
}

// ── 3. Stall rate across seeds and strategies ──
function playMatch(seed, len0, len1, cap) {
  let state = createMatch(seed);
  let positions = [spawnPosition(0), spawnPosition(1)];
  let wobble = [0, 0];
  let turns = 0;
  const seen = new Map();
  let cycleAt = null;
  while (state.winner === null && turns < cap) {
    const env = createTurnEnvironment(state.seed, state.round);
    const runes = [mkRune(0, positions[0], a0, len0), mkRune(1, positions[1], a1, len1)];
    const r = runResolve({ positions, wobble, runes, wind: env.wind, obstacles: env.obstacles });
    turns++;
    const key = `${state.round}|${positions[0].x.toFixed(4)},${positions[0].y.toFixed(4)}|${positions[1].x.toFixed(4)},${positions[1].y.toFixed(4)}|${wobble[0].toFixed(3)},${wobble[1].toFixed(3)}`;
    if (seen.has(key) && cycleAt === null) cycleAt = `${seen.get(key)}->${turns}`;
    seen.set(key, turns);
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
  return { turns, winner: state.winner, stars: state.players.map(p => p.stars), cycleAt };
}

console.log('\n=== stall rate (60 seeds, cap 60 Turns = 21 min) ===');
for (const [label, l0, l1] of [
  ['both mid ink (0.8)', 0.8, 0.8],
  ['both light dart (0.35)', 0.35, 0.35],
  ['both max wall (2.5)', 2.5, 2.5],
  ['dart vs wall', 0.35, 2.5],
]) {
  let stalls = 0, totalTurns = 0, slot0Wins = 0, slot1Wins = 0, cycles = 0;
  const overBudget = [];
  for (let seed = 1; seed <= 60; seed++) {
    const m = playMatch(seed, l0, l1, 60);
    if (m.winner === null) { stalls++; if (m.cycleAt) cycles++; }
    else { totalTurns += m.turns; if (m.winner === 0) slot0Wins++; else slot1Wins++; }
    if (m.winner !== null && m.turns * 21 > 300) overBudget.push(m.turns);
  }
  const finished = 60 - stalls;
  console.log(
    `${label.padEnd(24)} stalled=${String(stalls).padStart(2)}/60  cyclesDetected=${cycles}  ` +
    `avgTurns=${finished ? (totalTurns / finished).toFixed(1) : '-'}  ` +
    `avgMatch=${finished ? ((totalTurns / finished) * 21).toFixed(0) + 's' : '-'}  ` +
    `over5min=${overBudget.length}  wins slot0/slot1=${slot0Wins}/${slot1Wins}`);
}
