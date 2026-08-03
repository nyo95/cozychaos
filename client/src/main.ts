import { CONFIG } from '@cozy/shared';
import { mountMatchGame } from './ui/matchGame.js';

/**
 * A-09 — publish the locked arena ratio to CSS.
 *
 * The canvas aspect is a gameplay constant, not a layout preference: it decides
 * how much arena a player can see and what a vertical gesture costs in Ink.
 * Injecting it from `shared/config` keeps PLAN §3.5 honest — no gameplay number
 * is authored in the stylesheet. The literal in `styles.css` is only a fallback
 * for the frame before this runs.
 */
document.documentElement.style.setProperty(
  '--arena-aspect',
  String(CONFIG.camera.arenaAspectRatio),
);

/** Playable multiplayer vertical-slice entry point. */
mountMatchGame();
