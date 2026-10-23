import { describe, expect, it } from 'vitest';
import {
  ARGON2_OPTIONS,
  MIN_PASSWORD_SCORE,
  assessPassword,
  hashPassword,
  isOutdatedHash,
  spendVerificationTime,
  verifyPassword,
} from './password.js';

/* An invented passphrase, strong enough to pass the policy and belonging to
   nothing. Marked so the repository's own scanner does not flag its own test. */
const STRONG = 'fourteen purple lanterns'; // secret-scan:allow

describe('the password policy', () => {
  /* ASVS 2.1: length over composition. A passphrase is accepted with no
     symbol, no digit and no capital. */
  it('accepts a long passphrase with no symbols at all', () => {
    const result = assessPassword('fourteen purple lanterns upstairs');
    expect(result.acceptable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('rejects anything under twelve characters', () => {
    expect(assessPassword('Sh0rt!').problems).toContain('too_short');
  });

  it('rejects a password longer than the Argon2 bound', () => {
    expect(assessPassword('a'.repeat(129)).problems).toContain('too_long');
  });

  /* The composition-rule trap: this satisfies "upper, lower, digit, symbol"
     and is one of the most guessed passwords in existence. */
  it('rejects Password1! despite it meeting every composition rule', () => {
    expect(assessPassword('Password1!').acceptable).toBe(false);
  });

  it('rejects a long run of one character', () => {
    expect(assessPassword('aaaaaaaaaaaaaaaa').problems).toContain('too_repetitive');
  });

  /* Measured, not assumed: zxcvbn scores this 4 of 4 even with `csas` passed
     as a user input, because it penalises a password that *is* a user input,
     not one that *contains* it. The explicit containment rule is what catches
     it — which is why the rule exists. */
  it('rejects a password built from the product name and the year', () => {
    const result = assessPassword('csas-support-2026', { email: 'admin@csas.local' });
    expect(result.acceptable).toBe(false);
    expect(result.problems).toContain('contains_personal_detail');
  });

  /* zxcvbn does catch this one — score 2 — because the *whole* name is passed
     as a user input. It is kept as a test because the containment rule must
     agree with the estimator, not contradict it. */
  it('rejects a staff member using their own name', () => {
    const result = assessPassword('Rania Haddad 1234', {
      email: 'rania.haddad@csas.local',
      name: 'Rania Haddad',
    });
    expect(result.acceptable).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining(['too_guessable', 'contains_personal_detail']),
    );
  });

  it('rejects the user own email as their password', () => {
    const result = assessPassword('rania.haddad@csas.local', {
      email: 'rania.haddad@csas.local',
      name: 'Rania Haddad',
    });
    expect(result.acceptable).toBe(false);
  });

  /* A surname inside a longer password: zxcvbn scores it 3, which passes the
     strength floor on its own. Only the containment rule refuses it. */
  it('rejects a fragment of the user email that zxcvbn considers strong enough', () => {
    const weak = assessPassword('haddad-haddad-1', { email: 'rania.haddad@csas.local' });
    expect(weak.score).toBeGreaterThanOrEqual(MIN_PASSWORD_SCORE);
    expect(weak.acceptable).toBe(false);
    expect(weak.problems).toEqual(['contains_personal_detail']);
  });

  it('allows a strong passphrase that merely shares a short word', () => {
    /* "up" is two characters, below the three-character floor, so a sensible
       passphrase is not refused for an accidental overlap. */
    const result = assessPassword('fourteen purple lanterns upstairs', {
      email: 'up@csas.local',
      name: 'Up',
    });
    expect(result.acceptable).toBe(true);
  });

  it('returns stable codes rather than prose, for translation', () => {
    expect(assessPassword('abc').problems.every((code) => /^[a-z_]+$/.test(code))).toBe(true);
  });
});

describe('hashing', () => {
  it('produces an Argon2id hash', async () => {
    expect(await hashPassword(STRONG)).toMatch(/^\$argon2id\$/);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same input'), hashPassword('same input')]);
    expect(a).not.toBe(b);
  });

  it('accepts the right password and rejects a near miss', async () => {
    const stored = await hashPassword(STRONG);
    expect((await verifyPassword(stored, STRONG)).valid).toBe(true);
    expect((await verifyPassword(stored, 'fourteen purple lantern')).valid).toBe(false);
  });

  /* A corrupt row must lock one account out, not let anyone in. */
  it('refuses a malformed stored hash rather than throwing', async () => {
    expect((await verifyPassword('not-a-hash', 'anything')).valid).toBe(false);
  });

  it('uses the memory cost the module documents', () => {
    expect(ARGON2_OPTIONS.memoryCost).toBe(65_536);
    expect(ARGON2_OPTIONS.algorithm).toBe(2);
  });
});

describe('upgrading a stored hash', () => {
  it('leaves a current hash alone', async () => {
    expect(isOutdatedHash(await hashPassword(STRONG))).toBe(false);
  });

  /* The point of recording parameters inside the hash: raising the cost later
     upgrades every password on its owner's next login, silently. */
  it('flags a hash made with less memory', async () => {
    const { hash } = await import('@node-rs/argon2');
    const weak = await hash(STRONG, { ...ARGON2_OPTIONS, memoryCost: 19_456 });
    expect(isOutdatedHash(weak)).toBe(true);
  });

  it('reports the upgrade alongside a successful verification', async () => {
    const { hash } = await import('@node-rs/argon2');
    const weak = await hash(STRONG, { ...ARGON2_OPTIONS, timeCost: 1 });
    const result = await verifyPassword(weak, STRONG);
    expect(result).toEqual({ valid: true, needsUpgrade: true });
  });

  it('never asks to upgrade a hash that did not verify', async () => {
    const stored = await hashPassword(STRONG);
    expect((await verifyPassword(stored, 'wrong')).needsUpgrade).toBe(false);
  });

  it('treats an unreadable hash as outdated', () => {
    expect(isOutdatedHash('garbage')).toBe(true);
  });
});

describe('equal-time failure', () => {
  /**
   * Without this, a login for an account that does not exist returns in a
   * millisecond while a wrong password costs the full Argon2 verification —
   * a remotely measurable oracle for which staff accounts exist.
   *
   * The assertion is deliberately loose: it checks that real work happened,
   * not that two timings match, because a timing comparison in a test suite
   * on a shared runner is a flake generator.
   */
  it('spends real verification work on an account that does not exist', async () => {
    const started = performance.now();
    await spendVerificationTime('whatever-they-typed');
    expect(performance.now() - started).toBeGreaterThan(5);
  });
});
