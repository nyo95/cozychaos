/**
 * Probe: is wind still deciding Rounds before anyone draws? (M-02)
 *
 * Sesi 19 measured this with "mirrored play" built by hand. That construction
 * is fragile — a hand-mirrored stroke is easy to get subtly wrong, and a wrong
 * construction reads as simulator bias. This version instead tests the property
 * that actually matters:
 *
 *   MIRROR EQUIVARIANCE — reflect the whole world about x = 0 and swap the two
 *   seats, and every outcome must reflect and swap with it.
 *
 * If that holds, no seat can be favoured, whatever the wind is doing, because
 * the two seats are related by exactly that reflection. It is also mechanical
 * to construct: negate every x, negate every x-velocity, swap slot 0 and 1.
 *
 * Run: node .audit/probe-wind-fairness.mjs
 */
import {
  CONFIG,
  buildRuneBody,
  composeStroke,
  runResolve,
  spawnPosition,
  windAccelerationX,
} from '../shared/dist/index.js';

// ── scenario construction ──────────────────────────────────────────────────

function strokeFrom(x0, y0, x1, y1) {
  return Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  });
}

function rune(owner, casterPosition, castDirection, points) {
  const recipe = composeStroke(points).recipe;
  return buildRuneBody({
    points,
    owner,
    casterPosition,
    castDirection,
    inkCommitted: recipe.inkCommitted,
    inkReserved: recipe.inkReserved,
  });
}

/** Reflects a whole rune blueprint about x = 0 and reassigns its owner. */
function mirrorRune(blueprint, newOwner) {
  return {
    ...blueprint,
    owner: newOwner,
    direction: { x: -blueprint.direction.x, y: blueprint.direction.y },
    particles: blueprint.particles.map((p) => ({
      ...p,
      position: { x: -p.position.x, y: p.position.y },
      velocity: { x: -p.velocity.x, y: p.velocity.y },
    })),
  };
}

function mirrorObstacles(obstacles) {
  return obstacles.map((o) => ({
    ...o,
    base: { x: -o.base.x, y: o.base.y },
    tip: { x: -o.tip.x, y: o.tip.y },
  }));
}

const OBSTACLES = [
  { kind: 'stalagmite', base: { x: 0.22, y: 0 }, tip: { x: 0.22, y: 0.3 }, halfWidth: 0.12 },
  { kind: 'stalactite', base: { x: -0.4, y: 1.3 }, tip: { x: -0.4, y: 0.9 }, halfWidth: 0.13 },
];

/**
 * An intentionally lopsided scenario: different strokes, different aims,
 * asymmetric crystals. A symmetric scenario would pass trivially.
 */
function scenario() {
  return {
    positions: [spawnPosition(0), { x: 0.42, y: spawnPosition(1).y }],
    wobble: [12, 31],
    runes: [
      rune(0, spawnPosition(0), { x: 1, y: 0.4 }, strokeFrom(-0.3, 0.3, 0.55, 0.42)),
      rune(1, { x: 0.42, y: spawnPosition(1).y }, { x: -1, y: 0.2 }, strokeFrom(0.2, 0.5, -0.4, 0.28)),
    ],
    obstacles: OBSTACLES,
  };
}

function mirrored(base) {
  return {
    positions: [
      { x: -base.positions[1].x, y: base.positions[1].y },
      { x: -base.positions[0].x, y: base.positions[0].y },
    ],
    wobble: [base.wobble[1], base.wobble[0]],
    runes: [mirrorRune(base.runes[1], 0), mirrorRune(base.runes[0], 1)],
    obstacles: mirrorObstacles(base.obstacles),
  };
}

// ── 1. the field itself must be odd in x ───────────────────────────────────

console.log('=== FIELD SHAPE: must be odd in x ===');
let oddOk = true;
for (const x of [-0.9, -0.5, -0.2, 0, 0.2, 0.5, 0.9]) {
  const a = windAccelerationX({ x: 0.42, y: 0 }, x);
  const b = windAccelerationX({ x: 0.42, y: 0 }, -x);
  if (Math.abs(a + b) > 1e-12) oddOk = false;
}
console.log(`  f(-x) = -f(x) across the arena: ${oddOk ? 'yes ✓' : 'NO ✗'}`);

// ── 2. mirror equivariance under every wind setting ────────────────────────

console.log('\n=== MIRROR EQUIVARIANCE (lopsided scenario, every wind level) ===');
console.log('level'.padEnd(8) + 'sign'.padEnd(10) + 'Wobble err'.padEnd(14) + 'position err'.padEnd(15) + 'verdict');

let worstWobble = 0;
let worstPos = 0;
for (const magnitude of CONFIG.wind.accelerationLevels) {
  for (const sign of [-1, 1]) {
    if (magnitude === 0 && sign < 0) continue;
    const wind = { x: magnitude * sign, y: Math.abs(magnitude) * CONFIG.wind.verticalLiftFraction };
    const base = scenario();
    const flipped = mirrored(scenario());

    const a = runResolve({ ...base, wind });
    const b = runResolve({ ...flipped, wind });

    // Under mirroring, slot 0's outcome must equal slot 1's outcome reflected.
    const wobbleErr = Math.max(
      Math.abs(a.endWobble[0] - b.endWobble[1]),
      Math.abs(a.endWobble[1] - b.endWobble[0]),
    );
    const posErr = Math.max(
      Math.abs(a.endPositions[0].x + b.endPositions[1].x),
      Math.abs(a.endPositions[1].x + b.endPositions[0].x),
      Math.abs(a.endPositions[0].y - b.endPositions[1].y),
    );
    worstWobble = Math.max(worstWobble, wobbleErr);
    worstPos = Math.max(worstPos, posErr);
    console.log(
      String(magnitude).padEnd(8) +
        (magnitude === 0 ? 'calm' : sign > 0 ? 'outward' : 'inward').padEnd(10) +
        wobbleErr.toFixed(6).padEnd(14) +
        posErr.toFixed(6).padEnd(15) +
        (wobbleErr < 1e-6 && posErr < 1e-6 ? 'equivariant ✓' : 'BIASED ✗'),
    );
  }
}
console.log(`\nworst Wobble error: ${worstWobble.toFixed(8)}   worst position error: ${worstPos.toFixed(8)}`);
console.log('Sesi 19 baseline with the global field: 41.3 Wobble of one-sided damage.');

// ── 3. wind must still matter ──────────────────────────────────────────────

console.log('\n=== IS WIND STILL TACTICALLY MEANINGFUL? ===');
const samples = [];
for (const magnitude of CONFIG.wind.accelerationLevels) {
  for (const sign of [-1, 1]) {
    if (magnitude === 0 && sign < 0) continue;
    const wind = { x: magnitude * sign, y: Math.abs(magnitude) * CONFIG.wind.verticalLiftFraction };
    const r = runResolve({ ...scenario(), wind });
    samples.push({ magnitude, sign, total: r.endWobble[0] + r.endWobble[1] });
    console.log(
      `  ${String(magnitude).padEnd(6)} ${(magnitude === 0 ? 'calm' : sign > 0 ? 'outward' : 'inward').padEnd(8)}` +
        ` → combined Wobble ${(r.endWobble[0] + r.endWobble[1]).toFixed(2)}`,
    );
  }
}
const spread = Math.max(...samples.map((s) => s.total)) - Math.min(...samples.map((s) => s.total));
console.log(`  spread across wind settings: ${spread.toFixed(2)} Wobble`);
console.log('  (near zero would mean wind became decorative)');
