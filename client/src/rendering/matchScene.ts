import {
  CONFIG,
  TAU,
  normalize,
  type HazardSpikeConfig,
  type PlayerSlot,
  type Snapshot,
  type Vec2,
} from '@cozy/shared';
import { PALETTE, mix, withAlpha } from './palette.js';
import { toPixels, toScreen, visibleBounds, type Viewport } from './viewport.js';
import type { SceneEffects } from './effects.js';

const SLOT_COLOUR: Readonly<Record<PlayerSlot, string>> = {
  0: '#5fe0f0',
  1: '#ff8fd0',
};
const SLOT_GLOW: Readonly<Record<PlayerSlot, string>> = {
  0: '#c9f7ff',
  1: '#ffd6ee',
};

export interface MatchScene {
  readonly snapshot: Snapshot | null;
  readonly obstacles: readonly HazardSpikeConfig[];
  readonly localSlot: PlayerSlot;
  readonly localStroke: readonly Vec2[];
  readonly drawing: boolean;
  readonly casting: boolean;
  readonly castOrigin: Vec2 | null;
  readonly castDirection: Vec2 | null;
  readonly timeMs: number;
  readonly wind: Vec2;
  readonly effects: SceneEffects;
}

/**
 * Pure presentation. Cave, rune matter, and snapshots are all server-owned;
 * nothing drawn here can feed back into simulation.
 *
 * The arena is the floating dream island of PRD §1, not the grey cave the
 * previous build drifted into. That drift was not only an art problem: a dark,
 * low-contrast background is what made spell matter hard to follow on a phone,
 * and it put the "Cozy chaos" pillar (§4.2) in direct conflict with what the
 * player actually saw.
 */
export function drawMatchScene(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  scene: MatchScene,
): void {
  drawSky(ctx, viewport, scene.timeMs);
  drawAurora(ctx, viewport, scene.timeMs);
  drawStars(ctx, viewport, scene.timeMs);
  drawFarIslands(ctx, viewport, scene.timeMs, scene.wind);
  drawClouds(ctx, viewport, scene.timeMs, scene.wind);
  scene.effects.drawMotes(ctx, viewport, scene.timeMs, scene.wind);
  drawCrystals(ctx, viewport, scene.obstacles, scene.timeMs);
  drawIsland(ctx, viewport, scene.timeMs);

  if (scene.snapshot) {
    for (const bond of scene.snapshot.bonds) drawBond(ctx, viewport, bond);
    for (const particle of scene.snapshot.particles) drawParticle(ctx, viewport, particle);
    for (const body of scene.snapshot.bodies) {
      drawWizard(ctx, viewport, body, body.slot, body.slot === scene.localSlot, scene.timeMs);
    }
  }
  scene.effects.draw(ctx, viewport, scene.timeMs);

  if (scene.localStroke.length > 1) drawStroke(ctx, viewport, scene.localStroke, scene.localSlot);
  if (scene.casting && scene.castOrigin && scene.castDirection) {
    drawCastArrow(ctx, viewport, scene.castOrigin, scene.castDirection, scene.localSlot);
  }
}

/** Stable decoration scatter. Never `Math.random`: both clients must match. */
function hash01(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function drawSky(ctx: CanvasRenderingContext2D, viewport: Viewport, timeMs: number): void {
  // The horizon is anchored in arena space, so the gradient stays glued to the
  // world when the camera zooms instead of sliding across it.
  const horizon = toScreen(viewport, { x: 0, y: -0.15 }).y;
  const zenith = toScreen(viewport, { x: 0, y: 1.9 }).y;
  const gradient = ctx.createLinearGradient(0, zenith, 0, horizon);
  gradient.addColorStop(0, PALETTE.skyZenith);
  gradient.addColorStop(0.34, PALETTE.skyUpper);
  gradient.addColorStop(0.66, PALETTE.skyMid);
  gradient.addColorStop(0.9, PALETTE.skyHorizon);
  gradient.addColorStop(1, PALETTE.skyGlow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // Below the horizon the sky keeps going: this is a floating island, so the
  // "ground" is more sky, slightly deeper, with no hard bottom edge.
  const below = ctx.createLinearGradient(0, horizon, 0, viewport.height);
  below.addColorStop(0, PALETTE.skyGlow);
  below.addColorStop(0.35, PALETTE.skyMid);
  below.addColorStop(1, PALETTE.skyZenith);
  ctx.fillStyle = below;
  ctx.fillRect(0, Math.max(0, horizon), viewport.width, viewport.height - Math.max(0, horizon));

  const sun = toScreen(viewport, { x: 0.15, y: -0.05 });
  const glow = ctx.createRadialGradient(
    sun.x, sun.y, 0,
    sun.x, sun.y, toPixels(viewport, 1.6),
  );
  const pulse = 0.16 + Math.sin(timeMs / 4200) * 0.03;
  glow.addColorStop(0, withAlpha(PALETTE.skyGlow, pulse + 0.12));
  glow.addColorStop(1, withAlpha(PALETTE.skyGlow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawAurora(ctx: CanvasRenderingContext2D, viewport: Viewport, timeMs: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let band = 0; band < PALETTE.aurora.length; band += 1) {
    const colour = PALETTE.aurora[band]!;
    const phase = timeMs / (7000 + band * 2600);
    const baseY = 1.55 - band * 0.24;
    ctx.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const x = -2.2 + (step / 24) * 4.4;
      const y = baseY +
        Math.sin(x * 1.6 + phase * TAU) * 0.13 +
        Math.sin(x * 3.1 - phase * TAU * 0.7) * 0.05;
      const point = toScreen(viewport, { x, y });
      if (step === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = withAlpha(colour, 0.09);
    ctx.lineWidth = toPixels(viewport, 0.16);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = withAlpha(colour, 0.06);
    ctx.lineWidth = toPixels(viewport, 0.05);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, viewport: Viewport, timeMs: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < 40; index += 1) {
    const x = -2.4 + hash01(index * 3 + 1) * 4.8;
    const y = 0.55 + hash01(index * 3 + 2) * 1.5;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(timeMs / 1500 + hash01(index) * TAU));
    const point = toScreen(viewport, { x, y });
    ctx.fillStyle = withAlpha(PALETTE.star, 0.5 * twinkle * (y - 0.4));
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(0.6, toPixels(viewport, 0.0045)), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Distant islets. Parallax comes from moving them slower than the wind. */
function drawFarIslands(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  timeMs: number,
  wind: Vec2,
): void {
  for (let index = 0; index < 5; index += 1) {
    const drift = (timeMs / 1000) * wind.x * 0.02;
    const span = 5.2;
    const x = ((hash01(index * 5 + 3) * span + drift) % span) - span / 2;
    const y = 0.42 + hash01(index * 5 + 4) * 0.85;
    const width = 0.18 + hash01(index * 5 + 5) * 0.26;
    const depth = 0.4 + hash01(index * 5 + 6) * 0.35;
    const bob = Math.sin(timeMs / 3600 + index) * 0.015;
    drawIsletSilhouette(ctx, viewport, { x, y: y + bob }, width, depth);
  }
}

function drawIsletSilhouette(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  at: Vec2,
  halfWidth: number,
  depth: number,
): void {
  const left = toScreen(viewport, { x: at.x - halfWidth, y: at.y });
  const right = toScreen(viewport, { x: at.x + halfWidth, y: at.y });
  const tip = toScreen(viewport, { x: at.x, y: at.y - halfWidth * depth * 2.4 });
  ctx.fillStyle = withAlpha(PALETTE.farIsland, 0.5);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.quadraticCurveTo(right.x, (right.y + tip.y) / 2, tip.x, tip.y);
  ctx.quadraticCurveTo(left.x, (left.y + tip.y) / 2, left.x, left.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha(PALETTE.farIslandTop, 0.55);
  ctx.beginPath();
  ctx.ellipse(
    (left.x + right.x) / 2,
    left.y,
    (right.x - left.x) / 2,
    Math.max(1, toPixels(viewport, halfWidth * 0.16)),
    0, 0, TAU,
  );
  ctx.fill();
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  timeMs: number,
  wind: Vec2,
): void {
  const bounds = visibleBounds(viewport);
  for (let index = 0; index < 9; index += 1) {
    const layer = index % 3;
    const speed = 0.014 + layer * 0.02 + Math.abs(wind.x) * 0.05;
    const drift = (timeMs / 1000) * speed * Math.sign(wind.x || 1);
    const span = 6.0;
    const x = ((hash01(index * 7 + 11) * span + drift + span) % span) - span / 2;
    const y = -0.1 + hash01(index * 7 + 12) * 1.7;
    const width = 0.34 + hash01(index * 7 + 13) * 0.55;
    if (x + width < bounds.left - 0.5 || x - width > bounds.right + 0.5) continue;
    const height = width * (0.19 + hash01(index * 7 + 14) * 0.12);
    const centre = toScreen(viewport, { x, y });
    ctx.fillStyle = layer === 0 ? PALETTE.cloudDark : PALETTE.cloudLight;
    for (let puff = 0; puff < 4; puff += 1) {
      const offset = (puff / 3 - 0.5) * width * 1.5;
      const lift = Math.sin(puff * 1.7 + index) * height * 0.5;
      ctx.beginPath();
      ctx.ellipse(
        centre.x + toPixels(viewport, offset),
        centre.y - toPixels(viewport, lift),
        toPixels(viewport, width * (0.42 - Math.abs(puff / 3 - 0.5) * 0.28)),
        toPixels(viewport, height),
        0, 0, TAU,
      );
      ctx.fill();
    }
  }
}

/**
 * Cave spikes became sky crystals.
 *
 * Geometry is unchanged — these are the exact triangles the server collides
 * against — but they now read as something a spell would plausibly ricochet
 * off. The facet split is drawn from the same three vertices the collider
 * uses, so what looks solid *is* solid; the previous flat grey triangle made
 * players believe only the tip was interactive.
 */
function drawCrystals(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  obstacles: readonly HazardSpikeConfig[],
  timeMs: number,
): void {
  for (const [index, spike] of obstacles.entries()) {
    const base = toScreen(viewport, spike.base);
    const tip = toScreen(viewport, spike.tip);
    const half = toPixels(viewport, spike.halfWidth);
    const vertical = Math.abs(spike.base.y - spike.tip.y) > Math.abs(spike.base.x - spike.tip.x);
    const left = vertical ? { x: base.x - half, y: base.y } : { x: base.x, y: base.y - half };
    const right = vertical ? { x: base.x + half, y: base.y } : { x: base.x, y: base.y + half };
    const shimmer = 0.5 + 0.5 * Math.sin(timeMs / 1800 + index * 1.7);

    ctx.save();
    ctx.shadowColor = withAlpha(PALETTE.crystalCore, 0.55);
    ctx.shadowBlur = toPixels(viewport, 0.06) * (0.6 + shimmer * 0.6);

    const body = ctx.createLinearGradient(left.x, left.y, tip.x, tip.y);
    body.addColorStop(0, PALETTE.crystalDeep);
    body.addColorStop(0.55, PALETTE.crystalFace);
    body.addColorStop(1, mix(PALETTE.crystalFace, PALETTE.crystalCore, 0.6 + shimmer * 0.4));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Two internal facets from the true midpoint: the whole face reads solid.
    const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
    ctx.fillStyle = withAlpha(PALETTE.crystalCore, 0.22);
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = withAlpha(PALETTE.crystalRim, 0.55 + shimmer * 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = withAlpha(PALETTE.crystalRim, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, viewport: Viewport, timeMs: number): void {
  const half = CONFIG.arena.halfWidth;
  const left = toScreen(viewport, { x: -half, y: 0 });
  const right = toScreen(viewport, { x: half, y: 0 });
  const tip = toScreen(viewport, { x: 0, y: -0.72 });
  const width = right.x - left.x;

  ctx.save();
  ctx.shadowColor = 'rgba(40, 24, 60, .38)';
  ctx.shadowBlur = toPixels(viewport, 0.12);
  ctx.shadowOffsetY = toPixels(viewport, 0.04);
  const rock = ctx.createLinearGradient(0, left.y, 0, tip.y);
  rock.addColorStop(0, PALETTE.rockLight);
  rock.addColorStop(0.4, PALETTE.rockMid);
  rock.addColorStop(1, PALETTE.rockDeep);
  ctx.fillStyle = rock;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.quadraticCurveTo(right.x - width * 0.1, (right.y + tip.y) * 0.5, tip.x, tip.y);
  ctx.quadraticCurveTo(left.x + width * 0.1, (left.y + tip.y) * 0.5, left.x, left.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Rock strata: a few horizontal bands so the underside has depth.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.quadraticCurveTo(right.x - width * 0.1, (right.y + tip.y) * 0.5, tip.x, tip.y);
  ctx.quadraticCurveTo(left.x + width * 0.1, (left.y + tip.y) * 0.5, left.x, left.y);
  ctx.closePath();
  ctx.clip();
  for (let band = 1; band <= 4; band += 1) {
    const y = left.y + (tip.y - left.y) * (band / 5.5);
    ctx.strokeStyle = withAlpha('#2f2748', 0.16);
    ctx.lineWidth = toPixels(viewport, 0.018);
    ctx.beginPath();
    ctx.moveTo(left.x, y);
    ctx.bezierCurveTo(
      left.x + width * 0.3, y + toPixels(viewport, 0.03),
      right.x - width * 0.3, y - toPixels(viewport, 0.02),
      right.x, y,
    );
    ctx.stroke();
  }
  ctx.restore();

  // Grass cap.
  const grass = ctx.createLinearGradient(0, left.y - toPixels(viewport, 0.09), 0, left.y + toPixels(viewport, 0.05));
  grass.addColorStop(0, PALETTE.grassLight);
  grass.addColorStop(0.6, PALETTE.grassMid);
  grass.addColorStop(1, PALETTE.grassDeep);
  ctx.fillStyle = grass;
  ctx.beginPath();
  ctx.ellipse((left.x + right.x) / 2, left.y, width / 2, toPixels(viewport, 0.062), 0, 0, TAU);
  ctx.fill();

  // Blades and blossoms, swaying. Deterministic positions, animated phase.
  for (let index = 0; index < 34; index += 1) {
    const t = hash01(index * 11 + 5);
    const x = -half * 0.96 + t * half * 1.92;
    const edgeFade = 1 - Math.abs(x / half) ** 3;
    const height = (0.03 + hash01(index * 11 + 6) * 0.05) * edgeFade;
    const sway = Math.sin(timeMs / 900 + index * 0.8) * 0.012 * edgeFade;
    const root = toScreen(viewport, { x, y: 0.002 });
    const top = toScreen(viewport, { x: x + sway, y: height });
    ctx.strokeStyle = withAlpha(hash01(index) > 0.6 ? PALETTE.grassLight : PALETTE.grassDeep, 0.75);
    ctx.lineWidth = Math.max(1, toPixels(viewport, 0.008));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.quadraticCurveTo(root.x, (root.y + top.y) / 2, top.x, top.y);
    ctx.stroke();
    if (hash01(index * 13) > 0.84) {
      ctx.fillStyle = withAlpha(PALETTE.blossom, 0.9);
      ctx.beginPath();
      ctx.arc(top.x, top.y, Math.max(1, toPixels(viewport, 0.011)), 0, TAU);
      ctx.fill();
    }
  }

  // Vines hanging off the underside — the "floating" cue that reads instantly.
  for (let index = 0; index < 7; index += 1) {
    const x = -half * 0.82 + hash01(index * 19 + 7) * half * 1.64;
    const length = 0.1 + hash01(index * 19 + 8) * 0.24;
    const sway = Math.sin(timeMs / 1600 + index) * 0.03;
    const from = toScreen(viewport, { x, y: -0.015 });
    const to = toScreen(viewport, { x: x + sway, y: -0.015 - length });
    ctx.strokeStyle = withAlpha(PALETTE.rootVine, 0.6);
    ctx.lineWidth = Math.max(1, toPixels(viewport, 0.01));
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(from.x + (to.x - from.x) * 0.2, (from.y + to.y) / 2, to.x, to.y);
    ctx.stroke();
  }
}

function drawBond(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  bond: Snapshot['bonds'][number],
): void {
  const a = toScreen(viewport, { x: bond.ax, y: bond.ay });
  const b = toScreen(viewport, { x: bond.bx, y: bond.by });
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = withAlpha(SLOT_GLOW[bond.owner], 0.9);
  ctx.shadowBlur = bond.cross ? 12 : 7;
  ctx.strokeStyle = withAlpha(SLOT_COLOUR[bond.owner], bond.cross ? 0.95 : 0.7);
  ctx.lineWidth = bond.cross ? 4 : 2.6;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  particle: Snapshot['particles'][number],
): void {
  const point = toScreen(viewport, particle);
  const radius = Math.max(2.5, toPixels(viewport, particle.radius));
  const colour = SLOT_COLOUR[particle.owner];

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3);
  halo.addColorStop(0, withAlpha(SLOT_GLOW[particle.owner], 0.5));
  halo.addColorStop(1, withAlpha(SLOT_GLOW[particle.owner], 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 3, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Deflected matter is drawn with a hot rim, because a fragment sent back at
  // its own caster is the single most important thing to be able to see.
  if (particle.deflected) {
    ctx.strokeStyle = withAlpha(PALETTE.warning, 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 1.65, 0, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = withAlpha(colour, 0.96);
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.75);
  ctx.beginPath();
  ctx.arc(point.x - radius * 0.28, point.y - radius * 0.3, radius * 0.34, 0, TAU);
  ctx.fill();
}

function drawWizard(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  body: Snapshot['bodies'][number],
  slot: PlayerSlot,
  isLocal: boolean,
  timeMs: number,
): void {
  const colour = SLOT_COLOUR[slot];
  const bob = Math.sin(timeMs / 760 + slot * 2) * 0.006;
  const base = toScreen(viewport, { x: body.x, y: body.y - CONFIG.player.radius + bob });
  const unit = toPixels(viewport, 0.082);
  const facing = slot === 0 ? 1 : -1;
  ctx.globalAlpha = body.alive ? 1 : 0.22;

  // Contact shadow, so a wizard on the ground does not look pasted on.
  ctx.fillStyle = 'rgba(45, 30, 65, .26)';
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + unit * 0.08, unit * 0.85, unit * 0.2, 0, 0, TAU);
  ctx.fill();

  // Wobble ring: the only health-like readout in the game (PRD §5.3).
  const wobbleFraction = Math.min(1, body.wobble / CONFIG.wobble.max);
  if (wobbleFraction > 0.01) {
    ctx.strokeStyle = withAlpha(PALETTE.warning, 0.35 + wobbleFraction * 0.5);
    ctx.lineWidth = 2.5 + wobbleFraction * 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(base.x, base.y - unit * 0.9, unit * 1.55, -Math.PI / 2, -Math.PI / 2 + TAU * wobbleFraction);
    ctx.stroke();
  }

  // Robe.
  const robe = ctx.createLinearGradient(base.x, base.y - unit * 1.3, base.x, base.y);
  robe.addColorStop(0, PALETTE.wizardRobe);
  robe.addColorStop(1, PALETTE.wizardRobeShade);
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(base.x - unit * 0.72, base.y);
  ctx.quadraticCurveTo(base.x - unit * 0.5, base.y - unit * 0.9, base.x - unit * 0.36, base.y - unit * 1.2);
  ctx.lineTo(base.x + unit * 0.36, base.y - unit * 1.2);
  ctx.quadraticCurveTo(base.x + unit * 0.5, base.y - unit * 0.9, base.x + unit * 0.72, base.y);
  ctx.closePath();
  ctx.fill();

  // Head.
  ctx.fillStyle = PALETTE.wizardSkin;
  ctx.beginPath();
  ctx.arc(base.x, base.y - unit * 1.48, unit * 0.5, 0, TAU);
  ctx.fill();

  // Eyes, facing the rival.
  ctx.fillStyle = '#3b2f52';
  for (const offset of [-0.16, 0.16]) {
    ctx.beginPath();
    ctx.arc(
      base.x + unit * (offset + facing * 0.1),
      base.y - unit * 1.5,
      unit * 0.07,
      0, TAU,
    );
    ctx.fill();
  }

  // Pointed hat in the player's colour, with a soft brim.
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y - unit * 1.82, unit * 0.92, unit * 0.17, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(base.x - unit * 0.6, base.y - unit * 1.85);
  ctx.quadraticCurveTo(
    base.x + facing * unit * 0.1, base.y - unit * 3.15,
    base.x + facing * unit * 0.52, base.y - unit * 2.5,
  );
  ctx.lineTo(base.x + unit * 0.6, base.y - unit * 1.85);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha(PALETTE.wizardTrim, 0.9);
  ctx.beginPath();
  ctx.arc(base.x + facing * unit * 0.52, base.y - unit * 2.5, unit * 0.12, 0, TAU);
  ctx.fill();

  // Staff with a glowing tip: reads as "this one casts" without any label.
  ctx.strokeStyle = '#8a6b4e';
  ctx.lineWidth = Math.max(1.5, unit * 0.11);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(base.x + facing * unit * 0.72, base.y);
  ctx.lineTo(base.x + facing * unit * 0.86, base.y - unit * 1.85);
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tipX = base.x + facing * unit * 0.86;
  const tipY = base.y - unit * 1.95;
  const spark = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, unit * 0.6);
  spark.addColorStop(0, withAlpha(SLOT_GLOW[slot], 0.9));
  spark.addColorStop(1, withAlpha(SLOT_GLOW[slot], 0));
  ctx.fillStyle = spark;
  ctx.beginPath();
  ctx.arc(tipX, tipY, unit * 0.6, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (isLocal) {
    const markerY = base.y - unit * 3.5 + Math.sin(timeMs / 520) * unit * 0.12;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.moveTo(base.x, markerY + unit * 0.42);
    ctx.lineTo(base.x - unit * 0.3, markerY - unit * 0.1);
    ctx.lineTo(base.x + unit * 0.3, markerY - unit * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  stroke: readonly Vec2[],
  slot: PlayerSlot,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = withAlpha(SLOT_GLOW[slot], 0.9);
  ctx.shadowBlur = 14;
  for (const [width, alpha] of [[13, 0.18], [6.5, 0.5], [3, 1]] as const) {
    ctx.strokeStyle = withAlpha(width === 3 ? SLOT_GLOW[slot] : SLOT_COLOUR[slot], alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    const first = toScreen(viewport, stroke[0]!);
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index < stroke.length; index += 1) {
      const point = toScreen(viewport, stroke[index]!);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Aim indicator.
 *
 * Length is deliberately fixed and unrelated to drag distance: drag magnitude
 * buys nothing, and an arrow that grew with the drag would imply otherwise.
 * The dotted arc hints at the ballistic path without predicting it — reach is
 * the player's to judge from the mass readout.
 */
function drawCastArrow(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  origin: Vec2,
  rawDirection: Vec2,
  slot: PlayerSlot,
): void {
  const direction = normalize(rawDirection, { x: slot === 0 ? 1 : -1, y: 0 });
  const from = toScreen(viewport, origin);
  const to = toScreen(viewport, {
    x: origin.x + direction.x * 0.46,
    y: origin.y + direction.y * 0.46,
  });
  ctx.save();
  ctx.shadowColor = withAlpha(SLOT_GLOW[slot], 0.8);
  ctx.shadowBlur = 10;
  ctx.strokeStyle = SLOT_COLOUR[slot];
  ctx.fillStyle = SLOT_COLOUR[slot];
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - 15 * Math.cos(angle - 0.42), to.y - 15 * Math.sin(angle - 0.42));
  ctx.lineTo(to.x - 15 * Math.cos(angle + 0.42), to.y - 15 * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
