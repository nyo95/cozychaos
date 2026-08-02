import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from './connection.js';

describe('resolveServerUrl', () => {
  it('uses an explicit server URL first', () => {
    expect(resolveServerUrl(
      { protocol: 'https:', hostname: 'cozy.test', host: 'cozy.test' },
      { VITE_SERVER_URL: 'wss://socket.example/game' },
    )).toBe('wss://socket.example/game');
  });

  it('uses the same-origin websocket route for HTTPS deployments', () => {
    expect(resolveServerUrl(
      { protocol: 'https:', hostname: 'cozy.vercel.app', host: 'cozy.vercel.app' },
      {},
    )).toBe('wss://cozy.vercel.app/ws');
  });

  it('keeps the standalone server port for LAN development', () => {
    expect(resolveServerUrl(
      { protocol: 'http:', hostname: '192.168.1.8', host: '192.168.1.8:5173' },
      {},
    )).toBe('ws://192.168.1.8:8787');
  });

  it('honours a custom development server port', () => {
    expect(resolveServerUrl(
      { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173' },
      { VITE_SERVER_PORT: '9000' },
    )).toBe('ws://localhost:9000');
  });
});
