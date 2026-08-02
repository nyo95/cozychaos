import { CONFIG, TAU, type Heading, type SpellRecipe, type Vec2 } from '@cozy/shared';
import { PALETTE, withAlpha } from './palette.js';
import { toPixels, toScreen, type Viewport } from './viewport.js';

/**
 * Canvas renderer for the Spell Lab.
 *
 * Stage 0 needs one screen showing a drawing and the spell it produces
 * (PRD §18), so this uses 2D canvas rather than the Three.js renderer that
 * PRD §15 locks in for the game client. Introducing a 3D scene graph, camera,
 * and asset pipeline before the drawing system is proven would invert the
 * stage gate that PRD §20 exists to enforce.
 *
 * Nothing here influences classification or spell parameters. PRD §21:
 * "Renderer tidak boleh menentukan skor atau collision." The renderer is
 * handed a finished `SpellInstance` and only draws it.
 */

export interface SceneState {
  readonly casterPosition: Vec2;
  readonly stroke: readonly Vec2[];
  readonly recipe: SpellRecipe | null;
  /** Drives idle motion in the preview. Milliseconds since load. */
  readonly timeMs: number;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  state: SceneState,
): void {
  drawSky(ctx, viewport);
  drawIsland(ctx, viewport);
  drawWizard(ctx, viewport, state.casterPosition);
  if (state.recipe) drawCoarsePreview(ctx, viewport, state.casterPosition, state.recipe, state.timeMs);
  drawStroke(ctx, viewport, state.stroke);
}

function drawSky(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
  gradient.addColorStop(0, PALETTE.skyZenith);
  gradient.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // Parallax cloud bands. PRD §12 asks for layered depth behind the island.
  ctx.fillStyle = PALETTE.cloudLight;
  for (let i = 0; i < 4; i++) {
    const y = viewport.height * (0.12 + i * 0.11);
    const w = viewport.width * (0.32 + i * 0.13);
    const x = viewport.width * (i % 2 === 0 ? 0.08 : 0.52);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y, w / 2, viewport.height * 0.035, 0, 0, TAU);
    ctx.fill();
  }
}

/** A floating dream island. PRD §12 — "potongan pulau mimpi yang mengambang". */
function drawIsland(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
  const half = CONFIG.arena.halfWidth;
  const left = toScreen(viewport, { x: -half, y: 0 });
  const right = toScreen(viewport, { x: half, y: 0 });
  const tip = toScreen(viewport, { x: 0, y: -0.62 });
  const surfaceHeight = toPixels(viewport, 0.055);

  ctx.fillStyle = PALETTE.rockMid;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.quadraticCurveTo(right.x - toPixels(viewport, 0.2), tip.y * 0.92, tip.x, tip.y);
  ctx.quadraticCurveTo(left.x + toPixels(viewport, 0.2), tip.y * 0.92, left.x, left.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.grassMid;
  ctx.beginPath();
  ctx.ellipse(
    (left.x + right.x) / 2,
    left.y,
    (right.x - left.x) / 2,
    surfaceHeight,
    0,
    0,
    TAU,
  );
  ctx.fill();

  // The edge of the safe zone: crossing it is a knock-out (PRD §5.2), so it
  // must be visible rather than implied.
  ctx.strokeStyle = PALETTE.inkFaint;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  for (const x of [-half, half]) {
    const edge = toScreen(viewport, { x, y: 0 });
    ctx.beginPath();
    ctx.moveTo(edge.x, edge.y);
    ctx.lineTo(edge.x, 0);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Chibi apprentice mage: big hat, short body, readable silhouette. PRD §12. */
function drawWizard(ctx: CanvasRenderingContext2D, viewport: Viewport, position: Vec2): void {
  const base = toScreen(viewport, position);
  const unit = toPixels(viewport, 0.075);

  ctx.fillStyle = PALETTE.rockDeep;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + unit * 0.15, unit * 0.85, unit * 0.25, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = PALETTE.wizardRobe;
  ctx.beginPath();
  ctx.moveTo(base.x - unit * 0.7, base.y);
  ctx.lineTo(base.x + unit * 0.7, base.y);
  ctx.lineTo(base.x + unit * 0.4, base.y - unit * 1.15);
  ctx.lineTo(base.x - unit * 0.4, base.y - unit * 1.15);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(base.x, base.y - unit * 1.4, unit * 0.52, 0, TAU);
  ctx.fill();

  // Oversized hat — the silhouette cue that has to survive at small sizes.
  ctx.fillStyle = PALETTE.wizardHat;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y - unit * 1.72, unit * 0.95, unit * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(base.x - unit * 0.62, base.y - unit * 1.75);
  ctx.quadraticCurveTo(base.x - unit * 0.1, base.y - unit * 3.1, base.x + unit * 0.5, base.y - unit * 2.5);
  ctx.lineTo(base.x + unit * 0.62, base.y - unit * 1.75);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.rockDeep;
  ctx.beginPath();
  ctx.arc(base.x - unit * 0.17, base.y - unit * 1.42, unit * 0.07, 0, TAU);
  ctx.arc(base.x + unit * 0.17, base.y - unit * 1.42, unit * 0.07, 0, TAU);
  ctx.fill();
}

/**
 * The player's line, tinted by the family it is currently reading as.
 *
 * PRD §12: "Spell memakai garis bercahaya yang mempertahankan karakter gambar
 * pemain." The drawn line is not replaced by a generic effect — it stays on
 * screen as the spell's own shape.
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  stroke: readonly Vec2[],
): void {
  if (stroke.length < 2) return;
  const colour = PALETTE.ink;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Glow pass then core pass — cheap, and it keeps the line legible against
  // both the bright grass and the dark sky.
  for (const [width, alpha] of [
    [9, 0.22],
    [4.5, 0.55],
    [2, 1],
  ] as const) {
    ctx.strokeStyle = withAlpha(colour, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    const first = toScreen(viewport, stroke[0]!);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.length; i++) {
      const p = toScreen(viewport, stroke[i]!);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

/** Rough direction + commitment only. Detailed trajectory is Resolve's chaos. */
function drawCoarsePreview(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  casterPosition: Vec2,
  recipe: SpellRecipe,
  timeMs: number,
): void {
  const direction = headingVector(recipe.summary.heading);
  const origin = toScreen(viewport, casterPosition);
  const forceLength = recipe.summary.force === 'berat' ? 0.42 : recipe.summary.force === 'sedang' ? 0.3 : 0.2;
  const length = toPixels(viewport, forceLength);
  const pulse = 0.75 + 0.25 * Math.sin(timeMs / 340);
  ctx.save();
  ctx.strokeStyle = withAlpha(PALETTE.ink, 0.65);
  ctx.fillStyle = withAlpha(PALETTE.ink, 0.8);
  ctx.lineWidth = 2;

  if (recipe.summary.heading === 'none') {
    ctx.beginPath();
    ctx.arc(origin.x, origin.y - toPixels(viewport, 0.12), toPixels(viewport, 0.06) * pulse, 0, TAU);
    ctx.stroke();
  } else {
    const tip = {
      x: origin.x + direction.x * length,
      y: origin.y - direction.y * length,
    };
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3 + pulse * 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function headingVector(heading: Heading): Vec2 {
  const diagonal = Math.SQRT1_2;
  const vectors: Readonly<Record<Heading, Vec2>> = {
    N: { x: 0, y: 1 },
    NE: { x: diagonal, y: diagonal },
    E: { x: 1, y: 0 },
    SE: { x: diagonal, y: -diagonal },
    S: { x: 0, y: -1 },
    SW: { x: -diagonal, y: -diagonal },
    W: { x: -1, y: 0 },
    NW: { x: -diagonal, y: diagonal },
    none: { x: 0, y: 0 },
  };
  return vectors[heading];
}
