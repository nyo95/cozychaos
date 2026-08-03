import { describe, expect, it } from 'vitest';
import { CONFIG, predictLaunch } from '@cozy/shared';
import { commitmentReadout, windReadout, wobbleLevel, wobblePipFills } from './matchPresentation.js';

describe('mobile match presentation', () => {
  it('translates authoritative Ink predictions without new gameplay math', () => {
    expect(commitmentReadout(predictLaunch(20)).label).toBe('FAST · LONG RANGE');
    expect(commitmentReadout(predictLaunch(40)).label).toBe('BALANCED');
    expect(commitmentReadout(predictLaunch(100)).label).toBe('HEAVY · SHORT RANGE');
  });

  it('describes wind as a radial field, not a left/right shove (M-02)', () => {
    // The sign stopped meaning "blows right" when wind became symmetric.
    // Saying "wind right" now would describe a mechanic that no longer exists.
    expect(windReadout(0)).toEqual({ label: 'Calm', direction: 0 });
    expect(windReadout(0.42)).toEqual({ label: 'Strong · pushing out', direction: 1 });
    expect(windReadout(-0.42)).toEqual({ label: 'Strong · drawing in', direction: -1 });
    expect(windReadout(-0.16).direction).toBe(-1);
  });

  it('derives strength names from the configured levels, not literals (T-04)', () => {
    // Hard-coded thresholds would mislabel silently the next time wind is
    // retuned, and no test would fail. These must follow CONFIG.
    const levels = CONFIG.wind.accelerationLevels.filter((level) => level !== 0);
    const weakest = Math.min(...levels);
    const strongest = Math.max(...levels);
    expect(windReadout(weakest).label.startsWith('Light')).toBe(true);
    expect(windReadout(strongest).label.startsWith('Strong')).toBe(true);
  });

  it('fills Wobble pips continuously so 34 and 66 differ (T-03)', () => {
    expect(wobblePipFills(0)).toEqual([0, 0, 0]);
    expect(wobblePipFills(CONFIG.wobble.max)).toEqual([1, 1, 1]);
    const low = wobblePipFills(34);
    const high = wobblePipFills(66);
    expect(low).not.toEqual(high);
    // Monotone: no pip may empty as Wobble rises.
    low.forEach((value, index) => expect(high[index]).toBeGreaterThanOrEqual(value));
  });

  it('maps Wobble to three non-health pips', () => {
    expect(wobbleLevel(0)).toBe(0);
    expect(wobbleLevel(CONFIG.wobble.max / 2)).toBe(2);
    expect(wobbleLevel(CONFIG.wobble.max)).toBe(3);
  });
});
