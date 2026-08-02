import { createCozyChaosServer } from './app.js';

/** Local entrypoint. Vercel exports the same transport from `api/ws.ts`. */

const PORT = Number(process.env['PORT'] ?? 8787);
const { httpServer } = createCozyChaosServer();

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cozy Chaos server on :${PORT}`);
});
