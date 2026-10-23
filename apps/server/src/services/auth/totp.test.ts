import { describe, expect, it } from 'vitest';
import { SecretCipher } from '../../crypto/secret-cipher.js';
import {
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  createEnrolment,
  currentDemoCode,
  verifyStoredTotp,
  verifyTotp,
} from './totp.js';

const cipher = new SecretCipher(Buffer.alloc(32, 9).toString('base64'));

describe('enrolment', () => {
  it('produces a base32 secret and a scannable URI', () => {
    const { secret, uri } = createEnrolment('admin@csas.test');
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('C.S.A.S');
  });

  /* 160 bits, as RFC 4226 recommends: base32 encodes 20 bytes as 32 chars. */
  it('uses a 160-bit secret', () => {
    expect(createEnrolment('admin@csas.test').secret).toHaveLength(32);
  });

  it('never produces the same secret twice', () => {
    expect(createEnrolment('a@csas.test').secret).not.toBe(createEnrolment('a@csas.test').secret);
  });
});

describe('verification', () => {
  const { secret } = createEnrolment('admin@csas.test');

  it('accepts the code for the current moment', () => {
    expect(verifyTotp(secret, currentDemoCode(secret, 'admin@csas.test'), 'admin@csas.test')).toBe(
      true,
    );
  });

  /* `otpauth.validate` returns the matched step delta, and the current step is
     `0` — which is falsy. Reading the result as a boolean rejects every code
     at the exact moment it is most correct. */
  it('accepts a code whose matched delta is zero', () => {
    const code = currentDemoCode(secret, 'admin@csas.test');
    expect(verifyTotp(secret, code, 'admin@csas.test')).toBe(true);
  });

  it('rejects a code from a different secret', () => {
    const other = createEnrolment('other@csas.test').secret;
    expect(verifyTotp(secret, currentDemoCode(other, 'other@csas.test'))).toBe(false);
  });

  it('rejects anything that is not six digits', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(verifyTotp(secret, code)).toBe(false);
    }
  });

  it('tolerates spaces, because people paste codes with them', () => {
    const code = currentDemoCode(secret, 'admin@csas.test');
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, 'admin@csas.test')).toBe(
      true,
    );
  });

  it('uses six digits on a thirty-second period', () => {
    expect(TOTP_DIGITS).toBe(6);
    expect(TOTP_PERIOD_SECONDS).toBe(30);
    expect(currentDemoCode(secret)).toHaveLength(6);
  });
});

describe('the stored secret', () => {
  it('is encrypted at rest and still verifiable', () => {
    const { secret } = createEnrolment('admin@csas.test');
    const stored = cipher.encrypt(secret);

    expect(stored).not.toContain(secret);
    expect(
      verifyStoredTotp(
        cipher,
        stored,
        currentDemoCode(secret, 'admin@csas.test'),
        'admin@csas.test',
      ),
    ).toBe(true);
  });

  /* A secret that will not decrypt is a corrupt or tampered record. Failing
     closed locks one account out; failing open would make the second factor
     optional for anyone who can write to the database. */
  it('fails closed when the stored value is corrupt', () => {
    expect(verifyStoredTotp(cipher, 'not-a-stored-secret', '000000')).toBe(false);
  });

  it('fails closed when the value was encrypted with another key', () => {
    const other = new SecretCipher(Buffer.alloc(32, 1).toString('base64'));
    const { secret } = createEnrolment('admin@csas.test');
    expect(verifyStoredTotp(cipher, other.encrypt(secret), currentDemoCode(secret))).toBe(false);
  });
});
