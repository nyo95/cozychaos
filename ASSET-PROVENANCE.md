# Asset Provenance Register

Status: Arena dan reflector sheet **OBSOLETE** sejak Sesi 12 (arena pindah ke
floating dream island). Wizard cutout masih kandidat. Tidak ada yang ter-wire
ke renderer.

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
