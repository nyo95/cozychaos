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
  type MatchState,
  type Vec2,
} from '../../shared/src/index.js';

const TURN_MS =
  CONFIG.phases.setupMs + CONFIG.phases.drawMs + CONFIG.phases.castMs +
  CONFIG.phases.revealMs + CONFIG.phases.resolveMaxMs + CONFIG.phases.scoreMs;

/** A "typical" aimed stroke: a slightly curved line of a given arc length. */
function line(len: number, jitter = 0): Vec2[] {
  const pts: Vec2[] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: -0.3 + t * len, y: 0.3 + Math.sin(t * Math.PI) * 0.05 * jitter });
  }
  return pts;
}

function ink(points: Vec2[]): number {
  return composeStroke(points).recipe.inkCommitted;
}

function playMatch(
  seed: number,
  strokeLen: [number, number],
  aim: [Vec2, Vec2],
  label: string,
): { turns: number; ms: number; winner: number | null; wobbleTrace: string[] } {
  let state: MatchState = createMatch(seed);
  let positions: [Vec2, Vec2] = [spawnPosition(0), spawnPosition(1)];
  let wobble: [number, number] = [0, 0];
  let turns = 0;
  const trace: string[] = [];

  while (state.winner === null && turns < 200) {
    const env = createTurnEnvironment(state.seed, state.round);
    const runes = ([0, 1] as const).map((slot) => {
      const pts = line(strokeLen[slot]);
      const recipe = composeStroke(pts).recipe;
      return buildRuneBody({
        points: pts,
        owner: slot,
        casterPosition: positions[slot],
        castDirection: aim[slot],
        inkCommitted: recipe.inkCommitted,
        inkReserved: recipe.inkReserved,
      });
    }) as never;

    const r = runResolve({ positions, wobble, runes, wind: env.wind, obstacles: env.obstacles });
    turns++;
    trace.push(
      `T${turns} r${state.round} wob=[${r.endWobble[0].toFixed(1)},${r.endWobble[1].toFixed(1)}] ` +
        `pos=[${r.endPositions[0].x.toFixed(2)},${r.endPositions[1].x.toFixed(2)}] ko=${r.knockouts.length}`,
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
  console.log(trace.slice(0, 40).join('\n'));
  console.log(
    `stars=${state.players.map((p) => p.stars).join('-')} winner=${state.winner} ` +
      `turns=${turns} matchTime=${((turns * TURN_MS) / 1000).toFixed(0)}s (budget 180-300s)`,
  );
  return { turns, ms: turns * TURN_MS, winner: state.winner, wobbleTrace: trace };
}

console.log(`Turn budget: ${TURN_MS} ms  (PRD target 15000-22000)`);
console.log(`ink for len 0.6 = ${ink(line(0.6)).toFixed(1)}, len 1.2 = ${ink(line(1.2)).toFixed(1)}, len 2.0 = ${ink(line(2.0)).toFixed(1)}`);

const flat0: Vec2 = { x: 1, y: 0.35 };
const flat1: Vec2 = { x: -1, y: 0.35 };

for (const seed of [1, 7, 12345]) {
  playMatch(seed, [0.8, 0.8], [flat0, flat1], 'both mid-ink aimed');
}

// One player draws nothing (i.e. their stroke was dropped by the phase gate).
{
  let positions: [Vec2, Vec2] = [spawnPosition(0), spawnPosition(1)];
  const env = createTurnEnvironment(99, 0);
  const good = composeStroke(line(0.8)).recipe;
  const runes = [
    buildRuneBody({
      points: line(0.8), owner: 0, casterPosition: positions[0], castDirection: flat0,
      inkCommitted: good.inkCommitted, inkReserved: good.inkReserved,
    }),
    buildRuneBody({
      points: [], owner: 1, casterPosition: positions[1], castDirection: flat1,
      inkCommitted: 0, inkReserved: CONFIG.ink.total,
    }),
  ] as never;
  const r = runResolve({ positions, wobble: [0, 0], runes, wind: env.wind, obstacles: env.obstacles });
  console.log(`\n=== dropped stroke (slot 1 sends nothing) ===`);
  console.log(`particles slot1 = 0 -> endWobble=[${r.endWobble[0].toFixed(1)},${r.endWobble[1].toFixed(1)}] ko=${JSON.stringify(r.knockouts)}`);
}
