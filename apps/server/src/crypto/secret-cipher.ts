import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for short secrets held in the database.
 *
 * Extracted from the phone cipher in step 05 because step 06 needs exactly the
 * same thing for TOTP secrets: a value that must be recoverable (the server
 * computes codes from it) but must not be readable in a database dump. One
 * implementation, one set of tests, one place to get the IV handling right.
 *
 * AES-256-GCM rather than CBC or CTR: the authentication tag makes the value
 * tamper-evident, so an attacker with write access to the database cannot swap
 * one record's secret for another's and have it silently accepted.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const TAG_BYTES = 16;

export class SecretCipher {
  readonly #key: Buffer;

  /** @param encryptionKey 32 bytes, base64. Validated at startup. */
  constructor(encryptionKey: string, keyName = 'PHONE_ENCRYPTION_KEY') {
    const key = Buffer.from(encryptionKey, 'base64');
    if (key.length !== 32) {
      /* Names the variable and the expected size, never the value: this throws
         at startup, and startup errors end up in log files. */
      throw new Error(`${keyName} must decode to exactly 32 bytes (AES-256-GCM)`);
    }
    this.#key = key;
  }

  /**
   * Returns `iv.ciphertext.tag`, all base64url.
   *
   * A fresh random IV per call means the same input encrypts differently every
   * time. That is what makes the ciphertext useless as a lookup key — and why
   * anything that must be searchable needs a separate deterministic hash.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [iv, ciphertext, cipher.getAuthTag()]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  decrypt(stored: string): string {
    const parts = stored.split('.');
    if (parts.length !== 3) throw new Error('Stored secret is malformed');
    const [ivPart, ciphertextPart, tagPart] = parts as [string, string, string];

    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Stored secret is malformed');
    }

    const decipher = createDecipheriv(ALGORITHM, this.#key, iv);
    decipher.setAuthTag(tag);
    /* `final()` throws if the tag does not verify. That is the integrity
       check, and it must not be swallowed. */
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
