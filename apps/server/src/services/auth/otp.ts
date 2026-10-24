import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import type { Env } from '@csas/shared';
import { normalizePhone, PhoneFormatError } from '@csas/shared';
import { PhoneCipher } from '../../crypto/phone.js';
import { Customer, OtpChallenge } from '../../db/models/index.js';
import { maskPhone } from '../../observability/logger.js';
import { record } from '../audit.js';
import { DAILY_SEND_CAP, OTP_LIMITS, hit, hitAll, isSendingDisabled } from '../rate-limit.js';
import type { MessagingProvider } from '../providers/messaging.js';

/**
 * Customer login: a one-time code to a registered phone.
 *
 * Customers have **no password**. There is no public sign-up — an admin
 * registers them — so the only credential is possession of a number already on
 * file. That removes a whole class of breach and replaces it with a different
 * problem: every code costs money to send, and an endpoint that sends paid
 * messages on an unauthenticated request is the exact shape of SMS-pumping
 * fraud.
 *
 * So the controls here are mostly about *not sending*. From
 * `messaging-lebanon.md`, all of them in our code rather than a provider's:
 *
 *   destination allow-list · layered atomic limits · resend cooldown ·
 *   short expiry · bounded attempts · single use · daily cap with a kill
 *   switch · and never, anywhere, the code in a log.
 */

const CODE_DIGITS = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/**
 * `randomInt`, not `Math.random()`.
 *
 * A predictable six-digit code is not a second factor at all, and
 * `Math.random()` is seeded from a state an attacker can often infer. The
 * range is padded rather than reduced so every value from `000000` to `999999`
 * is equally likely — trimming leading zeros would quietly make a tenth of the
 * space unreachable.
 */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CODE_DIGITS, '0');
}

/** Peppered, so a stolen challenge table cannot be brute-forced offline —
    a six-digit space is a million guesses, which is seconds without one. */
function hashCode(code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${code}`).digest('hex');
}

function codesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type RequestOutcome =
  | { readonly kind: 'sent' }
  /* Deliberately indistinguishable from 'sent' at the API boundary. */
  | { readonly kind: 'suppressed'; readonly reason: string }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'invalid_number' };

export interface RequestCodeOptions {
  readonly phone: string;
  readonly channel: 'whatsapp' | 'sms';
  readonly env: Env;
  readonly logger: Logger;
  readonly messaging: MessagingProvider;
  readonly ip: string;
}

/**
 * Issues a code, if every gate agrees.
 *
 * The caller is told "accepted" whether or not the number belongs to a
 * customer — the same rule as the staff password reset, for the same reason:
 * this endpoint is unauthenticated, and anything else turns it into a lookup
 * service for who is a customer.
 *
 * A rate-limit refusal **is** visible, because hiding it would mean sending
 * the message anyway or lying about a retry that will not work. It carries no
 * information about whether the number exists.
 */
export async function requestCode({
  phone,
  channel,
  env,
  logger,
  messaging,
  ip,
}: RequestCodeOptions): Promise<RequestOutcome> {
  let e164: string;
  try {
    /* The destination allow-list: a full Lebanese mobile, not "anything
       starting with +961". Parsing is the allow-list. */
    e164 = normalizePhone(phone);
  } catch (error) {
    if (error instanceof PhoneFormatError) return { kind: 'invalid_number' };
    throw error;
  }

  const prefix = e164.slice(0, 4);

  /* Order matters: the cheapest, most specific limit first, so a flood against
     one number does not consume the shared per-prefix budget. */
  const limited = await hitAll([
    { rule: OTP_LIMITS.resend, subject: e164 },
    { rule: OTP_LIMITS.perPhone, subject: e164 },
    { rule: OTP_LIMITS.perIp, subject: ip },
    { rule: OTP_LIMITS.perPrefix, subject: prefix },
  ]);

  if (!limited.allowed) {
    await record(logger, {
      action: 'customer.otp.requested',
      actorType: 'system',
      outcome: 'failure',
      ip,
      metadata: {
        reason: 'rate_limited',
        rule: limited.rule?.name,
        phoneMasked: maskPhone(e164),
      },
    });
    return { kind: 'rate_limited', retryAfterSeconds: limited.retryAfterSeconds ?? 60 };
  }

  if (await isSendingDisabled()) {
    /* The kill switch is a hard stop, not an alert. */
    return { kind: 'suppressed', reason: 'sending_disabled' };
  }

  const cipher = new PhoneCipher({
    encryptionKey: env.PHONE_ENCRYPTION_KEY,
    hashPepper: env.PHONE_HASH_PEPPER,
  });
  const phoneHash = cipher.hash(e164);

  const customer = await Customer.findOne({ phoneHash, status: 'active' })
    .select('_id preferredLanguage')
    .lean<{ _id: unknown; preferredLanguage: 'ar' | 'en' } | null>();

  if (!customer) {
    /* No message is sent, and the caller cannot tell. The attempt is audited,
       because a run of these is somebody enumerating numbers. */
    await record(logger, {
      action: 'customer.otp.requested',
      actorType: 'system',
      outcome: 'failure',
      ip,
      metadata: { reason: 'unknown_number', phoneMasked: maskPhone(e164) },
    });
    return { kind: 'suppressed', reason: 'unknown_number' };
  }

  /* The budget cap is counted only for sends that will really happen, so a
     flood of unknown numbers cannot exhaust the day's allowance for real
     customers. */
  const budget = await hit(DAILY_SEND_CAP, 'global');
  if (!budget.allowed) {
    logger.error({ cap: DAILY_SEND_CAP.limit }, 'daily OTP send cap reached — sending stopped');
    return { kind: 'suppressed', reason: 'daily_cap_reached' };
  }

  const code = generateCode();
  const challenge = await OtpChallenge.create({
    phoneHash,
    codeHash: hashCode(code, env.PHONE_HASH_PEPPER),
    channel,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    maxAttempts: OTP_MAX_ATTEMPTS,
    deliveryStatus: 'queued',
    requestIp: ip,
  });

  const body =
    customer.preferredLanguage === 'ar'
      ? `رمز الدخول إلى C.S.A.S هو ${code}. صالح لمدة 5 دقائق. لا تشاركه مع أحد.`
      : `Your C.S.A.S sign-in code is ${code}. It is valid for 5 minutes. Do not share it.`;

  const { providerMessageId } = await messaging.send({
    to: e164,
    channel,
    kind: 'otp',
    templateKey: 'customer.otp',
    body,
    /* Per challenge: a genuine second request is a second message. */
    idempotencyKey: `otp:${String(challenge._id)}`,
    customerId: customer._id as never,
  });

  await OtpChallenge.updateOne(
    { _id: challenge._id },
    { $set: { deliveryStatus: 'sent', providerMessageId } },
  );

  await record(logger, {
    action: 'customer.otp.requested',
    actorType: 'customer',
    actorCustomerId: customer._id,
    ip,
    metadata: { channel, phoneMasked: maskPhone(e164) },
  });

  return { kind: 'sent' };
}

export type VerifyOutcome =
  | { readonly kind: 'verified'; readonly customerId: string }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number };

export interface VerifyCodeOptions {
  readonly phone: string;
  readonly code: string;
  readonly env: Env;
  readonly logger: Logger;
  readonly ip: string;
}

/**
 * Checks a code.
 *
 * Every failure is `invalid`: no such number, no live challenge, wrong code,
 * expired, already used, too many attempts. The attempt counter is incremented
 * **before** the comparison, so a crash mid-verification cannot hand back a
 * free guess.
 */
export async function verifyCode({
  phone,
  code,
  env,
  logger,
  ip,
}: VerifyCodeOptions): Promise<VerifyOutcome> {
  const perIp = await hit(OTP_LIMITS.verifyPerIp, ip);
  if (!perIp.allowed) {
    return { kind: 'rate_limited', retryAfterSeconds: perIp.retryAfterSeconds ?? 60 };
  }

  let e164: string;
  try {
    e164 = normalizePhone(phone);
  } catch {
    return { kind: 'invalid' };
  }

  const cipher = new PhoneCipher({
    encryptionKey: env.PHONE_ENCRYPTION_KEY,
    hashPepper: env.PHONE_HASH_PEPPER,
  });
  const phoneHash = cipher.hash(e164);

  /* The newest live challenge: requesting a second code must invalidate the
     first in practice, and taking the newest does that without a write. */
  const challenge = await OtpChallenge.findOne({ phoneHash, consumedAt: { $exists: false } })
    .select('+codeHash')
    .sort({ createdAt: -1 });

  if (!challenge) return { kind: 'invalid' };

  if (challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= challenge.maxAttempts) {
    return { kind: 'invalid' };
  }

  /* Counted first: a process that dies between here and the comparison must
     not leave the attacker with an unspent attempt. */
  await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });

  if (!codesMatch(challenge.codeHash, hashCode(code, env.PHONE_HASH_PEPPER))) {
    await record(logger, {
      action: 'customer.otp.failed',
      actorType: 'system',
      outcome: 'failure',
      ip,
      metadata: {
        reason: 'wrong_code',
        phoneMasked: maskPhone(e164),
        attempt: challenge.attempts + 1,
      },
    });
    return { kind: 'invalid' };
  }

  /* Single use, enforced by the filter: two requests racing with the same
     correct code must not both succeed. */
  const consumed = await OtpChallenge.updateOne(
    { _id: challenge._id, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date(), deliveryStatus: 'read' } },
  );
  if (consumed.modifiedCount === 0) return { kind: 'invalid' };

  const customer = await Customer.findOne({ phoneHash, status: 'active' })
    .select('_id')
    .lean<{ _id: unknown } | null>();
  if (!customer) return { kind: 'invalid' };

  await Customer.updateOne({ _id: customer._id }, { $set: { lastLoginAt: new Date() } });

  await record(logger, {
    action: 'customer.otp.verified',
    actorType: 'customer',
    actorCustomerId: customer._id,
    ip,
    metadata: { phoneMasked: maskPhone(e164) },
  });

  return { kind: 'verified', customerId: String(customer._id) };
}
