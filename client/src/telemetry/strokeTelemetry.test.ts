import { describe, expect, it } from 'vitest';
import { TAU, composeStroke, type Vec2 } from '@cozy/shared';
import { StrokeTelemetry } from './strokeTelemetry.js';

function lineWithLoopAtEnd(): Vec2[] {
  const points: Vec2[] = [];
  for (let index = 0; index < 34; index++) {
    const t = index / 33;
    points.push({ x: -0.9 + 1.2 * t, y: -0.16 });
  }
  for (let index = 1; index < 48; index++) {
    const angle = -Math.PI / 2 + (TAU * index) / 47;
    points.push({ x: 0.3 + Math.cos(angle) * 0.16, y: Math.sin(angle) * 0.16 });
  }
  return points;
}

describe('StrokeTelemetry', () => {
  it('records the contract fields plus replayable raw points', () => {
    const points = lineWithLoopAtEnd();
    const composition = composeStroke(points);
    const telemetry = new StrokeTelemetry('session-test');
    const record = telemetry.record({
      index: 0,
      motifs: composition.motifs,
      summary: composition.recipe.summary,
      drawMs: 483.6,
      points,
      assist: 'standard',
    });

    expect(record.sessionId).toBe('session-test');
    expect(record.drawMs).toBe(484);
    expect(record.pointCount).toBe(points.length);
    expect(record.points).toEqual(points);
    expect(record.motifs.map((motif) => motif.kind)).toEqual(['thrust', 'loop']);
    expect(record.inkCommitted + record.inkReserved).toBe(100);
  });

  it('exports a versioned deterministic JSON bundle', () => {
    const points = lineWithLoopAtEnd();
    const composition = composeStroke(points);
    const telemetry = new StrokeTelemetry('session-json');
    telemetry.record({
      index: 3,
      motifs: composition.motifs,
      summary: composition.recipe.summary,
      drawMs: 100,
      points,
      assist: 'high',
    });

    const parsed = JSON.parse(telemetry.toJSON()) as {
      schemaVersion: number;
      sessionId: string;
      strokes: Array<{ index: number; assist: string }>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sessionId).toBe('session-json');
    expect(parsed.strokes).toEqual([expect.objectContaining({ index: 3, assist: 'high' })]);
    expect(telemetry.toJSON()).toBe(telemetry.toJSON());
  });
});
