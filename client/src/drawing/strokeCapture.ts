import { CONFIG, affordableLength, distance, inkCost, type Vec2 } from '@cozy/shared';

/**
 * Captures a stroke while enforcing the ink budget.
 *
 * PRD §7.2: ink — not hand speed — is what caps spell size, and "Ketika tinta
 * habis, stroke otomatis selesai". So the budget is enforced *during* capture,
 * not checked afterwards: the line visibly stops growing at the exact moment
 * the meter empties, which is what makes the constraint legible instead of
 * feeling like a rejection after the fact.
 *
 * Deliberately knows nothing about rendering or DOM. It takes points in arena
 * coordinates and answers questions about them, so it can be unit-tested and
 * reused by the future match client unchanged.
 */
export class StrokeCapture {
  private points: Vec2[] = [];
  private lengthUsed = 0;
  private active = false;

  /** True while a stroke is being drawn. */
  get isDrawing(): boolean {
    return this.active;
  }

  /** Points captured so far, in arena coordinates. */
  get stroke(): readonly Vec2[] {
    return this.points;
  }

  /** Arc length drawn so far, in arena units. */
  get length(): number {
    return this.lengthUsed;
  }

  /** Ink spent so far. */
  get inkUsed(): number {
    return this.points.length === 0 ? 0 : inkCost(this.lengthUsed);
  }

  /** Ink left, floored at zero. */
  get inkRemaining(): number {
    return Math.max(0, CONFIG.ink.total - this.inkUsed);
  }

  /** Fraction of the meter still available, for the HUD. */
  get inkFraction(): number {
    return CONFIG.ink.total <= 0 ? 0 : this.inkRemaining / CONFIG.ink.total;
  }

  /** True once the meter has emptied and the stroke was cut short. */
  get exhausted(): boolean {
    return this.lengthUsed >= this.budget - 1e-9;
  }

  private get budget(): number {
    return Math.min(affordableLength(CONFIG.ink.total), CONFIG.strokeLimits.maxLength);
  }

  begin(point: Vec2): void {
    this.points = [point];
    this.lengthUsed = 0;
    this.active = true;
  }

  /**
   * Extends the stroke toward `point`, stopping exactly on the ink budget.
   *
   * When the budget runs out mid-segment the segment is cut at the crossing
   * point rather than dropped. Dropping it would let a player with a fast hand
   * squeeze in a longer stroke than a slow one — the samples arrive further
   * apart, so more length is lost to the final partial segment — which is the
   * hand-speed advantage PRD §7.1 rules out.
   */
  extend(point: Vec2): void {
    if (!this.active) return;
    const previous = this.points[this.points.length - 1];
    if (previous === undefined) return;

    const segment = distance(previous, point);
    if (segment < 1e-6) return;

    const remaining = this.budget - this.lengthUsed;
    if (remaining <= 0) {
      this.active = false;
      return;
    }

    if (segment <= remaining) {
      this.points.push(point);
      this.lengthUsed += segment;
      return;
    }

    const t = remaining / segment;
    this.points.push({
      x: previous.x + (point.x - previous.x) * t,
      y: previous.y + (point.y - previous.y) * t,
    });
    this.lengthUsed = this.budget;
    this.active = false;
  }

  /** Ends the stroke and returns the captured points. */
  end(): readonly Vec2[] {
    this.active = false;
    return this.points;
  }

  clear(): void {
    this.points = [];
    this.lengthUsed = 0;
    this.active = false;
  }
}
