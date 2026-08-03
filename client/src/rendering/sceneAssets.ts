const SCENE_ASSET_PATHS = Object.freeze({
  mobileSky: '/assets/mobile-ui/backgrounds/mobile-dream-sky.png',
  floatingIsland: '/assets/mobile-ui/candidates/gameplay-art-v2/floating-island-v2.png',
  crystalObstacle: '/assets/mobile-ui/candidates/gameplay-art-v2/crystal-obstacle-v2.png',
  runeNodeCyan: '/assets/mobile-ui/candidates/gameplay-art-v2/rune-node-cyan-v2.png',
  runeNodePink: '/assets/mobile-ui/candidates/gameplay-art-v2/rune-node-pink-v2.png',
});

type SceneAssetName = keyof typeof SCENE_ASSET_PATHS;

const sceneAssets = new Map<SceneAssetName, HTMLImageElement>();
let preloadStarted = false;

/** Starts image decoding lazily and remains safe when imported by Node tests. */
export function preloadSceneAssets(): void {
  if (preloadStarted || typeof Image === 'undefined') return;
  preloadStarted = true;
  for (const [name, path] of Object.entries(SCENE_ASSET_PATHS) as [SceneAssetName, string][]) {
    const image = new Image();
    image.decoding = 'async';
    image.src = path;
    sceneAssets.set(name, image);
  }
}

/** Returns null until decoded; every consumer retains a procedural fallback. */
function sceneAsset(name: SceneAssetName): HTMLImageElement | null {
  preloadSceneAssets();
  const image = sceneAssets.get(name);
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

export function mobileSkyImage(): HTMLImageElement | null {
  return sceneAsset('mobileSky');
}

export function floatingIslandImage(): HTMLImageElement | null {
  return sceneAsset('floatingIsland');
}

export function crystalObstacleImage(): HTMLImageElement | null {
  return sceneAsset('crystalObstacle');
}

export function runeNodeImage(slot: 0 | 1): HTMLImageElement | null {
  return sceneAsset(slot === 0 ? 'runeNodeCyan' : 'runeNodePink');
}
