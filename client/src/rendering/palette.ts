import type { SpellFamily } from '@cozy/shared';

/**
 * Colour palette. PRD §12.
 *
 * Rebuilt in Session 12 for the "pulau mimpi terapung" arena PRD §1 describes.
 * The previous grey cave contradicted both §1 and pillar §4.2 ("Cozy chaos"),
 * and its low-contrast background was the real reason spell matter was hard to
 * read on a phone — the fix is a warmer, lighter sky, not brighter particles.
 *
 * PRD §12 and §14 both insist colour is never the only cue: every element also
 * differs in shape and motion. These hues sit at similar luminance so that a
 * colour-blind player loses no information the silhouette does not carry.
 */

export const PALETTE = {
  // Dusk sky, zenith down to horizon.
  skyZenith: '#241f47',
  skyUpper: '#453a72',
  skyMid: '#8a5c88',
  skyHorizon: '#e0956f',
  skyGlow: '#ffcf9b',

  aurora: ['#7ee8d5', '#8fa8f0', '#d69bf0'] as const,
  star: '#fff4dc',

  cloudLight: 'rgba(255, 226, 208, 0.26)',
  cloudDark: 'rgba(88, 66, 114, 0.24)',

  farIsland: '#463a6e',
  farIslandTop: '#6d6098',

  grassLight: '#a8dc79',
  grassMid: '#7abb5d',
  grassDeep: '#4f8a48',
  rockLight: '#8d7fa8',
  rockMid: '#6b5d87',
  rockDeep: '#42375c',
  rootVine: '#5f8f52',
  blossom: '#ffd2e8',

  crystalCore: '#c6f6ff',
  crystalFace: '#7cc7e8',
  crystalDeep: '#3f6fa4',
  crystalRim: '#eafcff',

  ink: '#fff3dc',
  inkDim: 'rgba(255, 243, 220, 0.55)',
  inkFaint: 'rgba(255, 243, 220, 0.18)',

  wizardRobe: '#f4f1ff',
  wizardRobeShade: '#cbc4ea',
  // Stage 0's Spell Lab has no player slots, so its wizard needs a fixed hat
  // colour; the match renderer tints the hat by slot instead.
  wizardHat: '#7e6fc4',
  wizardSkin: '#f6d9c0',
  wizardTrim: '#fff3dc',
  warning: '#ffb867',
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

/** Blends two hex colours, so facet shading needs no extra constants. */
export function mix(from: string, to: string, amount: number): string {
  const parse = (hex: string): readonly [number, number, number] => {
    const value = hex.replace('#', '');
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ] as const;
  };
  const [ar, ag, ab] = parse(from);
  const [br, bg, bb] = parse(to);
  const t = Math.max(0, Math.min(1, amount));
  const channel = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return `rgb(${channel(ar, br)}, ${channel(ag, bg)}, ${channel(ab, bb)})`;
}
