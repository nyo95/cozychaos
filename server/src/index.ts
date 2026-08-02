import { createServer } from 'node:http';
import { CONFIG, parseClientMessage, type PlayerSlot, type ServerMessage } from '@cozy/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from './rooms.js';
import { Room } from './room.js';

/**
 * The WebSocket adapter. Thin by design: it maps sockets to room seats and
 * forwards validated messages. Every rule of the game lives in `Room`
 * (PRD §15, §21 — the authority is the room, not the transport).
 */

const PORT = Number(process.env['PORT'] ?? 8787);
const TICK_MS = 1000 / 30;

const manager = new RoomManager();

const httpServer = createServer((req, res) => {
  // A trivial health check, useful behind a load balancer or for `curl`.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: manager.size }));
    return;
  }
  res.writeHead(426);
  res.end('Upgrade required');
});

const wss = new WebSocketServer({ server: httpServer });

interface Connection {
  room: Room | null;
  slot: PlayerSlot | null;
}

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

  socket.on('close', () => {
    if (connection.room !== null && connection.slot !== null) {
      connection.room.markDisconnected(connection.slot, Date.now(), send);
    }
  });

  socket.on('error', () => {
    if (connection.room !== null && connection.slot !== null) {
      connection.room.markDisconnected(connection.slot, Date.now(), send);
    }
  });
});

setInterval(() => manager.tick(Date.now()), TICK_MS);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cozy Chaos server on :${PORT}  (phase clock ${TICK_MS.toFixed(1)}ms)`);
});
