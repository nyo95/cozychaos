# Cozy Chaos mobile redesign concept

Generated on 2026-08-03 with the built-in OpenAI ImageGen workflow. The two
user-supplied gameplay screenshots, the accepted PixelLab dream-island
environment, and the active PixelLab cyan wizard sheets were used as visual
references.

These files are an art-direction and implementation pilot. Nothing in this
folder is wired to the renderer yet.

| File | Intended use | Status |
|---|---|---|
| `mobile-gameplay-ideal.png` | Portrait target for the Aim phase and mobile HUD hierarchy | Reference |
| `mobile-hud-kit.png` | Text-free reusable HUD pieces | Candidate; slice and test at 1x before runtime use |
| `environment-props-kit.png` | Parallax clouds, decorative trims, and reflector skins | Candidate; presentation only |
| `feedback-vfx-sheet.png` | Lock, collision, reflection, Wobble, rescue, wind, and score feedback | Candidate; never replace literal rune matter |
| `cyan-hit-ko-concept-sheet.png` | Six hit frames plus six rescue-KO frames | Animation concept; requires pivot/frame cleanup |

## Guardrails

- The player-drawn rune remains procedural. Do not turn a VFX element into a
  fixed spell projectile.
- Island and crystal pixels are not collision truth. Fit any selected skin to
  the authoritative geometry from shared config.
- The character sheet is a concept extension, not a drop-in replacement for
  the accepted PixelLab runtime sheets. Normalize cells and validate the pivot
  at 48 px and 80 px before integration.
- Prefer HTML/CSS for dynamic text and layout. Use the HUD sheet only for
  ornaments, icons, and skins that survive responsive scaling.

## Post-processing

The HUD, VFX, and character sheets were generated on flat green chroma key and
converted to alpha PNG with the installed `remove_chroma_key.py` helper using
border sampling, a soft matte, and despill. The environment pack was regenerated
on a flat red key to avoid destroying its violet/magenta cloud palette, then
converted with a tight hard key and one-pixel edge contraction.

