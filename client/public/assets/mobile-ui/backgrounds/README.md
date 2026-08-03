# Mobile dream sky

`mobile-dream-sky.png` is a portrait-only, scenery-only runtime plate generated
with OpenAI ImageGen for the Cozy Chaos mobile presentation pass.

- Dimensions: 852×1846
- Format: indexed PNG, 192-colour palette, no resize
- SHA-256: `52f327d75d3ba2867cad6cee8c16fde0b5d2ab885ee68a215cf3581765a59eb9`
- Runtime path: `/assets/mobile-ui/backgrounds/mobile-dream-sky.png`
- Consumer: `client/src/rendering/sceneAssets.ts`

The plate intentionally contains no island, crystal, wizard, spell, trajectory,
HUD, text, or other gameplay truth. `matchScene.ts` draws authoritative geometry
after the plate and falls back to procedural scenery when decoding fails or the
stage is landscape.
