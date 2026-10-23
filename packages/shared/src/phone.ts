/**
 * Phone-number normalization.
 *
 * Lives in `packages/shared` because the client validates what it sends and the
 * server validates what it receives, and the two must agree on what "the same
 * number" means. Encryption and hashing stay server-side (`crypto/phone.ts`);
 * only the normalization rules are shared, and they contain no secrets.
 *
 * Normalizing **before** hashing is what makes `03 123 456`, `+961 3 123 456`
 * and `009613123456` one customer instead of three — and three customers for
 * one person means three OTP rate-limit buckets, which is a bypass.
 */

/** Lebanon. The destination allow-list starts here (messaging-lebanon.md). */
export const DEFAULT_COUNTRY_CODE = '961';

/**
 * Lebanese mobile numbers are 7 or 8 national digits: the legacy 7-digit form
 * (`3 123 456`, `71 123 456`) and the 8-digit form used by newer ranges. A
 * landline is 7 digits with an area code. Rather than encode every operator
 * prefix — they change, and a wrong list refuses real customers — the rule is a
 * length and shape check, with provider-level validation left to the point
 * where a message is actually sent.
 */
const NATIONAL_DIGITS = /^\d{7,8}$/;

export class PhoneFormatError extends Error {
  constructor(reason: string) {
    super(`Invalid phone number: ${reason}`);
    this.name = 'PhoneFormatError';
  }
}

/**
 * Returns E.164 (`+9613123456`) or throws.
 *
 * Accepts `+961…`, `00961…`, `961…` and a bare national number, with spaces,
 * dashes, dots and parentheses anywhere. Rejects anything else rather than
 * guessing: a number this function cannot parse is a number an OTP cannot
 * reach, and failing at the form is much cheaper than failing at the provider.
 */
export function normalizePhone(input: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const trimmed = input.trim();
  if (trimmed === '') throw new PhoneFormatError('empty');

  /* Keep a leading +, drop every other non-digit. */
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') throw new PhoneFormatError('no digits');

  let national: string;
  if (hasPlus || digits.startsWith('00')) {
    const international = digits.startsWith('00') ? digits.slice(2) : digits;
    if (!international.startsWith(countryCode)) {
      /* Not an error of format but of policy — the destination allow-list.
         Named separately so the caller can say something useful. */
      throw new PhoneFormatError(`country code +${international.slice(0, 3)} is not allowed`);
    }
    national = international.slice(countryCode.length);
  } else if (digits.startsWith(countryCode) && digits.length > countryCode.length + 6) {
    national = digits.slice(countryCode.length);
  } else {
    national = digits;
  }

  /* A single leading zero is the national trunk prefix: `03 123 456`. */
  if (national.startsWith('0')) national = national.slice(1);

  if (!NATIONAL_DIGITS.test(national)) {
    throw new PhoneFormatError(`expected 7 or 8 national digits, got ${String(national.length)}`);
  }

  return `+${countryCode}${national}`;
}

/** Non-throwing form, for validating without branching on exceptions. */
export function isValidPhone(input: string, countryCode = DEFAULT_COUNTRY_CODE): boolean {
  try {
    normalizePhone(input, countryCode);
    return true;
  } catch {
    return false;
  }
}

/**
 * `+9613123456` → `+961 3 123 456`. Display only.
 *
 * Never used as a key, never hashed, never compared — the stored form is always
 * E.164.
 */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^\+(\d{3})(\d{1,2})(\d{3})(\d{3})$/.exec(e164);
  if (!match) return e164;
  return `+${match[1] ?? ''} ${match[2] ?? ''} ${match[3] ?? ''} ${match[4] ?? ''}`;
}
