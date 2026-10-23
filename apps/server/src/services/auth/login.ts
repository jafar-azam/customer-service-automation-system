import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { SecretCipher } from '../../crypto/secret-cipher.js';
import { StaffUser } from '../../db/models/index.js';
import { maskEmail } from '../../observability/logger.js';
import { record } from '../audit.js';
import { hashPassword, spendVerificationTime, verifyPassword } from './password.js';
import { consumeRecoveryCode } from './recovery.js';
import { verifyStoredTotp } from './totp.js';
import { createSession, issueAccessToken, type CreatedSession } from './tokens.js';

/**
 * Staff login.
 *
 * Three rules shape this file, and each one costs something:
 *
 * 1. **Every failure looks the same.** Unknown account, wrong password, locked
 *    account and disabled account all return `invalid_credentials`. The reason
 *    goes to the audit log and to the operator; the caller learns nothing it
 *    did not already know. Telling a user "this account is locked" is friendlier
 *    and hands an attacker a list of real accounts, so the friendliness is
 *    spent in the recovery flow (step 07) instead, where identity is proven.
 *
 * 2. **Every failure costs the same.** A login for an account that does not
 *    exist still spends one Argon2 verification. Without that, "no such user"
 *    returns in a millisecond and "wrong password" takes ~50 ms — a remotely
 *    measurable oracle for which staff accounts exist.
 *
 * 3. **One disclosure is deliberate and bounded.** When the password is correct
 *    but the second factor is missing, the response says `totp_required`. That
 *    does tell the caller the password was right — to a caller who has just
 *    proved they know it. The alternative, a generic failure, makes the UI
 *    unusable and pushes people towards weaker factors.
 */

/** Failures before the account is locked. */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Backoff doubles from one minute, capped at an hour.
 *
 * Exponential because a human who mistypes twice should not be stopped, while
 * an automated attempt should slow to uselessness. Capped because a permanent
 * lock is a denial-of-service an attacker can inflict on any staff member
 * whose email they know — the lock must expire on its own.
 */
export function lockDurationMs(failedCount: number): number {
  const over = Math.max(0, failedCount - MAX_FAILED_ATTEMPTS);
  return Math.min(60_000 * 2 ** over, 60 * 60_000);
}

export type LoginResult =
  | {
      readonly kind: 'success';
      readonly accessToken: string;
      readonly session: CreatedSession;
      readonly staff: { readonly id: string; readonly name: string; readonly role: string };
      readonly mustChangePassword: boolean;
    }
  | { readonly kind: 'invalid_credentials' }
  | { readonly kind: 'totp_required' }
  | { readonly kind: 'totp_enrolment_required'; readonly staffId: string };

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly totp?: string;
  /** Used instead of a one-time code when the authenticator is lost. */
  readonly recoveryCode?: string;
  readonly userAgent?: string;
  readonly ip?: string;
}

export interface LoginDeps {
  readonly env: Env;
  readonly logger: Logger;
}

/**
 * Records one failed attempt and locks the account once there are enough.
 *
 * Shared by the password and the one-time-code paths on purpose: two counters
 * would mean five password guesses *and* five code guesses, which is not the
 * limit this is meant to impose.
 */
async function countFailure(
  staff: { _id: unknown; failedLoginCount: number },
  logger: Logger,
  auditBase: Record<string, unknown>,
  reason: string,
): Promise<void> {
  const failedLoginCount = staff.failedLoginCount + 1;
  const update: Record<string, unknown> = { failedLoginCount };
  if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    update['lockedUntil'] = new Date(Date.now() + lockDurationMs(failedLoginCount));
  }
  await StaffUser.updateOne({ _id: staff._id }, { $set: update });

  await record(logger, {
    ...(auditBase as { actorType: 'staff' }),
    action: failedLoginCount >= MAX_FAILED_ATTEMPTS ? 'staff.locked' : 'staff.login.failed',
    outcome: 'failure',
    metadata: { reason, failedLoginCount },
  });
}

export async function login(
  { email, password, totp, recoveryCode, userAgent, ip }: LoginInput,
  { env, logger }: LoginDeps,
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const staff = await StaffUser.findOne({ email: normalizedEmail }).select(
    '+passwordHash +totpSecretEncrypted',
  );

  if (!staff) {
    /* Spend the time anyway (rule 2), then answer exactly as for a wrong
       password (rule 1). */
    await spendVerificationTime(password);
    await record(logger, {
      action: 'staff.login.failed',
      actorType: 'system',
      outcome: 'failure',
      ...(ip === undefined ? {} : { ip }),
      metadata: { reason: 'unknown_account', emailMasked: maskEmail(normalizedEmail) },
    });
    return { kind: 'invalid_credentials' };
  }

  const auditBase = {
    actorType: 'staff' as const,
    actorStaffId: staff._id,
    targetType: 'StaffUser',
    targetId: String(staff._id),
    ...(ip === undefined ? {} : { ip }),
  };

  const locked = (staff.lockedUntil?.getTime() ?? 0) > Date.now();
  if (locked || staff.status === 'disabled') {
    await spendVerificationTime(password);
    await record(logger, {
      ...auditBase,
      action: 'staff.login.failed',
      outcome: 'failure',
      metadata: { reason: locked ? 'locked' : 'disabled' },
    });
    return { kind: 'invalid_credentials' };
  }

  const { valid, needsUpgrade } = await verifyPassword(staff.passwordHash, password);

  if (!valid) {
    await countFailure(staff, logger, auditBase, 'bad_password');
    return { kind: 'invalid_credentials' };
  }

  /* Password is correct from here on. */

  const totpRequired = staff.role === 'admin' || staff.totpSecretEncrypted !== undefined;

  if (totpRequired && staff.totpSecretEncrypted === undefined) {
    /* An admin who has never enrolled. Not a failure — a step they must
       complete before they can do anything (step 07 adds the enrolment flow).
       Counted separately so it cannot be confused with a bad password. */
    return { kind: 'totp_enrolment_required', staffId: String(staff._id) };
  }

  if (totpRequired) {
    /* A recovery code stands in for the authenticator. It is checked first
       because someone using one has, by definition, no code to offer. */
    if (recoveryCode !== undefined && recoveryCode !== '') {
      if (!(await consumeRecoveryCode(staff._id, recoveryCode, logger))) {
        await countFailure(staff, logger, auditBase, 'bad_recovery_code');
        return { kind: 'invalid_credentials' };
      }
    } else if (totp === undefined || totp === '') {
      return { kind: 'totp_required' };
    } else {
      const cipher = new SecretCipher(env.PHONE_ENCRYPTION_KEY);
      if (!verifyStoredTotp(cipher, String(staff.totpSecretEncrypted), totp, normalizedEmail)) {
        /* A wrong code counts towards the same lockout as a wrong password:
           otherwise the second factor is a free 6-digit guessing game for
           anyone who has the password. */
        await countFailure(staff, logger, auditBase, 'bad_totp');
        return { kind: 'invalid_credentials' };
      }
    }
  }

  const session = await createSession({
    staffId: staff._id,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(ip === undefined ? {} : { ip }),
  });

  const accessToken = await issueAccessToken({
    staffId: String(staff._id),
    role: staff.role,
    familyId: session.familyId,
    secret: env.ACCESS_TOKEN_SECRET,
  });

  const update: Record<string, unknown> = { failedLoginCount: 0, lastLoginAt: new Date() };
  /* The Argon2 parameters have been raised since this hash was written, and
     the one moment the plaintext is available is now. The user is told
     nothing, because nothing about their password has changed. */
  if (needsUpgrade) update['passwordHash'] = await hashPassword(password);

  await StaffUser.updateOne({ _id: staff._id }, { $set: update, $unset: { lockedUntil: '' } });

  await record(logger, { ...auditBase, action: 'staff.login.succeeded' });

  return {
    kind: 'success',
    accessToken,
    session,
    staff: { id: String(staff._id), name: staff.name, role: staff.role },
    mustChangePassword: staff.mustChangePassword,
  };
}
