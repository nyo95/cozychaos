import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Same alias the client build uses, so tests exercise the source the
      // browser will actually run rather than a stale build artefact.
      '@cozy/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'client/**/*.test.ts'],
    environment: 'node',
  },
});
