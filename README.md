# Project Cozy Chaos

> **Draw Magic. Expect Chaos.**

A casual online physics duel. Two wizards draw runes at the same time, and the
shape, direction, and size of each drawing become a physical spell.

**Current stage:** Spell Lab V2 technical prototype, offline. A stroke now
composes several ordered force motifs and exposes the Ink committed/reserved
trade-off. See `DESIGN-SPELL-COMPOSITION.md`.

## Run it

```bash
npm ci           # use ci, not install — the lockfile is authoritative
npm run dev      # opens the Spell Lab at localhost:5173
```

Draw anywhere on the island. The panel shows only the coarse promise players
need before committing: direction, force band, motif sequence, and how much Ink
remains reserved. It never exposes the old family names or trajectory details.

```bash
npm test         # 139 tests
npm run typecheck
npm run build
npm audit        # must stay at 0 vulnerabilities
```

**Status:** technical prototype, not yet human-validated. Telemetry is built
into V2 so every playtest stroke can be exported and replayed.

## Documents

| File | What it is |
|---|---|
| `PRD.md` | The product requirements. The source of truth for intent. |
| `PRD-AMENDMENTS.md` | Six defects found auditing the PRD, and their resolutions. **Overrides `PRD.md` where they conflict.** |
| `DESIGN-SPELL-COMPOSITION.md` | **The current implementation contract.** Wild composition + Ink commitment. Read this before touching the classifier. |
| `DESIGN-PROPOSAL-WILD-SPELLS.md` | The proposal that started the pivot. Historical. |
| `DECISION-WILD-SPELLS.md` | The lead's first answer, partly superseded by the product owner. §11 records which arguments fell and why. |
| `changelog.md` | Per-session record of what changed and why. |

## Layout

```
shared/     geometry, classifier, motif composer, match state, config
client/     drawing capture, telemetry, rendering, Spell Lab UI
server/     empty until Stage 3 (online 1v1)
```

## Rules this codebase follows

From PRD §21, and they are not negotiable:

- The stroke classifier is a pure function with a test dataset.
- Every tunable value lives in `shared/src/config` as data. No magic numbers in
  gameplay code.
- Spells are data definitions. Adding one must not touch the match loop.
- All randomness comes from a seeded PRNG. Nothing calls `Math.random()`.
- The renderer never decides score or collision.
- No new dependency without a written reason and a small spike.

Three more these sessions added:

- Client and server share `CONFIG` and the classifier, so the in-game preview
  and the server's verdict are the same computation and cannot disagree.
- **Draw Assist never changes physics.** Wild recipes are composed entirely
  from the canonical Standard reading and are identical across assist settings.
  `fairness.test.ts` and `composition.test.ts` guard both pipelines.
- Terminology: a **Turn** is one Setup→Draw→Reveal→Resolve→Score cycle, a
  **Round** ends in a knock-out and is worth a Star, a **Match** is first to
  three. Wobble resets per Round; ink resets per Turn. See `PRD-AMENDMENTS.md`
  A-01 for why this distinction is load-bearing.
