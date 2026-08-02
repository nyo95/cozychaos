import { CONFIG } from '../config/index.js';
import type { PlayerSlot } from '../match/state.js';
import {
  boundingBox,
  centroid,
  clamp,
  distance,
  normalize,
  resample,
  type Vec2,
} from './geometry.js';

/** A simulation-ready particle. No classifier family is required. */
export interface RuneParticleBlueprint {
  readonly index: number;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
  readonly mass: number;
  /** Conserved magical charge. Fuel, not knockback — see `world.ts`. */
  readonly energy: number;
  readonly integrity: number;
}

export interface RuneBondBlueprint {
  readonly a: number;
  readonly b: number;
  readonly restLength: number;
  readonly strength: number;
  readonly cross: boolean;
}

export interface RuneBodyBlueprint {
  readonly owner: PlayerSlot;
  readonly direction: Vec2;
  readonly particles: readonly RuneParticleBlueprint[];
  readonly bonds: readonly RuneBondBlueprint[];
  readonly inkCommitted: number;
  readonly inkReserved: number;
  /** Total mass, and the launch speed it bought. Exposed for HUD and tests. */
  readonly mass: number;
  readonly launchSpeed: number;
}

export interface BuildRuneBodyInput {
  readonly points: readonly Vec2[];
  readonly owner: PlayerSlot;
  readonly casterPosition: Vec2;
  /** Direction-only Cast gesture; magnitude is intentionally ignored. */
  readonly castDirection: Vec2;
  readonly inkCommitted: number;
  readonly inkReserved: number;
}

/** What a given Ink commitment will buy. Pure, so the HUD can promise it. */
export interface LaunchPrediction {
  readonly particles: number;
  readonly mass: number;
  readonly speed: number;
  /** Flat-ground ballistic reach at the optimal 45° angle, in arena units. */
  readonly maxReach: number;
}

/**
 * The offence/defence dial, in one function.
 *
 * There are no roles. Ink buys mass; a fixed launch energy turns that mass
 * into speed; speed sets ballistic reach. Draw a little and you get a fast
 * dart that crosses the arena. Draw a lot and you get a slow, heavy body that
 * lands in front of you and blocks — which is exactly the "Ink spent
 * attacking is Ink not available for defending" rule, expressed as physics
 * instead of a hidden stat.
 *
 * The HUD calls this before the player commits, which is what keeps property 8
 * (informed commitment) alive now that Ward is gone.
 */
export function predictLaunch(inkCommitted: number): LaunchPrediction {
  const ink = clamp(inkCommitted, 0, CONFIG.ink.total);
  const particles = particleCount(ink);
  const mass = totalMass(ink, particles);
  const speed = launchSpeed(mass);
  const gravity = Math.abs(CONFIG.arena.gravity) * CONFIG.runeBody.gravityScale;
  return {
    particles,
    mass,
    speed,
    maxReach: gravity <= 0 ? Infinity : (speed * speed) / gravity,
  };
}

function particleCount(ink: number): number {
  return Math.round(
    CONFIG.runeBody.minParticles +
    (CONFIG.runeBody.maxParticles - CONFIG.runeBody.minParticles) *
    (ink / CONFIG.ink.total),
  );
}

/**
 * Total body mass.
 *
 * The floor is absolute, not per-particle. A per-particle floor multiplied by
 * a particle count that itself grows with Ink is just a second linear-in-Ink
 * term, so it did not bound the curve — it flattened it, and a flat mass curve
 * means light and heavy runes fly at the same speed and the offence/defence
 * dial disappears.
 */
function totalMass(ink: number, _particles: number): number {
  return Math.max(CONFIG.runeBody.minimumMass, ink * CONFIG.runeBody.massPerInk);
}

/**
 * `v = sqrt(2E/m)`. Constant launch energy, so heavier is strictly slower.
 *
 * The clamps exist because `1/sqrt(m)` diverges as mass approaches zero: a
 * one-pixel twitch must not become a hypersonic pellet.
 */
function launchSpeed(mass: number): number {
  if (mass <= 0) return CONFIG.aim.maxLaunchSpeed;
  return clamp(
    Math.sqrt((2 * CONFIG.aim.launchEnergy) / mass),
    CONFIG.aim.minLaunchSpeed,
    CONFIG.aim.maxLaunchSpeed,
  );
}

/**
 * Converts every valid stroke into a physical rune body. Shape recognition is
 * absent by design: a name, doodle, or ugly scribble still becomes connected
 * matter. All values come from CONFIG so meta tuning never touches this math.
 */
export function buildRuneBody(input: BuildRuneBodyInput): RuneBodyBlueprint {
  const inkCommitted = clamp(input.inkCommitted, 0, CONFIG.ink.total);
  const inkReserved = clamp(input.inkReserved, 0, CONFIG.ink.total - inkCommitted);
  const direction = clampAimToOpponent(input.castDirection, input.owner);

  if (input.points.length === 0 || inkCommitted <= 0) {
    return {
      owner: input.owner,
      direction,
      particles: [],
      bonds: [],
      inkCommitted,
      inkReserved,
      mass: 0,
      launchSpeed: 0,
    };
  }

  const rawBox = boundingBox(input.points);
  const fraction = inkCommitted / CONFIG.ink.total;
  const count = rawBox.diagonal < CONFIG.strokeLimits.minSize
    ? 1
    : particleCount(inkCommitted);
  const sampled = count === 1 ? [input.points[0]!] : resample(input.points, count);
  const center = centroid(sampled);
  const extent = CONFIG.runeBody.minExtent +
    (CONFIG.runeBody.maxExtent - CONFIG.runeBody.minExtent) * fraction;
  const scale = extent / Math.max(boundingBox(sampled).diagonal, CONFIG.strokeLimits.minSize);
  const angle = Math.atan2(direction.y, direction.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const spawn = {
    x: input.casterPosition.x + direction.x * CONFIG.aim.spawnForward,
    y: input.casterPosition.y + CONFIG.runeBody.spawnHeight +
      direction.y * CONFIG.aim.spawnForward,
  };
  const mass = totalMass(inkCommitted, count);
  const speed = launchSpeed(mass);
  const totalEnergy = inkCommitted * CONFIG.runeBody.energyPerInk;

  const particles = sampled.map((point, index): RuneParticleBlueprint => {
    const localX = (point.x - center.x) * scale;
    const localY = (point.y - center.y) * scale;
    return {
      index,
      position: {
        x: spawn.x + localX * cos - localY * sin,
        y: spawn.y + localX * sin + localY * cos,
      },
      velocity: { x: direction.x * speed, y: direction.y * speed },
      radius: CONFIG.runeBody.particleRadius,
      mass: mass / count,
      energy: totalEnergy / count,
      integrity:
        CONFIG.runeBody.baseParticleIntegrity +
        (inkCommitted / count) * CONFIG.runeBody.integrityPerInk,
    };
  });

  return {
    owner: input.owner,
    direction,
    particles,
    bonds: buildBonds(particles),
    inkCommitted,
    inkReserved,
    mass,
    launchSpeed: speed,
  };
}

/**
 * Direction is expressive inside a forward cone, never backwards.
 *
 * The cone is wide (~83°) on purpose. A near-vertical lob barely travels, so
 * the rune falls back onto your own half and becomes a screen. Tightening this
 * cone deletes the defensive option entirely — there is no other lever for it.
 */
export function clampAimToOpponent(direction: Vec2, owner: PlayerSlot): Vec2 {
  const forwardAngle = owner === 0 ? 0 : Math.PI;
  const fallback = { x: owner === 0 ? 1 : -1, y: 0 };
  const desired = normalize(direction, fallback);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  const delta = wrapAngle(desiredAngle - forwardAngle);
  const clamped = clamp(
    delta,
    -CONFIG.aim.maxAngleFromOpponent,
    CONFIG.aim.maxAngleFromOpponent,
  );
  const angle = forwardAngle + clamped;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function buildBonds(particles: readonly RuneParticleBlueprint[]): RuneBondBlueprint[] {
  const bonds: RuneBondBlueprint[] = [];
  for (let index = 1; index < particles.length; index += 1) {
    bonds.push(makeBond(particles, index - 1, index, false));
  }

  const crossCandidates: { a: number; b: number; gap: number }[] = [];
  for (let a = 0; a < particles.length; a += 1) {
    for (let b = a + 3; b < particles.length; b += 1) {
      const gap = distance(particles[a]!.position, particles[b]!.position);
      if (gap <= CONFIG.runeBody.intersectionDistance) crossCandidates.push({ a, b, gap });
    }
  }
  crossCandidates.sort((left, right) => left.gap - right.gap || left.a - right.a || left.b - right.b);
  for (const candidate of crossCandidates.slice(0, CONFIG.runeBody.maxCrossBonds)) {
    bonds.push(makeBond(particles, candidate.a, candidate.b, true));
  }
  return bonds;
}

function makeBond(
  particles: readonly RuneParticleBlueprint[],
  a: number,
  b: number,
  cross: boolean,
): RuneBondBlueprint {
  return {
    a,
    b,
    restLength: Math.max(distance(particles[a]!.position, particles[b]!.position), 1e-4),
    strength: CONFIG.runeBody.bondBaseStrength *
      (cross ? 1 + CONFIG.runeBody.intersectionStrengthBonus : 1),
    cross,
  };
}

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}
