# Asset Provenance Register

Status: PixelLab wizard pilot **ACTIVE** sebagai presentation layer dengan
procedural fallback. PixelLab open-sky arena adalah **ART-DIRECTION
REFERENCE**. Arena dan reflector ImageGen lama **OBSOLETE** sejak Sesi 12.
Dua wizard ImageGen lama tetap kandidat dan tidak ter-wire ke renderer.

All files below were generated for this repository on 2026-08-02 with the
built-in OpenAI ImageGen workflow. The only visual references were the existing
Cozy Chaos multiplayer UI screenshot supplied by the user and outputs created
during the same generation session. No third-party game artwork was used.

## Generated files

| File | Purpose | Dimensions | Alpha/post-process | Status |
|---|---|---:|---|---|
| `client/public/assets/generated/cozy-cave-arena.png` | Historical environment concept; not the active background | 1672×941 | Opaque source output | `obsolete-theme` |
| `client/public/assets/generated/wizard-cyan.png` | Player 0 character cutout, facing right | 1254×1254 | Chroma-key removed locally | `candidate` |
| `client/public/assets/generated/wizard-pink.png` | Player 1 character cutout, facing left | 1254×1254 | Chroma-key removed locally | `candidate` |
| `client/public/assets/generated/cave-reflectors-sheet.png` | Historical reflector concepts; not the active crystal skin | 1672×941 | Chroma-key removed locally | `obsolete-theme` |
| `client/public/assets/generated/manifest.json` | Dimensions, orientation, usage, and status contract | — | Hand-authored metadata | `candidate` |

Transparent assets were generated on a flat green backdrop and processed with
the installed ImageGen `remove_chroma_key.py` helper using border auto-key,
soft matte, and despill. Final files were visually inspected after conversion.

## Prompt set

### Arena

Create an empty cozy magical cave duel arena behind gameplay sprites: deep
indigo-violet layered rock, subtle mist and magical dust, one broad floating
stone island with a thin moss-green top, and generous open combat space. Match
the current multiplayer palette. Exclude characters, obstacles, spells, HUD,
text, logos, watermarks, and borders.

### Cyan wizard

Create one compact full-body cyan team wizard readable at 48–80 px: oversized
crooked hat, short robe, simple face, tiny boots, neutral stance facing right,
and a strong silhouette. Match the cave's hand-painted casual-game style.
Isolate on uniform chroma green; no shadow, weapon, spell, text, or watermark.

### Pink wizard

Create an original pink counterpart matching the cyan wizard's proportions and
rendering, with the hat bending the opposite way and the stance facing left.
Isolate on uniform chroma green; no shadow, weapon, spell, text, or watermark.

### Reflectors

Create exactly six indestructible crystal-rock cave reflector sprites in a 3×2
sheet: three downward stalactites above and three upward stalagmites below,
with short-wide, medium, and tall-narrow variants. Preserve clean triangular
collision silhouettes and the lavender cave palette. Isolate on uniform chroma
green; no labels, particles, moss, shadows, logos, or watermark.

## Integration guardrails

- Obsolete-theme files are provenance only. Do not wire them into the current
  floating dream island scene.
- The arena background intentionally contains no obstacles. Random placement
  remains owned by the seeded server environment.
- Reflector art is a visual skin only. It must be fitted to the authoritative
  `HazardSpikeConfig` triangle; pixels must never decide collision.
- Wizard artwork may replace the current canvas-drawn character only after a
  readability test at actual mobile render size.
- Keep the existing programmatic renderer as fallback until image decode and
  responsive cropping are verified in two browsers.

## PixelLab runtime pilot — Session 16

Product owner explicitly deferred the Stage 2 human playtest gate and selected
PixelLab as the next character-art direction. Generation used PixelLab API v2
directly; no API token, account identifier, background-job identifier, or
remote character access identifier is stored in the repository.

### Output

| Path | Origin | Status |
|---|---|---|
| `client/public/assets/pixellab-pilot/cyan/base/` | PixelLab v3, eight stored rotations | source |
| `client/public/assets/pixellab-pilot/cyan/idle/east/` | PixelLab v3, six frames | accepted |
| `client/public/assets/pixellab-pilot/cyan/cast/east/` | PixelLab v3, eight frames | rejected: baked spell arcs |
| `client/public/assets/pixellab-pilot/cyan/cast-clean-v2/east/` | PixelLab v3, eight frames | accepted |
| `client/public/assets/pixellab-pilot/pink/` | deterministic local cyan→pink palette derivative | accepted |
| `client/public/assets/pixellab-pilot/runtime/` | packed one-row sheets consumed by Canvas | active pilot |
| `client/public/assets/pixellab-pilot/environment/dream-island-arena.png` | PixelLab Pixflux open-sky environment | accepted art-direction reference |
| `client/public/assets/pixellab-pilot/environment/dream-island-arena-rejected-v1.png` | PixelLab Pixflux first environment attempt | rejected: cave-like aperture |
| `client/public/assets/pixellab-pilot/environment/dream-island-arena-rejected-v3.png` | PixelLab Pixflux init-image revision | rejected: no material improvement |

The base prompt requested a compact semi-chibi side-view wizard with an
oversized crooked cyan hat, short robe, simple cream face, tiny boots, empty
hands, selective dark-indigo pixel outline, and readability at 48 px. It
explicitly prohibited weapons, staff, projectile, text, UI, shadow, and extra
characters.

The idle prompt requested breathing plus a tiny hat-tip movement with fixed
feet and a seamless loop. The accepted cast revision requested **body motion
only**, fixed feet/pivot, and fully transparent pixels outside the character;
it explicitly prohibited arcs, aura, glow, trails, particles, projectile,
props, and shadows. The first cast is deliberately retained as rejected source
so a later agent does not accidentally regenerate or ship the same failure.

### Processing and QA

- PixelLab returned a padded 176×176 source canvas from the requested 96×96
  character size. Runtime pivot is `(92, 131)` and remains presentation data.
- Idle alpha bounds keep the same bottom pixel on all six frames; horizontal
  centre drift is 0.5 source pixel.
- Accepted cast bottom drift is one source pixel; horizontal centre drift is
  six source pixels during the deliberate forward gesture.
- Pink is derived locally by hue-remapping only saturated cyan/blue clothing
  pixels; skin and deep-indigo outline are preserved. It does not spend a
  second stochastic generation and therefore cannot drift in pose.
- Runtime sheets use nearest-neighbour rendering. Slot 1 mirrors the east-facing
  frames. Physics position, collision radius, Wobble, and score remain server
  data; missing images fall back to the procedural wizard.

## PixelLab environment correction — Session 17

The old `cozy-cave-arena.png` remains historical provenance, but it is no
longer shown as the active arena preview in `roadmap.md`. Three PixelLab
Pixflux generations were inspected:

1. V1 was rejected because its dark edge aperture recreated a cave and its
   central platform occupied too little horizontal space.
2. V2 was accepted as the visual-direction reference because its sky is open,
   its palette matches the PixelLab wizards, and the combat airspace is quiet.
3. V3 attempted to widen V2 with an init-image edit, but it made no material
   improvement and was rejected.

The accepted prompt specified a production-ready 16:9 side-view spell-duel
environment, edge-to-edge indigo-magenta dream sky, sparse clouds and stars,
a centered floating island, crisp clustered pixels, a limited palette, and no
cave, frame, characters, obstacles, spells, UI, text, or isometric depth.

This output is not collision truth. PixelLab did not obey the requested 82%
platform width closely enough, so wiring the painted platform into runtime
would create a visible-versus-physical mismatch. `drawIsland` and
`drawCrystals` remain authoritative presentation generated from shared config;
the PixelLab image is a palette/composition target for the next environment
pass. Three additional generations were spent, leaving 23 of 40 trial
generations. No credential or remote job identifier is stored.

## Mobile redesign concept pack — 2026-08-03

The built-in OpenAI ImageGen workflow produced a mobile-first art-direction
target and four supporting candidate sheets under
`client/public/assets/concepts/mobile-redesign-2026-08-03/`. References were
limited to the two user-supplied Cozy Chaos gameplay screenshots plus the
repository's accepted PixelLab environment and active cyan wizard sheets.

| File | Dimensions | Alpha/post-process | Status |
|---|---:|---|---|
| `mobile-gameplay-ideal.png` | 851×1847 | Opaque source output | `reference` |
| `mobile-hud-kit.png` | 1254×1254 | Green key, soft matte, despill | `candidate` |
| `environment-props-kit.png` | 1254×1254 | Red key, tight hard matte | `candidate` |
| `feedback-vfx-sheet.png` | 1254×1254 | Green key, soft matte, despill | `candidate` |
| `cyan-hit-ko-concept-sheet.png` | 2172×724 | Green key, soft matte, despill | `animation-concept` |

The pack intentionally contains no fixed spell projectile. Rune bodies and
fragments remain procedural, and environment pixels remain presentation-only.
See the pack-local `README.md` and `manifest.json` for integration guardrails.

The target now informs the responsive HTML/CSS hierarchy, colour, wind
emphasis, and compact phase treatment. The first implementation pass did not
promote generated pixels; the follow-up below promotes only independently
validated presentation assets. The cyan hit/rescue-KO concept was rejected: feet and pose bounds
move substantially between cells, rescue bubbles change the occupied box, and
right-edge content is clipped. Promotion requires hand-cleaned per-frame
bounds, a stable foot/pelvis anchor, repaired edge pixels, and validation at
48 px and 80 px before deterministic pink palette remapping. The accepted
idle/cast pilot and procedural fallback remain safer.

## Mobile runtime art pass — Session 18

OpenAI ImageGen produced
`client/public/assets/mobile-ui/backgrounds/mobile-dream-sky.png` from the
accepted mobile composition and PixelLab environment references. The source
prompt required a scenery-only 9:16 sky: central combat corridor open, cloud
banks restricted to the edges, and no island, crystal, wizard, rune, arrow,
HUD, text, or logo. The repository copy is 852×1846, palette-quantized to 192
colours without resizing, 399,635 bytes, SHA-256
`52f327d75d3ba2867cad6cee8c16fde0b5d2ab885ee68a215cf3581765a59eb9`.
The renderer uses it only for portrait stages and retains the procedural sky
as both its decode-failure and landscape fallback.

The deterministic pipeline in `tools/extract_mobile_ui_assets.py` also
promotes nine independently cropped RGBA assets from the concept sheets:
three HUD ornaments and six presentation-only VFX strips. Exact crop bounds,
dimensions, animation layout, alpha coverage, and hashes live in
`client/public/assets/mobile-ui/extracted-assets.json`. No generated island or
crystal is promoted because those pixels would not match authoritative
collision geometry. No fixed projectile is promoted; rune matter remains
derived from simulation state.
