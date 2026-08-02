import { CONFIG, type PlayerSlot, type Phase, type Vec2 } from '@cozy/shared';

/**
 * Mapping between arena coordinates and canvas pixels, plus the camera that
 * chooses which slice of the arena is on screen.
 *
 * PRD-AMENDMENTS A-04 makes the rune canvas a 1:1 overlay on the arena, so
 * this mapping is the whole aiming system. It has to be exact and it has to be
 * uniform: if x and y were scaled differently, a circle drawn by the player
 * would arrive as an ellipse and a 45° line would not cast at 45°.
 *
 * Arena space: x ∈ [-1, 1] across the safe island, y = 0 at the ground and
 * positive upward — the opposite of canvas y, which grows downward.
 *
 * The camera zooms in while a player draws and aims, then pulls back for the
 * clash. `toScreen` and `toArena` stay exact inverses at every zoom level, so
 * a stroke captured mid-transition is still read correctly.
 *
 * Zoom is not a purely cosmetic choice. Ink is charged per unit of *arena*
 * arc length, so a tighter camera makes the same finger sweep cost less Ink.
 * That is why the framing constants live in shared CONFIG next to
 * `ink.costPerUnitLength`, which is calibrated against them.
 */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Pixels per arena unit. Uniform on both axes. */
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  /** The framing this viewport was built from, for renderers that need it. */
  readonly camera: CameraFrame;
}

/** Arena-space framing: what the camera is looking at, and how wide. */
export interface CameraFrame {
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
}

export const FULL_FRAME: CameraFrame = Object.freeze({
  centerX: 0,
  centerY: CONFIG.camera.fullCenterY,
  halfWidth: CONFIG.camera.fullHalfWidth,
});

/**
 * Where the camera wants to be for a given phase.
 *
 * Draw and Cast frame the local wizard, biased toward mid-arena so the rival
 * stays partly visible — a player who cannot see the rival cannot aim. Reveal
 * onward shows the whole arena, because the clash is the part worth watching
 * and both players must see the same thing.
 */
export function targetFrame(phase: Phase | null, slot: PlayerSlot): CameraFrame {
  if (phase !== 'draw' && phase !== 'cast' && phase !== 'setup') return FULL_FRAME;
  const home = slot === 0 ? -CONFIG.player.spawnX : CONFIG.player.spawnX;
  const bias = slot === 0 ? CONFIG.camera.drawCenterBias : -CONFIG.camera.drawCenterBias;
  return {
    centerX: home + bias,
    centerY: CONFIG.camera.drawCenterY,
    halfWidth: CONFIG.camera.drawHalfWidth,
  };
}

/**
 * Frame-rate independent easing toward a target.
 *
 * `1 - e^(-k·dt)` rather than a fixed per-frame fraction: a 120 Hz display and
 * a 60 Hz display must reach the same framing at the same wall-clock moment,
 * or the two players would be drawing on differently-scaled canvases and
 * therefore spending Ink at different rates.
 */
export function easeFrame(current: CameraFrame, target: CameraFrame, deltaMs: number): CameraFrame {
  const t = 1 - Math.exp(-CONFIG.camera.easePerSecond * (Math.max(0, deltaMs) / 1000));
  return {
    centerX: current.centerX + (target.centerX - current.centerX) * t,
    centerY: current.centerY + (target.centerY - current.centerY) * t,
    halfWidth: current.halfWidth + (target.halfWidth - current.halfWidth) * t,
  };
}

export function createViewport(
  width: number,
  height: number,
  camera: CameraFrame = FULL_FRAME,
): Viewport {
  const halfWidth = Math.max(1e-3, camera.halfWidth);
  const scale = width / (halfWidth * 2);
  return {
    width,
    height,
    scale,
    originX: width / 2 - camera.centerX * scale,
    originY: height / 2 + camera.centerY * scale,
    camera,
  };
}

export function toScreen(viewport: Viewport, point: Vec2): Vec2 {
  return {
    x: viewport.originX + point.x * viewport.scale,
    y: viewport.originY - point.y * viewport.scale,
  };
}

export function toArena(viewport: Viewport, screenX: number, screenY: number): Vec2 {
  return {
    x: (screenX - viewport.originX) / viewport.scale,
    y: (viewport.originY - screenY) / viewport.scale,
  };
}

/** Converts an arena-space length to pixels. */
export function toPixels(viewport: Viewport, arenaLength: number): number {
  return arenaLength * viewport.scale;
}

/** Arena-space rectangle currently on screen. Renderers cull against this. */
export function visibleBounds(viewport: Viewport): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  const topLeft = toArena(viewport, 0, 0);
  const bottomRight = toArena(viewport, viewport.width, viewport.height);
  return {
    left: topLeft.x,
    right: bottomRight.x,
    top: topLeft.y,
    bottom: bottomRight.y,
  };
}
