import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      // Point at source, not a build artefact: the client and server must run
      // the exact same classifier code (PRD §15), and a stale `dist` is the
      // easiest way for the preview and the server verdict to drift apart.
      '@cozy/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  // Listen on the LAN so a phone can join a desktop-hosted room during MVP tests.
  server: { host: true, port: 5173, open: false },
  build: { target: 'es2022', outDir: 'dist' },
});
