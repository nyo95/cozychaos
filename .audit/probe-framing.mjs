/**
 * Probe: portrait framing + Ink economy calibration.
 *
 * Question this answers: if the arena canvas aspect ratio is locked for every
 * device (BK's decision, Sesi 20), what must `camera.fullHalfWidth`,
 * `camera.drawHalfWidth`, and `ink.costPerUnitLength` be so that
 *
 *   1. the island x ∈ [-1, 1] and the crystal ceiling y = 1.3 stay framed;
 *   2. a lob at the steepest legal angle stays inside the frame;
 *   3. the Ink bought by a gesture of a given screen fraction is UNCHANGED
 *      from the landscape build, horizontally AND vertically;
 *   4. the offence/defence crossover still lands at Ink 40.
 *
 * Run: node .audit/probe-framing.mjs   (needs `npm run build --workspace=shared`)
 */
import { CONFIG, predictLaunch } from '../shared/dist/index.js';

const OPPONENT_GAP = CONFIG.player.spawnX * 2; // 1.10
const GRAV = Math.abs(CONFIG.arena.gravity) * CONFIG.runeBody.gravityScale;

/** Ink charged for a stroke that spans `frac` of the canvas WIDTH. */
const inkPerWidthFrac = (frac, halfWidth, cost) => frac * 2 * halfWidth * cost;

/** Ink charged for a stroke that spans `frac` of the canvas HEIGHT. */
const inkPerHeightFrac = (frac, halfWidth, cost, aspect) =>
  (frac / aspect) * 2 * halfWidth * cost;

/** Visible arena rect for a camera, given canvas aspect (width / height). */
function frame(halfWidth, centerY, aspect) {
  const halfHeight = halfWidth / aspect;
  return { halfWidth, top: centerY + halfHeight, bottom: centerY - halfHeight, halfHeight };
}

/** Apex height of a launch at `angle` radians from horizontal. */
const apex = (speed, angle) => (speed * speed * Math.sin(angle) ** 2) / (2 * GRAV);

// ---------------------------------------------------------------- baseline
const LAND = 16 / 9;
const base = {
  full: CONFIG.camera.fullHalfWidth,
  draw: CONFIG.camera.drawHalfWidth,
  cost: CONFIG.ink.costPerUnitLength,
};

console.log('=== BASELINE (landscape 16:9, shipped constants) ===');
console.log(`full=${base.full} draw=${base.draw} cost=${base.cost}`);
console.log(`  Ink per full-width sweep (Draw cam) : ${inkPerWidthFrac(1, base.draw, base.cost).toFixed(1)}`);
console.log(`  Ink per full-height sweep (Draw cam): ${inkPerHeightFrac(1, base.draw, base.cost, LAND).toFixed(1)}`);
console.log(`  screen-width fraction that buys Ink 40: ${(40 / inkPerWidthFrac(1, base.draw, base.cost)).toFixed(3)}`);

// What the CURRENT unlocked portrait build does — the defect being fixed.
for (const [label, aspect] of [['iPhone 14 Pro 430x932 arena ~430x700', 430 / 700], ['tall 390x844 arena ~390x640', 390 / 640]]) {
  console.log(`  [unlocked portrait] ${label}: full-height sweep costs ${inkPerHeightFrac(1, base.draw, base.cost, aspect).toFixed(1)} Ink ` +
    `(${(inkPerHeightFrac(1, base.draw, base.cost, aspect) / inkPerHeightFrac(1, base.draw, base.cost, LAND)).toFixed(2)}x desktop)`);
}

// ------------------------------------------------------- crossover (camera-free)
console.log('\n=== CROSSOVER (independent of camera — mass curve only) ===');
let crossover = null;
for (let ink = 1; ink <= 100; ink++) {
  const r = predictLaunch(ink);
  if (crossover === null && r.maxReach < OPPONENT_GAP) crossover = ink;
}
for (const ink of [10, 20, 40, 70, 100]) {
  const r = predictLaunch(ink);
  console.log(`  Ink ${String(ink).padStart(3)} → mass ${r.mass.toFixed(2)} v ${r.speed.toFixed(2)} reach ${r.maxReach.toFixed(2)}` +
    (ink === 40 ? `   (gap = ${OPPONENT_GAP.toFixed(2)})` : ''));
}
console.log(`  first Ink where reach < opponent gap: ${crossover}`);

// ------------------------------------------------------- candidate ratios
console.log('\n=== CANDIDATE LOCKED RATIOS ===');
const maxAngle = CONFIG.aim.maxAngleFromOpponent;
const lightest = predictLaunch(1);
const lobApex = apex(lightest.speed, Math.min(maxAngle, Math.PI / 2));
console.log(`  steepest lob apex (lightest rune, ${(maxAngle * 180 / Math.PI).toFixed(0)}°): ${lobApex.toFixed(2)} above spawn ${CONFIG.runeBody.spawnHeight}`);
const needTop = CONFIG.runeBody.spawnHeight + lobApex;

const candidates = [
  ['3:4   (0.750)', 3 / 4],
  ['2:3   (0.667)', 2 / 3],
  ['0.640 (mockup arena band)', 0.64],
  ['9:16  (0.563)', 9 / 16],
  ['9:19.5(0.462, full mockup)', 851 / 1847],
];

/**
 * The invariant that actually governs Ink is `2 · drawHalfWidth · cost` — the
 * Ink charged by a sweep across the full canvas width at the Draw camera. It
 * does NOT involve fullHalfWidth: nobody draws at the Full camera. So the
 * cheapest correct calibration keeps drawHalfWidth AND cost untouched and only
 * re-frames the Full camera, which is pure presentation.
 *
 * The one thing that then has to move is `drawCenterBias`: the Draw frame must
 * still contain the rival, or aiming becomes blind.
 */
const RIVAL_EDGE = CONFIG.player.spawnX + CONFIG.player.radius; // 0.64

for (const [label, aspect] of candidates) {
  const drawHalfWidth = base.draw;   // unchanged — Ink economy is byte-identical
  const cost = base.cost;            // unchanged

  // Full camera: narrowest framing that still holds the island, the crystal
  // ceiling, and the kill floor. Smaller = island reads larger on a phone.
  const byCeiling = (Math.max(needTop, CONFIG.hazards.generation.ceilingY) - CONFIG.camera.fullCenterY) * aspect;
  const byKillFloor = (CONFIG.camera.fullCenterY - CONFIG.arena.killFloorY) * aspect;
  const fullHalfWidth = Math.max(1.15, byCeiling, byKillFloor);

  const f = frame(fullHalfWidth, CONFIG.camera.fullCenterY, aspect);
  const d = frame(drawHalfWidth, CONFIG.camera.drawCenterY, aspect);

  // Draw frame must reach the rival. Solve the minimum bias that does it.
  const minBias = RIVAL_EDGE - drawHalfWidth + CONFIG.player.spawnX;
  const rightEdgeNow = -CONFIG.player.spawnX + CONFIG.camera.drawCenterBias + drawHalfWidth;

  console.log(`\n  ${label}`);
  console.log(`    fullHalfWidth ${fullHalfWidth.toFixed(3)}  drawHalfWidth ${drawHalfWidth.toFixed(3)} (unchanged)  cost ${cost.toFixed(1)} (unchanged)`);
  console.log(`    Full frame  x ±${f.halfWidth.toFixed(2)}  y ${f.bottom.toFixed(2)}..${f.top.toFixed(2)}` +
    `   island fits: ${f.halfWidth >= 1.0 ? 'yes' : 'NO'}   ceiling 1.3: ${f.top >= 1.3 ? 'yes' : 'NO'}   killFloor -1.4: ${f.bottom <= -1.4 ? 'yes' : 'NO'}`);
  console.log(`    island occupies ${(100 / f.halfWidth).toFixed(0)}% of canvas width`);
  console.log(`    Draw frame  x ±${d.halfWidth.toFixed(2)}  y ${d.bottom.toFixed(2)}..${d.top.toFixed(2)}`);
  console.log(`    rival at ${RIVAL_EDGE.toFixed(2)} vs draw right edge ${rightEdgeNow.toFixed(2)} → ${rightEdgeNow >= RIVAL_EDGE ? 'visible' : 'CLIPPED'}; min drawCenterBias ${minBias.toFixed(2)} (now ${CONFIG.camera.drawCenterBias})`);
  console.log(`    Ink: full-width sweep ${inkPerWidthFrac(1, drawHalfWidth, cost).toFixed(1)} (baseline 75.5)  |  full-height sweep ${inkPerHeightFrac(1, drawHalfWidth, cost, aspect).toFixed(1)} (baseline 42.5)`);
  console.log(`    screen-width fraction for Ink 40: ${(40 / inkPerWidthFrac(1, drawHalfWidth, cost)).toFixed(3)} (baseline 0.530)`);
  console.log(`    desktop 1280x720 letterbox → arena ${Math.round(720 * aspect)}x720 px`);
}
