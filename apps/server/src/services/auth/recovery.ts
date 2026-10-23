import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { PasswordResetToken, RecoveryCode, StaffUser } from '../../db/models/index.js';
import { maskEmail } from '../../observability/logger.js';
import { record } from '../audit.js';
import { idempotencyKey, type EmailProvider } from '../providers/email.js';
import { hashPassword, assessPassword } from './password.js';
import { revokeAllForStaff } from './tokens.js';

/**
 * Getting back in: password reset, and recovery codes for a lost authenticator.
 *
 * Both are the same shape of problem — proving identity without the credential
 * you normally use — and both are where an attacker would rather attack than
 * the login form, because a recovery flow that is too helpful is a way in.
 *
 * The rules here mirror step 06's:
 *   * the response never says whether an account exists;
 *   * the secret is stored only as a hash;
 *   * using it invalidates it, and ends every session the account had.
 */

/** Long enough that it is unguessable, short enough to fit in a URL. */
const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** SHA-256, not Argon2: these are 256-bit random values, not passwords. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/* ── Password reset ─────────────────────────────────────────────────────── */

export interface RequestResetOptions {
  readonly email: string;
  readonly env: Env;
  readonly logger: Logger;
  readonly email_: EmailProvider;
  readonly ip?: string;
}

/**
 * Starts a reset. **Always reports success.**
 *
 * The response, the status code and the time taken are identical whether or
 * not the address belongs to an account. An endpoint that says "no such user"
 * turns a leaked address list into a verified staff directory, and this one is
 * unauthenticated by necessity.
 *
 * Any previous unused token for the account is invalidated first, so a reset
 * requested twice leaves exactly one live token rather than two.
 */
export async function requestPasswordReset({
  email,
  env,
  logger,
  email_: mailer,
  ip,
}: RequestResetOptions): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const staff = await StaffUser.findOne({ email: normalized, status: 'active' })
    .select('_id email name')
    .lean<{ _id: Types.ObjectId; email: string; name: string } | null>();

  if (!staff) {
    /* Audited, because a burst of resets for addresses that do not exist is
       exactly the reconnaissance worth noticing. */
    await record(logger, {
      action: 'staff.password.reset_requested',
      actorType: 'system',
      outcome: 'failure',
      ...(ip === undefined ? {} : { ip }),
      metadata: { reason: 'unknown_account', emailMasked: maskEmail(normalized) },
    });
    return;
  }

  await PasswordResetToken.updateMany(
    { staffId: staff._id, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );

  const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  await PasswordResetToken.create({
    staffId: staff._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    ...(ip === undefined ? {} : { requestIp: ip }),
  });

  /* The link carries the token; the stored notification carries only the fact
     that a reset was sent. A dev inbox that stored the token would be a
     collection of live credentials. */
  const link = `${env.APP_BASE_URL}/staff/reset-password#token=${token}`;

  await mailer.send({
    to: staff.email,
    kind: 'password_reset',
    templateKey: 'staff.password_reset',
    subject: 'Reset your C.S.A.S password',
    preview: [
      `Hello ${staff.name},`,
      '',
      'Use this link within 30 minutes to choose a new password:',
      link,
      '',
      'If you did not ask for this, you can ignore it — nothing has changed.',
    ].join('\n'),
    /* Per token, not per account: two legitimate requests are two emails. */
    idempotencyKey: idempotencyKey('password_reset', hashToken(token)),
    staffId: staff._id,
  });

  await record(logger, {
    action: 'staff.password.reset_requested',
    actorType: 'system',
    targetType: 'StaffUser',
    targetId: String(staff._id),
    ...(ip === undefined ? {} : { ip }),
  });
}

export type ResetOutcome =
  | { readonly kind: 'completed'; readonly staffId: string; readonly sessionsRevoked: number }
  | { readonly kind: 'invalid_token' }
  | { readonly kind: 'weak_password'; readonly problems: readonly string[] };

export interface CompleteResetOptions {
  readonly token: string;
  readonly newPassword: string;
  readonly logger: Logger;
  readonly ip?: string;
}

/**
 * Finishes a reset.
 *
 * Three things happen together, and the order matters: the token is consumed,
 * the password is replaced, and **every session the account had is revoked**.
 * A reset usually means "someone else may have had access"; leaving their
 * sessions alive would make the reset theatre.
 */
export async function completePasswordReset({
  token,
  newPassword,
  logger,
  ip,
}: CompleteResetOptions): Promise<ResetOutcome> {
  const record_ = await PasswordResetToken.findOne({ tokenHash: hashToken(token) }).select(
    '+tokenHash staffId expiresAt usedAt',
  );

  const expired = (record_?.expiresAt.getTime() ?? 0) <= Date.now();
  if (!record_ || record_.usedAt !== undefined || expired) {
    /* One answer for "never existed", "already used" and "too late": the
       caller holding an invalid token learns nothing from the difference. */
    return { kind: 'invalid_token' };
  }

  const staff = await StaffUser.findById(record_.staffId)
    .select('email name')
    .lean<{ email: string; name: string } | null>();
  if (!staff) return { kind: 'invalid_token' };

  const assessment = assessPassword(newPassword, { email: staff.email, name: staff.name });
  if (!assessment.acceptable) {
    /* The token is **not** consumed: a weak choice is a retry, not an attack,
       and burning the token would force a whole new email round trip. */
    return { kind: 'weak_password', problems: assessment.problems };
  }

  await PasswordResetToken.updateOne({ _id: record_._id }, { $set: { usedAt: new Date() } });

  await StaffUser.updateOne(
    { _id: record_.staffId },
    {
      $set: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
      },
      /* A reset also clears a lockout — otherwise someone locked out by an
         attacker's guessing would still be locked out after recovering. */
      $unset: { lockedUntil: '' },
    },
  );

  const sessionsRevoked = await revokeAllForStaff(record_.staffId, 'password_reset');

  await record(logger, {
    action: 'staff.password.reset_completed',
    actorType: 'staff',
    actorStaffId: record_.staffId,
    targetType: 'StaffUser',
    targetId: String(record_.staffId),
    ...(ip === undefined ? {} : { ip }),
    metadata: { sessionsRevoked },
  });

  return { kind: 'completed', staffId: String(record_.staffId), sessionsRevoked };
}

/* ── Recovery codes ─────────────────────────────────────────────────────── */

export const RECOVERY_CODE_COUNT = 10;

/**
 * `4f3a-9c2e-7b1d` — grouped, lower case, no ambiguous characters.
 *
 * Read aloud and typed by a person who has just lost their phone, so the
 * alphabet excludes `0/o` and `1/l`. 12 characters from a 32-symbol alphabet
 * is 60 bits: unguessable, and the five-attempt lockout applies anyway.
 */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generateCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? 'x');
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((group) => group.join(''))
    .join('-');
}

/** Normalised before hashing, so case and dashes do not matter when typing. */
function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hashCode(code: string): string {
  return createHash('sha256').update(normalizeCode(code)).digest('hex');
}

/**
 * Issues ten codes and returns them **once**.
 *
 * Only hashes are stored, so they cannot be shown again — which is the point,
 * and must be said plainly in the UI. Regenerating invalidates the previous
 * batch: ten live codes at a time, never twenty.
 */
export type StaffRef = Types.ObjectId | string;

export async function generateRecoveryCodes(
  staffId: StaffRef,
  logger: Logger,
): Promise<readonly string[]> {
  const batchId = randomUUID();
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateCode);

  await RecoveryCode.deleteMany({ staffId });
  await RecoveryCode.insertMany(
    codes.map((code) => ({ staffId, codeHash: hashCode(code), batchId })),
  );

  await record(logger, {
    action: 'staff.totp.enrolled',
    actorType: 'staff',
    actorStaffId: staffId,
    targetType: 'StaffUser',
    targetId: String(staffId),
    metadata: { recoveryCodesIssued: codes.length, batchId },
  });

  return codes;
}

/**
 * Spends one code, if it matches an unused one.
 *
 * Single use is enforced by a conditional update rather than read-then-write:
 * two simultaneous attempts with the same code must not both succeed, and
 * `usedAt: { $exists: false }` in the filter makes the database decide.
 */
export async function consumeRecoveryCode(
  staffId: StaffRef,
  code: string,
  logger: Logger,
): Promise<boolean> {
  const result = await RecoveryCode.updateOne(
    { staffId, codeHash: hashCode(code), usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );

  if (result.modifiedCount === 0) return false;

  const remaining = await RecoveryCode.countDocuments({ staffId, usedAt: { $exists: false } });
  await record(logger, {
    action: 'staff.recovery_code.used',
    actorType: 'staff',
    actorStaffId: staffId,
    targetType: 'StaffUser',
    targetId: String(staffId),
    metadata: { remaining },
  });

  return true;
}

export function countUnusedRecoveryCodes(staffId: StaffRef): Promise<number> {
  return RecoveryCode.countDocuments({ staffId, usedAt: { $exists: false } });
}
