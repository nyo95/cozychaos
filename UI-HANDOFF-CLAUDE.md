# Mobile UI handoff to Claude

## Implemented by Codex

- The match is now a single full-height portrait stage with top HUD and bottom
  action overlays. Existing DOM IDs and server-driven state mappings remain.
- The top HUD uses live names, Stars, Wobble, phase, timer, Round, room code,
  wind, Copy, and Leave state. Timer display is one decimal; duration is still
  server-owned.
- The bottom HUD uses live remaining Ink, contextual phase copy, and the
  existing `predictLaunch()` commitment readout. `#setup-controls-slot` is an
  empty hidden container reserved for movement controls.
- Portrait sky and HUD ornaments are live runtime assets with decode-safe or CSS
  fallbacks. Generated islands/crystals/projectiles were deliberately rejected.
- Aim direction is now a fixed-length dotted guide. Cast input and payload are
  unchanged.

## Claude-owned follow-up

1. Recalibrate `drawHalfWidth`, `fullHalfWidth`, camera bias/centering, and Ink
   cost together. The right wizard can still clip during player-biased Draw/Aim;
   do not compensate by shifting render positions.
2. Add the partial curved trajectory preview from the same authoritative
   integrator and wind inputs as resolve. Keep the current dotted guide as a
   direction affordance, not a physics promise.
3. Populate `#setup-controls-slot` only when movement behavior and protocol are
   implemented. The container is presentation-ready but intentionally inert.
4. Wire ACK/grace, timing/fairness, Wobble mechanics, turn cap, and other
   server/shared work without replacing the stable UI IDs.
5. If VFX strips are connected, trigger them from authoritative events and keep
   them presentation-only. Layout and hashes are in
   `client/public/assets/mobile-ui/extracted-assets.json`.

## Verified contract

- Do not use pixels for collision or spawn truth.
- Do not derive Ink, wind, timer, Wobble, Stars, phase, or readiness locally.
- Keep a playable procedural renderer when runtime images fail.
- Re-run `python -B tools/extract_mobile_ui_assets.py --check`, `npm test`, and
  `npm run build` after shared/backend integration.
