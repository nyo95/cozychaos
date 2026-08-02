import type { Vec2 } from '@cozy/shared';

/**
 * Pointer abstraction over mouse, pen, and touch.
 *
 * PRD §3 makes mouse the MVP input but requires the input architecture to
 * support touch from the start. Pointer Events give all three for free, so
 * nothing here is mouse-specific — the mobile port later becomes a layout
 * problem rather than an input rewrite.
 */

export interface PointerSample {
  /** Position in the coordinate space the mapper produced. */
  readonly position: Vec2;
  /** Milliseconds since the stroke began. */
  readonly elapsedMs: number;
}

export interface PointerStreamHandlers {
  onStart(sample: PointerSample): void;
  onMove(sample: PointerSample): void;
  onEnd(sample: PointerSample): void;
}

export interface PointerStreamOptions {
  /** Converts a client-space event position into game coordinates. */
  readonly toGameSpace: (clientX: number, clientY: number) => Vec2;
  readonly now?: () => number;
}

/**
 * Binds a drawing stream to an element and returns a disposer.
 *
 * Only the pointer that started the stroke is tracked. Without that check a
 * second finger or a stray tablet hover mid-stroke would splice its own
 * coordinates into the drawing.
 */
export function attachPointerStream(
  element: HTMLElement,
  handlers: PointerStreamHandlers,
  options: PointerStreamOptions,
): () => void {
  const now = options.now ?? (() => performance.now());
  let activePointerId: number | null = null;
  let startedAt = 0;

  const sample = (event: PointerEvent): PointerSample => ({
    position: options.toGameSpace(event.clientX, event.clientY),
    elapsedMs: now() - startedAt,
  });

  const onPointerDown = (event: PointerEvent): void => {
    if (activePointerId !== null) return;
    activePointerId = event.pointerId;
    startedAt = now();
    // Capture so a stroke that leaves the canvas still ends cleanly rather
    // than hanging forever in a half-drawn state.
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
    handlers.onStart(sample(event));
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    event.preventDefault();

    /**
     * Coalesced events matter for fairness, not smoothness. A 1000 Hz gaming
     * mouse fires many samples between frames; without them a fast stroke on
     * that mouse is described by fewer points than the same stroke on a 125 Hz
     * office mouse, and the two hands would not be reading the same shape.
     * PRD §7.4 requires tolerance across hardware.
     */
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    if (events.length > 0) {
      for (const coalesced of events) handlers.onMove(sample(coalesced));
    } else {
      handlers.onMove(sample(event));
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    handlers.onEnd(sample(event));
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerUp);
  };
}
