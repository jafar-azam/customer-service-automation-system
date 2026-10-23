import { Secret, TOTP } from 'otpauth';
import type { SecretCipher } from '../../crypto/secret-cipher.js';

/**
 * Time-based one-time passwords (RFC 6238).
 *
 * Mandatory for admins, optional for agents — an admin can read every
 * customer's conversation, approve what the assistant is allowed to say, and
 * promote a model, so a stolen admin password must not be enough on its own.
 *
 * The secret is stored **encrypted**, with the same cipher and key as phone
 * numbers. A TOTP secret in a database dump is a permanent second factor for
 * the attacker: unlike a password it cannot be "changed by the user later
 * anyway", because nobody knows it has leaked.
 */

export const TOTP_ISSUER = 'C.S.A.S';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

/**
 * Accept the previous and next 30-second step as well as the current one.
 *
 * `window: 1` is the usual compromise: phone clocks drift, and a code typed at
 * second 29 arrives at second 31. It widens the guessing surface from one
 * 6-digit code to three — 3 in a million per attempt — which the five-attempt
 * lockout makes irrelevant. A window of 0 produces support tickets; a window of
 * 3 or more is sloppy.
 */
const VALIDATION_WINDOW = 1;

export interface TotpEnrolment {
  /** Base32, to be encrypted before it is stored. */
  readonly secret: string;
  /** `otpauth://…` — what the authenticator app scans. */
  readonly uri: string;
}

function buildTotp(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * SHA-1 is specified deliberately, and it is not a weakness here. RFC 6238's
 * default is HMAC-SHA-1, and it is what every authenticator app assumes when a
 * URI omits the algorithm; HMAC-SHA-1 has no practical break, and the secret —
 * not the hash — is what an attacker needs. Choosing SHA-256 would mean codes
 * that silently fail to match in half the apps people actually use.
 */
export function createEnrolment(email: string): TotpEnrolment {
  /* 20 random bytes = 160 bits, the size RFC 4226 recommends for the key. */
  const secret = new Secret({ size: 20 }).base32;
  return { secret, uri: buildTotp(secret, email).toString() };
}

/**
 * True when `code` is valid for `secret` right now.
 *
 * `otpauth`'s `validate` returns the matched time-step delta or `null`, so a
 * returned `0` — the current step — must not be read as falsy. That mistake
 * rejects every correctly-typed code at the exact moment it is most correct.
 */
export function verifyTotp(secret: string, code: string, label = 'staff'): boolean {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  const delta = buildTotp(secret, label).validate({
    token: normalized,
    window: VALIDATION_WINDOW,
  });
  return delta !== null;
}

/** Decrypts a stored secret and checks a code against it. */
export function verifyStoredTotp(
  cipher: SecretCipher,
  encryptedSecret: string,
  code: string,
  label = 'staff',
): boolean {
  try {
    return verifyTotp(cipher.decrypt(encryptedSecret), code, label);
  } catch {
    /* A secret that will not decrypt is a corrupt or tampered record. Fail
       closed: the admin-assisted reset in step 07 is the way out. */
    return false;
  }
}

/**
 * The demo secret, used only when `DEMO_MODE` is on.
 *
 * A reviewer who clones this repository has no authenticator seeded, and
 * mandatory admin 2FA would lock them out of their own demo. So `DEMO_MODE`
 * seeds a fixed, documented secret and the dev inbox shows the current code.
 * The 2FA code path itself is unchanged and fully tested — only the secret's
 * provenance is demo-only — and the environment validator refuses `DEMO_MODE`
 * when `NODE_ENV=production`.
 */
export function currentDemoCode(secret: string, label = 'demo-admin'): string {
  return buildTotp(secret, label).generate();
}
