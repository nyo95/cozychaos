import type { Vec2 } from '@cozy/shared';

/**
 * Mapping between arena coordinates and canvas pixels.
 *
 * PRD-AMENDMENTS A-04 makes the rune canvas a 1:1 overlay on the arena, so
 * this mapping is the whole aiming system. It has to be exact and it has to be
 * uniform: if x and y were scaled differently, a circle drawn by the player
 * would arrive as an ellipse and a 45° line would not cast at 45°.
 *
 * Arena space: x ∈ [-1, 1] across the safe island, y = 0 at the ground and
 * positive upward — the opposite of canvas y, which grows downward.
 */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Pixels per arena unit. Uniform on both axes. */
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
}

/** Arena half-width kept visible on either side of the island. */
const VIEW_HALF_WIDTH = 1.45;
/** Vertical position of the ground line, as a fraction of canvas height. */
const GROUND_FRACTION = 0.68;

export function createViewport(width: number, height: number): Viewport {
  const scale = width / (VIEW_HALF_WIDTH * 2);
  return { width, height, scale, originX: width / 2, originY: height * GROUND_FRACTION };
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
