import type {
  AssistLevel,
  MotifKind,
  MotifOccurrence,
  RecipeSummary,
  Vec2,
} from '@cozy/shared';

export interface StrokeRecord {
  readonly sessionId: string;
  readonly index: number;
  readonly motifs: readonly { readonly kind: MotifKind; readonly from: number; readonly size: number }[];
  readonly inkCommitted: number;
  readonly inkReserved: number;
  readonly summary: RecipeSummary;
  readonly drawMs: number;
  readonly pointCount: number;
  readonly assist: AssistLevel;
  /**
   * Required for replay and retuning. Recognised motifs alone cannot reveal a
   * motif the detector missed, so an export without the original points would
   * preserve the algorithm's opinion rather than the player's drawing.
   */
  readonly points: readonly Vec2[];
}

export interface RecordStrokeInput {
  readonly index: number;
  readonly motifs: readonly MotifOccurrence[];
  readonly summary: RecipeSummary;
  readonly drawMs: number;
  readonly points: readonly Vec2[];
  readonly assist: AssistLevel;
}

/** Local-only playtest telemetry. Nothing leaves the browser automatically. */
export class StrokeTelemetry {
  private readonly entries: StrokeRecord[] = [];

  constructor(readonly sessionId: string) {}

  get count(): number {
    return this.entries.length;
  }

  get records(): readonly StrokeRecord[] {
    return this.entries;
  }

  record(input: RecordStrokeInput): StrokeRecord {
    const record: StrokeRecord = Object.freeze({
      sessionId: this.sessionId,
      index: input.index,
      motifs: Object.freeze(
        input.motifs.map((motif) =>
          Object.freeze({ kind: motif.kind, from: motif.from, size: motif.size }),
        ),
      ),
      inkCommitted: input.summary.inkCommitted,
      inkReserved: input.summary.inkReserved,
      summary: Object.freeze({ ...input.summary, shape: Object.freeze([...input.summary.shape]) }),
      drawMs: Math.max(0, Math.round(input.drawMs)),
      pointCount: input.points.length,
      assist: input.assist,
      points: Object.freeze(input.points.map((point) => Object.freeze({ ...point }))),
    });
    this.entries.push(record);
    return record;
  }

  toJSON(): string {
    return JSON.stringify(
      {
        schemaVersion: 1,
        sessionId: this.sessionId,
        strokes: this.entries,
      },
      null,
      2,
    );
  }
}
