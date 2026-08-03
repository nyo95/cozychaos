import { describe, expect, it } from 'vitest';
import { isTextEntryTarget, resolveDirection } from './moveControls.js';

/**
 * The pure half of the movement pad. The DOM half is exercised by the room
 * tests through the protocol; this covers the one decision that has a wrong
 * answer players would actually notice.
 */
describe('resolveDirection', () => {
  it('reports the held side', () => {
    expect(resolveDirection(true, false)).toBe(-1);
    expect(resolveDirection(false, true)).toBe(1);
  });

  it('reports neutral when nothing is held', () => {
    expect(resolveDirection(false, false)).toBe(0);
  });

  it('reports neutral when both are held rather than picking a winner', () => {
    // Pressing two opposing directions means standing still. Choosing the more
    // recent press would make a fumbled thumb send the wizard the wrong way
    // during a 3-second phase.
    expect(resolveDirection(true, true)).toBe(0);
  });
});

/**
 * Regression guard: the movement keys (W/A/D, space, arrows) also double as
 * characters, and the window-level listeners preventDefault() on every match.
 * While typing in a form — notably the lobby room-code input — the handler must
 * bow out, or codes containing those letters cannot be entered.
 */
describe('isTextEntryTarget', () => {
  it('claims form fields that receive typed characters', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it('ignores the canvas, buttons, and a null target so movement still works', () => {
    expect(isTextEntryTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget({ isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
