import {
  CONFIG,
  composeStroke,
  type AssistLevel,
  type ForceBand,
  type Heading,
  type MotifKind,
  type StrokeComposition,
  type Vec2,
} from '@cozy/shared';
import { StrokeCapture } from '../drawing/strokeCapture.js';
import { attachPointerStream } from '../input/pointer.js';
import { drawScene } from '../rendering/arena.js';
import { StrokeTelemetry } from '../telemetry/strokeTelemetry.js';
import { createViewport, toArena, type Viewport } from '../rendering/viewport.js';

const CASTER_POSITION: Vec2 = { x: -0.55, y: 0.16 };

const MOTIF_ICONS: Readonly<Record<MotifKind, string>> = {
  thrust: '➜',
  loop: '○',
  spiral: '◎',
  bounce: '◇',
  unstable: '✦',
  wisp: '·',
};

const HEADING_LABELS: Readonly<Record<Heading, string>> = {
  N: 'North',
  NE: 'North-east',
  E: 'East',
  SE: 'South-east',
  S: 'South',
  SW: 'South-west',
  W: 'West',
  NW: 'North-west',
  none: 'Anchored',
};

const FORCE_LABELS: Readonly<Record<ForceBand, string>> = {
  ringan: 'Light',
  sedang: 'Medium',
  berat: 'Heavy',
};

interface Elements {
  readonly canvas: HTMLCanvasElement;
  readonly hint: HTMLElement;
  readonly inkFill: HTMLElement;
  readonly inkLabel: HTMLElement;
  readonly summaryTitle: HTMLElement;
  readonly summaryBlurb: HTMLElement;
  readonly summaryHeading: HTMLElement;
  readonly summaryForce: HTMLElement;
  readonly motifSequence: HTMLElement;
  readonly committedFill: HTMLElement;
  readonly reservedFill: HTMLElement;
  readonly committedLabel: HTMLElement;
  readonly reservedLabel: HTMLElement;
  readonly recordCount: HTMLElement;
  readonly exportButton: HTMLButtonElement;
  readonly assist: HTMLSelectElement;
}

/** Spell Lab V2: free composition, coarse preview, and local telemetry. */
export class SpellLab {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly capture = new StrokeCapture();
  private readonly telemetry = new StrokeTelemetry(createSessionId());
  private viewport: Viewport;
  private composition: StrokeComposition | null = null;
  private assist: AssistLevel = 'standard';
  private strokeIndex = 0;
  private frame = 0;
  private previewDirty = false;
  private hasCommitted = false;
  private currentStrokeCommitted = false;
  private strokeStartedAt = 0;

  constructor(private readonly elements: Elements) {
    const context = elements.canvas.getContext('2d');
    if (context === null) throw new Error('2D canvas context unavailable');
    this.ctx = context;
    this.viewport = createViewport(1, 1);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    elements.assist.addEventListener('change', () => {
      this.assist = elements.assist.value === 'high' ? 'high' : 'standard';
      if (this.hasCommitted) this.evaluate(this.capture.stroke, true);
    });
    elements.exportButton.addEventListener('click', () => this.exportTelemetry());

    attachPointerStream(
      elements.canvas,
      {
        onStart: (sample) => this.onStrokeStart(sample.position),
        onMove: (sample) => this.onStrokeMove(sample.position),
        onEnd: (sample) => this.onStrokeEnd(sample.position),
      },
      {
        toGameSpace: (clientX, clientY) => {
          const rect = elements.canvas.getBoundingClientRect();
          return toArena(this.viewport, clientX - rect.left, clientY - rect.top);
        },
      },
    );

    this.renderReadout();
    this.loop(0);
  }

  private onStrokeStart(point: Vec2): void {
    this.capture.begin(point);
    this.currentStrokeCommitted = false;
    this.strokeStartedAt = performance.now();
    this.composition = null;
    this.elements.hint.style.opacity = '0';
  }

  private onStrokeMove(point: Vec2): void {
    if (!this.capture.isDrawing) return;
    this.capture.extend(point);
    this.updateInk();
    this.previewDirty = true;
    if (!this.capture.isDrawing) this.commitStroke();
  }

  private onStrokeEnd(finalPoint: Vec2): void {
    if (this.currentStrokeCommitted) return;
    if (this.capture.isDrawing) this.capture.extend(finalPoint);
    this.updateInk();
    this.commitStroke();
  }

  private commitStroke(): void {
    if (this.currentStrokeCommitted) return;
    this.currentStrokeCommitted = true;
    const stroke = this.capture.end();
    this.previewDirty = false;
    this.hasCommitted = true;
    this.evaluate(stroke, true);

    if (this.composition !== null) {
      this.telemetry.record({
        index: this.strokeIndex,
        motifs: this.composition.motifs,
        summary: this.composition.recipe.summary,
        drawMs: performance.now() - this.strokeStartedAt,
        points: stroke,
        assist: this.assist,
      });
      this.renderTelemetryStatus();
    }
    this.strokeIndex++;
  }

  private evaluate(stroke: readonly Vec2[], commit: boolean): void {
    if (!commit && stroke.length < CONFIG.strokeLimits.minPoints) {
      this.composition = null;
      this.renderReadout();
      return;
    }
    this.composition = composeStroke(stroke, { assist: this.assist });
    this.renderReadout();
  }

  private updateInk(): void {
    const reserved = this.capture.inkFraction;
    this.elements.inkFill.style.width = `${(reserved * 100).toFixed(1)}%`;
    this.elements.inkFill.classList.toggle('is-low', reserved < CONFIG.ink.warnFraction);
    this.elements.inkLabel.textContent = this.capture.exhausted
      ? 'No reserve'
      : `Reserve ${Math.round(reserved * 100)}%`;
  }

  private renderReadout(): void {
    const elements = this.elements;
    if (this.composition === null) {
      elements.summaryTitle.textContent = this.hasCommitted ? 'Draw another spell' : 'Draw freely';
      elements.summaryBlurb.textContent = 'Your geometry becomes force. What you do not spend stays in reserve.';
      elements.summaryHeading.textContent = '—';
      elements.summaryForce.textContent = '—';
      elements.motifSequence.replaceChildren();
      this.renderInkSplit(0, CONFIG.ink.total);
      return;
    }

    const summary = this.composition.recipe.summary;
    const heading = HEADING_LABELS[summary.heading];
    const force = FORCE_LABELS[summary.force];
    elements.summaryTitle.textContent = summary.heading === 'none' ? `${force} anchored magic` : `${force} magic · ${heading}`;
    elements.summaryBlurb.textContent = `${summary.shape.length} force component${summary.shape.length === 1 ? '' : 's'}, released in drawing order.`;
    elements.summaryHeading.textContent = heading;
    elements.summaryForce.textContent = force;
    elements.motifSequence.replaceChildren(
      ...summary.shape.map((kind, index) => {
        const icon = document.createElement('span');
        icon.className = 'motif-icon';
        icon.textContent = MOTIF_ICONS[kind];
        icon.setAttribute('aria-label', `Shape component ${index + 1}`);
        return icon;
      }),
    );
    this.renderInkSplit(summary.inkCommitted, summary.inkReserved);
  }

  private renderInkSplit(committed: number, reserved: number): void {
    const committedFraction = committed / CONFIG.ink.total;
    const reservedFraction = reserved / CONFIG.ink.total;
    this.elements.committedFill.style.width = `${committedFraction * 100}%`;
    this.elements.reservedFill.style.width = `${reservedFraction * 100}%`;
    this.elements.committedLabel.textContent = `${Math.round(committed)} committed`;
    this.elements.reservedLabel.textContent = `${Math.round(reserved)} reserved`;
  }

  private renderTelemetryStatus(): void {
    this.elements.recordCount.textContent = String(this.telemetry.count);
    this.elements.exportButton.disabled = this.telemetry.count === 0;
  }

  private exportTelemetry(): void {
    if (this.telemetry.count === 0) return;
    const blob = new Blob([this.telemetry.toJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `spell-lab-${this.telemetry.sessionId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
    if (this.previewDirty) {
      this.previewDirty = false;
      this.evaluate(this.capture.stroke, false);
    }
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    drawScene(this.ctx, this.viewport, {
      casterPosition: CASTER_POSITION,
      stroke: this.capture.stroke,
      recipe: this.composition?.recipe ?? null,
      timeMs,
    });
    this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
  }
}

function createSessionId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}`;
}

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
    summaryTitle: byId('summary-title'),
    summaryBlurb: byId('summary-blurb'),
    summaryHeading: byId('summary-heading'),
    summaryForce: byId('summary-force'),
    motifSequence: byId('motif-sequence'),
    committedFill: byId('committed-fill'),
    reservedFill: byId('reserved-fill'),
    committedLabel: byId('committed-label'),
    reservedLabel: byId('reserved-label'),
    recordCount: byId('record-count'),
    exportButton: byId<HTMLButtonElement>('export-data'),
    assist: byId<HTMLSelectElement>('assist'),
  });
}
