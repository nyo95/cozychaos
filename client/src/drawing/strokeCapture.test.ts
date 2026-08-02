import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, affordableLength, pathLength, type Vec2 } from '@cozy/shared';
import { StrokeCapture } from './strokeCapture.js';

/**
 * The ink meter is the only cap on spell size (PRD §7.2). If it can be
 * out-drawn — by a fast hand, a high-polling mouse, or a long final segment —
 * then size is effectively free and the constraint the whole economy rests on
 * is gone.
 */

let capture: StrokeCapture;

beforeEach(() => {
  capture = new StrokeCapture();
});

const drawAlong = (from: Vec2, to: Vec2, steps: number): void => {
  capture.begin(from);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    capture.extend({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
};

describe('basic capture', () => {
  it('starts empty', () => {
    expect(capture.stroke).toHaveLength(0);
    expect(capture.inkFraction).toBe(1);
    expect(capture.isDrawing).toBe(false);
  });

  it('records points while drawing', () => {
    drawAlong({ x: -0.3, y: 0 }, { x: 0.3, y: 0 }, 10);
    expect(capture.stroke.length).toBe(11);
    expect(capture.isDrawing).toBe(true);
  });

  it('ignores points that do not move', () => {
    // A held-still mouse emits repeats; keeping them would inflate the point
    // count without adding shape.
    capture.begin({ x: 0, y: 0 });
    for (let i = 0; i < 20; i++) capture.extend({ x: 0, y: 0 });
    expect(capture.stroke).toHaveLength(1);
  });

  it('ignores extends after the stroke ends', () => {
    capture.begin({ x: 0, y: 0 });
    capture.end();
    capture.extend({ x: 0.5, y: 0 });
    expect(capture.stroke).toHaveLength(1);
  });

  it('clears fully', () => {
    drawAlong({ x: -0.3, y: 0 }, { x: 0.3, y: 0 }, 10);
    capture.clear();
    expect(capture.stroke).toHaveLength(0);
    expect(capture.length).toBe(0);
    expect(capture.inkFraction).toBe(1);
  });
});

describe('ink budget (PRD §7.2)', () => {
  it('spends ink as the line grows', () => {
    drawAlong({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, 20);
    expect(capture.inkUsed).toBeGreaterThan(0);
    expect(capture.inkFraction).toBeLessThan(1);
  });

  it('stops the stroke when the meter empties', () => {
    // "Ketika tinta habis, stroke otomatis selesai."
    const budget = affordableLength(CONFIG.ink.total);
    drawAlong({ x: -budget, y: 0 }, { x: budget * 2, y: 0 }, 400);
    expect(capture.isDrawing).toBe(false);
    expect(capture.exhausted).toBe(true);
    expect(capture.inkRemaining).toBe(0);
  });

  it('never draws more than the budget allows', () => {
    const budget = affordableLength(CONFIG.ink.total);
    drawAlong({ x: -5, y: 0 }, { x: 5, y: 0 }, 500);
    expect(pathLength(capture.stroke)).toBeLessThanOrEqual(budget + 1e-6);
  });

  it('gives a fast hand exactly the same length as a slow one', () => {
    /**
     * The fairness case PRD §7.1 turns on. A low-polling mouse reports few,
     * widely spaced samples; if the segment that crosses the budget were
     * discarded rather than trimmed, that hand would lose a chunk of stroke
     * and draw a measurably smaller spell than a high-polling one.
     */
    const lengths = [3, 17, 200, 999].map((steps) => {
      const run = new StrokeCapture();
      run.begin({ x: -6, y: 0 });
      for (let i = 1; i <= steps; i++) {
        run.extend({ x: -6 + (12 * i) / steps, y: 0 });
      }
      return run.length;
    });

    for (const length of lengths) {
      expect(length).toBeCloseTo(lengths[0]!, 9);
    }
  });

  it('trims the crossing segment instead of dropping it', () => {
    const budget = affordableLength(CONFIG.ink.total);
    capture.begin({ x: 0, y: 0 });
    capture.extend({ x: budget * 3, y: 0 });
    expect(capture.stroke).toHaveLength(2);
    expect(capture.length).toBeCloseTo(budget, 9);
  });

  it('keeps the budget within the server-side stroke length limit', () => {
    // PRD §15 — the server caps stroke length. A client budget above that cap
    // would let players draw strokes the server then has to truncate, which
    // would show up as the spell not matching the drawing.
    expect(affordableLength(CONFIG.ink.total)).toBeLessThanOrEqual(CONFIG.strokeLimits.maxLength);
  });
});
