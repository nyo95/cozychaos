import type { SpellFamily } from '@cozy/shared';

/**
 * Colour palette. PRD §12.
 *
 * PRD §12 and §14 both insist colour is never the only cue: every spell must
 * also differ in shape and sound. These colours therefore sit alongside the
 * distinct preview silhouettes drawn in `arena.ts`, and are chosen at similar
 * luminance so that a colour-blind player loses no information the shape does
 * not already carry.
 */

export const PALETTE = {
  skyTop: '#2a3358',
  skyBottom: '#4c5b8c',
  cloud: 'rgba(190, 205, 240, 0.16)',
  islandTop: '#6f9a5c',
  islandGrass: '#8cba6e',
  islandRock: '#7d76a3',
  islandShadow: '#3c3a58',
  parchment: '#1d1b2b',
  parchmentEdge: '#3a3550',
  ink: '#efe4cc',
  inkDim: 'rgba(239, 228, 204, 0.55)',
  inkFaint: 'rgba(239, 228, 204, 0.18)',
  wizardRobe: '#c9d6f0',
  wizardHat: '#7e6fc4',
  wizardTrim: '#efe4cc',
  warning: '#e8a05f',
} as const;

/** One colour per spell family. PRD §12: cyan, magenta, amber, violet. */
export const SPELL_COLOURS: Readonly<Record<SpellFamily, string>> = {
  stroke: '#63d6ec',
  loop: '#f0b45c',
  spiral: '#a98cf0',
  angular: '#ef7fbf',
  wisp: '#d8cfe8',
};

export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
