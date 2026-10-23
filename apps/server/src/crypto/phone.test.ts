import { describe, expect, it } from 'vitest';
import {
  formatPhoneForDisplay,
  isValidPhone,
  normalizePhone,
  PhoneFormatError,
} from '@csas/shared';
import { PhoneCipher } from './phone.js';

const cipher = new PhoneCipher({
  encryptionKey: Buffer.alloc(32, 7).toString('base64'),
  hashPepper: 'p'.repeat(32),
});

describe('normalization', () => {
  /* Every spelling of one number must become one number. Otherwise a customer
     holds several rate-limit buckets by typing their number differently, which
     is a bypass of the OTP limits rather than a cosmetic problem. */
  const spellings = [
    '+96170123456',
    '0096170123456',
    '96170123456',
    '070123456',
    '70 123 456',
    '70-123-456',
    '(70) 123.456',
    ' +961 70 123 456 ',
  ];

  it.each(spellings)('reads %s as one number', (input) => {
    expect(normalizePhone(input)).toBe('+96170123456');
  });

  it('accepts a seven-digit national number', () => {
    expect(normalizePhone('3123456')).toBe('+9613123456');
  });

  it('refuses an empty value', () => {
    expect(() => normalizePhone('   ')).toThrow(PhoneFormatError);
  });

  it('refuses a number that is too short to be real', () => {
    expect(() => normalizePhone('12345')).toThrow(/7 or 8 national digits/);
  });

  it('refuses a number that is too long', () => {
    expect(() => normalizePhone('+961701234567890')).toThrow(/national digits/);
  });

  /* The destination allow-list (messaging-lebanon.md): paid sends to arbitrary
     countries are the mechanism of SMS-pumping fraud. */
  it('refuses another country', () => {
    expect(() => normalizePhone('+447700900123')).toThrow(/not allowed/);
  });

  it('refuses letters pretending to be a number', () => {
    expect(() => normalizePhone('not-a-number')).toThrow(/no digits/);
  });

  it('exposes a non-throwing form for validation', () => {
    expect(isValidPhone('70123456')).toBe(true);
    expect(isValidPhone('+447700900123')).toBe(false);
  });

  it('formats for display without changing the stored value', () => {
    expect(formatPhoneForDisplay('+96170123456')).toBe('+961 70 123 456');
  });
});

describe('encryption', () => {
  it('round-trips a number', () => {
    const stored = cipher.encrypt('+96170123456');
    expect(cipher.decrypt(stored)).toBe('+96170123456');
  });

  it('never stores the number in readable form', () => {
    expect(cipher.encrypt('+96170123456')).not.toContain('70123456');
  });

  /* A fresh IV per call: the same number encrypts differently every time, which
     is exactly why the ciphertext cannot be used as a lookup key and the hash
     has to exist. */
  it('produces a different ciphertext each time', () => {
    expect(cipher.encrypt('+96170123456')).not.toBe(cipher.encrypt('+96170123456'));
  });

  /* The GCM tag is an integrity check: an attacker with write access to the
     database cannot swap one customer's number for another's undetected. */
  it('refuses a tampered value rather than returning something plausible', () => {
    const stored = cipher.encrypt('+96170123456');
    const [iv, ciphertext, tag] = stored.split('.') as [string, string, string];
    const flipped = `${ciphertext.slice(0, -2)}${ciphertext.endsWith('AA') ? 'AB' : 'AA'}`;
    expect(() => cipher.decrypt(`${iv}.${flipped}.${tag}`)).toThrow();
  });

  it('refuses a malformed stored value', () => {
    expect(() => cipher.decrypt('not-a-stored-value')).toThrow(/malformed/);
    expect(() => cipher.decrypt('a.b')).toThrow(/malformed/);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(
      () =>
        new PhoneCipher({
          encryptionKey: Buffer.alloc(16, 1).toString('base64'),
          hashPepper: 'p'.repeat(32),
        }),
    ).toThrow(/32 bytes/);
  });

  it('names the variable in that error without printing the key', () => {
    try {
      new PhoneCipher({ encryptionKey: 'c2hvcnQ=', hashPepper: 'p'.repeat(32) });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('PHONE_ENCRYPTION_KEY');
      expect((error as Error).message).not.toContain('c2hvcnQ');
    }
  });
});

describe('the lookup hash', () => {
  it('is deterministic, so login can find a number in one indexed read', () => {
    expect(cipher.hash('+96170123456')).toBe(cipher.hash('+96170123456'));
  });

  it('normalizes first, so one number is one bucket', () => {
    expect(cipher.hash('070123456')).toBe(cipher.hash('+961 70 123 456'));
  });

  it('is not reversible to the number', () => {
    expect(cipher.hash('+96170123456')).not.toContain('70123456');
  });

  /* The pepper is what makes a stolen dump useless on its own: Lebanese mobile
     numbers are a small enough space to hash exhaustively without it. */
  it('differs under a different pepper, so a dump alone cannot be enumerated', () => {
    const other = new PhoneCipher({
      encryptionKey: Buffer.alloc(32, 7).toString('base64'),
      hashPepper: 'q'.repeat(32),
    });
    expect(other.hash('+96170123456')).not.toBe(cipher.hash('+96170123456'));
  });

  it('compares two hashes in constant time', () => {
    const value = cipher.hash('+96170123456');
    expect(cipher.hashesMatch(value, value)).toBe(true);
    expect(cipher.hashesMatch(value, cipher.hash('+96171123456'))).toBe(false);
    expect(cipher.hashesMatch(value, 'short')).toBe(false);
  });
});
