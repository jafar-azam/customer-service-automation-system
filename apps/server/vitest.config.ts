import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      /**
       * Tests read the shared package's **source**, not its built output.
       *
       * Two reasons. A test run no longer depends on having built the package
       * first, which removes a confusing failure mode where the code is fixed
       * and the test still fails. And coverage attributes correctly: before
       * this, `packages/shared` reported 0% while its tests were passing,
       * because the instrumented file and the imported file were different
       * files.
       */
      '@csas/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: { name: 'server', environment: 'node', include: ['src/**/*.test.ts'] },
});
