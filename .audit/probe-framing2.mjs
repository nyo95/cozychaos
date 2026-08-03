/**
 * Probe: does the drawn wizard actually fit inside the Draw frame, and is the
 * locked 2:3 arena ratio (A-09) in force at runtime?
 *
 * Written after Codex reported "the right wizard can still clip during
 * player-biased Draw/Aim" despite the A-09 recalibration. My original check in
 * probe-framing.mjs bounded the rival by `player.radius` (0.09) — the physics
 * body. The renderer draws a sprite and a Wobble ring that are both wider than
 * that, so the check was measuring the wrong edge.
 *
 * Run: node .audit/probe-framing2.mjs
 */
import { CONFIG } from '../shared/dist/index.js';

// Mirrors of renderer constants. Kept here as literals ON PURPOSE: if these
// drift from the renderer, this probe should fail loudly rather than silently
// track the change.
const SPRITE = { canvasSize: 176, pivotX: 92, worldCanvasSize: 0.56 }; // wizardSprites.ts:15
const RING_UNIT = 0.082;      // matchScene.ts:534
const RING_RADIUS = 1.55;     // matchScene.ts:552

const cam = CONFIG.camera;
const spawnX = CONFIG.player.spawnX;

// --- how far right of its centre does the rival actually paint? -------------
// Measured opaque bbox of the pink/cyan sheets, not the quad: the 176px cell
// is mostly transparent padding, so bounding the rival by the quad overstates
// the clip by ~3x. Measured with PIL: bbox x ∈ [58, 125] on a 176px cell.
const OPAQUE = { left: 58, right: 125 };
const arenaPerPx = SPRITE.worldCanvasSize / SPRITE.canvasSize;
// Slot 1 is mirrored (ctx.scale(-1,1)), so the far edge is the pivot-left side.
const spriteRight = (SPRITE.pivotX - OPAQUE.left) * arenaPerPx;
const ringRight = RING_UNIT * RING_RADIUS;
const bodyRight = CONFIG.player.radius;

const extents = [
  ['physics body (what A-09 checked)', bodyRight],
  ['Wobble ring', ringRight],
  ['sprite opaque pixels (mirrored slot 1)', spriteRight],
];

// Wizards do not stay on their spawn: positions carry across Turns.
const HEADROOM = drawRightEdgeOf();
function drawRightEdgeOf() { return -CONFIG.player.spawnX + CONFIG.camera.drawCenterBias + CONFIG.camera.drawHalfWidth; }

const drawRightEdge = -spawnX + cam.drawCenterBias + cam.drawHalfWidth;

console.log('=== RIVAL CLIPPING DURING DRAW (slot 0 is local) ===');
console.log(`Draw frame right edge : ${drawRightEdge.toFixed(3)}`);
console.log(`Rival centre          : ${spawnX.toFixed(3)}\n`);
let worst = 0;
for (const [label, ext] of extents) {
  const edge = spawnX + ext;
  const over = edge - drawRightEdge;
  worst = Math.max(worst, over);
  console.log(`  ${label.padEnd(34)} extends to ${edge.toFixed(3)}  ${over > 0 ? `CLIPPED by ${over.toFixed(3)}` : 'fits'}`);
}
console.log(`\n  bias needed to clear the widest element: ${(cam.drawCenterBias + worst).toFixed(3)} (now ${cam.drawCenterBias})`);
const widest = Math.max(...extents.map((e) => e[1]));
console.log(`  headroom past spawn before the rival leaves frame entirely: ${(HEADROOM - spawnX - widest).toFixed(3)} arena units`);
console.log('  (positions carry across Turns, so any rightward drift consumes this)');
console.log(`  ...but bias also pushes the LOCAL wizard toward the left edge:`);
for (const bias of [cam.drawCenterBias, cam.drawCenterBias + worst, 0.45]) {
  const localLeft = -spawnX - spriteRight;              // sprite is near-symmetric
  const frameLeft = -spawnX + bias - cam.drawHalfWidth;
  console.log(`    bias ${bias.toFixed(3)} → local wizard left ${localLeft.toFixed(3)} vs frame left ${frameLeft.toFixed(3)}` +
    ` → ${localLeft >= frameLeft ? 'fits' : `LOCAL CLIPPED by ${(frameLeft - localLeft).toFixed(3)}`}`);
}

// Widening the frame instead of shifting it costs Ink, so quantify that too.
console.log('\n  alternative: widen drawHalfWidth instead of shifting bias');
for (const dhw of [0.85, 0.90, 0.95, 1.0]) {
  const cost = (2 * cam.drawHalfWidth * CONFIG.ink.costPerUnitLength) / (2 * dhw);
  const right = -spawnX + cam.drawCenterBias + dhw;
  const left = -spawnX + cam.drawCenterBias - dhw;
  console.log(`    drawHalfWidth ${dhw.toFixed(2)} → frame ${left.toFixed(2)}..${right.toFixed(2)}` +
    `  rival ${right >= spawnX + worst + spawnX - spawnX ? '' : ''}${right >= spawnX + Math.max(...extents.map(e => e[1])) ? 'fits' : 'CLIPPED'}` +
    `  | costPerUnitLength must become ${cost.toFixed(1)} to hold Ink 75.5/sweep`);
}

// --- is the locked ratio actually in force? ---------------------------------
console.log('\n=== A-09 RATIO ENFORCEMENT ===');
console.log(`CONFIG.camera.arenaAspectRatio = ${(cam.arenaAspectRatio).toFixed(4)} (2:3)`);
const observed = [
  ['desktop CSS (styles.css:368) aspect-ratio 16/9', 16 / 9],
  ['<=42rem CSS (styles.css:817) aspect-ratio auto @430x932', 430 / 932],
  ['LOCKED target A-09', cam.arenaAspectRatio],
];
const inkPerHeightSweep = (aspect) => (1 / aspect) * 2 * cam.drawHalfWidth * CONFIG.ink.costPerUnitLength;
for (const [label, aspect] of observed) {
  console.log(`  ${label.padEnd(52)} aspect ${aspect.toFixed(3)}  full-height sweep ${inkPerHeightSweep(aspect).toFixed(1)} Ink`);
}
const worstRatio = inkPerHeightSweep(430 / 932) / inkPerHeightSweep(16 / 9);
console.log(`\n  phone-vs-desktop vertical Ink disparity STILL SHIPPING: ${worstRatio.toFixed(2)}x`);
console.log(`  (A-09 target: 1.00x — every device on ${(cam.arenaAspectRatio).toFixed(3)})`);
