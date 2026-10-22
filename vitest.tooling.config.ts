import { defineConfig } from 'vitest/config';

/** Tests for the repository's own tooling (the secret scanner, for now). */
export default defineConfig({
  test: {
    name: 'tooling',
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
});
