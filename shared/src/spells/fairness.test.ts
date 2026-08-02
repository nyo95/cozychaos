import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import { classifyStroke } from './classifier.js';
import { extractFeatures } from './features.js';
import { decimate, type Vec2 } from './geometry.js';
import { mapToSpell, type MappingContext } from './mapping.js';
import { circle, line, polygon, scribble, spiral, zigzag } from './__fixtures__/generators.js';

/**
 * Regression tests for the review findings of 2026-08-02.
 *
 * Each of these fails against the code as it was reviewed. They exist so the
 * fixes cannot be quietly undone — particularly the assist one, which is
 * invisible in play and only shows up as a slow drift in win rates between
 * players who happened to pick different settings.
 */

const context = (): MappingContext => ({
  casterPosition: { x: -0.6, y: 0 },
  seededUnit: 0.5,
});

describe('Draw Assist changes recognition only, never physics', () => {
  /**
   * PRD §11: "Tidak ada equipment dengan damage, mana, atau knockback lebih
   * tinggi." A settings toggle is equipment for this purpose.
   *
   * The reviewed build failed this outright: an identical zigzag produced four
   * bounces and 1.73 knockback on High assist against one bounce and 1.37 on
   * Standard, because assist smoothing and widened tolerance changed the
   * detected corner count and the spell was built from the assisted reading.
   */
  const strokes: Array<[string, Vec2[]]> = [
    ['clean zigzag', zigzag({ x: -0.4, y: 0 }, 0.22, 3, { samples: 96 })],
    ['shaky zigzag', zigzag({ x: -0.4, y: 0 }, 0.22, 3, { noise: 0.05, samples: 96, seed: 5 })],
    ['clean line', line({ x: -0.5, y: 0 }, { x: 0.5, y: 0.15 })],
    ['shaky line', line({ x: -0.5, y: 0 }, { x: 0.5, y: 0.15 }, { noise: 0.06, seed: 2 })],
    ['clean ring', circle({ x: 0.1, y: 0.2 }, 0.28)],
    ['wobbly ring', circle({ x: 0.1, y: 0.2 }, 0.28, { noise: 0.07, overdraw: 0.12, seed: 9 })],
    ['spiral', spiral({ x: 0, y: 0 }, 0.05, 0.38, 2.2, { samples: 96 })],
    ['triangle', polygon({ x: 0, y: 0 }, 0.3, 3)],
    ['scribble', scribble({ x: 0, y: 0 }, 0.22, { seed: 4 })],
  ];

  it.each(strokes)('produces identical physics on both settings: %s', (label, stroke) => {
    const standardReading = classifyStroke(stroke, { assist: 'standard' });
    const highReading = classifyStroke(stroke, { assist: 'high' });

    // Assist may change which family a drawing belongs to — that is the whole
    // point of it. Once the family is settled, nothing that reaches the
    // simulation may differ.
    expect(highReading.family, `${label}: assist should not reroute a clear shape`).toBe(
      standardReading.family,
    );

    const standard = mapToSpell(standardReading, context());
    const high = mapToSpell(highReading, context());

    expect(high.bounces).toBe(standard.bounces);
    expect(high.radius).toBeCloseTo(standard.radius, 12);
    expect(high.mass).toBeCloseTo(standard.mass, 12);
    expect(high.spin).toBeCloseTo(standard.spin, 12);
    expect(high.speed).toBeCloseTo(standard.speed, 12);
    expect(high.origin.x).toBeCloseTo(standard.origin.x, 12);
    expect(high.origin.y).toBeCloseTo(standard.origin.y, 12);
    expect(high.direction.x).toBeCloseTo(standard.direction.x, 12);
    expect(high.direction.y).toBeCloseTo(standard.direction.y, 12);
    expect(high.variance).toBeCloseTo(standard.variance, 12);
  });

  it('keeps knockback identical when assist does not change the family', () => {
    for (const [label, stroke] of strokes) {
      const standard = classifyStroke(stroke, { assist: 'standard' });
      const high = classifyStroke(stroke, { assist: 'high' });
      if (standard.family !== high.family) continue;
      expect(
        mapToSpell(high, context()).knockback,
        `${label}: knockback must not depend on assist`,
      ).toBeCloseTo(mapToSpell(standard, context()).knockback, 12);
    }
  });

  it('reads canonical geometry from the Standard pipeline', () => {
    const stroke = zigzag({ x: -0.4, y: 0 }, 0.22, 3, { noise: 0.05, samples: 96, seed: 5 });
    const high = classifyStroke(stroke, { assist: 'high' });
    const standardFeatures = extractFeatures(stroke, { assist: 'standard' });

    expect(high.canonical.cornerCount).toBe(standardFeatures.cornerCount);
    expect(high.canonical.size).toBeCloseTo(standardFeatures.size, 12);
  });

  it('still lets assist rescue a drawing the Standard pipeline misreads', () => {
    // The fix must not make assist inert — it exists to help recognition
    // (PRD §14), and only the physics coupling was the problem.
    let rescued = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const messy = circle({ x: 0, y: 0 }, 0.28, { noise: 0.18, overdraw: 0.25, seed });
      if (
        classifyStroke(messy, { assist: 'standard' }).family !== 'loop' &&
        classifyStroke(messy, { assist: 'high' }).family === 'loop'
      ) {
        rescued++;
      }
    }
    expect(rescued).toBeGreaterThan(0);
  });

  /**
   * The check that was missing, and that would have caught the worst of it.
   *
   * The reviewed build asserted that assist did not change *power*, but never
   * that it improved *recognition* — so nobody noticed that High assist scored
   * zero rings out of sixty where Standard scored sixty. Two tolerances were
   * being scaled that should not have been: the corner threshold, which is a
   * boundary between families rather than a measure of sloppiness, and the
   * spiral winding ceiling, whose ramp collapsed to a width of 0.01 radians
   * once divided.
   *
   * An accessibility setting that makes the game harder is worse than no
   * setting, and it fails silently — the player just thinks they are bad at
   * drawing.
   */
  it('recognises at least as much overall as Standard does', () => {
    const kinds = {
      loop: (n: number, s: number) => circle({ x: 0, y: 0 }, 0.28, { noise: n, overdraw: 0.2, seed: s }),
      stroke: (n: number, s: number) => line({ x: -0.5, y: 0 }, { x: 0.5, y: 0.1 }, { noise: n, seed: s }),
      angular: (n: number, s: number) => zigzag({ x: -0.4, y: 0 }, 0.22, 3, { noise: n, samples: 96, seed: s }),
      spiral: (n: number, s: number) => spiral({ x: 0, y: 0 }, 0.05, 0.38, 2.2, { noise: n, samples: 96, seed: s }),
    } as const;

    for (const noise of [0.06, 0.1, 0.14, 0.18]) {
      let standardTotal = 0;
      let highTotal = 0;

      for (const [expected, generate] of Object.entries(kinds)) {
        let standardHits = 0;
        let highHits = 0;
        for (let seed = 1; seed <= 60; seed++) {
          if (classifyStroke(generate(noise, seed), { assist: 'standard' }).family === expected) {
            standardHits++;
          }
          if (classifyStroke(generate(noise, seed), { assist: 'high' }).family === expected) {
            highHits++;
          }
        }
        standardTotal += standardHits;
        highTotal += highHits;

        // No single family may collapse, even if the total still looks healthy.
        expect(
          highHits,
          `${expected} at noise ${noise}: High assist must not lose ground`,
        ).toBeGreaterThanOrEqual(Math.floor(standardHits * 0.9));
      }

      expect(highTotal, `overall recognition at noise ${noise}`).toBeGreaterThanOrEqual(
        standardTotal,
      );
    }
  });

  it('never lets assist raise canonical confidence', () => {
    for (const [label, stroke] of strokes) {
      const high = classifyStroke(stroke, { assist: 'high' });
      const standard = classifyStroke(stroke, { assist: 'standard' });
      expect(high.canonicalConfidence, label).toBeCloseTo(standard.canonicalConfidence, 12);
    }
  });
});

describe('the point cap is enforced, not merely declared (PRD §15)', () => {
  it('reduces an oversized stroke to the cap', () => {
    const flood = Array.from({ length: 20_000 }, (_, i) => ({ x: -0.5 + i * 0.00005, y: 0 }));
    expect(decimate(flood, CONFIG.strokeLimits.maxPoints)).toHaveLength(
      CONFIG.strokeLimits.maxPoints,
    );
  });

  it('leaves a stroke under the cap untouched', () => {
    const stroke = line({ x: -0.4, y: 0 }, { x: 0.4, y: 0 }, { samples: 40 });
    expect(decimate(stroke, CONFIG.strokeLimits.maxPoints)).toBe(stroke);
  });

  it('keeps both endpoints, so the aim survives decimation', () => {
    const flood = Array.from({ length: 5000 }, (_, i) => ({ x: -1 + i * 0.0004, y: i * 0.0001 }));
    const reduced = decimate(flood, 512);
    expect(reduced[0]).toEqual(flood[0]);
    expect(reduced[reduced.length - 1]).toEqual(flood[flood.length - 1]);
  });

  it('reads a flooded stroke the same as a normally sampled one', () => {
    // A 1000 Hz mouse must not describe a different shape from a 125 Hz one.
    const dense = Array.from({ length: 12_000 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 11_999;
      return { x: Math.cos(angle) * 0.3, y: Math.sin(angle) * 0.3 };
    });
    const sparse = circle({ x: 0, y: 0 }, 0.3, { samples: 60 });
    expect(classifyStroke(dense).family).toBe(classifyStroke(sparse).family);
  });

  it('bounds the work done per classification', () => {
    // The guarantee behind the cap: cost is independent of how many samples a
    // client sends, so no client can make the server do arbitrary work.
    const flood = Array.from({ length: 50_000 }, (_, i) => ({ x: -1 + i * 0.00004, y: 0 }));
    const features = extractFeatures(flood);
    expect(features.points).toHaveLength(CONFIG.strokeLimits.resampleCount);
  });
});

describe('every mark becomes a spell (PRD §7.1, §8.5)', () => {
  it('returns a real family for inputs with no shape at all', () => {
    const inputs: Vec2[][] = [
      [],
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 0 },
        { x: 0.0004, y: 0 },
      ],
      Array.from({ length: 6 }, (_, i) => ({ x: i * 0.0002, y: 0 })),
    ];
    for (const input of inputs) {
      const classification = classifyStroke(input);
      expect(classification.family).toBe('wisp');
      // And it must survive being turned into a spell, not just classified.
      const spell = mapToSpell(classification, context());
      expect(spell.name).toBe(CONFIG.spells.wisp.name);
      expect(Number.isFinite(spell.radius)).toBe(true);
      expect(Number.isFinite(spell.speed)).toBe(true);
      expect(Number.isFinite(spell.direction.x)).toBe(true);
      expect(Number.isFinite(spell.direction.y)).toBe(true);
    }
  });
});
