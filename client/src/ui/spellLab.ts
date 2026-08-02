import {
  CONFIG,
  classifyStroke,
  createRandom,
  deriveSeed,
  mapToSpell,
  type AssistLevel,
  type Classification,
  type SpellFamily,
  type SpellInstance,
  type Vec2,
} from '@cozy/shared';
import { StrokeCapture } from '../drawing/strokeCapture.js';
import { attachPointerStream } from '../input/pointer.js';
import { drawScene } from '../rendering/arena.js';
import { SPELL_COLOURS } from '../rendering/palette.js';
import { createViewport, toArena, type Viewport } from '../rendering/viewport.js';

/**
 * Stage 0 — the Spell Lab. PRD §18.
 *
 * "Satu layar offline untuk menggambar dan melihat klasifikasi serta parameter
 * spell. Lulus jika: minimal 90% pemain uji dapat menghasilkan empat keluarga
 * spell setelah tutorial singkat, tanpa bantuan developer."
 *
 * The discovery tracker on the right is not decoration — it is the exit
 * criterion made visible. A tester either lights up all four families or does
 * not, and the screen says which, so the gate can be judged by watching rather
 * than by asking. The hints stay deliberately terse: if a player needs the
 * paragraph, the classifier is what needs fixing, not the copy.
 */

/** Where the wizard stands. Spells from open strokes launch from here (A-05). */
const CASTER_POSITION: Vec2 = { x: -0.55, y: 0.16 };

const FAMILY_HINTS: Readonly<Record<SpellFamily, string>> = {
  stroke: 'a straight line',
  loop: 'a closed ring',
  spiral: 'wind it inward',
  angular: 'sharp zigzag',
  wisp: 'anything else',
};

const DISCOVERABLE: readonly SpellFamily[] = ['stroke', 'loop', 'spiral', 'angular'];

interface Elements {
  readonly canvas: HTMLCanvasElement;
  readonly hint: HTMLElement;
  readonly inkFill: HTMLElement;
  readonly inkLabel: HTMLElement;
  readonly family: HTMLElement;
  readonly blurb: HTMLElement;
  readonly confidenceFill: HTMLElement;
  readonly confidenceLabel: HTMLElement;
  readonly params: HTMLElement;
  readonly families: HTMLElement;
  readonly familiesNote: HTMLElement;
  readonly discoveredCount: HTMLElement;
  readonly assist: HTMLSelectElement;
}

export class SpellLab {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly capture = new StrokeCapture();
  private readonly discovered = new Set<SpellFamily>();
  private viewport: Viewport;
  private classification: Classification | null = null;
  private spell: SpellInstance | null = null;
  private assist: AssistLevel = 'standard';
  private strokeIndex = 0;
  private frame = 0;

  constructor(private readonly elements: Elements) {
    const context = elements.canvas.getContext('2d');
    if (context === null) throw new Error('2D canvas context unavailable');
    this.ctx = context;
    this.viewport = createViewport(1, 1);

    this.renderFamilyList();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    elements.assist.addEventListener('change', () => {
      this.assist = elements.assist.value === 'high' ? 'high' : 'standard';
      // Re-read the stroke already on screen so the effect of the setting is
      // immediately visible rather than deferred to the next drawing.
      this.evaluate(this.capture.stroke);
    });

    attachPointerStream(
      elements.canvas,
      {
        onStart: (sample) => this.onStrokeStart(sample.position),
        onMove: (sample) => this.onStrokeMove(sample.position),
        onEnd: () => this.onStrokeEnd(),
      },
      {
        toGameSpace: (clientX, clientY) => {
          const rect = elements.canvas.getBoundingClientRect();
          return toArena(this.viewport, clientX - rect.left, clientY - rect.top);
        },
      },
    );

    this.loop(0);
  }

  private onStrokeStart(point: Vec2): void {
    this.capture.begin(point);
    this.classification = null;
    this.spell = null;
    this.elements.hint.style.opacity = '0';
  }

  private onStrokeMove(point: Vec2): void {
    if (!this.capture.isDrawing) return;
    this.capture.extend(point);
    this.updateInk();

    /**
     * The live preview PRD §14 asks for: a thin indication of where the spell
     * is heading before the stroke is committed, without spelling out the
     * final trajectory. It runs the same shared classifier the server will run
     * (PRD §15), so what the player sees mid-stroke cannot contradict the
     * verdict they get on release.
     */
    this.evaluate(this.capture.stroke);

    if (!this.capture.isDrawing) this.onStrokeEnd();
  }

  private onStrokeEnd(): void {
    const stroke = this.capture.end();
    this.evaluate(stroke);
    if (this.classification !== null) this.recordDiscovery(this.classification.family);
    this.strokeIndex++;
  }

  /**
   * Classifies and maps a stroke. Pure inputs in, display out.
   *
   * PRD §21 requires all randomness to be seeded. The per-stroke seed is
   * derived from a fixed lab seed and the stroke index, so drawing the same
   * shape twice in a row produces the same variance and a tester comparing two
   * attempts is comparing their drawing, not the dice.
   */
  private evaluate(stroke: readonly Vec2[]): void {
    if (stroke.length < CONFIG.strokeLimits.minPoints) {
      this.classification = null;
      this.spell = null;
      this.renderReadout();
      return;
    }

    const classification = classifyStroke(stroke, { assist: this.assist });
    const random = createRandom(deriveSeed(LAB_SEED, `stroke:${this.strokeIndex}`));
    const spell = mapToSpell(classification, {
      casterPosition: CASTER_POSITION,
      seededUnit: random.next(),
    });

    this.classification = classification;
    this.spell = spell;
    this.renderReadout();
  }

  private recordDiscovery(family: SpellFamily): void {
    if (!DISCOVERABLE.includes(family) || this.discovered.has(family)) return;
    this.discovered.add(family);
    this.renderFamilyList();
  }

  private updateInk(): void {
    const fraction = this.capture.inkFraction;
    this.elements.inkFill.style.width = `${(fraction * 100).toFixed(1)}%`;
    this.elements.inkFill.classList.toggle('is-low', fraction < CONFIG.ink.warnFraction);
    this.elements.inkLabel.textContent = this.capture.exhausted
      ? 'Out of ink'
      : `Ink ${Math.round(fraction * 100)}%`;
  }

  private renderReadout(): void {
    const { family, blurb, confidenceFill, confidenceLabel, params } = this.elements;

    if (this.classification === null || this.spell === null) {
      family.textContent = 'Draw something';
      family.style.color = '';
      blurb.textContent = 'Any single line becomes a spell.';
      confidenceFill.style.width = '0%';
      confidenceLabel.textContent = '—';
      params.replaceChildren();
      return;
    }

    const spell = this.spell;
    const definition = CONFIG.spells[spell.family];
    const colour = SPELL_COLOURS[spell.family];

    family.textContent = definition.name;
    family.style.color = colour;
    blurb.textContent = definition.blurb;

    const confidence = this.classification.confidence;
    confidenceFill.style.width = `${(confidence * 100).toFixed(0)}%`;
    confidenceFill.parentElement!.style.color = colour;
    confidenceLabel.textContent = this.classification.fellBackToWisp
      ? 'unreadable — fell back'
      : `${Math.round(confidence * 100)}% sure`;

    const features = this.classification.features;
    const rows: Array<[string, string]> = [
      ['Size', features.size.toFixed(2)],
      ['Ink spent', `${Math.round(this.capture.inkUsed)} / ${CONFIG.ink.total}`],
      ['Radius', spell.radius.toFixed(3)],
      ['Mass', spell.mass.toFixed(2)],
      ['Knockback', spell.knockback.toFixed(2)],
      ['Spin', spell.spin.toFixed(2)],
      ['Bounces', String(spell.bounces)],
      ['Spawn', spell.originClamped ? 'centroid (pulled in)' : definition.spawn],
    ];

    if (spell.direction.x !== 0 || spell.direction.y !== 0) {
      const degrees = (Math.atan2(spell.direction.y, spell.direction.x) * 180) / Math.PI;
      rows.splice(2, 0, ['Aim', `${degrees.toFixed(0)}°`]);
    }
    if (spell.chirality !== 0) {
      rows.push(['Swirl', spell.chirality > 0 ? 'counter-clockwise' : 'clockwise']);
    }

    params.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }

  private renderFamilyList(): void {
    const { families, familiesNote, discoveredCount } = this.elements;

    families.replaceChildren(
      ...DISCOVERABLE.map((family) => {
        const item = document.createElement('li');
        const found = this.discovered.has(family);
        item.classList.toggle('is-found', found);
        item.style.color = SPELL_COLOURS[family];

        const dot = document.createElement('span');
        dot.className = 'dot';

        const name = document.createElement('span');
        name.textContent = found ? CONFIG.spells[family].name : '???';
        name.style.color = 'var(--ink)';

        const how = document.createElement('span');
        how.className = 'how';
        how.textContent = FAMILY_HINTS[family];

        item.append(dot, name, how);
        return item;
      }),
    );

    discoveredCount.textContent = `${this.discovered.size}/${DISCOVERABLE.length}`;
    const complete = this.discovered.size === DISCOVERABLE.length;
    familiesNote.classList.toggle('is-complete', complete);
    familiesNote.textContent = complete
      ? 'All four found. Stage 0 does what it promised.'
      : 'Find all four and the lab is proven.';
  }

  /**
   * Resizes the backing store to device pixels.
   *
   * Without this the canvas is drawn at CSS resolution and upscaled, which
   * blurs the line the player is drawing — and the line is the entire game.
   */
  private resize(): void {
    const canvas = this.elements.canvas;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.viewport = createViewport(rect.width, rect.height);
  }

  private loop(timeMs: number): void {
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    drawScene(this.ctx, this.viewport, {
      casterPosition: CASTER_POSITION,
      stroke: this.capture.stroke,
      spell: this.spell,
      timeMs,
    });
    this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
  }
}

/** Fixed so the lab is reproducible between sessions. PRD §21. */
const LAB_SEED = 0x50e11;

export function mountSpellLab(): SpellLab {
  const byId = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (element === null) throw new Error(`missing element #${id}`);
    return element as T;
  };

  return new SpellLab({
    canvas: byId<HTMLCanvasElement>('arena'),
    hint: byId('hint'),
    inkFill: byId('ink-fill'),
    inkLabel: byId('ink-label'),
    family: byId('family'),
    blurb: byId('blurb'),
    confidenceFill: byId('confidence-fill'),
    confidenceLabel: byId('confidence-label'),
    params: byId('params'),
    families: byId('families'),
    familiesNote: byId('families-note'),
    discoveredCount: byId('discovered-count'),
    assist: byId<HTMLSelectElement>('assist'),
  });
}
