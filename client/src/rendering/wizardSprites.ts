import type { PlayerSlot } from '@cozy/shared';

export type WizardAnimation = 'idle' | 'cast';

interface AnimationSpec {
  readonly fileStem: string;
  readonly frameCount: number;
}

const ANIMATIONS: Readonly<Record<WizardAnimation, AnimationSpec>> = Object.freeze({
  idle: Object.freeze({ fileStem: 'idle-east', frameCount: 6 }),
  cast: Object.freeze({ fileStem: 'cast-east', frameCount: 8 }),
});

export const WIZARD_SPRITE_LAYOUT = Object.freeze({
  canvasSize: 176,
  pivotX: 92,
  pivotY: 131,
  worldCanvasSize: 0.56,
  idleFrameMs: 160,
});

export interface WizardSpriteFrame {
  readonly image: HTMLImageElement;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceSize: number;
}

const loadedSheets = new Map<string, HTMLImageElement>();
let preloadStarted = false;

function sheetPath(slot: PlayerSlot, animation: WizardAnimation): string {
  const team = slot === 0 ? 'cyan' : 'pink';
  const spec = ANIMATIONS[animation];
  return `/assets/pixellab-pilot/runtime/${team}-${spec.fileStem}.png`;
}

function createImage(path: string): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.src = path;
  return image;
}

/**
 * Starts decode early, but deliberately has no import-time browser side effect.
 * Vitest imports rendering helpers in Node, where `Image` does not exist.
 */
export function preloadWizardSprites(): void {
  if (preloadStarted || typeof Image === 'undefined') return;
  preloadStarted = true;
  for (const slot of [0, 1] as const) {
    for (const animation of ['idle', 'cast'] as const) {
      const path = sheetPath(slot, animation);
      loadedSheets.set(path, createImage(path));
    }
  }
}

export function wizardFrameIndex(
  animation: WizardAnimation,
  timeMs: number,
  castProgress = 0,
): number {
  const spec = ANIMATIONS[animation];
  if (animation === 'cast') {
    const progress = Math.max(0, Math.min(1, castProgress));
    return Math.min(spec.frameCount - 1, Math.floor(progress * spec.frameCount));
  }
  const elapsed = Math.max(0, timeMs);
  return Math.floor(elapsed / WIZARD_SPRITE_LAYOUT.idleFrameMs) % spec.frameCount;
}

/** Returns null until the requested frame has decoded; callers keep a fallback. */
export function wizardSpriteFrame(
  slot: PlayerSlot,
  animation: WizardAnimation,
  timeMs: number,
  castProgress = 0,
): WizardSpriteFrame | null {
  preloadWizardSprites();
  const index = wizardFrameIndex(animation, timeMs, castProgress);
  const image = loadedSheets.get(sheetPath(slot, animation));
  if (image?.complete && image.naturalWidth > 0) {
    return {
      image,
      sourceX: index * WIZARD_SPRITE_LAYOUT.canvasSize,
      sourceY: 0,
      sourceSize: WIZARD_SPRITE_LAYOUT.canvasSize,
    };
  }

  // A slow cast frame must not make the wizard disappear. Idle is the safe
  // image fallback; the caller still owns the procedural fallback below that.
  if (animation === 'cast') {
    const idleIndex = wizardFrameIndex('idle', timeMs);
    const idle = loadedSheets.get(sheetPath(slot, 'idle'));
    if (idle?.complete && idle.naturalWidth > 0) {
      return {
        image: idle,
        sourceX: idleIndex * WIZARD_SPRITE_LAYOUT.canvasSize,
        sourceY: 0,
        sourceSize: WIZARD_SPRITE_LAYOUT.canvasSize,
      };
    }
  }
  return null;
}
