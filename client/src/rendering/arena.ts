import { CONFIG, TAU, type SpellInstance, type Vec2 } from '@cozy/shared';
import { PALETTE, SPELL_COLOURS, withAlpha } from './palette.js';
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
  readonly spell: SpellInstance | null;
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
  if (state.spell) drawSpellPreview(ctx, viewport, state.spell, state.timeMs);
  drawStroke(ctx, viewport, state.stroke, state.spell);
}

function drawSky(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // Parallax cloud bands. PRD §12 asks for layered depth behind the island.
  ctx.fillStyle = PALETTE.cloud;
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

  ctx.fillStyle = PALETTE.islandRock;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.quadraticCurveTo(right.x - toPixels(viewport, 0.2), tip.y * 0.92, tip.x, tip.y);
  ctx.quadraticCurveTo(left.x + toPixels(viewport, 0.2), tip.y * 0.92, left.x, left.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.islandGrass;
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

  ctx.fillStyle = PALETTE.islandShadow;
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

  ctx.fillStyle = PALETTE.islandShadow;
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
  spell: SpellInstance | null,
): void {
  if (stroke.length < 2) return;
  const colour = spell ? SPELL_COLOURS[spell.family] : PALETTE.ink;

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

/**
 * Where the spell would appear and what it would do.
 *
 * Each family gets a distinct silhouette, not just a distinct colour — PRD §12
 * requires shape and sound to carry the identity so colour is never
 * load-bearing.
 */
function drawSpellPreview(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  spell: SpellInstance,
  timeMs: number,
): void {
  const colour = SPELL_COLOURS[spell.family];
  const origin = toScreen(viewport, spell.origin);
  const radius = Math.max(toPixels(viewport, spell.radius), 4);
  const pulse = 0.85 + 0.15 * Math.sin(timeMs / 320);

  ctx.save();

  if (spell.family === 'loop') {
    ctx.strokeStyle = withAlpha(colour, 0.9);
    ctx.fillStyle = withAlpha(colour, 0.14);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, radius * pulse, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (spell.family === 'spiral') {
    // Concentric arcs turning the way the player wound the stroke.
    ctx.strokeStyle = withAlpha(colour, 0.8);
    ctx.lineWidth = 2;
    const direction = spell.chirality === 0 ? 1 : spell.chirality;
    for (let ring = 1; ring <= 3; ring++) {
      const r = (radius * ring) / 3;
      const offset = (timeMs / 500) * direction + ring;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, r, offset, offset + TAU * 0.62);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(colour, 0.25);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, radius, 0, TAU);
    ctx.stroke();
  } else {
    // Projectile families: show the launch heading and, for Prism Shard, the
    // bounces the corners bought.
    const arrowLength = radius * 5;
    const tip = {
      x: origin.x + spell.direction.x * arrowLength,
      y: origin.y - spell.direction.y * arrowLength,
    };
    ctx.strokeStyle = withAlpha(colour, 0.85);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = withAlpha(colour, 0.95);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, radius * pulse, 0, TAU);
    ctx.fill();

    for (let i = 0; i < spell.bounces; i++) {
      ctx.beginPath();
      ctx.arc(origin.x + (i + 1) * 9 - 4, origin.y - radius * 3, 2.6, 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();
}
