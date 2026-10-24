import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'client',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: ['src/test-setup.ts'],
    /* Actually compile CSS modules rather than returning a proxy that answers
       every name. The proxy would make `components.test.tsx`'s class-list
       check vacuous — a name that no rule defines would still resolve — and
       compiling gives the real exported keys to compare against.

       Layout is still not computed: jsdom has no engine, which is why axe's
       colour-contrast rule is disabled in `test/axe.ts` and the palette is
       checked separately by `npm run check:contrast`. */
    css: { include: [/\.module\.css$/] },
  },
});
