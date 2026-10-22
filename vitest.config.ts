import { defineConfig } from 'vitest/config';

/**
 * One runner for the whole monorepo. Per-workspace settings live in each
 * project's own config; this file only decides what gets collected and how
 * coverage is judged.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/server', 'apps/client', './vitest.tooling.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['apps/server/src/**', 'packages/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts'],
      /* The plan commits to >=80% server coverage, enforced in CI.
         Thresholds start here and are raised, never lowered. */
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
