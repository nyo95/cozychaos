/// <reference types="node" />
// The explicit reference is needed because the client project restricts
// `types` to vite/client. A `?raw` import would avoid it, but Vitest returns an
// empty string for `*.css?raw`, which would make this guard pass vacuously —
// exactly the failure mode it exists to prevent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@cozy/shared';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const styles = read('../styles.css');
const main = read('../main.ts');

/**
 * A-09 regression guard for the locked arena ratio.
 *
 * The honest thing to say about this test: it reads the stylesheet as text
 * rather than measuring a rendered box. A real measurement needs a browser, and
 * the check that matters — "does the canvas come out 2:3 on a phone" — should
 * ideally be a screenshot test in browser-enabled CI.
 *
 * It exists anyway because T-01 already happened once: the ratio was specified
 * in `PRD-AMENDMENTS` A-09 and in the plan, the constant was added to
 * `shared/config`, and the stylesheet still shipped `aspect-ratio: 16 / 9`
 * beside `height: 100dvh`. Nothing failed, and a phone paid 3.85x the vertical
 * Ink cost of a desktop. A grep-level guard would have caught exactly that.
 *
 * What it enforces:
 *   1. no rule sets the canvas aspect to `auto` or to a hardcoded ratio;
 *   2. no rule pins canvas *height* to viewport units, which overrides aspect;
 *   3. the ratio actually used comes from CONFIG, via the `--arena-aspect`
 *      custom property set in `main.ts`.
 */

/** Declaration blocks whose selector mentions `canvas`. */
function canvasBlocks(css: string): string[] {
  // Comments are stripped first: several of them mention `canvas` while
  // explaining the rule, and a comment is not a declaration.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  css = withoutComments;
  const blocks: string[] = [];
  const pattern = /([^{}]*canvas[^{}]*)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    blocks.push(`${match[1]!.trim()} { ${match[2]!.trim()} }`);
  }
  return blocks;
}

describe('the arena canvas ratio is locked to CONFIG (A-09)', () => {
  const blocks = canvasBlocks(styles);

  it('finds canvas rules to check, so the test cannot pass vacuously', () => {
    expect(blocks.length).toBeGreaterThan(2);
  });

  it('never releases the aspect ratio', () => {
    const offenders = blocks.filter((block) => /aspect-ratio:\s*auto/.test(block));
    expect(offenders, `aspect-ratio: auto lets the device decide the ratio:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('never hardcodes a ratio beside the configured one', () => {
    const offenders = blocks.filter((block) => {
      const declared = /aspect-ratio:\s*([^;]+);/.exec(block)?.[1] ?? '';
      return declared !== '' && !declared.includes('--arena-aspect');
    });
    expect(offenders, `ratio must come from --arena-aspect:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('never pins canvas height to the viewport, which would override the ratio', () => {
    const offenders = blocks.filter((block) =>
      /(^|[^-])height:\s*(?!auto)[^;]*(dvh|vh|100%)/.test(block.replace(/max-height:[^;]*;/g, '')),
    );
    expect(offenders, `canvas height must follow the ratio, not the viewport:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('publishes the configured ratio to CSS at boot', () => {
    expect(main).toContain('--arena-aspect');
    expect(main).toContain('CONFIG.camera.arenaAspectRatio');
  });

  it('agrees with the amended value', () => {
    // If A-09 is ever renegotiated, this is the line that should force the
    // conversation rather than letting the two drift apart.
    expect(CONFIG.camera.arenaAspectRatio).toBeCloseTo(2 / 3, 10);
  });
});
