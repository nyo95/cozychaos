import { CONFIG, type LaunchPrediction } from '@cozy/shared';

export type CommitmentTone = 'fast' | 'balanced' | 'heavy';

/** Semantic copy derived only from the authoritative launch prediction. */
export function commitmentReadout(launch: LaunchPrediction): {
  readonly label: string;
  readonly detail: string;
  readonly tone: CommitmentTone;
} {
  const gap = CONFIG.player.spawnX * 2;
  if (launch.maxReach < gap * 0.55) {
    return { label: 'HEAVY · SHORT RANGE', detail: 'Lands close · holds ground', tone: 'heavy' };
  }
  if (launch.maxReach < gap * 1.05) {
    return { label: 'BALANCED', detail: 'Screens the space ahead', tone: 'balanced' };
  }
  return { label: 'FAST · LONG RANGE', detail: 'Light enough to reach your rival', tone: 'fast' };
}

export function windReadout(x: number): { readonly label: string; readonly direction: -1 | 0 | 1 } {
  if (Math.abs(x) < 1e-4) return { label: 'Calm', direction: 0 };
  const strength = Math.abs(x) >= 0.35 ? 'Strong' : Math.abs(x) >= 0.22 ? 'Steady' : 'Light';
  return { label: `${strength} wind ${x > 0 ? 'right' : 'left'}`, direction: x > 0 ? 1 : -1 };
}

export function wobbleLevel(wobble: number): 0 | 1 | 2 | 3 {
  const fraction = Math.max(0, Math.min(1, wobble / CONFIG.wobble.max));
  return Math.min(3, Math.ceil(fraction * 3)) as 0 | 1 | 2 | 3;
}
