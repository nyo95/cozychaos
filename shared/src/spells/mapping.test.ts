import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import type { SpellFamily } from '../config/types.js';
import { classifyStroke } from './classifier.js';
import { affordableLength, inkCost, mapToSpell, type MappingContext } from './mapping.js';
import { distance, type Vec2 } from './geometry.js';
import { circle, line, spiral, zigzag } from './__fixtures__/generators.js';

const CASTER: Vec2 = { x: -0.6, y: 0 };
const context = (overrides: Partial<MappingContext> = {}): MappingContext => ({
  casterPosition: CASTER,
  seededUnit: 0.5,
  ...overrides,
});

const spellFor = (points: readonly Vec2[], ctx = context()) =>
  mapToSpell(classifyStroke(points), ctx);

describe('drawing parameters become spell parameters (PRD §7.3)', () => {
  it('sends an Arc Bolt in the direction the line was drawn', () => {
    const right = spellFor(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }));
    expect(right.direction.x).toBeGreaterThan(0.9);

    const left = spellFor(line({ x: 0.5, y: 0 }, { x: -0.5, y: 0 }));
    expect(left.direction.x).toBeLessThan(-0.9);
  });

  it('makes a bigger drawing produce a bigger, heavier spell', () => {
    const small = spellFor(circle({ x: 0, y: 0 }, 0.1));
    const large = spellFor(circle({ x: 0, y: 0 }, 0.45));
    expect(large.radius).toBeGreaterThan(small.radius);
    expect(large.mass).toBeGreaterThan(small.mass);
  });

  it('turns corners into bounces, capped (PRD §8.4)', () => {
    const few = spellFor(zigzag({ x: -0.4, y: 0 }, 0.22, 2, { samples: 96 }));
    const many = spellFor(zigzag({ x: -0.9, y: 0 }, 0.12, 9, { samples: 160 }));
    expect(many.bounces).toBeGreaterThanOrEqual(few.bounces);
    expect(many.bounces).toBeLessThanOrEqual(CONFIG.spells.angular.cornersToBounces.outMax);
  });

  it('turns spiral direction into swirl direction (PRD §8.3)', () => {
    const counterClockwise = spellFor(spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.2, { samples: 96 }));
    const clockwise = spellFor(
      spiral({ x: 0, y: 0 }, 0.05, 0.4, 2.2, { samples: 96 }).map((p) => ({ x: p.x, y: -p.y })),
    );
    expect(counterClockwise.chirality).toBe(1);
    expect(clockwise.chirality).toBe(-1);
  });
});

describe('A-05 — spawn rules by topology', () => {
  it('launches open families from the caster', () => {
    const bolt = spellFor(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0.2 }));
    expect(bolt.origin).toEqual(CASTER);
  });

  it('places closed families at the drawing centroid', () => {
    const ward = spellFor(circle({ x: -0.3, y: 0.2 }, 0.2));
    expect(distance(ward.origin, { x: -0.3, y: 0.2 })).toBeLessThan(0.05);
    expect(ward.originClamped).toBe(false);
  });

  it('pulls a far centroid back to the cast radius instead of refusing it', () => {
    // PRD §7.1 forbids a drawing from producing nothing, so an out-of-range
    // ring must still cast — just closer than it was drawn.
    const far = spellFor(circle({ x: 4, y: 3 }, 0.2));
    expect(far.originClamped).toBe(true);
    expect(distance(far.origin, CASTER)).toBeCloseTo(CONFIG.aim.maxCastRadius, 5);
  });

  it('gives closed families no travel direction', () => {
    expect(spellFor(circle({ x: 0, y: 0 }, 0.25)).direction).toEqual({ x: 0, y: 0 });
  });
});

describe('fairness (PRD §7.4, §11)', () => {
  it('keeps variance small and centred on zero', () => {
    // "Variasi akibat gambar kasar dibatasi agar kekalahan tidak terasa acak."
    const messy = circle({ x: 0, y: 0 }, 0.3, { noise: 0.09, seed: 3 });
    const classification = classifyStroke(messy);
    const cap = CONFIG.spells[classification.family].maxIrregularityVariance;

    for (const seededUnit of [0, 0.25, 0.5, 0.75, 0.999]) {
      const spell = mapToSpell(classification, context({ seededUnit }));
      expect(Math.abs(spell.variance)).toBeLessThanOrEqual(cap);
    }

    const low = mapToSpell(classification, context({ seededUnit: 0 })).variance;
    const high = mapToSpell(classification, context({ seededUnit: 0.999 })).variance;
    expect(low).toBeLessThanOrEqual(0);
    expect(high).toBeGreaterThanOrEqual(0);
  });

  it('never lets confidence change knockback', () => {
    // PRD §7.4 — "Kerapian memberi kontrol, bukan damage mentah."
    const clean = classifyStroke(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }));
    const shaky = classifyStroke(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { noise: 0.05, seed: 4 }));
    expect(shaky.confidence).toBeLessThan(clean.confidence);

    const cleanSpell = mapToSpell(clean, context());
    const shakySpell = mapToSpell(shaky, context());
    expect(shakySpell.family).toBe(cleanSpell.family);
    expect(shakySpell.knockback).toBe(cleanSpell.knockback);
  });

  it('is deterministic for a given seeded value', () => {
    const classification = classifyStroke(circle({ x: 0, y: 0 }, 0.3));
    const first = mapToSpell(classification, context({ seededUnit: 0.37 }));
    for (let i = 0; i < 10; i++) {
      expect(mapToSpell(classification, context({ seededUnit: 0.37 }))).toEqual(first);
    }
  });

  it('gives every family a usable spell, including the fallback', () => {
    const families: SpellFamily[] = ['stroke', 'loop', 'spiral', 'angular', 'wisp'];
    for (const family of families) {
      const definition = CONFIG.spells[family];
      expect(definition.lifetimeMs).toBeGreaterThan(0);
      expect(definition.baseKnockback).toBeGreaterThan(0);
      expect(definition.baseRadius).toBeGreaterThan(0);
    }
  });
});

describe('low gravity modifier (PRD §9)', () => {
  it('makes spells float longer', () => {
    const normal = spellFor(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }));
    const floaty = spellFor(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }), context({ lowGravity: true }));
    expect(floaty.gravityScale).toBeLessThan(normal.gravityScale);
  });
});

describe('ink (PRD §7.2)', () => {
  it('charges more for a longer stroke', () => {
    expect(inkCost(2)).toBeGreaterThan(inkCost(1));
  });

  it('agrees with the remaining-length calculation the UI uses', () => {
    const length = affordableLength(CONFIG.ink.total);
    expect(inkCost(length)).toBeCloseTo(CONFIG.ink.total, 6);
  });

  it('lets a full ink meter draw a stroke worth using', () => {
    // If the budget were too tight the biggest useful shape would be
    // unreachable and the size mappings would have dead range at the top.
    //
    // Measured against the *Draw* camera, not the full arena. Ink is charged
    // per arena unit, and Session 12 zoomed the Draw framing in, so a shape
    // that fills a given fraction of the screen now spans fewer arena units.
    // Judging the budget against full-arena distances would silently make this
    // test stricter every time the camera tightened.
    const budget = affordableLength(CONFIG.ink.total);
    const drawScale = CONFIG.camera.drawHalfWidth / CONFIG.camera.fullHalfWidth;
    const largeRingPerimeter = 2 * Math.PI * 0.45 * drawScale;
    expect(budget).toBeGreaterThan(largeRingPerimeter);
  });

  it('reports nothing affordable on an empty meter', () => {
    expect(affordableLength(0)).toBe(0);
  });
});
