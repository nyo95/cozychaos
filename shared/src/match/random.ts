/**
 * Seeded pseudo-random number generation.
 *
 * PRD §21: "Semua randomness berasal dari seeded random." PRD §15 requires the
 * whole match to run from one seed so that a replay can be rebuilt from
 * `seed + initial state + two strokes`. Nothing in gameplay may call
 * `Math.random()` — a single unseeded call anywhere makes replays wrong and
 * puts the two clients' visuals out of step with the server.
 */

/** Deterministic 32-bit PRNG. Small, fast, and identical across engines. */
export interface Random {
  /** Next value in [0, 1). */
  next(): number;
  /** Current internal state, so a stream can be snapshotted and resumed. */
  state(): number;
}

export function createRandom(seed: number): Random {
  // Force to uint32 so the same seed behaves the same regardless of caller.
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state(): number {
      return state;
    },
  };
}

/**
 * Derives a stable sub-seed from a match seed and a label.
 *
 * Lets each subsystem own an independent stream, so adding a random effect to
 * the renderer cannot shift the numbers the simulation draws.
 */
export function deriveSeed(seed: number, label: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < label.length; i++) {
    hash = (Math.imul(hash ^ label.charCodeAt(i), 0x01000193) >>> 0) >>> 0;
  }
  return hash >>> 0;
}
