# Extracted mobile UI assets

These PNGs are deterministic runtime crops from the concept sheets in
`../concepts/mobile-redesign-2026-08-03/`. They are presentation assets only:
authoritative Ink, wind, scoring, collision, and timing must continue to come from game
state. No fixed projectile art is included.

Regenerate and verify from the repository root:

```powershell
python tools/extract_mobile_ui_assets.py
python tools/extract_mobile_ui_assets.py --check
```

The extraction tool requires Python 3.9+ and Pillow; Pillow is only a build-time tool and
is not needed by the game client.

The generator does not resize source pixels. Animation frames are alpha-trimmed inside
fixed source selections, then centered (or right-centered for wind) on equal-size RGBA
canvases. If a consumer scales these pixel-art assets, use nearest-neighbor rendering.

## Runtime files

| Asset | Runtime size | Source decision |
| --- | ---: | --- |
| `hud/ink-orb.png` | 192 x 192 | Fixed crop `(50, 574, 242, 766)` from `mobile-hud-kit.png`; text and live droplets stay dynamic. |
| `hud/wind-direction-pill.png` | 416 x 128 | Fixed crop `(390, 392, 806, 520)`; text-free and safe to mirror/rotate from wind data. |
| `hud/action-panel-ornament.png` | 1104 x 192 | Fixed crop `(74, 1009, 1178, 1201)` containing the panel, touch glyph, and divider but no baked label. |
| `vfx/lock-pulse-cyan.png` | 4 x 192 x 192 | Four cyan lock/readiness frames, centered. |
| `vfx/lock-pulse-pink.png` | 4 x 192 x 192 | Four pink rival-ready frames, centered. |
| `vfx/collision-burst.png` | 4 x 192 x 192 | Four cyan/pink impact frames; visual feedback only. |
| `vfx/rescue-bubble-cyan.png` | 4 x 192 x 192 | Four rescue-bubble dissolve frames; visual feedback only. |
| `vfx/wind-streak.png` | 4 x 192 x 128 | Four right-anchored wind frames so the curl stays stable while the trail dissipates. |
| `vfx/star-reward.png` | 4 x 192 x 192 | Four centered round-win sparkle frames. |

All exact selection rectangles, alpha-trimmed bounds, frame metadata, SHA-256 hashes,
and validation results live in `extracted-assets.json`. Runtime paths begin with
`/assets/mobile-ui/`.

For a sprite sheet, render a viewport matching `frameWidth` x `frameHeight`, use the PNG
as a non-repeating background at its natural pixel size, and move the background by one
`frameWidth` per frame. Scale the viewport separately with `image-rendering: pixelated`.
Honor `prefers-reduced-motion` by showing frame 0 without animation.

## Validation guarantees

- Every output is RGBA and non-empty.
- All four output corners are fully transparent.
- Every sprite frame has non-zero alpha coverage.
- Generated PNG bytes and manifest are reproducible with `--check`.
- No resampling or color remapping is performed.
- Environment art is not included here and must never become collision truth.

## Deliberately rejected crops

- A standalone touch glyph was rejected because the glyph is painted over the action
  panel fill. The complete text-free panel ornament is safe; an isolated glyph crop
  would carry a visible rectangular backing.
- Full player cards, score stars, Wobble pips, labels, and timers were rejected because
  their values and accessibility semantics need live HTML/CSS.
- Islands and crystals were rejected from this extraction set because their generated
  silhouettes could be mistaken for authoritative collision geometry.
- The character concept sheet was not normalized here: pose pivots and per-frame body
  consistency require a separate character-animation review.
- Large cloud groups are not part of this pipeline; they belong to the presentation-only
  background layer and are managed separately.
