# Mobile gameplay presentation implementation report

Date: 2026-08-02

## What changed

- Reorganized the live match chrome around a compact phase/timer HUD, two
  player score chips, three Wobble pips per player, and a secondary room code.
- Moved Copy and Leave into a keyboard-operable overflow menu with 44×44 px
  minimum controls.
- Expanded the portrait arena to use the remaining dynamic viewport height at
  390×844 and 430×932 while retaining desktop and short-landscape rules.
- Added phase-coloured arena treatment and concise Draw, Aim, Reveal, Resolve,
  lock, and secret-rival copy without exposing an opponent's rune.
- Added a prominent directional wind arrow alongside accessible text.
- Replaced technical-first commitment labels with semantic `FAST · LONG
  RANGE`, `BALANCED`, and `HEAVY · SHORT RANGE` feedback. These labels consume
  `predictLaunch`; no new launch calculation was introduced.
- Kept the fixed-length, direction-only procedural Aim arrow and literal
  player-drawn rune rendering unchanged.

## Files changed

- `client/index.html` — responsive HUD semantics and controls.
- `client/src/styles.css` — mobile-first hierarchy, phase states, overflow
  menu, Wobble pips, wind indicator, and responsive sizing.
- `client/src/ui/matchGame.ts` — live HUD state wiring.
- `client/src/ui/matchPresentation.ts` and test — pure semantic formatters.
- Concept README and `ASSET-PROVENANCE.md` — asset decisions.
- This report.

## Design decisions

The reference is art direction rather than a bitmap template. The arena stays
on Canvas because it already renders authoritative geometry and procedural
runes; responsive labels remain HTML. Portrait screens spend nearly all
non-HUD height on the arena. The configured camera remains the only world
framing authority because changing draw zoom would affect Ink cost per finger
movement.

Wobble uses three circular pips plus the existing in-world ring. This avoids a
conventional health bar while making accumulation glanceable. The protocol
does not expose opponent submission state, so the HUD says `Rune hidden`
rather than fabricating a rival-ready signal. Local `Rune locked` and `Aim
locked` states follow successful client sends.

## Assets integrated or rejected

No generated sheet was required for the material improvement. HUD ornaments
were implemented in CSS for clean responsive scaling. Environment pixels were
not used, so procedural crystal triangles remain aligned with server
collision. The VFX sheet remains a candidate; unvalidated bursts could obscure
trajectories.

The cyan hit/KO sheet was rejected for runtime: frame bounds and foot/pelvis
pivots are inconsistent, bubble frames change the occupied box, and rightmost
content is clipped. Cleanup requires per-cell extraction, edge repair, a
stable anchor, phone-size validation at 48/80 px, runtime packing, then
deterministic pink remapping and manifest tests.

## Verification

Automated coverage includes semantic Ink, wind, and Wobble formatting. All 198
tests, TypeScript checks, and production builds pass. `npm audit` could not
reach the registry advisory endpoint (HTTP 403 in this environment). No files
under `shared/src/sim`, `shared/src/spells`, `server`, or protocol were changed.

## Screenshots

Browser screenshot tooling is unavailable in this environment, so visual
capture remains pending. Intended review paths are:

- `artifacts/mobile-ui-redesign/390x844.png`
- `artifacts/mobile-ui-redesign/430x932.png`
- `artifacts/mobile-ui-redesign/1280x720.png`

## Remaining visual and playtest debt

- Capture and inspect the three target viewports in browser-enabled CI.
- Verify safe-area behavior and thumb reach on physical iOS and Android.
- Playtest whether the semantic commitment bands are understood without
  instruction; thresholds reuse established reach bands and do not alter sim.
- Normalize the hit/rescue sheet only after pivots and clipping are repaired.
