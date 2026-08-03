export { ARENA } from './config.js';
export {
  type ArenaPlayer,
  type ArenaState,
  type DodgeDir,
  type DodgeState,
  applyDamage,
  createArena,
  halfBounds,
  isInvulnerable,
  queueDodge,
  setConnected,
  setMoveIntent,
  stepArena,
} from './state.js';
