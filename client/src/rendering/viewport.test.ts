import { describe, expect, it } from 'vitest';
import { CONFIG, classifyStroke, distance } from '@cozy/shared';
import {
  FULL_FRAME,
  createViewport,
  easeFrame,
  targetFrame,
  toArena,
  toPixels,
  toScreen,
} from './viewport.js';

/**
 * The viewport is the aiming system. PRD-AMENDMENTS A-04 makes the rune canvas
 * a 1:1 overlay on the arena, so any distortion here is a distortion in how
 * every spell aims — and it would be invisible in play, showing up only as
 * "my spells go slightly wrong" complaints.
 */

const viewport = createViewport(1280, 800);

describe('screen and arena coordinates round-trip', () => {
  it('returns the same point after a round trip', () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 0.75, y: 0.4 },
      { x: -1.2, y: -0.3 },
      { x: 1.4, y: 1.1 },
    ]) {
      const screen = toScreen(viewport, point);
      const back = toArena(viewport, screen.x, screen.y);
      expect(back.x).toBeCloseTo(point.x, 10);
      expect(back.y).toBeCloseTo(point.y, 10);
    }
  });

  it('puts the arena centre at the middle of the canvas', () => {
    const centre = toScreen(viewport, { x: 0, y: 0 });
    expect(centre.x).toBeCloseTo(viewport.width / 2, 6);
  });

  it('treats arena y as up and canvas y as down', () => {
    const low = toScreen(viewport, { x: 0, y: 0 });
    const high = toScreen(viewport, { x: 0, y: 1 });
    expect(high.y).toBeLessThan(low.y);
  });

  it('shows the whole safe island with room on both sides', () => {
    // A player must be able to draw beyond the island edge — that is where
    // knock-outs happen (PRD §5.2) and where a Vortex is usefully placed.
    const left = toScreen(viewport, { x: -CONFIG.arena.halfWidth, y: 0 });
    const right = toScreen(viewport, { x: CONFIG.arena.halfWidth, y: 0 });
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(viewport.width);
  });
});

describe('the mapping is uniform, so shapes are not distorted', () => {
  it('scales x and y by the same factor', () => {
    // If the axes scaled differently, a drawn circle would arrive as an
    // ellipse and the classifier would see a shape the player did not draw.
    const origin = toScreen(viewport, { x: 0, y: 0 });
    const alongX = toScreen(viewport, { x: 1, y: 0 });
    const alongY = toScreen(viewport, { x: 0, y: 1 });
    expect(Math.abs(alongX.x - origin.x)).toBeCloseTo(Math.abs(alongY.y - origin.y), 10);
  });

  it('keeps a drawn circle circular through the transform', () => {
    const circleInScreenSpace = Array.from({ length: 64 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 63;
      return { x: 640 + Math.cos(angle) * 180, y: 400 + Math.sin(angle) * 180 };
    });
    const inArena = circleInScreenSpace.map((p) => toArena(viewport, p.x, p.y));
    expect(classifyStroke(inArena).family).toBe('loop');
  });

  it('preserves a 45° gesture as a 45° aim', () => {
    const start = toArena(viewport, 400, 500);
    const end = toArena(viewport, 600, 300);
    const stroke = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    });
    const direction = classifyStroke(stroke).features.direction;
    expect((Math.atan2(direction.y, direction.x) * 180) / Math.PI).toBeCloseTo(45, 4);
  });

  it('converts arena lengths to pixels consistently', () => {
    const origin = toScreen(viewport, { x: 0, y: 0 });
    const offset = toScreen(viewport, { x: 0.5, y: 0 });
    expect(toPixels(viewport, 0.5)).toBeCloseTo(distance(origin, offset), 8);
  });
});

/**
 * The camera moves the aiming system, so every property above has to survive
 * being zoomed. A camera that quietly broke the round-trip would show up only
 * as "my rune came out wrong", which is the hardest class of bug to report.
 */
describe('the camera never breaks the aiming mapping', () => {
  const zoomed = createViewport(1280, 800, targetFrame('draw', 0));

  it('round-trips exactly at any zoom level', () => {
    for (const point of [{ x: 0, y: 0 }, { x: -0.55, y: 0.3 }, { x: 0.9, y: -0.2 }]) {
      const back = toArena(zoomed, toScreen(zoomed, point).x, toScreen(zoomed, point).y);
      expect(back.x).toBeCloseTo(point.x, 10);
      expect(back.y).toBeCloseTo(point.y, 10);
    }
  });

  it('stays uniform on both axes while zoomed', () => {
    const origin = toScreen(zoomed, { x: 0, y: 0 });
    const alongX = toScreen(zoomed, { x: 1, y: 0 });
    const alongY = toScreen(zoomed, { x: 0, y: 1 });
    expect(Math.abs(alongX.x - origin.x)).toBeCloseTo(Math.abs(alongY.y - origin.y), 10);
  });

  it('frames each player around their own wizard during Draw', () => {
    const left = targetFrame('draw', 0);
    const right = targetFrame('draw', 1);
    expect(left.centerX).toBeLessThan(0);
    expect(right.centerX).toBeGreaterThan(0);
    expect(left.centerX).toBeCloseTo(-right.centerX, 10);
    expect(left.halfWidth).toBeLessThan(FULL_FRAME.halfWidth);
  });

  it('pulls back to the shared full view from Reveal onward', () => {
    for (const phase of ['reveal', 'resolve', 'score'] as const) {
      expect(targetFrame(phase, 0)).toEqual(FULL_FRAME);
      expect(targetFrame(phase, 1)).toEqual(FULL_FRAME);
    }
  });

  it('eases at the same rate regardless of frame rate', () => {
    // Two players on 60 Hz and 120 Hz displays must reach the same framing at
    // the same wall-clock moment, or they would be spending Ink at different
    // rates for the same gesture.
    const start = FULL_FRAME;
    const target = targetFrame('draw', 0);
    let slow = start;
    let fast = start;
    for (let step = 0; step < 30; step += 1) slow = easeFrame(slow, target, 1000 / 60);
    for (let step = 0; step < 60; step += 1) fast = easeFrame(fast, target, 1000 / 120);
    expect(slow.halfWidth).toBeCloseTo(fast.halfWidth, 3);
    expect(slow.centerX).toBeCloseTo(fast.centerX, 3);
  });

  it('keeps the rival on screen while drawing', () => {
    // Aiming at someone you cannot see is guessing, which PRD §20 lists as the
    // top risk. The Draw framing has to include both wizards.
    const frame = targetFrame('draw', 0);
    const rival = CONFIG.player.spawnX;
    expect(frame.centerX + frame.halfWidth).toBeGreaterThan(rival);
  });
});

describe('the mapping adapts to canvas size', () => {
  it('reads the same shape at any canvas resolution', () => {
    // Window size must not change what a drawing means. PRD §7.4 requires
    // tolerance across hardware, and a browser window is hardware here.
    const shapes = [
      { small: createViewport(480, 300), large: createViewport(2560, 1600) },
      { small: createViewport(900, 560), large: createViewport(1280, 800) },
    ];
    for (const { small, large } of shapes) {
      const pixels = Array.from({ length: 48 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 47;
        return { fx: 0.5 + Math.cos(angle) * 0.18, fy: 0.5 + Math.sin(angle) * 0.18 };
      });
      const inSmall = pixels.map((p) => toArena(small, p.fx * small.width, p.fy * small.height));
      const inLarge = pixels.map((p) => toArena(large, p.fx * large.width, p.fy * large.height));
      expect(classifyStroke(inSmall).family).toBe(classifyStroke(inLarge).family);
    }
  });
});
