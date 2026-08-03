import { describe, expect, it } from 'vitest';
import { CONFIG, predictLaunch } from '@cozy/shared';
import { commitmentReadout, windReadout, wobbleLevel } from './matchPresentation.js';

describe('mobile match presentation', () => {
  it('translates authoritative Ink predictions without new gameplay math', () => {
    expect(commitmentReadout(predictLaunch(20)).label).toBe('FAST · LONG RANGE');
    expect(commitmentReadout(predictLaunch(40)).label).toBe('BALANCED');
    expect(commitmentReadout(predictLaunch(100)).label).toBe('HEAVY · SHORT RANGE');
  });

  it('formats wind direction accessibly', () => {
    expect(windReadout(0)).toEqual({ label: 'Calm', direction: 0 });
    expect(windReadout(0.4)).toEqual({ label: 'Strong wind right', direction: 1 });
    expect(windReadout(-0.1).direction).toBe(-1);
  });

  it('maps Wobble to three non-health pips', () => {
    expect(wobbleLevel(0)).toBe(0);
    expect(wobbleLevel(CONFIG.wobble.max / 2)).toBe(2);
    expect(wobbleLevel(CONFIG.wobble.max)).toBe(3);
  });
});
