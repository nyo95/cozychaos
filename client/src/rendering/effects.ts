import { TAU, type PlayerSlot, type Snapshot, type Vec2 } from '@cozy/shared';
import { toPixels, toScreen, type Viewport } from './viewport.js';
import { withAlpha } from './palette.js';

/**
 * Presentation-only particle effects.
 *
 * These read snapshots and never write back, so they cannot influence the
 * simulation or desync two clients. Both players still see the same bursts,
 * because a burst is triggered by a snapshot event (matter disappearing) and
 * its scatter comes from a hash of the particle id — not `Math.random`, which
 * the repo reserves for nothing at all and the simulation forbids outright.
 */

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornMs: number;
  lifeMs: number;
  size: number;
  colour: string;
}

const SPARKS_PER_BURST = 7;
const SPARK_LIFE_MS = 520;
const SPARK_SPEED = 0.55;
const MAX_SPARKS = 320;
const MOTE_COUNT = 26;

/** Stable scatter: same id always throws the same sparks on both clients. */
function hash01(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export class SceneEffects {
  private sparks: Spark[] = [];
  private previous = new Map<number, { x: number; y: number; owner: PlayerSlot }>();

  /** Compares consecutive snapshots and bursts where matter was destroyed. */
  observe(snapshot: Snapshot, timeMs: number, colourFor: (slot: PlayerSlot) => string): void {
    const seen = new Set<number>();
    for (const particle of snapshot.particles) {
      seen.add(particle.id);
      this.previous.set(particle.id, { x: particle.x, y: particle.y, owner: particle.owner });
    }
    for (const [id, last] of this.previous) {
      if (seen.has(id)) continue;
      this.previous.delete(id);
      this.burst(id, last, timeMs, colourFor(last.owner));
    }
    if (this.sparks.length > MAX_SPARKS) {
      this.sparks.splice(0, this.sparks.length - MAX_SPARKS);
    }
  }

  /** Clears carry-over between Turns so an old Resolve cannot bleed forward. */
  reset(): void {
    this.sparks = [];
    this.previous.clear();
  }

  private burst(id: number, at: Vec2, timeMs: number, colour: string): void {
    for (let index = 0; index < SPARKS_PER_BURST; index += 1) {
      const angle = hash01(id * 31 + index) * TAU;
      const speed = SPARK_SPEED * (0.4 + hash01(id * 77 + index) * 0.9);
      this.sparks.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        bornMs: timeMs,
        lifeMs: SPARK_LIFE_MS * (0.6 + hash01(id * 131 + index) * 0.8),
        size: 0.006 + hash01(id * 17 + index) * 0.012,
        colour,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, viewport: Viewport, timeMs: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index]!;
      const age = (timeMs - spark.bornMs) / spark.lifeMs;
      if (age >= 1 || age < 0) {
        this.sparks.splice(index, 1);
        continue;
      }
      const seconds = (timeMs - spark.bornMs) / 1000;
      const point = toScreen(viewport, {
        x: spark.x + spark.vx * seconds,
        y: spark.y + spark.vy * seconds - 0.5 * 0.9 * seconds * seconds,
      });
      const fade = (1 - age) * (1 - age);
      ctx.fillStyle = withAlpha(spark.colour, 0.85 * fade);
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(0.8, toPixels(viewport, spark.size * fade)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Slow ambient motes. Purely atmospheric; drift follows the Round wind. */
  drawMotes(
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    timeMs: number,
    wind: Vec2,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      const seedX = hash01(index * 2 + 1);
      const seedY = hash01(index * 2 + 2);
      const speed = 0.02 + seedY * 0.05;
      const driftX = (timeMs / 1000) * (speed + wind.x * 0.12);
      const spanX = 3.4;
      const x = ((seedX * spanX + driftX) % spanX) - spanX / 2;
      const y = -0.35 + seedY * 1.5 +
        Math.sin(timeMs / 2400 + index) * 0.04;
      const point = toScreen(viewport, { x, y });
      const size = Math.max(0.7, toPixels(viewport, 0.004 + seedX * 0.006));
      ctx.fillStyle = withAlpha('#fff4dc', 0.1 + seedY * 0.22);
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
