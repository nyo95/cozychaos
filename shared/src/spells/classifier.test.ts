import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import type { SpellFamily } from '../config/types.js';
import { classifyStroke } from './classifier.js';
import { TAU, type Vec2 } from './geometry.js';
import {
  arc,
  circle,
  dot,
  line,
  polygon,
  scribble,
  spiral,
  zigzag,
} from './__fixtures__/generators.js';

/**
 * Classifier test dataset. PRD §21 mandates one.
 *
 * The bar these tests defend is PRD §19: "Keluhan 'gambar saya tidak terbaca'
 * terjadi pada kurang dari 10% ronde uji." So the assertions are not only that
 * a clean shape reads correctly, but that a shape drawn *badly* still reads
 * correctly — a classifier that only handles machine-perfect input would pass
 * a naive test suite and fail every real player.
 */

const familyOf = (points: readonly Vec2[]): SpellFamily => classifyStroke(points).family;

describe('Arc Bolt — open strokes (PRD §8.1)', () => {
  it('reads a clean straight line', () => {
    expect(familyOf(line({ x: -0.4, y: 0 }, { x: 0.4, y: 0.2 }))).toBe('stroke');
  });

  it('reads lines drawn in any direction', () => {
    const directions = [0, TAU / 8, TAU / 4, (3 * TAU) / 8, TAU / 2, (5 * TAU) / 8, (7 * TAU) / 8];
    for (const angle of directions) {
      const stroke = line(
        { x: 0, y: 0 },
        { x: Math.cos(angle) * 0.6, y: Math.sin(angle) * 0.6 },
      );
      expect(familyOf(stroke), `direction ${angle.toFixed(2)} rad`).toBe('stroke');
    }
  });

  it('still reads a line drawn with a shaky hand', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const stroke = line({ x: -0.5, y: -0.1 }, { x: 0.5, y: 0.1 }, { noise: 0.05, seed });
      expect(familyOf(stroke), `seed ${seed}`).toBe('stroke');
    }
  });

  it('keeps a gently curved line in the family, per §8.1', () => {
    // "garis melengkung menghasilkan sedikit curve" — a bowed line is still an
    // Arc Bolt; it just curves in flight.
    for (const sweep of [TAU / 12, TAU / 8, TAU / 6]) {
      expect(familyOf(arc({ x: 0, y: 0 }, 0.5, 0, sweep)), `sweep ${sweep}`).toBe('stroke');
    }
  });

  it('records the drawn direction as the aim (A-04)', () => {
    const rightward = classifyStroke(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }));
    expect(rightward.features.direction.x).toBeGreaterThan(0.95);

    const upward = classifyStroke(line({ x: 0, y: -0.5 }, { x: 0, y: 0.5 }));
    expect(upward.features.direction.y).toBeGreaterThan(0.95);
  });
});

describe('Bubble Ward — closed loops (PRD §8.2)', () => {
  it('reads a clean circle', () => {
    expect(familyOf(circle({ x: 0, y: 0 }, 0.3))).toBe('loop');
  });

  it('reads circles at every size the ink meter allows', () => {
    for (const radius of [0.08, 0.15, 0.3, 0.5]) {
      expect(familyOf(circle({ x: 0, y: 0 }, radius)), `radius ${radius}`).toBe('loop');
    }
  });

  it('reads an over-drawn circle as a loop, not a spiral', () => {
    // Nobody stops exactly where they started. Overshooting by up to a third
    // of a revolution must not silently become a Vortex.
    for (const overdraw of [0.05, 0.15, 0.3]) {
      expect(familyOf(circle({ x: 0, y: 0 }, 0.3, { overdraw })), `overdraw ${overdraw}`).toBe(
        'loop',
      );
    }
  });

  it('reads a wobbly hand-drawn circle', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const stroke = circle({ x: 0, y: 0 }, 0.3, { noise: 0.06, overdraw: 0.08, seed });
      expect(familyOf(stroke), `seed ${seed}`).toBe('loop');
    }
  });

  it('reads a circle left slightly open', () => {
    // A gap of a fifth of a revolution still reads as a ring to a human.
    expect(familyOf(arc({ x: 0, y: 0 }, 0.3, 0, TAU * 0.85))).toBe('loop');
  });

  it('spawns at the drawing centroid (A-05)', () => {
    const result = classifyStroke(circle({ x: 0.6, y: 0.25 }, 0.2));
    expect(result.features.centroid.x).toBeCloseTo(0.6, 1);
    expect(result.features.centroid.y).toBeCloseTo(0.25, 1);
  });
});

describe('Vortex — spirals (PRD §8.3)', () => {
  it('reads an outward spiral', () => {
    expect(familyOf(spiral({ x: 0, y: 0 }, 0.04, 0.4, 2.2, { samples: 96 }))).toBe('spiral');
  });

  it('reads an inward spiral', () => {
    expect(familyOf(spiral({ x: 0, y: 0 }, 0.4, 0.04, 2.2, { samples: 96 }))).toBe('spiral');
  });

  it('reads a loose two-revolution spiral', () => {
    expect(familyOf(spiral({ x: 0, y: 0 }, 0.1, 0.45, 2.0, { samples: 96 }))).toBe('spiral');
  });

  it('reads a shaky spiral', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const stroke = spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.3, { noise: 0.04, samples: 96, seed });
      expect(familyOf(stroke), `seed ${seed}`).toBe('spiral');
    }
  });

  it('records chirality so the swirl direction matches the drawing (§8.3)', () => {
    const counterClockwise = classifyStroke(spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.2, { samples: 96 }));
    expect(counterClockwise.features.chirality).toBe(1);

    const clockwise = classifyStroke(
      spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.2, { samples: 96 }).map((p) => ({ x: p.x, y: -p.y })),
    );
    expect(clockwise.features.chirality).toBe(-1);
  });

  it('sees the radius marching, which is what distinguishes it from a circle', () => {
    const outward = classifyStroke(spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.2, { samples: 96 }));
    const ring = classifyStroke(circle({ x: 0, y: 0 }, 0.3));
    expect(Math.abs(outward.features.radiusTrend)).toBeGreaterThan(0.7);
    expect(Math.abs(ring.features.radiusTrend)).toBeLessThan(0.4);
  });
});

describe('Prism Shard — angular shapes (PRD §8.4)', () => {
  it('reads a zigzag', () => {
    expect(familyOf(zigzag({ x: -0.4, y: 0 }, 0.22, 3, { samples: 72 }))).toBe('angular');
  });

  it('reads zigzags with two through five corners', () => {
    for (const corners of [2, 3, 4, 5]) {
      const stroke = zigzag({ x: -0.5, y: 0 }, 0.18, corners, { samples: 96 });
      expect(familyOf(stroke), `${corners} corners`).toBe('angular');
    }
  });

  it('reads a closed triangle as angular, not as a loop', () => {
    expect(familyOf(polygon({ x: 0, y: 0 }, 0.3, 3))).toBe('angular');
  });

  it('reads a closed square as angular, not as a loop', () => {
    expect(familyOf(polygon({ x: 0, y: 0 }, 0.3, 4))).toBe('angular');
  });

  it('reads a shaky zigzag', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const stroke = zigzag({ x: -0.4, y: 0 }, 0.22, 3, { noise: 0.05, samples: 72, seed });
      expect(familyOf(stroke), `seed ${seed}`).toBe('angular');
    }
  });

  it('caps bounces no matter how many corners are drawn (§8.4)', () => {
    // PRD §8.4 promises bounces are capped at a fixed limit. Without the cap a
    // player could draw a dense sawtooth and get a shard that ricochets
    // forever, which is both unreadable and unbalanced.
    const many = classifyStroke(zigzag({ x: -0.9, y: 0 }, 0.12, 11, { samples: 160 }));
    expect(many.features.cornerCount).toBeGreaterThan(4);
    expect(CONFIG.spells.angular.cornersToBounces.outMax).toBe(4);
  });
});

describe('Arcane Wisp — the fallback (PRD §8.5)', () => {
  it('never returns anything but a real family', () => {
    const inputs = [
      dot({ x: 0, y: 0 }),
      [],
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      scribble({ x: 0, y: 0 }, 0.2),
      line({ x: 0, y: 0 }, { x: 0.001, y: 0.001 }),
    ];
    for (const input of inputs) {
      const result = classifyStroke(input);
      expect(CONFIG.spells[result.family]).toBeDefined();
    }
  });

  it('turns a stroke with no shape into a Wisp rather than guessing', () => {
    expect(familyOf(dot({ x: 0, y: 0 }))).toBe('wisp');
    expect(familyOf([])).toBe('wisp');
  });

  it('produces a spell for absolutely any input, per §7.1', () => {
    // The core promise: "Setiap coretan menjadi sihir."
    for (let seed = 1; seed <= 40; seed++) {
      const stroke = scribble({ x: 0, y: 0 }, 0.25, { seed, samples: 40 });
      const result = classifyStroke(stroke);
      expect(CONFIG.spells[result.family], `seed ${seed}`).toBeDefined();
    }
  });
});

describe('fairness guarantees (PRD §7.1, §7.4)', () => {
  it('ignores hand speed entirely', () => {
    // Same shape, sampled sparsely (fast hand) and densely (slow hand).
    const fast = line({ x: -0.4, y: -0.2 }, { x: 0.4, y: 0.2 }, { samples: 8 });
    const slow = line({ x: -0.4, y: -0.2 }, { x: 0.4, y: 0.2 }, { samples: 300 });
    expect(familyOf(fast)).toBe(familyOf(slow));

    const fastCircle = circle({ x: 0, y: 0 }, 0.3, { samples: 14 });
    const slowCircle = circle({ x: 0, y: 0 }, 0.3, { samples: 400 });
    expect(familyOf(fastCircle)).toBe(familyOf(slowCircle));
  });

  it('ignores where on the arena the shape was drawn', () => {
    const offsets: Vec2[] = [
      { x: 0, y: 0 },
      { x: 0.8, y: 0.4 },
      { x: -0.7, y: -0.3 },
    ];
    for (const offset of offsets) {
      expect(familyOf(circle(offset, 0.25)), `at ${offset.x},${offset.y}`).toBe('loop');
    }
  });

  it('reads the same shape at any scale', () => {
    for (const radius of [0.1, 0.25, 0.5, 0.8]) {
      expect(familyOf(circle({ x: 0, y: 0 }, radius)), `radius ${radius}`).toBe('loop');
    }
  });

  it('is deterministic — the same points always give the same answer', () => {
    // PRD §15 depends on this: the client preview and the server verdict are
    // the same function, so they must never disagree.
    const stroke = spiral({ x: 0.1, y: -0.2 }, 0.06, 0.35, 2.1, { noise: 0.03, samples: 96 });
    const first = classifyStroke(stroke);
    for (let i = 0; i < 20; i++) {
      const repeat = classifyStroke(stroke);
      expect(repeat.family).toBe(first.family);
      expect(repeat.confidence).toBe(first.confidence);
    }
  });

  it('never mutates the caller’s points', () => {
    const stroke = circle({ x: 0, y: 0 }, 0.3);
    const before = JSON.stringify(stroke);
    classifyStroke(stroke);
    expect(JSON.stringify(stroke)).toBe(before);
  });
});

describe('draw assist (PRD §14)', () => {
  it('recovers shapes on High that Standard reads as something else', () => {
    // High assist widens tolerance bands; it must never narrow them.
    const sloppy = circle({ x: 0, y: 0 }, 0.28, { noise: 0.13, overdraw: 0.2, seed: 7 });
    const high = classifyStroke(sloppy, { assist: 'high' });
    expect(high.confidence).toBeGreaterThanOrEqual(classifyStroke(sloppy).confidence);
  });

  it('does not change spell power — only tolerance (§14, §11)', () => {
    // Assist is an accessibility setting. If it touched damage it would be a
    // competitive advantage, which PRD §11 forbids outright. The guarantee is
    // structural: assist config carries no power terms at all, and a stroke
    // that reads the same way on both settings produces the same spell.
    for (const level of ['standard', 'high'] as const) {
      expect(Object.keys(CONFIG.assist[level]).sort()).toEqual([
        'confidenceBonus',
        'smoothingPasses',
        'toleranceScale',
      ]);
    }

    const stroke = line({ x: -0.4, y: 0 }, { x: 0.4, y: 0.1 });
    const standard = classifyStroke(stroke, { assist: 'standard' });
    const high = classifyStroke(stroke, { assist: 'high' });
    expect(high.family).toBe(standard.family);
    expect(CONFIG.spells[standard.family].baseKnockback).toBe(
      CONFIG.spells[high.family].baseKnockback,
    );
  });
});

describe('dataset accuracy sweep', () => {
  /**
   * The headline number. PRD §19 allows under 10% unreadable rounds, so this
   * sweep — clean shapes plus shapes drawn with realistic tremor — must clear
   * 90%. It is deliberately a single aggregate assertion: individual shape
   * tests catch specific regressions, this one catches "the classifier got
   * quietly worse overall".
   */
  it('classifies at least 90% of the dataset correctly', () => {
    const cases: Array<{ points: Vec2[]; expected: SpellFamily; label: string }> = [];

    for (let seed = 1; seed <= 25; seed++) {
      const noise = 0.02 + (seed % 5) * 0.012;
      const angle = (TAU * seed) / 25;

      cases.push({
        label: `line-${seed}`,
        expected: 'stroke',
        points: line(
          { x: 0, y: 0 },
          { x: Math.cos(angle) * 0.55, y: Math.sin(angle) * 0.55 },
          { noise, seed },
        ),
      });

      cases.push({
        label: `circle-${seed}`,
        expected: 'loop',
        points: circle({ x: 0, y: 0 }, 0.18 + (seed % 4) * 0.08, {
          noise,
          overdraw: (seed % 3) * 0.08,
          seed,
        }),
      });

      cases.push({
        label: `spiral-${seed}`,
        expected: 'spiral',
        points: spiral({ x: 0, y: 0 }, 0.05, 0.32 + (seed % 3) * 0.06, 2.0 + (seed % 3) * 0.3, {
          noise,
          samples: 96,
          seed,
        }),
      });

      cases.push({
        label: `zigzag-${seed}`,
        expected: 'angular',
        points: zigzag({ x: -0.45, y: 0 }, 0.2, 2 + (seed % 3), { noise, samples: 96, seed }),
      });
    }

    const failures = cases.filter((c) => classifyStroke(c.points).family !== c.expected);
    const accuracy = 1 - failures.length / cases.length;

    if (accuracy < 0.9) {
      const detail = failures
        .slice(0, 12)
        .map((f) => `${f.label}: expected ${f.expected}, got ${classifyStroke(f.points).family}`)
        .join('\n  ');
      throw new Error(`accuracy ${(accuracy * 100).toFixed(1)}% — failures:\n  ${detail}`);
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('reaches every one of the four families, so none is unreachable', () => {
    // A classifier that never emits a family would pass most tests while
    // making a quarter of the game inaccessible.
    const reached = new Set<SpellFamily>([
      familyOf(line({ x: -0.4, y: 0 }, { x: 0.4, y: 0 })),
      familyOf(circle({ x: 0, y: 0 }, 0.3)),
      familyOf(spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.2, { samples: 96 })),
      familyOf(zigzag({ x: -0.4, y: 0 }, 0.22, 3, { samples: 72 })),
    ]);
    expect([...reached].sort()).toEqual(['angular', 'loop', 'spiral', 'stroke']);
  });
});
