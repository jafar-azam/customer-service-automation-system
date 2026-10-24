import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Unmounts the React tree after every test.
 *
 * Testing Library registers this automatically only when Vitest's globals are
 * enabled. They are not: `globals: false` keeps `describe`/`it`/`expect` as
 * explicit imports, which is better for type-checking and for readers. The
 * trade is that cleanup has to be wired by hand — and without it a component
 * from one test stays in the document, so the next test's `findByRole` can
 * match the previous test's output and pass or fail for the wrong reason.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom implements `matchMedia` as a stub that throws when a listener is
 * attached, and the theme rules ask for one.
 *
 * It answers "no" to every query, which is the right default: no dark mode,
 * no reduced motion, so a test that depends on either has to say so.
 */
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});
