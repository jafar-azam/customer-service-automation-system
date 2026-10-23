import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { normalizePhone } from '@csas/shared';

/**
 * Phone numbers: encrypted at rest, but still searchable.
 *
 * The number is simultaneously the login identifier (so it must be findable in
 * one indexed lookup) and the most sensitive single field in the database (so
 * it must not sit in plaintext in a dump). Those two requirements fight, and
 * the standard resolution is to store both forms:
 *
 *   phoneEncrypted — AES-256-GCM, reversible, what gets displayed
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

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const TAG_BYTES = 16;

export interface PhoneCipherOptions {
  /** 32 bytes, base64. Validated at startup by the environment schema. */
  readonly encryptionKey: string;
  /** ≥32 characters. Never stored with the data it protects. */
  readonly hashPepper: string;
}

export class PhoneCipher {
  readonly #key: Buffer;
  readonly #pepper: string;

  constructor({ encryptionKey, hashPepper }: PhoneCipherOptions) {
    const key = Buffer.from(encryptionKey, 'base64');
    if (key.length !== 32) {
      /* The message names the variable and the expected size, never the value.
         This throws at startup, and startup errors end up in log files. */
      throw new Error('PHONE_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256-GCM)');
    }
    this.#key = key;
    this.#pepper = hashPepper;
  }

  /**
   * Returns `iv.ciphertext.tag`, all base64url.
   *
   * A fresh random IV per call means the same number encrypts differently every
   * time — which is why the ciphertext cannot be used for lookup, and why the
   * hash exists. The GCM tag makes the value tamper-evident: an attacker with
   * write access to the database cannot swap one customer's number for another
   * without the decrypt failing.
   */
  encrypt(e164: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(e164, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, ciphertext, tag].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(stored: string): string {
    const parts = stored.split('.');
    if (parts.length !== 3) throw new Error('Stored phone value is malformed');
    const [ivPart, ciphertextPart, tagPart] = parts as [string, string, string];

    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Stored phone value is malformed');
    }

    const decipher = createDecipheriv(ALGORITHM, this.#key, iv);
    decipher.setAuthTag(tag);
    /* `final()` throws if the tag does not verify — that is the integrity
       check, and it must not be swallowed. */
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
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
