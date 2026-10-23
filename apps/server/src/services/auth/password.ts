import { hash, parseOptions, verify } from '@node-rs/argon2';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { adjacencyGraphs, dictionary } from '@zxcvbn-ts/language-common';

/**
 * Staff passwords.
 *
 * **Argon2id, 64 MiB.** OWASP's baseline for Argon2id is 19 MiB with two
 * iterations; memory is the parameter that costs a GPU attacker most, so it is
 * raised here. A handful of staff logins a day cannot notice 64 MiB, and the
 * cost of one cracked staff password is the whole system.
 *
 * The parameters live inside the hash string, so a future change is detectable
 * and `needsRehash` upgrades the stored hash on the next successful login —
 * without ever asking the user to do anything.
 */
export const ARGON2_OPTIONS = {
  algorithm: 2 as const /* Argon2id */,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
};

/**
 * ASVS 2.1: length over composition.
 *
 * No "must contain a symbol" rule. Composition rules push people towards
 * `Password1!` — predictable to a cracker, annoying to a human — while a long
 * passphrase is both easier to remember and harder to attack. So the rules are:
 * at least 12 characters, at most 128 (a bound on Argon2 work, not on
 * strength), every character allowed, and the password must not be *guessable*.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * zxcvbn scores 0–4 by estimating how many guesses a password would survive.
 * 3 means "safely unguessable without a slow hash" — appropriate for staff
 * accounts that can read every customer's conversation.
 *
 * This replaces a downloaded breach list. It carries the common-password
 * dictionaries with it, so the check works offline, in CI and on a laptop with
 * no network — and it catches patterns a list cannot: `csas-support-2026`,
 * keyboard walks, dates, and the user's own name and email.
 */
export const MIN_PASSWORD_SCORE = 3;

/* One instance, built once: the dictionaries are megabytes, and rebuilding
   them per call would make every password change noticeably slow. No
   `translations` — the feedback is returned as codes and translated by the
   client, which already has to speak Arabic and English. */
const zxcvbn = new ZxcvbnFactory({ dictionary, graphs: adjacencyGraphs });

export interface PasswordAssessment {
  readonly acceptable: boolean;
  readonly score: number;
  /** Stable codes, not prose: the client translates them (Arabic and English). */
  readonly problems: readonly string[];
  /** zxcvbn's own advice, shown as a hint. Never a hard failure on its own. */
  readonly suggestions: readonly string[];
}

export interface PasswordContext {
  readonly email?: string;
  readonly name?: string;
}

/** Words that are guessable *for this product*, whoever the user is. */
const PRODUCT_WORDS = ['csas', 'support', 'helpdesk', 'customerservice'];

/** Strips case, spaces and separators: `Rania-Haddad_1` → `raniahaddad1`. */
function flatten(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Words the password must not contain: the user's own identity and the
 * product's own name.
 *
 * **zxcvbn's `userInputs` is not enough on its own**, and this was measured
 * rather than assumed: `csas-support-2026` scores **4 of 4** with the email
 * and all its fragments supplied, and `haddad-haddad-1` scores **3** — both at
 * or above the strength floor. The estimator penalises a password that *is* a
 * user input far more than one that merely *contains* it inside something
 * longer.
 *
 * NIST SP 800-63B asks for context-specific words to be refused, so the check
 * is explicit: the flattened password may not contain any identity fragment of
 * three characters or more.
 */
export function containsPersonalDetail(password: string, context: PasswordContext): boolean {
  const flat = flatten(password);
  if (flat === '') return false;

  const fragments = [context.email, context.name]
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .flatMap((value) => value.split(/[@._\s-]+/))
    .concat(PRODUCT_WORDS)
    .map(flatten)
    /* Two characters would match almost anything; three is the shortest
       fragment that carries identity ("ali", "sam"). */
    .filter((fragment) => fragment.length >= 3);

  return fragments.some((fragment) => flat.includes(fragment));
}

export function assessPassword(
  password: string,
  context: PasswordContext = {},
): PasswordAssessment {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) problems.push('too_short');
  if (password.length > MAX_PASSWORD_LENGTH) problems.push('too_long');

  /* A long password made of one repeated character passes zxcvbn's length
     heuristics in some versions; it is not a password. */
  if (password.length > 0 && new Set(password).size < 4) problems.push('too_repetitive');

  const userInputs = [context.email, context.name]
    .filter((value): value is string => typeof value === 'string' && value !== '')
    /* Split the email so `rania.haddad@csas.local` also blocks `rania` and
       `haddad`, not only the whole string. */
    .flatMap((value) => [value, ...value.split(/[@._\s-]+/)])
    .filter((value) => value.length > 2);

  const result = zxcvbn.check(password, userInputs);
  if (result.score < MIN_PASSWORD_SCORE) problems.push('too_guessable');
  if (containsPersonalDetail(password, context)) problems.push('contains_personal_detail');

  return {
    acceptable: problems.length === 0,
    score: result.score,
    problems,
    suggestions: result.feedback.suggestions,
  };
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a password, and says whether the stored hash is out of date.
 *
 * Returns a result object rather than throwing, because a wrong password is an
 * expected outcome on a login endpoint, not an exceptional one — and because
 * the caller must treat "wrong password" and "no such account" identically.
 */
export interface VerifyResult {
  readonly valid: boolean;
  readonly needsUpgrade: boolean;
}

/**
 * True when a stored hash was made with weaker parameters than we use now.
 *
 * `@node-rs/argon2` has no `needsRehash`, but the parameters are encoded in
 * the hash string and `parseOptions` reads them back — so the comparison is
 * exact rather than a guess, and raising the cost later upgrades every hash on
 * its owner's next login.
 */
export function isOutdatedHash(storedHash: string): boolean {
  try {
    const stored = parseOptions(storedHash);
    return (
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison --
         the library types this as its own enum; the value is the same 2. */
      stored.algorithm !== ARGON2_OPTIONS.algorithm ||
      stored.memoryCost < ARGON2_OPTIONS.memoryCost ||
      stored.timeCost < ARGON2_OPTIONS.timeCost
    );
  } catch {
    /* Unparseable: treat as outdated so a successful login replaces it. */
    return true;
  }
}

export async function verifyPassword(storedHash: string, password: string): Promise<VerifyResult> {
  try {
    const valid = await verify(storedHash, password, ARGON2_OPTIONS);
    return { valid, needsUpgrade: valid && isOutdatedHash(storedHash) };
  } catch {
    /* A malformed or truncated hash is a corrupt record, not a valid login.
       Failing closed here means a damaged row locks one account out rather
       than letting anyone in. */
    return { valid: false, needsUpgrade: false };
  }
}

/**
 * A hash of a value nobody knows, used to spend the same work on a login for
 * an account that does not exist.
 *
 * Without this, "no such user" returns in a millisecond and "wrong password"
 * takes the ~50 ms Argon2 costs — which is a remotely measurable oracle for
 * *which staff accounts exist*. Generated once per process at first use.
 */
let dummyHash: string | undefined;

export async function spendVerificationTime(password: string): Promise<void> {
  dummyHash ??= await hashPassword(`no-such-account-${String(Math.random())}`);
  await verifyPassword(dummyHash, password);
}
