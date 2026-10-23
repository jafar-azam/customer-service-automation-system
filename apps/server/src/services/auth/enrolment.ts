import { SignJWT, jwtVerify } from 'jose';
import type { Types } from 'mongoose';
import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { SecretCipher } from '../../crypto/secret-cipher.js';
import { StaffUser } from '../../db/models/index.js';
import { record } from '../audit.js';
import { generateRecoveryCodes } from './recovery.js';
import { createEnrolment, verifyTotp } from './totp.js';
import { revokeAllForStaff } from './tokens.js';

/**
 * Setting up a second factor — including for the admin who cannot log in
 * without one.
 *
 * Step 06 left a deliberate hole: an admin with no TOTP secret is refused with
 * `totp_enrolment_required` and has no way to fix it. The obvious fixes are
 * both wrong. An unauthenticated enrolment endpoint would let anyone who knows
 * an admin's address attach *their own* authenticator. Enrolling automatically
 * at first login would mean the server chose the second factor, which is not a
 * second factor at all.
 *
 * So login issues a **narrow, short-lived enrolment ticket** when, and only
 * when, the password was correct and the account has no secret. It authorises
 * exactly two calls — start and confirm — for five minutes, and nothing else.
 * The password has already been proven; this ticket just carries that proof
 * across the two requests that set up the factor.
 */

const TICKET_TTL_SECONDS = 5 * 60;
const TICKET_AUDIENCE = 'csas-enrolment';

export async function issueEnrolmentTicket(staffId: string, secret: string): Promise<string> {
  return (
    new SignJWT({ purpose: 'totp_enrolment' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(staffId)
      .setIssuedAt()
      .setExpirationTime(`${String(TICKET_TTL_SECONDS)}s`)
      .setIssuer('csas')
      /* A distinct audience, so an enrolment ticket can never be presented as an
       access token — the API checks for `csas-api` and would refuse this. */
      .setAudience(TICKET_AUDIENCE)
      .sign(new TextEncoder().encode(secret))
  );
}

export async function verifyEnrolmentTicket(
  ticket: string,
  secret: string,
): Promise<string | undefined> {
  try {
    const { payload } = await jwtVerify(ticket, new TextEncoder().encode(secret), {
      issuer: 'csas',
      audience: TICKET_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (payload['purpose'] !== 'totp_enrolment') return undefined;
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

export interface StartEnrolmentResult {
  readonly secret: string;
  readonly uri: string;
}

/**
 * Produces a secret and the `otpauth://` URI an authenticator scans.
 *
 * **Not stored yet.** The secret is handed to the client and only written once
 * the user proves they have it by returning a working code. Storing it first
 * would leave half-enrolled accounts that cannot log in and cannot recover —
 * the exact state this flow exists to fix.
 */
export async function startEnrolment(staffId: string): Promise<StartEnrolmentResult | undefined> {
  const staff = await StaffUser.findById(staffId).select('email').lean<{ email: string } | null>();
  if (!staff) return undefined;

  const { secret, uri } = createEnrolment(staff.email);
  return { secret, uri };
}

export type ConfirmOutcome =
  | { readonly kind: 'enrolled'; readonly recoveryCodes: readonly string[] }
  | { readonly kind: 'wrong_code' }
  | { readonly kind: 'unknown_staff' }
  | { readonly kind: 'already_enrolled' };

export interface ConfirmEnrolmentOptions {
  readonly staffId: string;
  readonly secret: string;
  readonly code: string;
  readonly env: Env;
  readonly logger: Logger;
  readonly ip?: string;
}

/**
 * Stores the secret, but only after a working code proves the authenticator
 * really has it — and issues the ten recovery codes in the same moment, which
 * is the only moment they can be shown.
 */
export async function confirmEnrolment({
  staffId,
  secret,
  code,
  env,
  logger,
  ip,
}: ConfirmEnrolmentOptions): Promise<ConfirmOutcome> {
  const staff = await StaffUser.findById(staffId)
    .select('+totpSecretEncrypted email')
    .lean<{ _id: Types.ObjectId; email: string; totpSecretEncrypted?: string } | null>();

  if (!staff) return { kind: 'unknown_staff' };
  /* Re-enrolling over a working factor is how an attacker with a stolen
     session would replace it. Changing an existing factor goes through the
     authenticated re-enrolment path, which requires the current code. */
  if (staff.totpSecretEncrypted !== undefined) return { kind: 'already_enrolled' };

  if (!verifyTotp(secret, code, staff.email)) return { kind: 'wrong_code' };

  const cipher = new SecretCipher(env.PHONE_ENCRYPTION_KEY);
  await StaffUser.updateOne(
    { _id: staff._id },
    { $set: { totpSecretEncrypted: cipher.encrypt(secret), totpEnrolledAt: new Date() } },
  );

  const recoveryCodes = await generateRecoveryCodes(staff._id, logger);

  await record(logger, {
    action: 'staff.totp.enrolled',
    actorType: 'staff',
    actorStaffId: staff._id,
    targetType: 'StaffUser',
    targetId: String(staff._id),
    ...(ip === undefined ? {} : { ip }),
  });

  return { kind: 'enrolled', recoveryCodes };
}

export type AdminResetOutcome =
  | { readonly kind: 'reset'; readonly sessionsRevoked: number }
  | { readonly kind: 'unknown_staff' }
  | { readonly kind: 'confirmation_mismatch' }
  | { readonly kind: 'self_reset_refused' };

export interface AdminResetOptions {
  readonly adminId: string;
  readonly targetStaffId: string;
  /** The target's email, typed by the admin. */
  readonly confirmation: string;
  readonly logger: Logger;
  readonly ip?: string;
}

/**
 * An admin clears another staff member's second factor.
 *
 * For the real case: an agent loses their phone and has used their recovery
 * codes. It is also, unavoidably, a way for a compromised admin account to
 * strip a colleague's second factor — so it is constrained rather than
 * convenient:
 *
 * * the admin must type the target's **email address** to confirm, which makes
 *   a mis-click on the wrong row impossible;
 * * every session the target had is revoked, so a reset cannot be used to
 *   quietly keep access;
 * * it is audited with both identities, and the entry is one of the few that
 *   says who did something *to someone else*;
 * * an admin **cannot** use it on themselves — that is what break-glass is
 *   for, and it keeps this from being a one-click way to shed your own 2FA.
 */
export async function adminResetTotp({
  adminId,
  targetStaffId,
  confirmation,
  logger,
  ip,
}: AdminResetOptions): Promise<AdminResetOutcome> {
  if (adminId === targetStaffId) return { kind: 'self_reset_refused' };

  const target = await StaffUser.findById(targetStaffId)
    .select('email')
    .lean<{ _id: Types.ObjectId; email: string } | null>();
  if (!target) return { kind: 'unknown_staff' };

  if (confirmation.trim().toLowerCase() !== target.email.toLowerCase()) {
    await record(logger, {
      action: 'staff.totp.reset_by_admin',
      actorType: 'staff',
      actorStaffId: adminId,
      targetType: 'StaffUser',
      targetId: targetStaffId,
      outcome: 'failure',
      ...(ip === undefined ? {} : { ip }),
      metadata: { reason: 'confirmation_mismatch' },
    });
    return { kind: 'confirmation_mismatch' };
  }

  await StaffUser.updateOne(
    { _id: target._id },
    { $unset: { totpSecretEncrypted: '', totpEnrolledAt: '' }, $set: { failedLoginCount: 0 } },
  );

  const sessionsRevoked = await revokeAllForStaff(targetStaffId, 'admin');

  await record(logger, {
    action: 'staff.totp.reset_by_admin',
    actorType: 'staff',
    actorStaffId: adminId,
    targetType: 'StaffUser',
    targetId: targetStaffId,
    ...(ip === undefined ? {} : { ip }),
    metadata: { sessionsRevoked },
  });

  return { kind: 'reset', sessionsRevoked };
}
