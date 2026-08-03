/**
 * Probe: does Setup positioning (M-04) change the M-01 stall rate?
 *
 * Sesi 19 measured 26/60 seeds entering a deterministic non-terminating cycle
 * on reasonable mid-Ink play, and 15/20 on full-defensive play. The hypothesis
 * recorded then was that some of that was caused by movement being missing —
 * both wizards stood on their spawn every Turn, so identical inputs produced
 * identical geometry forever.
 *
 * This re-runs the same experiment with Setup movement active, so the decision
 * about how hard the M-01 Turn cap needs to be is made against a number rather
 * than the guess.
 *
 * Run: node .audit/probe-stall-m04.mjs
 */
import {
  CONFIG,
  applyResolveOutcome,
  buildRuneBody,
  composeStroke,
  createMatch,
  createSetupBody,
  createTurnEnvironment,
  runResolve,
  spawnPosition,
  startNextTurn,
  stepSetupMovement,
} from '../shared/dist/index.js';

const line = (len) =>
  Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return { x: -0.3 + t * len, y: 0.3 };
  });

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

const AIM = [{ x: 1, y: 0.35 }, { x: -1, y: 0.35 }];

/** Deterministic pseudo-random intent, so runs are reproducible per seed. */
function intentFor(seed, turn, slot, policy) {
  if (policy === 'still') return { direction: 0, jump: false };
  const h = Math.sin(seed * 12.9898 + turn * 78.233 + slot * 37.719) * 43758.5453;
  const r = h - Math.floor(h);
  if (policy === 'wander') {
    return { direction: r < 0.34 ? -1 : r < 0.67 ? 1 : 0, jump: r > 0.9 };
  }
  // 'retreat': back away from the centre, the intuitive defensive instinct.
  return { direction: slot === 0 ? -1 : 1, jump: false };
}

function runSetupPhase(seed, turn, positions, policy) {
  const bodies = [createSetupBody(0, positions[0]), createSetupBody(1, positions[1])];
  const intents = [intentFor(seed, turn, 0, policy), intentFor(seed, turn, 1, policy)];
  const steps = Math.round(CONFIG.phases.setupMs / 1000 * 30);
  for (let i = 0; i < steps; i++) stepSetupMovement(bodies, intents, 1 / 30);
  return [
    { x: bodies[0].x, y: bodies[0].y },
    { x: bodies[1].x, y: bodies[1].y },
  ];
}

function play(seed, l0, l1, cap, policy) {
  let state = createMatch(seed);
  let positions = [spawnPosition(0), spawnPosition(1)];
  let wobble = [0, 0];
  let turns = 0;

  while (state.winner === null && turns < cap) {
    positions = runSetupPhase(seed, turns, positions, policy);
    const env = createTurnEnvironment(state.seed, state.round);
    const result = runResolve({
      positions,
      wobble,
      runes: [mkRune(0, positions[0], AIM[0], l0), mkRune(1, positions[1], AIM[1], l1)],
      wind: env.wind,
      obstacles: env.obstacles,
    });
    turns++;

    if (result.knockouts.length > 0) {
      state = applyResolveOutcome(state, { knockouts: [...result.knockouts] });
      positions = [spawnPosition(0), spawnPosition(1)];
      wobble = [0, 0];
    } else {
      state = startNextTurn(state);
      positions = [result.endPositions[0], result.endPositions[1]];
      wobble = [result.endWobble[0], result.endWobble[1]];
    }
  }
  return { turns, winner: state.winner };
}

const SCENARIOS = [
  ['mid-Ink trade (1.2 vs 1.2)', 1.2, 1.2],
  ['dart 0.35 vs wall 2.5', 0.35, 2.5],
  ['both max wall (2.5)', 2.5, 2.5],
];

console.log(`Turn cap 30. ${25} seeds per cell. Stall = no winner within the cap.\n`);
console.log('scenario'.padEnd(28) + 'policy'.padEnd(10) + 'stalled'.padEnd(12) + 'avg turns'.padEnd(12) + 'slot0/slot1');

for (const [label, l0, l1] of SCENARIOS) {
  for (const policy of ['still', 'retreat', 'wander']) {
    let stalled = 0;
    let total = 0;
    let w0 = 0;
    let w1 = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const m = play(seed, l0, l1, 30, policy);
      if (m.winner === null) stalled++;
      else {
        total += m.turns;
        m.winner === 0 ? w0++ : w1++;
      }
    }
    const finished = 25 - stalled;
    console.log(
      label.padEnd(28) +
        policy.padEnd(10) +
        `${stalled}/25`.padEnd(12) +
        (finished ? (total / finished).toFixed(1) : '—').padEnd(12) +
        `${w0}/${w1}`,
    );
  }
}

console.log('\nNote: "still" reproduces the Sesi 19 conditions (no positioning).');
console.log('Any drop from "still" to the other policies is what movement bought.');
