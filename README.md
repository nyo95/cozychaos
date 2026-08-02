# Project Cozy Chaos

> **Draw Magic. Expect Chaos.**

A casual online physics duel. Two wizards draw at the same time; every wild
stroke becomes a breakable physical rune body made from particles and bonds.

**Current stage:** playable online vertical slice. Two browsers can create or
join a room, draw arbitrary rune bodies under the same rules, aim them with a
direction-only Cast gesture, and watch them collide, fragment, reflect from
seeded immutable dream-island crystals, score Stars, reconnect, and rematch.
The current contract is `DESIGN-RUNE-BODY-COMBAT.md`.

## Run it

```bash
npm ci           # the lockfile is authoritative
npm run play     # client :5173 + authoritative WebSocket server :8787
```

Open `http://localhost:5173` in two browser tabs. Create a room in one, copy the
four-character code, and join it from the other. On a phone on the same LAN,
open `http://<computer-LAN-IP>:5173`; the client connects to port 8787 on that
same host.

During Draw, make one continuous shape—names and scribbles are valid. During
Cast, drag once to choose the angle; drag distance does not change power. Ink
buys mass: a small commitment launches a light, fast strike, while a large
commitment produces a heavy, slow wall near the caster. Unspent Ink has no
secondary effect. Reveal stays simultaneous and the server decides wind,
collisions, fragments, Wobble, and score.

```bash
npm test         # 191 tests
npm run typecheck
npm run build
npm audit        # must stay at 0 vulnerabilities
```

**Status:** local multiplayer prototype, not production multiplayer and not yet
human-validated. The deterministic handwritten physics is intentionally thin;
a physics-library spike, hosted deployment, movement, lag simulation, and
real-device playtests are still owed.

Character presentation currently uses a PixelLab runtime pilot: cyan idle/cast
sprites plus a deterministic pink palette derivative. Sprite decode failure
falls back to the procedural Canvas wizard and never affects physics.
The current environment reference is the PixelLab open-sky dream island shown
in `roadmap.md`; the old cave images are historical only. Runtime island and
crystal geometry remain procedural so visible surfaces match server collision.

## Documents

| File | What it is |
|---|---|
| `PRD.md` | Product requirements and original intent. |
| `PRD-AMENDMENTS.md` | PRD defect resolutions; overrides the PRD on conflicts. |
| `DESIGN-SPELL-COMPOSITION.md` | Current wild-composition + Ink implementation contract. |
| `DESIGN-RUNE-BODY-COMBAT.md` | **Current combat contract:** Ink/mass trade-off, particle/bond math, conservation, and meta knobs. |
| `ASSET-PROVENANCE.md` | ImageGen + PixelLab inventory, prompts, rejected variants, processing, and integration guardrails. |
| `roadmap.md` | Product context, generated images, PixelLab pilot, and staged handoff for Claude/Codex. |
| `DESIGN-PROPOSAL-WILD-SPELLS.md` | Historical proposal that started the pivot. |
| `DECISION-WILD-SPELLS.md` | Decision trail and overridden arguments. |
| `changelog.md` | Per-session record of changes, reasons, verification, and debt. |

## Layout

```text
shared/     geometry, wild spell composer, protocol, deterministic sim, config
client/     room lobby, drawing capture, match rendering, responsive duel UI
server/     authoritative rooms, phase clock, snapshots, scoring, reconnect
```

## Rules this codebase follows

- Rune construction, environment selection, and physics math are pure/tested.
- Every gameplay tuning value lives in `shared/src/config`.
- The server owns phases, spell reading, physics, KO, and score.
- Gameplay randomness comes only from a seeded PRNG.
- Rendering never decides collisions or scores.
- The literal drawing always becomes physical matter; classification cannot reject it.
- Particle energy cannot increase through fragmentation.
- A Turn is Setup→Draw→Cast→Reveal→Resolve→Score, a Round ends in a KO and awards a
  Star, and the Match is first to three Stars. Wobble resets per Round; Ink
  resets per Turn.
