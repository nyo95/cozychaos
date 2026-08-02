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
  /**
   * Current minimum gap between kept samples. Doubles each time the point
   * budget fills, so a very long stroke thins out rather than being cut off.
   */
  private spacing = CONFIG.strokeLimits.minSampleSpacing;
  /**
   * The most recent sample rejected for being too close to its predecessor.
   *
   * Kept so the stroke can be finished on its true endpoint. Without this the
   * last fraction of a gesture is silently discarded, and since the endpoint
   * contributes to the aim direction, releasing the button would nudge the
   * spell off the line the player drew.
   */
  private pendingTail: Vec2 | null = null;

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
    this.spacing = CONFIG.strokeLimits.minSampleSpacing;
    this.pendingTail = null;
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
    this.append(point, this.spacing);
  }

  private append(point: Vec2, minimumSpacing: number): void {
    if (!this.active) return;
    const previous = this.points[this.points.length - 1];
    if (previous === undefined) return;

    const segment = distance(previous, point);

    /**
     * Drop samples too close to the previous one.
     *
     * A high-polling mouse with coalesced pointer events reports many samples
     * per frame, sometimes a fraction of a pixel apart. Keeping them would let
     * the point count run into the thousands within one Draw phase while
     * adding nothing to the shape, and it is what made the live preview stutter
     * on fast hardware. The rejected sample is remembered rather than
     * forgotten, so the stroke can still finish exactly where the hand did.
     */
    if (segment < minimumSpacing) {
      this.pendingTail = point;
      return;
    }
    this.pendingTail = null;

    const remaining = this.budget - this.lengthUsed;
    if (remaining <= 0) {
      this.active = false;
      return;
    }

    if (segment <= remaining) {
      this.points.push(point);
      this.lengthUsed += segment;
      this.thinIfFull();
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

  /**
   * Halves the point count once the budget fills, doubling the spacing.
   *
   * A minimum spacing bounds how *dense* a stroke can be but not how *long*,
   * so a sweeping gesture could still run past the server's point cap
   * (PRD §15) — 1400 points in testing, against a cap of 512. Thinning
   * adaptively keeps the cap an invariant of the capture rather than something
   * a later stage has to repair, and halving preserves the shape because the
   * survivors stay evenly spaced along the path.
   *
   * Ink already spent is not refunded: `lengthUsed` tracks what the player
   * drew, not what is still stored.
   */
  private thinIfFull(): void {
    if (this.points.length < CONFIG.strokeLimits.maxPoints) return;

    const thinned: Vec2[] = [];
    for (let i = 0; i < this.points.length; i += 2) thinned.push(this.points[i]!);
    const last = this.points[this.points.length - 1]!;
    if (thinned[thinned.length - 1] !== last) thinned.push(last);

    this.points = thinned;
    this.spacing *= 2;
  }

  /**
   * Ends the stroke and returns the captured points.
   *
   * The last rejected sample is appended first, so the stroke finishes where
   * the hand actually stopped. That final fragment is short, but it is the one
   * that sets the aim.
   */
  end(): readonly Vec2[] {
    if (this.pendingTail !== null && this.active) {
      this.append(this.pendingTail, 0);
      this.pendingTail = null;
    }
    this.active = false;
    return this.points;
  }

  clear(): void {
    this.points = [];
    this.lengthUsed = 0;
    this.active = false;
    this.spacing = CONFIG.strokeLimits.minSampleSpacing;
    this.pendingTail = null;
  }
}
