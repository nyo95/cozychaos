/**
 * Roles were removed in Session 12.
 *
 * `rolesForTurn()` used to assign one Attacker and one Counter per Turn, but
 * both roles built the same rune body through the same function and both were
 * aimed at the opponent through the same clamp, so the split was invisible in
 * play. Offence and defence are now decided by how much Ink a player commits:
 * mass sets launch speed, launch speed sets ballistic reach. See
 * `spells/runeBody.ts#predictLaunch` and DESIGN-RUNE-BODY-COMBAT.md.
 *
 * This file is kept as a tombstone rather than deleted, because the changelog
 * references it and a future reader will otherwise re-invent the same mechanic.
 */
export {};
