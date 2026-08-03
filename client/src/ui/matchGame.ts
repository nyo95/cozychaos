import {
  CONFIG,
  composeStroke,
  predictLaunch,
  spawnPosition,
  type PlayerSlot,
  type RecipeSummary,
  type RoomView,
  type ServerMessage,
  type Snapshot,
  type Vec2,
} from '@cozy/shared';
import { StrokeCapture } from '../drawing/strokeCapture.js';
import { attachPointerStream } from '../input/pointer.js';
import { MoveControls } from '../input/moveControls.js';
import { connect, resolveServerUrl, type Connection } from '../net/connection.js';
import { SceneEffects } from '../rendering/effects.js';
import { drawMatchScene } from '../rendering/matchScene.js';
import {
  FULL_FRAME,
  createViewport,
  easeFrame,
  targetFrame,
  toArena,
  type CameraFrame,
  type Viewport,
} from '../rendering/viewport.js';
import { commitmentReadout, windReadout, wobbleLevel, wobblePipFills } from './matchPresentation.js';

interface SavedSeat {
  readonly name: string;
  readonly code: string;
  readonly token: string;
}

interface Elements {
  readonly lobby: HTMLElement;
  readonly match: HTMLElement;
  readonly connectionStatus: HTMLElement;
  readonly lobbyFeedback: HTMLElement;
  readonly nameInput: HTMLInputElement;
  readonly codeInput: HTMLInputElement;
  readonly createButton: HTMLButtonElement;
  readonly joinButton: HTMLButtonElement;
  readonly canvas: HTMLCanvasElement;
  readonly roomCode: HTMLElement;
  readonly copyButton: HTMLButtonElement;
  readonly phase: HTMLElement;
  readonly timer: HTMLElement;
  readonly turnLabel: HTMLElement;
  readonly hint: HTMLElement;
  readonly inkFill: HTMLElement;
  readonly inkLabel: HTMLElement;
  readonly windStatus: HTMLElement;
  readonly windArrow: HTMLElement;
  readonly playerNames: readonly [HTMLElement, HTMLElement];
  readonly playerStars: readonly [HTMLElement, HTMLElement];
  readonly playerStates: readonly [HTMLElement, HTMLElement];
  readonly playerWobbles: readonly [HTMLElement, HTMLElement];
  readonly actionLabel: HTMLElement;
  /** M-04 movement pad host. Left inert by Codex; populated by MoveControls. */
  readonly setupControlsSlot: HTMLElement;
  readonly spellPreview: HTMLElement;
  readonly spellRole: HTMLElement;
  readonly reveal: HTMLElement;
  readonly winnerPanel: HTMLElement;
  readonly winnerText: HTMLElement;
  readonly rematchButton: HTMLButtonElement;
  readonly leaveButton: HTMLButtonElement;
}

const PHASE_LABEL: Readonly<Record<RoomView['phase'], string>> = {
  setup: 'Ready',
  draw: 'Draw',
  cast: 'Aim',
  reveal: 'Reveal',
  resolve: 'Clash',
  score: 'Score',
};

const PHASE_ACTION: Readonly<Record<RoomView['phase'], string>> = {
  setup: 'Read the arena',
  draw: 'Draw your rune',
  cast: 'Drag to aim',
  reveal: 'Runes revealed',
  resolve: 'Watch the clash',
  score: 'Round complete',
};

const SESSION_KEY = 'cozy-chaos-seat';

/**
 * Playable online duel client. It only captures intent and paints server
 * snapshots; phases, spell reading, physics, and score remain authoritative.
 */
export class MatchGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly capture = new StrokeCapture();
  private readonly connection: Connection;
  private readonly effects = new SceneEffects();
  private readonly moveInput: MoveControls;
  private viewport: Viewport = createViewport(1, 1);
  private canvasSize = { width: 1, height: 1 };
  private camera: CameraFrame = FULL_FRAME;
  private lastFrameMs: number | null = null;
  private room: RoomView | null = null;
  private slot: PlayerSlot | null = null;
  private reconnectToken: string | null = null;
  private latestSnapshot: Snapshot = idleSnapshot();
  private submitted = false;
  /** M-03 — set only by a server ack, never by a successful `send()`. */
  private submitAcked = false;
  private castSubmitted = false;
  private castAcked = false;
  private castOrigin: Vec2 | null = null;
  private castDirection: Vec2 | null = null;
  private roomReceivedAt = performance.now();
  private preview: RecipeSummary | null = null;
  private resetAtNextSetup = false;
  private rematchVoted = false;
  private frame = 0;

  constructor(private readonly elements: Elements) {
    const context = elements.canvas.getContext('2d');
    if (context === null) throw new Error('2D canvas context unavailable');
    this.ctx = context;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // M-04. The pad reports intent; the server decides where anyone stands.
    // `send` returning false (socket not open) is deliberately not retried —
    // a queued movement intent replayed on reconnect would move a wizard
    // somewhere the player stopped asking for seconds ago.
    this.moveInput = new MoveControls(elements.setupControlsSlot, {
      onChange: (intent) => {
        if (this.slot === null || this.room?.phase !== 'setup') return;
        this.connection.send({ type: 'move', direction: intent.direction, jump: intent.jump });
      },
    });
    elements.codeInput.addEventListener('input', () => {
      elements.codeInput.value = elements.codeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
    });
    elements.createButton.addEventListener('click', () => this.join());
    elements.joinButton.addEventListener('click', () => this.join(elements.codeInput.value));
    elements.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.join(elements.codeInput.value);
    });
    elements.copyButton.addEventListener('click', () => void this.copyRoomCode());
    elements.rematchButton.addEventListener('click', () => this.voteRematch());
    elements.leaveButton.addEventListener('click', () => this.leave());

    attachPointerStream(
      elements.canvas,
      {
        onStart: (sample) => this.pointerStart(sample.position),
        onMove: (sample) => this.pointerMove(sample.position),
        onEnd: (sample) => this.pointerEnd(sample.position),
      },
      {
        toGameSpace: (clientX, clientY) => {
          const rect = elements.canvas.getBoundingClientRect();
          return toArena(this.viewport, clientX - rect.left, clientY - rect.top);
        },
      },
    );

    this.setLobbyEnabled(false);
    this.connection = connect(resolveServerUrl(), {
      onOpen: () => this.onOpen(),
      onMessage: (message) => this.onMessage(message),
      onClose: () => this.onClose(),
    });
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  private onOpen(): void {
    this.elements.connectionStatus.textContent = 'Server connected';
    this.elements.connectionStatus.className = 'connection is-online';
    this.setLobbyEnabled(true);
    const saved = readSavedSeat();
    if (this.room !== null && this.reconnectToken !== null && this.slot !== null) {
      this.connection.send({
        type: 'join',
        name: this.room.players[this.slot]?.name ?? 'Wizard',
        code: this.room.code,
        reconnectToken: this.reconnectToken,
      });
    } else if (saved) {
      this.elements.lobbyFeedback.textContent = `Rejoining room ${saved.code}...`;
      this.connection.send({
        type: 'join',
        name: saved.name,
        code: saved.code,
        reconnectToken: saved.token,
      });
    }
  }

  private onClose(): void {
    this.elements.connectionStatus.textContent = 'Reconnecting...';
    this.elements.connectionStatus.className = 'connection is-offline';
    this.setLobbyEnabled(false);
    if (this.room) this.elements.hint.textContent = 'Connection lost. Your seat is held for 30 seconds.';
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.slot = message.slot;
        this.reconnectToken = message.reconnectToken;
        saveSeat({
          name: message.room.players[message.slot]?.name ?? 'Wizard',
          code: message.code,
          token: message.reconnectToken,
        });
        this.showMatch();
        this.acceptRoom(message.room);
        break;
      case 'room':
        if (this.slot !== null) this.acceptRoom(message.room);
        break;
      case 'reveal':
        this.renderReveal(message.summaries);
        break;
      case 'frame':
        this.latestSnapshot = message.snapshot;
        this.effects.observe(message.snapshot, performance.now(), (slot) =>
          slot === 0 ? '#5fe0f0' : '#ff8fd0');
        break;
      case 'setupFrame':
        // M-04. The server owns these positions; the client only paints them.
        // No local integration, so there is nothing to reconcile and no way for
        // the two players to see different wizards.
        this.latestSnapshot = {
          ...this.latestSnapshot,
          bodies: this.latestSnapshot.bodies.map((body) => ({
            ...body,
            x: message.positions[body.slot]?.x ?? body.x,
            y: message.positions[body.slot]?.y ?? body.y,
          })),
        };
        if (this.slot !== null) this.moveInput.setJumpsLeft(message.jumpsLeft[this.slot] ?? 0);
        break;
      case 'ack':
        // M-03 — the only place a lock is confirmed. A rejection re-arms the
        // input if there is still phase left to use it in.
        if (message.of === 'submit') {
          this.submitAcked = message.accepted;
          if (!message.accepted) {
            this.submitted = message.reason === 'already-submitted';
            this.elements.hint.textContent =
              message.reason === 'phase-closed'
                ? 'Too late — that rune missed the Draw window.'
                : 'Rune already locked for this Turn.';
          }
        } else {
          this.castAcked = message.accepted;
          if (!message.accepted) {
            this.castSubmitted = message.reason === 'already-submitted';
            if (message.reason === 'phase-closed') {
              this.elements.hint.textContent = 'Too late — the server aimed forward for you.';
            }
          }
        }
        this.renderRoom();
        break;
      case 'score':
        this.resetAtNextSetup = message.knockouts.length > 0;
        if (message.winner !== null) this.showWinner(message.winner);
        break;
      case 'error':
        this.handleError(message.reason);
        break;
    }
  }

  private join(code?: string): void {
    if (!this.connection.isOpen) {
      this.elements.lobbyFeedback.textContent = 'Server is still connecting.';
      return;
    }
    const name = this.elements.nameInput.value.trim().slice(0, 24) || 'Wizard';
    const cleanCode = code?.trim().toUpperCase();
    if (cleanCode !== undefined && cleanCode.length !== 4) {
      this.elements.lobbyFeedback.textContent = 'Room code must be 4 characters.';
      return;
    }
    this.elements.lobbyFeedback.textContent = cleanCode ? `Joining ${cleanCode}...` : 'Creating room...';
    this.connection.send({ type: 'join', name, ...(cleanCode ? { code: cleanCode } : {}) });
  }

  private acceptRoom(next: RoomView): void {
    const previous = this.room;
    this.room = next;
    this.roomReceivedAt = performance.now();

    if (previous !== null && previous.winner !== null && next.winner === null) {
      this.latestSnapshot = idleSnapshot();
      this.rematchVoted = false;
      this.elements.rematchButton.disabled = false;
      this.elements.rematchButton.textContent = 'Rematch';
      this.elements.winnerPanel.hidden = true;
    }

    if (previous?.phase !== next.phase) {
      // M-04 — the movement pad exists only while Setup is on the clock.
      // Driven by the server's phase, not a local timer, so it closes at the
      // same instant for both players.
      this.moveInput.setActive(next.phase === 'setup');
      if (next.phase === 'draw') {
        this.capture.clear();
        this.effects.reset();
        this.preview = null;
        this.submitted = false;
        this.submitAcked = false;
        this.castSubmitted = false;
        this.castAcked = false;
        this.castOrigin = null;
        this.castDirection = null;
        this.elements.reveal.textContent = '';
      }
      if (next.phase === 'cast' && this.capture.isDrawing) this.capture.end();
      if (next.phase === 'resolve') {
        // The first authoritative frame arrives on the following server tick.
        // Use the new Round layout immediately without keeping stale geometry.
        this.latestSnapshot = { ...this.latestSnapshot, obstacles: next.obstacles };
      }
      if (next.phase === 'setup' && this.resetAtNextSetup) {
        this.latestSnapshot = idleSnapshot();
        this.resetAtNextSetup = false;
      }
    }
    this.renderRoom();
  }

  private pointerStart(point: Vec2): void {
    if (this.canDraw()) this.beginStroke(point);
    else if (this.canCast()) this.beginCast(point);
  }

  private pointerMove(point: Vec2): void {
    if (this.capture.isDrawing) this.extendStroke(point);
    else if (this.castOrigin !== null && this.canCast()) this.extendCast(point);
  }

  private pointerEnd(point: Vec2): void {
    if (this.capture.isDrawing) this.endStroke(point);
    else if (this.castOrigin !== null && this.canCast()) this.endCast(point);
  }

  private beginStroke(point: Vec2): void {
    if (!this.canDraw()) return;
    this.capture.begin(point);
    this.preview = null;
    this.renderInk();
  }

  private extendStroke(point: Vec2): void {
    if (!this.capture.isDrawing || !this.canDraw()) return;
    this.capture.extend(point);
    if (this.capture.stroke.length >= CONFIG.strokeLimits.minPoints) {
      this.preview = composeStroke(this.capture.stroke).recipe.summary;
    }
    this.renderInk();
    this.renderSpellPreview();
    if (!this.capture.isDrawing) this.submitStroke();
  }

  private endStroke(point: Vec2): void {
    if (!this.capture.isDrawing || !this.canDraw()) return;
    this.capture.extend(point);
    this.submitStroke();
  }

  private submitStroke(): void {
    if (this.submitted) return;
    const points = this.capture.end();
    this.preview = composeStroke(points).recipe.summary;
    if (!this.connection.send({ type: 'submit', points })) {
      this.elements.hint.textContent = 'Could not lock the spell. Draw again after reconnecting.';
      this.capture.clear();
      return;
    }
    // M-03: "sent" is not "locked". The pointer is disarmed so the player
    // cannot draw a second rune while the first is in flight, but the lock is
    // only claimed once the server acknowledges.
    this.submitted = true;
    this.submitAcked = false;
    this.renderRoom();
  }

  private canDraw(): boolean {
    return (
      this.connection.isOpen &&
      this.room?.phase === 'draw' &&
      this.room.players.filter((player) => player.connected).length === 2 &&
      !this.submitted &&
      this.room.winner === null
    );
  }

  private canCast(): boolean {
    return (
      this.connection.isOpen &&
      this.room?.phase === 'cast' &&
      this.room.players.filter((player) => player.connected).length === 2 &&
      !this.castSubmitted &&
      this.room.winner === null
    );
  }

  private beginCast(point: Vec2): void {
    this.castOrigin = point;
    this.castDirection = { x: this.slot === 0 ? 1 : -1, y: 0 };
  }

  private extendCast(point: Vec2): void {
    if (!this.castOrigin) return;
    this.castDirection = {
      x: point.x - this.castOrigin.x,
      y: point.y - this.castOrigin.y,
    };
  }

  private endCast(point: Vec2): void {
    this.extendCast(point);
    const direction = this.castDirection ?? { x: this.slot === 0 ? 1 : -1, y: 0 };
    if (!this.connection.send({ type: 'cast', direction })) {
      this.elements.hint.textContent = 'Cast was not sent. The server will aim forward.';
      return;
    }
    this.castSubmitted = true;
    this.renderRoom();
  }

  private renderRoom(): void {
    const room = this.room;
    if (!room) return;
    this.elements.roomCode.textContent = room.code;
    const connected = room.players.filter((player) => player.connected).length;
    this.elements.match.dataset['phase'] = connected < 2 ? 'waiting' : room.phase;
    this.elements.match.dataset['localSlot'] = String(this.slot ?? 0);
    this.elements.turnLabel.textContent = `Round ${room.round + 1}`;
    this.elements.phase.textContent = connected < 2
      ? 'Waiting'
      : PHASE_LABEL[room.phase];
    this.elements.actionLabel.textContent = connected < 2
      ? 'Waiting for rival'
      : room.phase === 'draw' && this.submitted
        ? (this.submitAcked ? 'Rune locked' : 'Sending rune...')
        : room.phase === 'cast' && this.castSubmitted
          ? (this.castAcked ? 'Aim locked' : 'Sending aim...')
          : PHASE_ACTION[room.phase];
    const wind = windReadout(room.wind.x);
    this.elements.windStatus.textContent = `${wind.label} · ${room.obstacles.length} crystals`;
    this.elements.windArrow.dataset['direction'] = String(wind.direction);

    for (const slot of [0, 1] as const) {
      const player = room.players[slot];
      this.elements.playerNames[slot].textContent = player?.name ?? 'Waiting...';
      this.elements.playerStars[slot].textContent = stars(player?.stars ?? 0);
      const isLocal = slot === this.slot;
      const privatelyComposing = room.phase === 'draw' || room.phase === 'cast';
      const identity = isLocal
        ? (this.submitAcked && room.phase === 'draw' ? 'Rune locked' : this.castAcked && room.phase === 'cast' ? 'Aim locked' : 'You')
        : (privatelyComposing ? 'Rune hidden' : 'Rival');
      this.elements.playerStates[slot].textContent = player?.connected ? identity : 'Offline';
      this.elements.playerStates[slot].classList.toggle('is-offline', !player?.connected);
      this.elements.playerStates[slot].classList.toggle('is-local', isLocal);
      this.renderWobble(slot);
    }

    if (room.players.filter((player) => player.connected).length < 2) {
      this.elements.hint.textContent = 'Share the room code. The duel starts when your rival joins.';
    } else if (room.phase === 'draw') {
      this.elements.hint.textContent = this.submitAcked
        ? 'Rune locked. Waiting for your rival...'
        : 'Small rune = fast and far. Big rune = heavy, slow, and it shields you.';
    } else if (room.phase === 'cast') {
      this.elements.hint.textContent = this.castAcked
        ? 'Direction locked. Waiting for Reveal...'
        : 'Drag to aim. Steep angles fall short — that is how you screen yourself.';
    } else if (room.phase === 'setup') {
      this.elements.hint.textContent = 'Read the wind and the crystals before you commit Ink.';
    } else if (room.phase === 'reveal') {
      this.elements.hint.textContent = 'Both rune bodies are revealed together.';
    } else if (room.phase === 'resolve') {
      this.elements.hint.textContent = 'No input now - the server resolves the chaos.';
    } else {
      this.elements.hint.textContent = room.winner === null ? 'Next turn starts soon.' : 'Match complete.';
    }
    this.renderInk();
    this.renderSpellPreview();
  }

  /**
   * The informed-commitment readout.
   *
   * With Ward gone, this is the only thing standing between the player and a
   * coin flip: before committing they must be able to tell whether the rune
   * they are drawing will cross the arena or land at their own feet. Reach is
   * computed by the same shared `predictLaunch` the simulation builds from, so
   * the promise on screen and the physics cannot drift apart.
   */
  private renderSpellPreview(): void {
    if (!this.preview) {
      this.elements.spellPreview.textContent = this.submitAcked
        ? 'Rune locked'
        : 'Draw anything. Small and quick, or big and heavy.';
      this.elements.spellRole.textContent = '';
      this.elements.spellRole.className = 'spell-readout__role';
      return;
    }
    const launch = predictLaunch(this.preview.inkCommitted);
    this.elements.spellPreview.textContent =
      `${launch.particles} nodes · mass ${launch.mass.toFixed(2)} · speed ${launch.speed.toFixed(2)}`;
    const readout = commitmentReadout(launch);
    this.elements.spellRole.textContent = readout.label;
    this.elements.spellRole.className = `spell-readout__role is-${readout.tone}`;
    this.elements.reveal.textContent = readout.detail;
  }

  private renderReveal(summaries: readonly (RecipeSummary | null)[]): void {
    const describe = (summary: RecipeSummary | null): string => {
      if (!summary) return 'no rune';
      const launch = predictLaunch(summary.inkCommitted);
      return `${launch.particles} nodes, mass ${launch.mass.toFixed(2)}, ${commitmentReadout(launch).label.toLowerCase()}`;
    };
    const rivalSlot = this.slot === 0 ? 1 : 0;
    const mine = this.slot === null ? null : summaries[this.slot] ?? null;
    const theirs = this.slot === null ? null : summaries[rivalSlot] ?? null;
    this.elements.reveal.textContent = `You: ${describe(mine)} — Rival: ${describe(theirs)}`;
  }

  private renderInk(): void {
    const remaining = this.room?.phase === 'draw' && !this.submitted
      ? this.capture.inkRemaining
      : this.preview?.inkReserved ?? CONFIG.ink.total;
    const fraction = remaining / CONFIG.ink.total;
    this.elements.inkFill.style.width = `${fraction * 100}%`;
    this.elements.inkFill.classList.toggle('is-low', fraction < CONFIG.ink.warnFraction);
    // Unspent Ink is simply unspent now. Ward was removed because its own
    // maths made it decorative, and because mass already is the defence.
    const rounded = Math.round(remaining);
    this.elements.inkLabel.textContent = `${rounded} Ink`;
    this.elements.inkLabel.parentElement?.setAttribute(
      'aria-label',
      `${rounded} of ${CONFIG.ink.total} Ink remaining`,
    );
  }

  private renderWobble(slot: PlayerSlot): void {
    const body = this.latestSnapshot.bodies.find((candidate) => candidate.slot === slot);
    const value = body?.wobble ?? 0;
    const level = wobbleLevel(value);
    const element = this.elements.playerWobbles[slot];
    element.dataset['level'] = String(level);
    element.style.setProperty('--wobble', String(value / CONFIG.wobble.max));
    // T-03 — each pip fills continuously. Three discrete steps threw away the
    // difference between Wobble 34 and 66, which knockback treats as large.
    const fills = wobblePipFills(value);
    const pips = element.children;
    for (let index = 0; index < pips.length && index < fills.length; index++) {
      (pips[index] as HTMLElement).style.setProperty('--fill', String(fills[index]));
    }
    element.setAttribute('role', 'progressbar');
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', String(CONFIG.wobble.max));
    element.setAttribute('aria-valuenow', String(Math.round(value)));
    element.setAttribute('aria-label', level === 0 ? 'No Wobble' : `Wobble ${level} of 3`);
  }

  private showWinner(winner: PlayerSlot): void {
    const won = winner === this.slot;
    this.elements.winnerText.textContent = won ? 'You won the duel!' : `${this.room?.players[winner]?.name ?? 'Your rival'} won this time.`;
    this.elements.winnerPanel.hidden = false;
  }

  private voteRematch(): void {
    if (this.rematchVoted || !this.connection.send({ type: 'rematch' })) return;
    this.rematchVoted = true;
    this.elements.rematchButton.disabled = true;
    this.elements.rematchButton.textContent = 'Waiting for rival...';
  }

  private leave(): void {
    this.connection.send({ type: 'leave' });
    clearSavedSeat();
    this.connection.close();
    location.reload();
  }

  private handleError(reason: string): void {
    if (reason === 'room not found' || reason === 'room full') {
      clearSavedSeat();
      this.room = null;
      this.slot = null;
      this.reconnectToken = null;
      this.elements.match.hidden = true;
      this.elements.lobby.hidden = false;
    }
    const friendly = reason === 'room not found'
      ? 'Room not found. Check the code or create a new room.'
      : reason === 'room full'
        ? 'That room already has two players.'
        : `Server rejected the request: ${reason}`;
    this.elements.lobbyFeedback.textContent = friendly;
    this.elements.hint.textContent = friendly;
  }

  private showMatch(): void {
    this.elements.lobby.hidden = true;
    this.elements.match.hidden = false;
    this.resize();
  }

  private setLobbyEnabled(enabled: boolean): void {
    this.elements.createButton.disabled = !enabled;
    this.elements.joinButton.disabled = !enabled;
  }

  private async copyRoomCode(): Promise<void> {
    if (!this.room) return;
    try {
      await navigator.clipboard.writeText(this.room.code);
      this.elements.copyButton.textContent = 'Copied';
      setTimeout(() => { this.elements.copyButton.textContent = 'Copy'; }, 1200);
    } catch {
      this.elements.copyButton.textContent = this.room.code;
    }
  }

  private resize(): void {
    const rect = this.elements.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.elements.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.elements.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.canvasSize = { width: rect.width, height: rect.height };
    this.viewport = createViewport(rect.width, rect.height, this.camera);
  }

  private loop(timeMs: number): void {
    const room = this.room;
    let remaining = 0;
    if (room) {
      remaining = Math.max(0, room.phaseRemainingMs - (performance.now() - this.roomReceivedAt));
      this.elements.timer.textContent = room.players.filter((player) => player.connected).length < 2
        ? '--'
        : (remaining / 1000).toFixed(1);
      for (const slot of [0, 1] as const) this.renderWobble(slot);
    }

    // Camera easing happens here, not on phase change, so the pull-back at
    // Reveal is a movement the player can follow rather than a hard cut.
    const deltaMs = this.lastFrameMs === null ? 16 : Math.min(64, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;
    const bothHere = (room?.players.filter((player) => player.connected).length ?? 0) === 2;
    const target = bothHere ? targetFrame(room?.phase ?? null, this.slot ?? 0) : FULL_FRAME;
    this.camera = easeFrame(this.camera, target, deltaMs);
    this.viewport = createViewport(this.canvasSize.width, this.canvasSize.height, this.camera);

    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    const visibleObstacles = room?.phase === 'resolve' || room?.phase === 'score'
      ? this.latestSnapshot.obstacles
      : room?.obstacles ?? this.latestSnapshot.obstacles;
    drawMatchScene(this.ctx, this.viewport, {
      snapshot: this.latestSnapshot,
      obstacles: visibleObstacles,
      localSlot: this.slot ?? 0,
      localStroke: room?.phase === 'draw' || room?.phase === 'cast' ? this.capture.stroke : [],
      drawing: room?.phase === 'draw',
      casting: room?.phase === 'cast',
      castProgress: room?.phase === 'cast'
        ? 1 - Math.min(1, remaining / CONFIG.phases.castMs)
        : 0,
      castOrigin: this.castOrigin,
      castDirection: this.castDirection,
      timeMs,
      wind: room?.wind ?? this.latestSnapshot.wind,
      effects: this.effects,
    });
    this.frame = requestAnimationFrame((next) => this.loop(next));
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.connection.close();
  }
}

function idleSnapshot(): Snapshot {
  return {
    timeMs: 0,
    wind: { x: 0, y: 0 },
    obstacles: [],
    bodies: ([0, 1] as const).map((slot) => ({
      slot,
      ...spawnPosition(slot),
      wobble: 0,
      alive: true,
    })),
    particles: [],
    bonds: [],
  };
}

function stars(count: number): string {
  return `${'★'.repeat(count)}${'☆'.repeat(Math.max(0, CONFIG.scoring.starsToWin - count))}`;
}

function readSavedSeat(): SavedSeat | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedSeat>;
    return typeof value.name === 'string' && typeof value.code === 'string' && typeof value.token === 'string'
      ? { name: value.name, code: value.code, token: value.token }
      : null;
  } catch {
    return null;
  }
}

function saveSeat(seat: SavedSeat): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(seat));
  } catch {
    // Private browsing may disable storage; the live match still works.
  }
}

function clearSavedSeat(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing else to clean up.
  }
}

export function mountMatchGame(): MatchGame {
  const byId = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`missing element #${id}`);
    return element as T;
  };
  return new MatchGame({
    lobby: byId('lobby'),
    match: byId('match'),
    connectionStatus: byId('connection-status'),
    lobbyFeedback: byId('lobby-feedback'),
    nameInput: byId<HTMLInputElement>('player-name'),
    codeInput: byId<HTMLInputElement>('room-input'),
    createButton: byId<HTMLButtonElement>('create-room'),
    joinButton: byId<HTMLButtonElement>('join-room'),
    canvas: byId<HTMLCanvasElement>('arena'),
    roomCode: byId('room-code'),
    copyButton: byId<HTMLButtonElement>('copy-code'),
    phase: byId('phase-label'),
    timer: byId('phase-timer'),
    setupControlsSlot: byId('setup-controls-slot'),
    turnLabel: byId('turn-label'),
    hint: byId('match-hint'),
    inkFill: byId('ink-fill'),
    inkLabel: byId('ink-label'),
    windStatus: byId('wind-status'),
    windArrow: byId('wind-arrow'),
    playerNames: [byId('player-0-name'), byId('player-1-name')],
    playerStars: [byId('player-0-stars'), byId('player-1-stars')],
    playerStates: [byId('player-0-state'), byId('player-1-state')],
    playerWobbles: [byId('player-0-wobble'), byId('player-1-wobble')],
    actionLabel: byId('action-label'),
    spellPreview: byId('spell-preview'),
    spellRole: byId('spell-role'),
    reveal: byId('reveal-summary'),
    winnerPanel: byId('winner-panel'),
    winnerText: byId('winner-text'),
    rematchButton: byId<HTMLButtonElement>('rematch'),
    leaveButton: byId<HTMLButtonElement>('leave-room'),
  });
}
