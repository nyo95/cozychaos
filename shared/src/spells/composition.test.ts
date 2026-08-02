import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config/index.js';
import {
  circle,
  denseCrossing,
  dot,
  line,
  lineWithLoopAtEnd,
  loopThenTail,
  spiral,
  zigzag,
  zigzagIntoSpiral,
} from './__fixtures__/generators.js';
import { composeRecipe, composeStroke } from './composition.js';
import { extractFeatures } from './features.js';
import type { Vec2 } from './geometry.js';
import { segmentMotifs } from './motifs.js';

const kinds = (stroke: readonly Vec2[]) => segmentMotifs(extractFeatures(stroke)).map((motif) => motif.kind);

describe('wild motif segmentation', () => {
  it('finds a straight thrust', () => {
    expect(kinds(line({ x: -0.5, y: 0 }, { x: 0.5, y: 0 }))).toEqual(['thrust']);
  });

  it('finds a thrust followed by a late loop', () => {
    const motifs = segmentMotifs(extractFeatures(lineWithLoopAtEnd()));
    expect(motifs.map((motif) => motif.kind)).toEqual(['thrust', 'loop']);
    expect(motifs.find((motif) => motif.kind === 'loop')!.from).toBeGreaterThan(0.5);
  });

  it('keeps a sparse hand-like loop when smoothing separates its seam', () => {
    const sparse: Vec2[] = [
      { x: -0.8, y: -0.18 },
      { x: -0.45, y: -0.18 },
      { x: -0.1, y: -0.18 },
      { x: 0.25, y: -0.18 },
    ];
    for (let index = 0; index <= 24; index++) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 24;
      sparse.push({ x: 0.25 + Math.cos(angle) * 0.18, y: Math.sin(angle) * 0.18 });
    }
    expect(kinds(sparse)).toEqual(['thrust', 'loop']);
  });

  it('finds an early loop followed by thrust', () => {
    const motifs = segmentMotifs(extractFeatures(loopThenTail()));
    expect(motifs.map((motif) => motif.kind)).toEqual(['loop', 'thrust']);
    expect(motifs[0]!.from).toBeLessThan(0.5);
  });

  it('turns three zigzag corners into ordered bounce motifs', () => {
    const found = kinds(zigzag({ x: -0.45, y: 0 }, 0.22, 3, { samples: 96 }));
    expect(found[0]).toBe('thrust');
    expect(found.filter((kind) => kind === 'bounce')).toHaveLength(3);
  });

  it('finds bounces before a spiral tail', () => {
    const motifs = segmentMotifs(extractFeatures(zigzagIntoSpiral()));
    const firstBounce = motifs.find((motif) => motif.kind === 'bounce');
    const coil = motifs.find((motif) => motif.kind === 'spiral');
    expect(firstBounce).toBeDefined();
    expect(coil).toBeDefined();
    expect(firstBounce!.from).toBeLessThan(coil!.from);
  });

  it('finds a pure two-turn spiral with the correct chirality', () => {
    const motifs = segmentMotifs(extractFeatures(spiral({ x: 0, y: 0 }, 0.04, 0.36, 2.1, { samples: 96 })));
    expect(motifs.map((motif) => motif.kind)).toEqual(['spiral']);
    expect(motifs[0]!.chirality).toBe(1);
  });

  it('collapses a dense crossing into unstable', () => {
    expect(kinds(denseCrossing())).toContain('unstable');
  });

  it('keeps a tiny mark alive as a wisp', () => {
    expect(kinds(dot({ x: 0, y: 0 }))).toEqual(['wisp']);
  });

  it('keeps even a long unreadable Wisp weak', () => {
    const canonical = extractFeatures(line({ x: -1.4, y: 0 }, { x: 1.4, y: 0 }));
    const recipe = composeRecipe(canonical, [{
      kind: 'wisp',
      from: 0,
      to: 1,
      center: canonical.centroid,
      direction: canonical.direction,
      size: canonical.size,
      chirality: 0,
      arcLength: canonical.arcLength,
    }]);
    expect(recipe.inkCommitted).toBeGreaterThan(CONFIG.ink.total * CONFIG.composition.forceHeavyFraction);
    expect(recipe.components[0]!.strength).toBeLessThanOrEqual(CONFIG.composition.motif.wisp.maxStrength);
    expect(recipe.summary.force).toBe('ringan');
  });
});

describe('recipe properties', () => {
  const dataset: readonly Vec2[][] = [
    [],
    [{ x: 0, y: 0 }],
    line({ x: -0.5, y: 0 }, { x: 0.5, y: 0.1 }),
    lineWithLoopAtEnd(),
    loopThenTail(),
    zigzag({ x: -0.4, y: 0 }, 0.2, 3, { samples: 96 }),
    spiral({ x: 0, y: 0 }, 0.04, 0.35, 2.1, { samples: 96 }),
    denseCrossing(),
  ];

  it('is monotonic in loop radius and committed strength', () => {
    const small = composeStroke(circle({ x: 0, y: 0 }, 0.16));
    const large = composeStroke(circle({ x: 0, y: 0 }, 0.3));
    expect(large.recipe.components[0]!.radius).toBeGreaterThan(small.recipe.components[0]!.radius);

    const short = composeStroke(line({ x: -0.2, y: 0 }, { x: 0.2, y: 0 }));
    const long = composeStroke(line({ x: -0.7, y: 0 }, { x: 0.7, y: 0 }));
    const total = (recipe: typeof short.recipe) => recipe.components.reduce((sum, component) => sum + component.strength, 0);
    expect(total(long.recipe)).toBeGreaterThan(total(short.recipe));
  });

  it('conserves the strength budget for every fixture', () => {
    for (const stroke of dataset) {
      const { recipe } = composeStroke(stroke);
      const strength = recipe.components.reduce((sum, component) => sum + component.strength, 0);
      expect(strength).toBeLessThanOrEqual(recipe.inkCommitted * CONFIG.composition.strengthPerInk + 1e-12);
    }
  });

  it('always returns finite components and respects maxMotifs', () => {
    for (const stroke of dataset) {
      const { recipe } = composeStroke(stroke);
      expect(recipe.components.length).toBeGreaterThanOrEqual(1);
      expect(recipe.components.length).toBeLessThanOrEqual(CONFIG.composition.maxMotifs);
      for (const component of recipe.components) {
        expect(Object.values(component).every((value) => typeof value !== 'number' || Number.isFinite(value))).toBe(true);
      }
    }
  });

  it('activates components in drawn order', () => {
    const { recipe } = composeStroke(zigzagIntoSpiral());
    for (let index = 1; index < recipe.components.length; index++) {
      expect(recipe.components[index]!.activateAtMs).toBeGreaterThanOrEqual(recipe.components[index - 1]!.activateAtMs);
    }
  });

  it('is numerically identical across assist settings', () => {
    for (const stroke of dataset) {
      expect(composeStroke(stroke, { assist: 'high' }).recipe).toEqual(
        composeStroke(stroke, { assist: 'standard' }).recipe,
      );
    }
  });

  it('is deterministic bit-for-bit', () => {
    const stroke = lineWithLoopAtEnd({ noise: 0.04, seed: 8 });
    expect(JSON.stringify(composeStroke(stroke))).toBe(JSON.stringify(composeStroke(stroke)));
  });

  it('keeps coarse heading and force stable under small tremor', () => {
    const clean = composeStroke(line({ x: -0.55, y: -0.1 }, { x: 0.55, y: 0.15 }));
    for (let seed = 1; seed <= 30; seed++) {
      const shaky = composeStroke(
        line({ x: -0.55, y: -0.1 }, { x: 0.55, y: 0.15 }, { noise: 0.035, seed }),
      );
      expect(shaky.recipe.summary.heading).toBe(clean.recipe.summary.heading);
      expect(shaky.recipe.summary.force).toBe(clean.recipe.summary.force);
    }
  });

  /**
   * Property 8, widened to the multi-motif shapes that a single straight line
   * could never exercise. This is the test that was missing: a zigzag commits
   * ~0.36 of the meter, which landed exactly on the old force-band edge, so its
   * readout flipped on nearly half of shaky attempts. A single-motif line has
   * a stable force by construction and hid the defect. Every representative
   * shape now has to hold its coarse summary across 40 tremored attempts.
   */
  it('keeps coarse heading and force stable for every representative shape', () => {
    const shapes: Array<readonly [string, (seed: number, noise: number) => readonly Vec2[]]> = [
      ['zigzag', (seed, noise) => zigzag({ x: -0.45, y: 0 }, 0.22, 3, { noise, samples: 96, seed })],
      ['circle', (seed, noise) => circle({ x: 0, y: 0 }, 0.28, { noise, seed })],
      ['line+loop', (seed, noise) => lineWithLoopAtEnd({ noise, seed })],
      ['loop+tail', (seed, noise) => loopThenTail({ noise, seed })],
      ['spiral', (seed, noise) => spiral({ x: 0, y: 0 }, 0.04, 0.36, 2.1, { noise, samples: 96, seed })],
    ];

    for (const [label, generate] of shapes) {
      const clean = composeStroke(generate(0, 0)).recipe.summary;
      for (let seed = 1; seed <= 40; seed++) {
        const shaky = composeStroke(generate(seed, 0.03)).recipe.summary;
        expect(shaky.heading, `${label} heading @ seed ${seed}`).toBe(clean.heading);
        expect(shaky.force, `${label} force @ seed ${seed}`).toBe(clean.force);
      }
    }
  });

  it('composeRecipe accepts segmented canonical features directly', () => {
    const canonical = extractFeatures(lineWithLoopAtEnd());
    const recipe = composeRecipe(canonical, segmentMotifs(canonical));
    expect(recipe.summary.shape).toEqual(['thrust', 'loop']);
  });
});
