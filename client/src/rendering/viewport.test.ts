import { describe, expect, it } from 'vitest';
import { CONFIG, classifyStroke, distance } from '@cozy/shared';
import { createViewport, toArena, toPixels, toScreen } from './viewport.js';

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
