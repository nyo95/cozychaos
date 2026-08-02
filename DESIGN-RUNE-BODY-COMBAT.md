# Rune-Body Combat Contract

Status: rewritten 2026-08-02 (Session 12). Supersedes the Attack/Counter role
version of this document, which is preserved only in the changelog.

The classifier remains useful for telemetry, but it does not decide whether a
drawing has gameplay value, and there are no longer any roles.

## Product rules

1. Every non-empty stroke becomes physical matter. Names and ugly scribbles are
   not failures.
2. **There are no roles.** Both players cast at the same time, every Turn, with
   the same rules. Nothing is assigned by the server and nothing is toggled.
3. **How much Ink you commit is the offence/defence decision.** Ink buys mass;
   a fixed launch energy turns mass into speed; speed sets ballistic reach.
   - little Ink → light, fast, long reach → a strike;
   - much Ink → heavy, slow, short reach → a wall in front of you.
4. Input is `Setup → Draw → Cast → Reveal → Resolve → Score`. Cast is one short
   drag; only its **direction** matters. Drag length and pointer speed buy
   nothing, and never will.
5. Opposing matter destroys opposing matter on contact, mutually. The heavier
   body loses proportionally less, which is what makes a heavy rune a shield
   without any shield mechanic existing.
6. Matter deflected by a crystal, a bond, or an opposing rune may hit the
   wizard who cast it. Fresh matter never can. Sending an opponent's rune back
   at them is a real, physical, visible outcome — not bookkeeping.

## The launch math

Implementation: `shared/src/spells/runeBody.ts`.

For committed Ink `I`:

- particle count: `round(minParticles + (maxParticles-minParticles) × I/T)`;
- body extent: `minExtent + (maxExtent-minExtent) × I/T`;
- **mass**: `max(minimumMass, I × massPerInk)` — an *absolute* floor, not a
  per-particle one. A per-particle floor multiplied by a count that itself
  grows with Ink is a second linear-in-Ink term, so it flattens the mass curve
  instead of bounding it, and a flat mass curve deletes the whole design;
- **launch speed**: `v = clamp(sqrt(2 × launchEnergy / mass), min, max)`;
- charge: `I × energyPerInk`, split across nodes.

Flat-ground ballistic reach is `v²·sin(2θ)/g`, so maximum reach scales with
`1/mass`. At the tuned constants, with the wizards 1.1 units apart:

| Ink | mass | speed | max reach | reads as |
|---|---|---|---|---|
| ≤25 | 0.27 | 1.40 | 1.79 | strike |
| 30 | 0.33 | 1.26 | 1.47 | strike |
| **40** | **0.44** | **1.09** | **1.10** | **crossover** |
| 55 | 0.61 | 0.93 | 0.80 | screen |
| 70 | 0.77 | 0.83 | 0.63 | screen |
| 100 | 1.10 | 0.69 | 0.44 | wall at your feet |

`predictLaunch()` is the single source of this table. The HUD calls it before
the player commits, which is what preserves informed commitment (property 8)
now that Ward is gone. If the HUD and the simulation ever disagree, the bug is
that something stopped calling `predictLaunch`.

The stroke is arc-length resampled, centred, uniformly scaled, rotated to the
Cast direction, and translated in front of the wizard. Consecutive particles
receive bonds; non-neighbours within `intersectionDistance` receive stronger
cross-bonds, so crossings reinforce the literal drawing.

Aim is clamped to `maxAngleFromOpponent` (~83°). The cone is wide on purpose: a
steep lob barely travels and lands on your own half, and that is the only lever
that turns a cast into a screen. Narrowing this cone deletes half the game.

## Physics

Implementation: `shared/src/sim/world.ts`; triangle collision math:
`shared/src/sim/collision.ts`; environment: `shared/src/sim/environment.ts`.

- Fixed timestep: `simulation.fixedTimestepMs`.
- Particles receive gravity, Round wind, and linear drag.
- Bonds are Hooke springs:
  `force = extension × bondStiffness + relativeSpeed × bondDamping`. A bond
  breaks on strain, on force, or when an endpoint loses integrity.
- Both particles and the capsules between bonded particles collide. Bonds are
  gameplay geometry, not decorative rendering.
- **Matter rests on the island.** Below `groundRestingSpeed` a ground contact
  is resting rather than an impact and costs no charge; above it, the particle
  bounces and pays `groundEnergyLossFraction`. Without the resting threshold,
  gravity re-triggers an "impact" every step and a landed wall evaporates.
  Past the island edge there is deliberately no floor.
- Crystals are full triangle colliders, seeded per Round, immutable, with a
  swept centre-line test against tunnelling. Ground crystals top out at 0.36
  and floating ones hang no lower than 0.82: a corridor narrower than this can
  hard-block every flat cast for a whole Round, and because a Round only ends
  on a knock-out, that deadlocks the match.

## Mutual destruction

On contact between opposing matter, with `collisionEnergy` derived from
relative approach speed and reduced mass:

```
shareA = massB / (massA + massB)      // weighted by the OPPONENT's mass
shareB = massA / (massA + massB)
A.energy    -= collisionEnergy × shareA × mutualDamageScale
B.energy    -= collisionEnergy × shareB × mutualDamageScale
A.integrity -= …  ;  B.integrity -= …
```

Two equal runes split the loss evenly. A 0.27 dart meeting a 1.10 wall absorbs
80% of the destruction while the wall absorbs 20%. Nothing is created, so
fragmentation never manufactures damage.

## Player impact

Knockback is **momentum**, not energy:

```
momentum = |v| × mass
charge   = min(1, particle.energy / energyForFullImpact)
impulse  = momentum × impactTransfer × charge
```

Charge gates *whether and how much* of that momentum still lands, so spent
matter fades out instead of stopping dead. The previous formula compared an
energy against a momentum inside a `min` and then multiplied by 20; it was
dimensionally meaningless and made a nearly stationary fragment worth a fifth
of the Wobble bar.

Every impact also adds `knockbackLift × magnitude` upward. This is not polish:
grounded friction spends a horizontal impulse in a fraction of a second, so
without lift a solid hit moved a wizard about 0.03 arena units and a knock-out
took twenty Turns — four times the whole match length in PRD §4.4. Lift throws
the wizard into the air where drag is 0.4/s instead of 1.4/s, and it also reads
the way PRD §4.2 asks ("terpental", not "slid an inch").

There is no Ward. Unspent Ink is simply unspent. Mass is the defence.

## Camera

Implementation: `client/src/rendering/viewport.ts`.

- Setup, Draw and Cast frame the local wizard at `camera.drawHalfWidth`, biased
  toward mid-arena so the rival stays on screen.
- Reveal, Resolve and Score show the whole arena at `camera.fullHalfWidth`, so
  both players watch the same clash.
- Easing is `1 - e^(-k·dt)`, frame-rate independent by construction.

Camera framing lives in **shared** CONFIG, not in the renderer, because Ink is
charged per arena unit of arc length: zooming the Draw camera changes how much
matter a given gesture buys. `ink.costPerUnitLength` is calibrated against
`camera.drawHalfWidth` and the two must be changed together.

## Meta tuning map

All knobs live in `shared/src/config/index.ts` and are typed in `types.ts`:

| Desired change | Config group |
|---|---|
| Longer/shorter Turn | `phases` |
| Offence/defence crossover | `aim.launchEnergy`, `runeBody.massPerInk`, `runeBody.minimumMass` |
| Aim cone width | `aim.maxAngleFromOpponent` |
| Draw zoom (and therefore Ink economy) | `camera` **and** `ink.costPerUnitLength` |
| Wind distribution | `wind` |
| Crystal layout and firing corridor | `hazards.generation` |
| Shape resolution and body size | `runeBody.minParticles/maxParticles/minExtent/maxExtent` |
| Rigidity and breakability | `runeBody.bond*`, `breakStrain`, integrity values |
| How hard runes destroy each other | `particleRestitution`, `collisionEnergyScale`, `mutualDamageScale` |
| Knock-out pace | `impactTransfer`, `wobble.gainPerImpulse`, `wobble.knockbackLift`, `player.groundFriction` |
| How landed matter settles | `runeBody.ground*` |

Do not put tuning numbers in Room, renderer, input, or protocol code.

## Locked invariants

- Same input produces byte-identical snapshots.
- Total particle energy never increases.
- A name or doodle produces particles and bonds.
- More Ink never buys more reach (monotonic).
- The shield/strike crossover sits inside the playable Ink range: a small rune
  can cross the arena and a full commitment cannot.
- `predictLaunch` and `buildRuneBody` agree on mass and launch speed.
- A heavier rune loses a strictly smaller fraction of itself in a collision.
- Fresh matter cannot hit its own caster; deflected matter can.
- Drawing nothing provides no defence.
- Roles contain no attacker and no counter, because roles do not exist.
- Protocol rejects non-finite Cast vectors and caps point floods.
- Server sends byte-identical frames to both clients.
- A crystal face reflects matter far from its tip, high-speed matter cannot
  tunnel through it, and collision never mutates the layout.
- Crystal layouts match for the same seed/Round and vary across Rounds.
- `toScreen`/`toArena` are exact inverses and uniform on both axes at every
  zoom level; the camera reaches the same framing at 60 Hz and 120 Hz.

These are regression-tested. Meta values may change; the invariants may not.
