/**
 * Gives a CSS module's class names a type.
 *
 * Vite types a CSS module as `Record<string, string>`, and this project turns
 * on `noPropertyAccessFromIndexSignature`, so `styles.header` does not
 * compile. Writing `styles['header']` everywhere would satisfy the compiler
 * and discard what the flag is for: against an index signature a typo like
 * `styles['hedaer']` is `string | undefined` and silently renders an element
 * with no styling.
 *
 * Naming the classes makes a typo a compile error instead. The names are
 * hand-written and so can drift from the stylesheet — `assertNames` is the
 * check that stops them, and `components.test.tsx` runs it.
 */
export function typedStyles<const T extends readonly string[]>(
  module_: unknown,
  /* Present to infer `T` from the call site, not to be read: the names come
     from a `const` array so TypeScript can turn them into a literal union. */
  _names: T,
): Readonly<Record<T[number], string>> {
  return module_ as Readonly<Record<T[number], string>>;
}

/**
 * Compares a declared name list against what the stylesheet actually exports.
 *
 * Only meaningful when the test runner compiles CSS modules; with a
 * pass-through proxy every name resolves and the check is vacuous. The client
 * Vitest config sets `css.include` for exactly this reason.
 */
export function exportedNames(module_: unknown): string[] {
  return Object.keys(module_ as Record<string, string>).sort();
}
