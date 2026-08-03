import { describe, expect, it } from 'vitest';
import {
  crystalObstacleImage,
  floatingIslandImage,
  mobileSkyImage,
  preloadSceneAssets,
  runeNodeImage,
} from './sceneAssets.js';

describe('scene assets', () => {
  it('keeps rendering imports safe when Image is unavailable in Node', () => {
    expect(typeof Image).toBe('undefined');
    expect(() => preloadSceneAssets()).not.toThrow();
    expect(mobileSkyImage()).toBeNull();
    expect(floatingIslandImage()).toBeNull();
    expect(crystalObstacleImage()).toBeNull();
    expect(runeNodeImage(0)).toBeNull();
    expect(runeNodeImage(1)).toBeNull();
  });
});
