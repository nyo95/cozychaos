import { createServer, type Server } from 'node:http';
import {
  CONFIG,
  parseClientMessage,
  type PlayerSlot,
  type ServerMessage,
} from '../../shared/src/index.js';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room } from './room.js';
import { RoomManager } from './rooms.js';

const TICK_MS = 1000 / 30;

interface Connection {
  room: Room | null;
  slot: PlayerSlot | null;
}

export interface CozyChaosServer {
  readonly httpServer: Server;
  readonly manager: RoomManager;
  close(): void;
}

/**
 * Creates the authoritative HTTP + WebSocket transport without binding a port.
 * Local development calls `listen` in `index.ts`; Vercel exports the same
 * server from `api/ws.ts`. The room and simulation stay transport-agnostic.
 */
export function createCozyChaosServer(): CozyChaosServer {
  const manager = new RoomManager();

  const httpServer = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/ws/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: manager.size }));
      return;
    }
    res.writeHead(426);
    res.end('Upgrade required');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket: WebSocket) => {
    const connection: Connection = { room: null, slot: null };
    const send = (message: ServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    socket.on('message', (data) => {
      const message = parseClientMessage(String(data), CONFIG.strokeLimits.maxPoints);
      if (!message) {
        send({ type: 'error', reason: 'malformed message' });
        return;
      }

      if (message.type === 'join') {
        if (connection.room !== null) {
          send({ type: 'error', reason: 'already joined' });
          return;
        }
        const requestedCode = message.code?.trim();
        const room = requestedCode ? manager.get(requestedCode) : manager.getOrCreate(undefined);
        if (!room) {
          send({ type: 'error', reason: 'room not found' });
          return;
        }
        const slot = room.join(message.name, send, message.reconnectToken, Date.now());
        if (slot === null) {
          send({ type: 'error', reason: 'room full' });
          return;
        }
        connection.room = room;
        connection.slot = slot;
        return;
      }

      if (connection.room === null || connection.slot === null) {
        send({ type: 'error', reason: 'join a room first' });
        return;
      }

      switch (message.type) {
        case 'submit':
          connection.room.submitStroke(connection.slot, message.points);
          break;
        case 'cast':
          connection.room.submitCast(connection.slot, message.direction);
          break;
        case 'rematch':
          connection.room.voteRematch(connection.slot, Date.now());
          break;
        case 'leave':
          connection.room.markDisconnected(connection.slot, Date.now(), send);
          connection.room = null;
          connection.slot = null;
          break;
      }
    });

    const disconnect = (): void => {
      if (connection.room !== null && connection.slot !== null) {
        connection.room.markDisconnected(connection.slot, Date.now(), send);
      }
    };
    socket.on('close', disconnect);
    socket.on('error', disconnect);
  });

  const tick = setInterval(() => manager.tick(Date.now()), TICK_MS);
  tick.unref();

  return {
    httpServer,
    manager,
    close() {
      clearInterval(tick);
      wss.close();
      httpServer.close();
    },
  };
}
