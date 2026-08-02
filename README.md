# Project Cozy Chaos

> **Draw Magic. Expect Chaos.**

A casual online physics duel. Two wizards draw runes at the same time, and the
shape, direction, and size of each drawing become a physical spell.

**Current stage:** Stage 0 — Spell Lab. Offline, no server, no match loop.

## Run it

```bash
npm install
npm run dev      # opens the Spell Lab at localhost:5173
```

Draw anywhere on the island. The panel on the right shows which spell family
your drawing became and every parameter it decided. Find all four families.

```bash
npm test         # 93 tests
npm run typecheck
npm run build
```

## Documents

| File | What it is |
|---|---|
| `PRD.md` | The product requirements. The source of truth for intent. |
| `PRD-AMENDMENTS.md` | Six defects found auditing the PRD, and their resolutions. **Overrides `PRD.md` where they conflict.** |
| `changelog.md` | Per-session record of what changed and why. |

## Layout

```
shared/     classifier, spell definitions, match state, config — used by both sides
client/     drawing capture, input, rendering, UI
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

Two more that this session added:

- Client and server share `CONFIG` and the classifier, so the in-game preview
  and the server's verdict are the same computation and cannot disagree.
- Terminology: a **Turn** is one Setup→Draw→Reveal→Resolve→Score cycle, a
  **Round** ends in a knock-out and is worth a Star, a **Match** is first to
  three. Wobble resets per Round; ink resets per Turn. See `PRD-AMENDMENTS.md`
  A-01 for why this distinction is load-bearing.
