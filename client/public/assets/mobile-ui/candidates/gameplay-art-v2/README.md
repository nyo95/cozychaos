# Gameplay art candidates v2

Status: **active visual pilot with procedural fallbacks**. The runtime consumes
these files through `client/src/rendering/sceneAssets.ts`; gameplay and collision
remain authoritative and the original procedural renderer is retained.

## What changed visually

- `floating-island-v2.png` replaces the flat gray bands with a deep faceted
  purple rock mass, readable crevices, a richer grass lip, and restrained
  flowers. Its proportions match the existing world platform closely.
- `crystal-obstacle-v2.png` provides bold internal facets and a stronger icy
  silhouette while remaining safe to clip to the exact collision triangle.
- `rune-node-cyan-v2.png` and `rune-node-pink-v2.png` provide a shared luminous
  spell-matter language. Pink is a deterministic hue derivative, so both teams
  retain identical geometry and value contrast.

## Runtime integration contract

### 1. Island

Load the image through the existing decode-safe scene asset cache. Preserve the
procedural island as fallback. For a destination width `w` between the screen
positions of `-CONFIG.arena.halfWidth` and `+CONFIG.arena.halfWidth`:

```ts
const h = w * (578 / 1711);
const y = groundScreenY - h * (72 / 578);
ctx.imageSmoothingEnabled = false;
ctx.drawImage(image, leftScreenX, y, w, h);
```

The image point `(855.5, 72)` is the ground-center anchor and must map to world
`(0, 0)`. Do not move player bodies, spawn positions, kill floor, or platform
collision to fit the art.

### 2. Obstacles

Keep `HazardSpikeConfig` as truth. Build the exact triangle path from its base,
tip, and half-width, call `ctx.clip()`, then fit the sprite into that triangle's
bounding box. The source triangle is tip `(387.5, 8)`, base-left `(8, 1447)`,
base-right `(767, 1447)`. Flip vertically for ceiling spikes. Never derive the
collider from alpha pixels.

### 3. Rune matter

Keep the player's captured stroke, composed recipe, bonds, particle count,
mass, and radius unchanged. Draw the team node centered only at positions that
already exist in state: sampled stroke points during Draw and authoritative
particles/nodes during Resolve. Recommended visible diameter is 10-24 CSS px,
derived from an existing visual/state radius. Do not use the sprite as a fixed
rune shape or projectile.

### 4. Required safeguards

- Preload lazily; imports must remain safe in Node/Vitest where `Image` is absent.
- Draw with `imageSmoothingEnabled = false`.
- Missing/decode-failed images must fall back to the procedural renderer.
- Test upward and downward crystals at multiple widths before promotion.
- Promote by changing consumer paths; do not delete the old fallback artwork.

All dimensions, hashes, anchors, and fit policies are machine-readable in
`manifest.json`.
