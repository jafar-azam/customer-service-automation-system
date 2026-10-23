import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '@csas/shared';
import { SecretCipher } from './secret-cipher.js';

/**
 * Phone numbers: encrypted at rest, but still searchable.
 *
 * The number is simultaneously the login identifier (so it must be findable in
 * one indexed lookup) and the most sensitive single field in the database (so
 * it must not sit in plaintext in a dump). Those two requirements fight, and
 * the standard resolution is to store both forms:
 *
 *   phoneEncrypted — AES-256-GCM (SecretCipher), reversible, what gets displayed
 *   phoneHash      — HMAC-SHA-256 with a pepper, deterministic, what gets indexed
 *
 * Login hashes the submitted number and looks up `phoneHash`; nothing is
 * decrypted on the authentication path, so a timing difference there cannot
 * leak anything about stored values either.
 *
 * **Why HMAC with a pepper and not a password hash.** The lookup must be
 * deterministic, so no per-record salt is possible, and Argon2 with a fixed
 * salt would be both slow and no stronger here. The real threat is offline
 * enumeration: E.164 Lebanese mobiles are a space of a few million, so a plain
 * SHA-256 of every possible number is minutes of work. The pepper — held in the
 * environment, never in the database — is what makes a stolen collection
 * useless on its own. That is the whole design: the attacker needs the dump
 * *and* the application's configuration.
 */

export interface PhoneCipherOptions {
  /** 32 bytes, base64. Validated at startup by the environment schema. */
  readonly encryptionKey: string;
  /** >=32 characters. Never stored with the data it protects. */
  readonly hashPepper: string;
}

export class PhoneCipher {
  readonly #cipher: SecretCipher;
  readonly #pepper: string;

  constructor({ encryptionKey, hashPepper }: PhoneCipherOptions) {
    this.#cipher = new SecretCipher(encryptionKey, 'PHONE_ENCRYPTION_KEY');
    this.#pepper = hashPepper;
  }

  /** Reversible, for the rare moment a human must see the number. */
  encrypt(e164: string): string {
    return this.#cipher.encrypt(e164);
  }

  decrypt(stored: string): string {
    return this.#cipher.decrypt(stored);
  }

  /**
   * Deterministic lookup key. Normalizes first, so every spelling of one number
   * produces one hash — otherwise a customer could hold several rate-limit
   * buckets simply by typing their number differently.
   */
  hash(phone: string): string {
    const e164 = normalizePhone(phone);
    return createHmac('sha256', this.#pepper).update(e164).digest('base64url');
  }

  /** Constant-time comparison, for the rare path that compares two hashes. */
  hashesMatch(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
