import { describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '@cozy/shared';
import { attachPointerStream, type PointerSample } from './pointer.js';

type PointerListener = (event: PointerEvent) => void;

class FakeElement {
  private readonly listeners = new Map<string, Set<PointerListener>>();
  private readonly captured = new Set<number>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callbacks = this.listeners.get(type) ?? new Set<PointerListener>();
    callbacks.add(listener as PointerListener);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as PointerListener);
  }

  setPointerCapture(pointerId: number): void {
    this.captured.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.captured.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.captured.delete(pointerId);
  }

  emit(type: string, event: PointerEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function pointer(pointerId: number, clientX: number, clientY: number): PointerEvent {
  return {
    pointerId,
    clientX,
    clientY,
    preventDefault: vi.fn(),
    getCoalescedEvents: () => [],
  } as unknown as PointerEvent;
}

function collect(element: FakeElement): {
  readonly starts: PointerSample[];
  readonly moves: PointerSample[];
  readonly ends: PointerSample[];
} {
  const starts: PointerSample[] = [];
  const moves: PointerSample[] = [];
  const ends: PointerSample[] = [];
  attachPointerStream(
    element as unknown as HTMLElement,
    {
      onStart: (sample) => starts.push(sample),
      onMove: (sample) => moves.push(sample),
      onEnd: (sample) => ends.push(sample),
    },
    {
      toGameSpace: (x, y): Vec2 => ({ x, y }),
      now: () => 100,
    },
  );
  return { starts, moves, ends };
}

describe('pointer release', () => {
  it('forwards the release coordinate as the true final sample', () => {
    const element = new FakeElement();
    const samples = collect(element);

    element.emit('pointerdown', pointer(7, 10, 20));
    element.emit('pointerup', pointer(7, 240, 75));

    expect(samples.starts[0]?.position).toEqual({ x: 10, y: 20 });
    expect(samples.ends).toHaveLength(1);
    expect(samples.ends[0]?.position).toEqual({ x: 240, y: 75 });
  });

  it('ends a pointer only once when a later cancel arrives', () => {
    const element = new FakeElement();
    const samples = collect(element);

    element.emit('pointerdown', pointer(3, 0, 0));
    element.emit('pointerup', pointer(3, 1, 1));
    element.emit('pointercancel', pointer(3, 2, 2));

    expect(samples.ends).toHaveLength(1);
  });
});
