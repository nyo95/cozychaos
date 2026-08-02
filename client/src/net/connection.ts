import type { ClientMessage, ServerMessage } from '@cozy/shared';

/**
 * A thin, reconnecting WebSocket wrapper typed to the shared protocol.
 *
 * The client is never authoritative (PRD §15), so this does nothing but send
 * validated `ClientMessage`s and hand back parsed `ServerMessage`s. All game
 * rules live on the server; this is a mailbox.
 */
export interface Connection {
  /** Returns false when the socket is not currently open. */
  send(message: ClientMessage): boolean;
  close(): void;
  readonly isOpen: boolean;
}

export interface ConnectionHandlers {
  onOpen?: () => void;
  onMessage: (message: ServerMessage) => void;
  onClose?: () => void;
}

/**
 * Resolves the server URL. In dev the Vite client and the ws server run on
 * different ports, so an explicit `VITE_SERVER_URL` wins. HTTPS deployments
 * use the same-origin `/ws` route (Vercel); HTTP development keeps the
 * conventional port so a phone on the same LAN can join.
 */
interface ServerLocation {
  readonly protocol: string;
  readonly hostname: string;
  readonly host: string;
}

export function resolveServerUrl(
  current: ServerLocation = location,
  env: Readonly<Record<string, unknown>> = import.meta.env,
): string {
  const explicit = env['VITE_SERVER_URL'];
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  if (current.protocol === 'https:') return `wss://${current.host}/ws`;
  const configuredPort = env['VITE_SERVER_PORT'];
  const port = typeof configuredPort === 'string' && configuredPort.length > 0
    ? configuredPort
    : '8787';
  return `ws://${current.hostname}:${port}`;
}

export function connect(url: string, handlers: ConnectionHandlers): Connection {
  let socket: WebSocket | null = null;
  let closedByUser = false;
  let open = false;

  const openSocket = (): void => {
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      open = true;
      handlers.onOpen?.();
    });
    socket.addEventListener('message', (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // A malformed frame from the server is ignored rather than fatal.
      }
    });
    socket.addEventListener('close', () => {
      open = false;
      handlers.onClose?.();
      // A dropped connection during a match is worth one silent retry, which
      // pairs with the server's reconnect window (A-06).
      if (!closedByUser) setTimeout(openSocket, 1000);
    });
    socket.addEventListener('error', () => socket?.close());
  };

  openSocket();

  return {
    send(message) {
      if (!socket || !open) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    close() {
      closedByUser = true;
      socket?.close();
    },
    get isOpen() {
      return open;
    },
  };
}
