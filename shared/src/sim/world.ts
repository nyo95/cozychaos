import { CONFIG } from '../config/index.js';
import type { HazardSpikeConfig } from '../config/types.js';
import { knockbackMultiplier, type PlayerSlot } from '../match/state.js';
import type { RuneBodyBlueprint } from '../spells/runeBody.js';
import { distance, normalize, type Vec2 } from '../spells/geometry.js';
import { bounceMovingCircleOffSpike } from './collision.js';

/** Authoritative wizard body. */
export interface Body {
  readonly slot: PlayerSlot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobble: number;
  alive: boolean;
  koAtMs: number | null;
}

interface RuneParticle {
  readonly id: number;
  readonly owner: PlayerSlot;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  readonly radius: number;
  readonly mass: number;
  energy: number;
  integrity: number;
  /**
   * True once this fragment has bounced off anything — opposing matter, a
   * crystal, or a bond. Until then it may not touch its own caster, so a
   * launch cannot hit you. After that it may, which is the entire reward for
   * deflecting an incoming rune back at whoever threw it.
   */
  deflected: boolean;
  hitMask: number;
  alive: boolean;
  readonly diesAtMs: number;
}

interface RuneBond {
  readonly id: number;
  readonly owner: PlayerSlot;
  readonly a: number;
  readonly b: number;
  readonly restLength: number;
  readonly strength: number;
  readonly cross: boolean;
  alive: boolean;
}

export interface World {
  timeMs: number;
  readonly bodies: readonly [Body, Body];
  readonly particles: RuneParticle[];
  readonly bonds: RuneBond[];
  readonly wind: Vec2;
  readonly obstacles: readonly HazardSpikeConfig[];
  readonly lowGravity: boolean;
  readonly knockouts: { slot: PlayerSlot; atMs: number }[];
}

/** Compact wire frame; renderer decisions never feed back into simulation. */
export interface Snapshot {
  readonly timeMs: number;
  readonly wind: Vec2;
  readonly obstacles: readonly HazardSpikeConfig[];
  readonly bodies: readonly {
    readonly slot: PlayerSlot;
    readonly x: number;
    readonly y: number;
    readonly wobble: number;
    readonly alive: boolean;
  }[];
  readonly particles: readonly {
    readonly id: number;
    readonly owner: PlayerSlot;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly energy: number;
    readonly deflected: boolean;
  }[];
  readonly bonds: readonly {
    readonly owner: PlayerSlot;
    readonly ax: number;
    readonly ay: number;
    readonly bx: number;
    readonly by: number;
    readonly cross: boolean;
  }[];
}

export function spawnPosition(slot: PlayerSlot): Vec2 {
  return {
    x: slot === 0 ? -CONFIG.player.spawnX : CONFIG.player.spawnX,
    y: CONFIG.arena.groundY + CONFIG.player.radius,
  };
}

function createBody(slot: PlayerSlot, position: Vec2, wobble: number): Body {
  return {
    slot,
    x: position.x,
    y: position.y,
    vx: 0,
    vy: 0,
    wobble,
    alive: true,
    koAtMs: null,
  };
}

export interface CreateWorldInput {
  readonly positions: readonly [Vec2, Vec2];
  readonly wobble: readonly [number, number];
  readonly runes: readonly [RuneBodyBlueprint, RuneBodyBlueprint];
  readonly wind: Vec2;
  readonly obstacles: readonly HazardSpikeConfig[];
  readonly lowGravity?: boolean;
}

export function createResolveWorld(input: CreateWorldInput): World {
  const particles: RuneParticle[] = [];
  const bonds: RuneBond[] = [];
  for (const rune of input.runes) {
    const offset = particles.length;
    for (const particle of rune.particles) {
      particles.push({
        id: particles.length,
        owner: rune.owner,
        x: particle.position.x,
        y: particle.position.y,
        previousX: particle.position.x,
        previousY: particle.position.y,
        vx: particle.velocity.x,
        vy: particle.velocity.y,
        radius: particle.radius,
        mass: particle.mass,
        energy: particle.energy,
        integrity: particle.integrity,
        deflected: false,
        hitMask: 0,
        alive: true,
        diesAtMs: CONFIG.runeBody.lifetimeMs,
      });
    }
    for (const bond of rune.bonds) {
      bonds.push({
        id: bonds.length,
        owner: rune.owner,
        a: offset + bond.a,
        b: offset + bond.b,
        restLength: bond.restLength,
        strength: bond.strength,
        cross: bond.cross,
        alive: true,
      });
    }
  }

  return {
    timeMs: 0,
    bodies: [
      createBody(0, input.positions[0], input.wobble[0]),
      createBody(1, input.positions[1], input.wobble[1]),
    ],
    particles,
    bonds,
    wind: input.wind,
    obstacles: input.obstacles,
    lowGravity: input.lowGravity ?? false,
    knockouts: [],
  };
}

const STEP_MS = CONFIG.simulation.fixedTimestepMs;
const STEP_S = STEP_MS / 1000;

export function stepWorld(world: World): void {
  world.timeMs += STEP_MS;
  stepBonds(world);
  integrateParticles(world);
  collideParticles(world);
  collideParticlesWithBonds(world);
  collideParticlesWithHazards(world);
  collideParticlesWithGround(world);
  collideParticlesWithPlayers(world);
  stepBodies(world);
  expireMatter(world);
}

/** Hooke springs preserve the handwritten silhouette until stress breaks it. */
function stepBonds(world: World): void {
  for (const bond of world.bonds) {
    if (!bond.alive) continue;
    const a = world.particles[bond.a];
    const b = world.particles[bond.b];
    if (!a?.alive || !b?.alive || a.integrity <= 0 || b.integrity <= 0) {
      bond.alive = false;
      continue;
    }
    const delta = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(delta.x, delta.y);
    const normal = normalize(delta, { x: 1, y: 0 });
    const extension = length - bond.restLength;
    const strain = Math.abs(extension) / Math.max(bond.restLength, 1e-4);
    const relativeSpeed = (b.vx - a.vx) * normal.x + (b.vy - a.vy) * normal.y;
    const force = extension * CONFIG.runeBody.bondStiffness +
      relativeSpeed * CONFIG.runeBody.bondDamping;

    if (strain > CONFIG.runeBody.breakStrain || Math.abs(force) > bond.strength) {
      bond.alive = false;
      continue;
    }
    const impulse = force * STEP_S;
    a.vx += normal.x * impulse / a.mass;
    a.vy += normal.y * impulse / a.mass;
    b.vx -= normal.x * impulse / b.mass;
    b.vy -= normal.y * impulse / b.mass;
  }
}

function integrateParticles(world: World): void {
  const gravity = CONFIG.arena.gravity * CONFIG.runeBody.gravityScale *
    (world.lowGravity ? CONFIG.arena.lowGravityMultiplier : 1);
  const drag = Math.max(0, 1 - CONFIG.runeBody.airDrag * STEP_S);
  for (const particle of world.particles) {
    if (!particle.alive) continue;
    particle.previousX = particle.x;
    particle.previousY = particle.y;
    particle.vx += world.wind.x * STEP_S;
    particle.vy += (gravity + world.wind.y) * STEP_S;
    particle.vx *= drag;
    particle.vy *= drag;
    particle.x += particle.vx * STEP_S;
    particle.y += particle.vy * STEP_S;
  }
}

/** Pairwise impulse + mutual destruction. At 56 nodes this stays cheap. */
function collideParticles(world: World): void {
  const particles = world.particles;
  for (let left = 0; left < particles.length; left += 1) {
    const a = particles[left]!;
    if (!a.alive) continue;
    for (let right = left + 1; right < particles.length; right += 1) {
      const b = particles[right]!;
      if (!b.alive || a.owner === b.owner) continue;
      const delta = { x: b.x - a.x, y: b.y - a.y };
      const gap = Math.hypot(delta.x, delta.y);
      const reach = a.radius + b.radius;
      if (gap >= reach) continue;
      const normal = normalize(delta, { x: a.owner === 0 ? 1 : -1, y: 0 });
      const overlap = reach - gap;
      const totalMass = a.mass + b.mass;
      a.x -= normal.x * overlap * (b.mass / totalMass);
      a.y -= normal.y * overlap * (b.mass / totalMass);
      b.x += normal.x * overlap * (a.mass / totalMass);
      b.y += normal.y * overlap * (a.mass / totalMass);

      const relativeNormal = (b.vx - a.vx) * normal.x + (b.vy - a.vy) * normal.y;
      if (relativeNormal < 0) {
        const impulse =
          -(1 + CONFIG.runeBody.particleRestitution) * relativeNormal /
          (1 / a.mass + 1 / b.mass);
        a.vx -= normal.x * impulse / a.mass;
        a.vy -= normal.y * impulse / a.mass;
        b.vx += normal.x * impulse / b.mass;
        b.vy += normal.y * impulse / b.mass;
      }

      a.deflected = true;
      b.deflected = true;
      const reducedMass = (a.mass * b.mass) / totalMass;
      const collisionEnergy = Math.max(0, -relativeNormal) * reducedMass *
        CONFIG.runeBody.collisionEnergyScale;
      annihilate(a, b, collisionEnergy);
    }
  }
}

/**
 * Opposing matter destroys opposing matter. There is no attacker and no
 * defender: both sides lose charge and structure in the same event.
 *
 * The share is mass-weighted, and deliberately weighted by the *opponent's*
 * mass rather than one's own. Two equal runes split the loss evenly; a 0.1
 * fragment meeting a 1.0 wall absorbs 91% of the destruction while the wall
 * absorbs 9%. That single line is what makes a heavy, slow, short-range rune
 * behave as a shield without any shield mechanic existing.
 */
function annihilate(a: RuneParticle, b: RuneParticle, collisionEnergy: number): void {
  if (collisionEnergy <= 0) return;
  const totalMass = a.mass + b.mass;
  if (totalMass <= 0) return;
  const shareA = b.mass / totalMass;
  const shareB = a.mass / totalMass;
  const scale = CONFIG.runeBody.mutualDamageScale;

  const lossA = collisionEnergy * shareA * scale;
  const lossB = collisionEnergy * shareB * scale;
  a.energy = Math.max(0, a.energy - lossA);
  b.energy = Math.max(0, b.energy - lossB);
  a.integrity -= lossA * CONFIG.runeBody.integrityDamageScale;
  b.integrity -= lossB * CONFIG.runeBody.integrityDamageScale;
}

/**
 * Bonds are capsule colliders, not decorative lines. This is what makes the
 * literal handwriting matter: an opposing fragment cannot pass freely through
 * the gap between two sampled nodes of a loop or written letter.
 */
function collideParticlesWithBonds(world: World): void {
  for (const particle of world.particles) {
    if (!particle.alive) continue;
    for (const bond of world.bonds) {
      if (!bond.alive || bond.owner === particle.owner) continue;
      const a = world.particles[bond.a];
      const b = world.particles[bond.b];
      if (!a?.alive || !b?.alive) continue;
      const segment = { x: b.x - a.x, y: b.y - a.y };
      const lengthSquared = segment.x * segment.x + segment.y * segment.y;
      if (lengthSquared < 1e-8) continue;
      const projection =
        ((particle.x - a.x) * segment.x + (particle.y - a.y) * segment.y) /
        lengthSquared;
      const t = Math.max(0, Math.min(1, projection));
      // End caps are already handled by particle-particle collision.
      const endCap = CONFIG.runeBody.bondEndCapFraction;
      if (t <= endCap || t >= 1 - endCap) continue;
      const closest = { x: a.x + segment.x * t, y: a.y + segment.y * t };
      const delta = { x: particle.x - closest.x, y: particle.y - closest.y };
      const gap = Math.hypot(delta.x, delta.y);
      const reach = particle.radius + CONFIG.runeBody.bondCollisionRadius;
      if (gap >= reach) continue;
      const normal = normalize(delta, { x: -segment.y, y: segment.x });
      particle.x += normal.x * (reach - gap);
      particle.y += normal.y * (reach - gap);

      const bondVx = a.vx * (1 - t) + b.vx * t;
      const bondVy = a.vy * (1 - t) + b.vy * t;
      const relativeNormal = (particle.vx - bondVx) * normal.x +
        (particle.vy - bondVy) * normal.y;
      if (relativeNormal >= 0) continue;
      const bondMass = a.mass + b.mass;
      const impulse =
        -(1 + CONFIG.runeBody.particleRestitution) * relativeNormal /
        (1 / particle.mass + 1 / bondMass);
      particle.vx += normal.x * impulse / particle.mass;
      particle.vy += normal.y * impulse / particle.mass;
      a.vx -= normal.x * impulse * (1 - t) / a.mass;
      a.vy -= normal.y * impulse * (1 - t) / a.mass;
      b.vx -= normal.x * impulse * t / b.mass;
      b.vy -= normal.y * impulse * t / b.mass;

      const other = t < 0.5 ? a : b;
      particle.deflected = true;
      other.deflected = true;
      const reducedMass = (particle.mass * bondMass) / (particle.mass + bondMass);
      const collisionEnergy = -relativeNormal * reducedMass * CONFIG.runeBody.collisionEnergyScale;
      annihilate(particle, other, collisionEnergy);
    }
  }
}

function collideParticlesWithHazards(world: World): void {
  for (const particle of world.particles) {
    if (!particle.alive) continue;
    for (const spike of world.obstacles) {
      const collision = bounceMovingCircleOffSpike(
        particle,
        { x: particle.previousX, y: particle.previousY },
        particle.radius,
        CONFIG.hazards.spellRestitution,
        spike,
      );
      if (!collision?.bounced) continue;
      particle.deflected = true;
      particle.energy *= 1 - CONFIG.hazards.spellEnergyLossFraction;
      particle.integrity -= CONFIG.runeBody.hazardIntegrityDamage;
    }
  }
}

/**
 * Rune matter rests on the island.
 *
 * Without this, a heavy short-range rune fell straight through the ground and
 * expired below the kill floor — so the defensive half of the design did not
 * actually exist: a "wall" that sinks through the floor blocks nothing. Matter
 * that lands on the island now stays there as physical geometry for the rest
 * of the Resolve, which is what a screen has to be.
 *
 * Past the island edge there is deliberately no floor. A rune lobbed into the
 * void is gone, and that is the cost of aiming badly.
 */
function collideParticlesWithGround(world: World): void {
  const surface = CONFIG.arena.groundY;
  for (const particle of world.particles) {
    if (!particle.alive) continue;
    if (Math.abs(particle.x) > CONFIG.arena.halfWidth) continue;
    const rest = surface + particle.radius;
    if (particle.y > rest) continue;
    particle.y = rest;
    /**
     * The resting threshold is load-bearing, not polish. Gravity gives a
     * settled particle a small negative `vy` every single step, so charging an
     * impact for any downward motion drained a landed rune by the ground-loss
     * fraction *per frame* — a wall lost 99% of its charge in two seconds just
     * by sitting still. Below this speed the contact is resting, not an
     * impact: kill the velocity and charge nothing.
     */
    if (particle.vy < -CONFIG.runeBody.groundRestingSpeed) {
      particle.vy = -particle.vy * CONFIG.runeBody.groundRestitution;
      particle.energy *= 1 - CONFIG.runeBody.groundEnergyLossFraction;
    } else if (particle.vy < 0) {
      particle.vy = 0;
    }
    particle.vx *= Math.max(0, 1 - CONFIG.runeBody.groundFriction * STEP_S);
  }
}

function collideParticlesWithPlayers(world: World): void {
  for (const particle of world.particles) {
    if (!particle.alive) continue;
    for (const body of world.bodies) {
      const mask = 1 << body.slot;
      if (!body.alive || (particle.hitMask & mask) !== 0) continue;
      // Your own matter is harmless until something sends it back at you.
      if (body.slot === particle.owner && !particle.deflected) continue;
      const reach = particle.radius + CONFIG.player.radius;
      if (distance(particle, body) > reach) continue;
      if (particle.energy <= 0) continue;

      /**
       * Knockback is momentum, full stop. The old code took
       * `min(energy, max(floor, speed × mass)) × 20`, which compared an energy
       * against a momentum, then scaled by 20 — so a nearly stationary
       * fragment still delivered a fifth of the Wobble bar. Charge now only
       * gates *whether and how much* of that momentum still lands.
       */
      const momentum = Math.hypot(particle.vx, particle.vy) * particle.mass;
      const charge = Math.min(1, particle.energy / CONFIG.runeBody.energyForFullImpact);
      const impulse = momentum * CONFIG.runeBody.impactTransfer * charge;
      if (impulse <= 0) continue;

      const heading = normalize(
        { x: particle.vx, y: particle.vy },
        { x: particle.owner === 0 ? 1 : -1, y: 0 },
      );
      applyImpact(body, heading, impulse);
      particle.energy = Math.max(
        0,
        particle.energy - impulse * CONFIG.runeBody.energyCostPerImpulse,
      );
      particle.integrity -= impulse * CONFIG.runeBody.integrityDamageScale;
      particle.hitMask |= mask;
    }
  }
}

/**
 * A hit launches, it does not shove.
 *
 * Ground friction is 1.4/s, so a purely horizontal impulse is spent in a
 * fraction of a second and moves a wizard almost nowhere — measured, a solid
 * hit was worth about 0.03 arena units and a knock-out took twenty Turns, four
 * times the whole match length PRD §4.4 asks for. The lift term throws the
 * wizard into the air instead, where drag is 0.4/s rather than 1.4/s, so the
 * knockback actually carries. It also reads far better: PRD §4.2 asks for
 * players who get "terpental", not players who slide an inch.
 *
 * Lift is unsigned on purpose. A steeply lobbed rune arrives travelling almost
 * straight down, and without this a lob would only ever press its target into
 * the floor.
 */
function applyImpact(body: Body, heading: Vec2, impulse: number): void {
  if (impulse <= 0) return;
  const magnitude = impulse * knockbackMultiplier(body.wobble) / CONFIG.player.mass;
  body.vx += heading.x * magnitude;
  body.vy += heading.y * magnitude + magnitude * CONFIG.wobble.knockbackLift;
  body.wobble = Math.min(
    CONFIG.wobble.max,
    body.wobble + impulse * CONFIG.wobble.gainPerImpulse,
  );
}

function stepBodies(world: World): void {
  const gravity = CONFIG.arena.gravity *
    (world.lowGravity ? CONFIG.arena.lowGravityMultiplier : 1);
  const groundY = CONFIG.arena.groundY + CONFIG.player.radius;
  for (const body of world.bodies) {
    if (!body.alive) continue;
    body.vy += gravity * STEP_S;
    body.vx *= Math.max(0, 1 - CONFIG.player.airDrag * STEP_S);
    const previous = { x: body.x, y: body.y };
    body.x += body.vx * STEP_S;
    body.y += body.vy * STEP_S;

    collidePlayerWithHazards(body, previous, world.obstacles);
    if (body.y <= groundY && Math.abs(body.x) <= CONFIG.arena.halfWidth) {
      body.y = groundY;
      body.vy = body.vy < 0 ? -body.vy * CONFIG.player.groundRestitution : body.vy;
      body.vx *= Math.max(0, 1 - CONFIG.player.groundFriction * STEP_S);
    }
    if (Math.abs(body.x) > CONFIG.arena.killWallX || body.y < CONFIG.arena.killFloorY) {
      body.alive = false;
      body.koAtMs = world.timeMs;
      world.knockouts.push({ slot: body.slot, atMs: world.timeMs });
    }
  }
}

function collidePlayerWithHazards(
  body: Body,
  previous: Vec2,
  obstacles: readonly HazardSpikeConfig[],
): void {
  for (const spike of obstacles) {
    const collision = bounceMovingCircleOffSpike(
      body,
      previous,
      CONFIG.player.radius,
      CONFIG.hazards.playerRestitution,
      spike,
    );
    if (!collision?.bounced) continue;
    applyImpact(
      body,
      collision.normal,
      collision.incomingSpeed * CONFIG.player.mass * CONFIG.hazards.playerImpact,
    );
  }
}

function expireMatter(world: World): void {
  for (const particle of world.particles) {
    if (!particle.alive) continue;
    const powerless = particle.energy <= CONFIG.runeBody.powerlessEnergyThreshold;
    const outside =
      Math.abs(particle.x) > CONFIG.arena.killWallX * CONFIG.runeBody.particleKillWallMultiplier ||
      particle.y < CONFIG.arena.killFloorY ||
      particle.y > CONFIG.runeBody.particleCeilingY;
    if (world.timeMs >= particle.diesAtMs || outside || powerless) particle.alive = false;
  }
  for (const bond of world.bonds) {
    if (!world.particles[bond.a]?.alive || !world.particles[bond.b]?.alive) bond.alive = false;
  }
}

export function worldSnapshot(world: World): Snapshot {
  return {
    timeMs: round(world.timeMs),
    wind: { x: round(world.wind.x), y: round(world.wind.y) },
    obstacles: world.obstacles,
    bodies: world.bodies.map((body) => ({
      slot: body.slot,
      x: round(body.x),
      y: round(body.y),
      wobble: round(body.wobble),
      alive: body.alive,
    })),
    particles: world.particles.filter((particle) => particle.alive).map((particle) => ({
      id: particle.id,
      owner: particle.owner,
      x: round(particle.x),
      y: round(particle.y),
      radius: round(particle.radius),
      energy: round(particle.energy),
      deflected: particle.deflected,
    })),
    bonds: world.bonds.filter((bond) => bond.alive).map((bond) => {
      const a = world.particles[bond.a]!;
      const b = world.particles[bond.b]!;
      return {
        owner: bond.owner,
        ax: round(a.x),
        ay: round(a.y),
        bx: round(b.x),
        by: round(b.y),
        cross: bond.cross,
      };
    }),
  };
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function isSettled(world: World): boolean {
  if (world.particles.some((particle) => particle.alive)) return false;
  const energy = world.bodies
    .filter((body) => body.alive)
    .reduce((sum, body) => sum + body.vx * body.vx + body.vy * body.vy, 0);
  return energy < CONFIG.simulation.settleEnergyThreshold;
}

export const SIM_STEP_MS = STEP_MS;
