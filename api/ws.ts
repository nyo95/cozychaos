import { createCozyChaosServer } from '../server/src/app.js';

// Vercel's WebSocket Public Beta accepts a standard Node HTTP server export.
// Keep one server per warm Function instance so sockets in that instance share
// the same authoritative RoomManager.
const { httpServer } = createCozyChaosServer();

export default httpServer;
