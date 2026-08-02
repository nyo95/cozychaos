import { describe, expect, it } from 'vitest';
import { wizardFrameIndex } from './wizardSprites.js';

describe('wizard sprite timing', () => {
  it('loops idle deterministically', () => {
    expect(wizardFrameIndex('idle', 0)).toBe(0);
    expect(wizardFrameIndex('idle', 159)).toBe(0);
    expect(wizardFrameIndex('idle', 160)).toBe(1);
    expect(wizardFrameIndex('idle', 960)).toBe(0);
  });

  it('plays cast once from phase progress and clamps its ends', () => {
    expect(wizardFrameIndex('cast', 0, -1)).toBe(0);
    expect(wizardFrameIndex('cast', 0, 0.5)).toBe(4);
    expect(wizardFrameIndex('cast', 0, 0.999)).toBe(7);
    expect(wizardFrameIndex('cast', 0, 2)).toBe(7);
  });
});
