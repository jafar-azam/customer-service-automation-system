import { describe, expect, it } from 'vitest';
import { USAGE, parseArgs } from './break-glass.js';

/**
 * The CLI's behaviour against a live database is exercised by hand during the
 * recovery drill in `docs/operations` — it reads from a terminal and is meant
 * to be awkward. What is worth testing automatically is the argument handling,
 * because a flag that silently does nothing is how a dangerous tool gets run
 * twice.
 */

describe('argument parsing', () => {
  it('reads the address and the reason', () => {
    const options = parseArgs(['--email', 'admin@csas.local', '--reason', 'lost phone']);
    expect(options).toEqual({ email: 'admin@csas.local', reason: 'lost phone', assumeYes: false });
  });

  it('treats --yes as opt-in only', () => {
    expect(parseArgs([]).assumeYes).toBe(false);
    expect(parseArgs(['--yes']).assumeYes).toBe(true);
  });

  /* A missing value must not silently consume the next flag as its argument. */
  it('reports a flag with no value as absent', () => {
    expect(parseArgs(['--email']).email).toBeUndefined();
  });

  it('ignores flags it does not know', () => {
    const options = parseArgs(['--force', '--email', 'a@b.test', '--reason', 'x']);
    expect(options.email).toBe('a@b.test');
  });
});

describe('the usage text', () => {
  /* It is the only documentation someone reads at 3 a.m. */
  it('names both required flags and what the tool does', () => {
    expect(USAGE).toContain('--email');
    expect(USAGE).toContain('--reason');
    expect(USAGE).toContain('audit log');
    expect(USAGE).toContain('never creates an account');
  });
});
