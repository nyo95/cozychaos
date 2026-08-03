import { CONFIG } from '@cozy/shared';
import './moveControls.css';

/**
 * Held-direction movement controls for the Setup phase (M-04, A-08).
 *
 * Fills `#setup-controls-slot`, which Codex left deliberately inert. Three
 * targets — left, right, jump — because A-08 chose held-direction over
 * tap-to-position, and PRD §9's jump only exists if there is a button for it.
 *
 * ## What this does not do
 *
 * It does not move anything. It reports intent to the caller, which sends it to
 * the server; the wizard on screen moves only when a `setupFrame` says so. That
 * is the whole design: on a phone, a mispredicted position that snaps back is
 * far worse than one that starts a few frames late.
 *
 * ## Why it emits on change rather than per frame
 *
 * A held button is one message down and one up, not 90 messages over three
 * seconds. The risk is a lost release leaving a player walking; the guards for
 * that are `releaseAll()` on phase exit, on `blur`, on `visibilitychange`, and
 * on `pointercancel` — the four ways a touch can end without a clean `up`.
 */

export type MoveDirection = -1 | 0 | 1;

export interface MoveIntentSnapshot {
  readonly direction: MoveDirection;
  readonly jump: boolean;
}

export interface MoveControlsOptions {
  /** Called whenever the intent changes. Never called for an unchanged intent. */
  readonly onChange: (intent: MoveIntentSnapshot) => void;
}

const KEY_LEFT = new Set(['ArrowLeft', 'a', 'A']);
const KEY_RIGHT = new Set(['ArrowRight', 'd', 'D']);
const KEY_JUMP = new Set([' ', 'ArrowUp', 'w', 'W']);

/**
 * True when a key event is destined for a text field.
 *
 * The movement keys double as characters — W/A/D, space, the arrows — and the
 * listeners below `preventDefault()` on every match. Bound on `window`, that
 * also swallows the keystroke while the player is typing in a form: the lobby's
 * room-code input could not accept a "W" (jump), "A"/"D" (strafe) or a space,
 * so codes containing those letters were impossible to enter. Skip the handler
 * whenever focus is in an input, textarea, select, or contenteditable element.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  // Duck-typed rather than `instanceof HTMLElement`: it survives elements from
  // another realm (iframe) and is unit-testable without a DOM.
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (el === null || typeof el !== 'object') return false;
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class MoveControls {
  private readonly held = { left: false, right: false };
  private jumpsLeft = CONFIG.movement.jumpsPerSetup;
  private active = false;
  private lastDirection: MoveDirection = 0;
  private readonly buttons: Record<'left' | 'right' | 'jump', HTMLButtonElement>;
  private readonly detach: (() => void)[] = [];

  constructor(
    private readonly slot: HTMLElement,
    private readonly options: MoveControlsOptions,
  ) {
    slot.replaceChildren();
    const row = document.createElement('div');
    row.className = 'move-pad';

    this.buttons = {
      left: this.makeButton('left', '◀', 'Move left'),
      jump: this.makeButton('jump', '▲', 'Jump'),
      right: this.makeButton('right', '▶', 'Move right'),
    };
    row.append(this.buttons.left, this.buttons.jump, this.buttons.right);
    slot.append(row);

    this.bindKeyboard();
    this.bindLifecycle();
  }

  /**
   * Opens or closes the control.
   *
   * Closing always emits a neutral intent first. Leaving Setup with a finger
   * still down would otherwise leave the server holding a stale direction that
   * it correctly refuses to act on — and the player would see their own button
   * lit while nothing moved.
   */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.releaseAll();
    this.slot.toggleAttribute('data-active', active);
  }

  /** Greys out the jump button once the server says the jump is spent. */
  setJumpsLeft(count: number): void {
    this.jumpsLeft = count;
    this.buttons.jump.disabled = count <= 0;
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }

  private makeButton(kind: 'left' | 'right' | 'jump', glyph: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `move-pad__button move-pad__button--${kind}`;
    button.textContent = glyph;
    button.setAttribute('aria-label', label);

    if (kind === 'jump') {
      const press = (event: Event): void => {
        event.preventDefault();
        this.requestJump();
      };
      button.addEventListener('pointerdown', press);
      this.detach.push(() => button.removeEventListener('pointerdown', press));
      return button;
    }

    const side = kind;
    const down = (event: PointerEvent): void => {
      event.preventDefault();
      // Capture so a finger that slides off the button still releases it.
      button.setPointerCapture(event.pointerId);
      this.setHeld(side, true);
    };
    const up = (): void => this.setHeld(side, false);

    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    this.detach.push(() => {
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('pointerup', up);
      button.removeEventListener('pointercancel', up);
      button.removeEventListener('lostpointercapture', up);
    });
    return button;
  }

  private bindKeyboard(): void {
    const down = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      if (isTextEntryTarget(event.target)) return;
      if (KEY_LEFT.has(event.key)) this.setHeld('left', true);
      else if (KEY_RIGHT.has(event.key)) this.setHeld('right', true);
      else if (KEY_JUMP.has(event.key)) this.requestJump();
      else return;
      event.preventDefault();
    };
    const up = (event: KeyboardEvent): void => {
      if (isTextEntryTarget(event.target)) return;
      if (KEY_LEFT.has(event.key)) this.setHeld('left', false);
      else if (KEY_RIGHT.has(event.key)) this.setHeld('right', false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.detach.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    });
  }

  /** The four ways a press can end without a matching release. */
  private bindLifecycle(): void {
    const release = (): void => this.releaseAll();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    this.detach.push(() => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    });
  }

  private setHeld(side: 'left' | 'right', value: boolean): void {
    if (!this.active) return;
    if (this.held[side] === value) return;
    this.held[side] = value;
    this.buttons[side].toggleAttribute('data-held', value);
    this.emitDirection();
  }

  private requestJump(): void {
    if (!this.active || this.jumpsLeft <= 0) return;
    // Optimistic only in the UI: the button dims immediately so a second press
    // does not feel ignored, but the server still decides whether it counted.
    this.options.onChange({ direction: this.lastDirection, jump: true });
  }

  private releaseAll(): void {
    if (!this.held.left && !this.held.right && this.lastDirection === 0) return;
    this.held.left = false;
    this.held.right = false;
    this.buttons.left.removeAttribute('data-held');
    this.buttons.right.removeAttribute('data-held');
    this.emitDirection();
  }

  private emitDirection(): void {
    const direction = resolveDirection(this.held.left, this.held.right);
    if (direction === this.lastDirection) return;
    this.lastDirection = direction;
    this.options.onChange({ direction, jump: false });
  }
}

/**
 * Both directions held reads as neutral.
 *
 * Picking the most recent instead would be defensible, but neutral is the one
 * answer that cannot surprise: the player is pressing two opposing things and
 * the wizard stands still, which is what pressing two opposing things means.
 */
export function resolveDirection(left: boolean, right: boolean): MoveDirection {
  if (left === right) return 0;
  return left ? -1 : 1;
}
