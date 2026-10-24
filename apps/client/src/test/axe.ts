import axe, { type AxeResults, type RunOptions, type Result } from 'axe-core';

/**
 * axe-core directly, rather than through a wrapper.
 *
 * `vitest-axe` is the obvious choice and is at 0.1.0, untouched since January
 * 2025. `axe-core` itself is maintained and is the part that does the work, so
 * the wrapper would be an unmaintained dependency in front of a maintained one
 * to save about thirty lines.
 *
 * **What this does not check: colour contrast.** jsdom has no layout engine
 * and computes no used colours, so axe disables `color-contrast` here — and a
 * green run would otherwise read as if it had passed. Contrast is covered
 * instead by `npm run check:contrast`, which computes every pair in the
 * palette from `docs/design/palettes.json`. The two together cover it; neither
 * alone does, and it is worth knowing which is which.
 */

/** WCAG 2.1 AA — the specification's committed target. Deliberately not 2.2:
    that is an open decision recorded in `docs/design/LOCALIZATION.md` §5. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export const RULES_UNAVAILABLE_IN_JSDOM = ['color-contrast'] as const;

export async function analyse(element: Element, options: RunOptions = {}): Promise<AxeResults> {
  return axe.run(element, {
    runOnly: { type: 'tag', values: TAGS },
    rules: Object.fromEntries(RULES_UNAVAILABLE_IN_JSDOM.map((rule) => [rule, { enabled: false }])),
    ...options,
  });
}

function describeViolation(violation: Result): string {
  const where = violation.nodes
    .map((node) => `      ${node.html}\n        ${node.failureSummary ?? ''}`)
    .join('\n');
  return `  ${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${where}`;
}

/**
 * Asserts a tree has no violations, and fails with the offending markup.
 *
 * The message matters more than it looks: "expected 1 to be 0" sends you
 * hunting, whereas the rule id, the element and axe's own failure summary
 * usually make the fix obvious without opening a browser.
 */
export async function expectNoViolations(element: Element): Promise<void> {
  const results = await analyse(element);
  if (results.violations.length > 0) {
    throw new Error(
      `axe found ${String(results.violations.length)} violation(s):\n` +
        results.violations.map((violation) => describeViolation(violation)).join('\n'),
    );
  }
}
