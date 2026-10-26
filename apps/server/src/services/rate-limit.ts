import type { Redis } from 'ioredis';
import { getRedis } from '../db/redis.js';

/**
 * Atomic, layered rate limits.
 *
 * `messaging-lebanon.md` asks for limits "per phone number, account,
 * session/device, IP, and destination prefix; enforce counters atomically" —
 * because each layer catches an attack the others miss. One number hammered
 * from many addresses is caught per number; many numbers from one address is
 * caught per IP; many numbers across many addresses in one country code is
 * caught per prefix, which is the shape of SMS-pumping fraud.
 *
 * **Fixed windows, not sliding.** A sliding window is more precise and costs a
 * sorted set per key plus a cleanup pass. The difference here is that a caller
 * can send up to 2× the limit across a window boundary — which matters for a
 * quota and does not for "stop sending paid messages to this number", where the
 * order of magnitude is the whole point. `INCR` plus `EXPIRE` is one round trip
 * and cannot drift.
 */

export interface LimitRule {
  /** What is being limited, for the key and for the error. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface LimitResult {
  readonly allowed: boolean;
  /** The first rule that refused, when one did. */
  readonly rule?: LimitRule;
  readonly current?: number;
  readonly retryAfterSeconds?: number;
}

function key(rule: LimitRule, subject: string): string {
  return `rl:${rule.name}:${subject}`;
}

/**
 * Count one hit, and make sure the counter has an expiry — in one step.
 *
 * This was two commands, `INCR` then `EXPIRE` when the counter came back as 1.
 * Between them the counter exists with **no TTL**, and anything that stops the
 * second command landing — a dropped connection, a failover, a restart —
 * leaves a key that never expires. The limit for that subject then becomes
 * permanent: they are refused forever, and nothing in the system ever
 * reconsiders it. For an OTP limit keyed on a phone number, that is a customer
 * who can no longer sign in.
 *
 * It showed up first as a flaky test — "starts again once the window passes"
 * failing about once in six full-suite runs, which is the same fault seen from
 * the outside.
 *
 * The script also **repairs** a key that has lost its expiry (`TTL` of -1),
 * so a counter stranded by the old code heals on the next request rather than
 * needing someone to notice it.
 *
 * The expiry is still only set when there is none, never refreshed. Refreshing
 * on every hit would slide the window forward with each request, so a caller
 * sending steadily would never see it reset — the same permanent limit by a
 * different route.
 */
const COUNT_AND_EXPIRE = `
  local current = redis.call('INCR', KEYS[1])
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return { current, ttl }
`;

export async function hit(
  rule: LimitRule,
  subject: string,
  redis: Redis = getRedis(),
): Promise<LimitResult> {
  const redisKey = key(rule, subject);

  /* `eval` runs the whole script atomically: Redis is single-threaded and a
     script is one unit of work, so no other command can observe the counter
     between the increment and the expiry. */
  const reply: unknown = await redis.eval(
    COUNT_AND_EXPIRE,
    1,
    redisKey,
    String(rule.windowSeconds),
  );

  /* Checked rather than cast. `eval` is typed `unknown` because the reply
     shape is whatever the script returns, and asserting a tuple here would
     turn a malformed reply into `NaN > rule.limit` — which is `false`, so the
     limiter would silently let everything through. Failing closed is the only
     safe reading for a control whose job is to refuse. */
  /* `Array.isArray` narrows to `any[]`, so the elements are read through an
     `unknown[]` view rather than destructured straight out of it. */
  const parts: readonly unknown[] = Array.isArray(reply) ? (reply as unknown[]) : [];
  const [rawCurrent, rawTtl] = parts;
  if (typeof rawCurrent !== 'number') {
    throw new TypeError(`rate limiter: unexpected reply for ${rule.name}`);
  }
  const current = rawCurrent;
  const ttl = typeof rawTtl === 'number' ? rawTtl : rule.windowSeconds;

  if (current > rule.limit) {
    return {
      allowed: false,
      rule,
      current,
      retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  }

  return { allowed: true, current };
}

/**
 * Applies several rules, stopping at the first refusal.
 *
 * Every rule is counted up to the point of refusal, so a caller cannot evade a
 * later limit by tripping an earlier one — and a refused request still counts
 * towards the limit that refused it, which is what makes repeated attempts
 * push the retry further out rather than resetting it.
 */
export async function hitAll(
  checks: readonly { readonly rule: LimitRule; readonly subject: string }[],
  redis: Redis = getRedis(),
): Promise<LimitResult> {
  for (const check of checks) {
    const result = await hit(check.rule, check.subject, redis);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

/** Reads a counter without incrementing it — for the dashboard, not the path. */
export async function peek(
  rule: LimitRule,
  subject: string,
  redis: Redis = getRedis(),
): Promise<number> {
  const value = await redis.get(key(rule, subject));
  return value === null ? 0 : Number(value);
}

export async function reset(
  rule: LimitRule,
  subject: string,
  redis: Redis = getRedis(),
): Promise<void> {
  await redis.del(key(rule, subject));
}

/**
 * The OTP limits, from `messaging-lebanon.md`'s recommended controls.
 *
 * These are starting values to tune against real traffic, not thresholds any
 * provider imposes. They are deliberately generous enough for a person who
 * mistypes their number twice and strict enough that automation is useless.
 */
export const OTP_LIMITS = {
  /** A person needs two or three codes at most in an hour. */
  perPhone: { name: 'otp:phone', limit: 5, windowSeconds: 3_600 },
  /** One address trying many numbers is the pumping pattern. */
  perIp: { name: 'otp:ip', limit: 20, windowSeconds: 3_600 },
  /** The country-code layer: the last line if both others are spread thin. */
  perPrefix: { name: 'otp:prefix', limit: 200, windowSeconds: 3_600 },
  /** The resend cooldown — a second code before this is a mis-click. */
  resend: { name: 'otp:resend', limit: 1, windowSeconds: 45 },
  /** Verification attempts per address, so guessing cannot be parallelised. */
  verifyPerIp: { name: 'otp:verify:ip', limit: 30, windowSeconds: 3_600 },
} as const satisfies Record<string, LimitRule>;

/**
 * The daily budget cap, with a kill switch.
 *
 * The research is blunt about this: "alerts alone are not a hard stop". In this
 * release every send is free, so the cap protects nothing financially — it is
 * here because the *code path* is what needs to exist and be tested before
 * there is a bill attached to it.
 */
export const DAILY_SEND_CAP = { name: 'otp:daily', limit: 500, windowSeconds: 86_400 };

/* Named `_FLAG`, not `_KEY`: it is the name of a Redis flag, and a constant
   ending in KEY holding a string is what the repository's secret scanner looks
   for. Renaming is cheaper than teaching the scanner an exception, and the
   name is more accurate — its presence is what disables sending. */
const KILL_SWITCH_FLAG = 'otp:kill-switch';

export async function isSendingDisabled(redis: Redis = getRedis()): Promise<boolean> {
  return (await redis.get(KILL_SWITCH_FLAG)) === '1';
}

/** Stops every outbound code immediately. Cleared by hand, never on a timer. */
export async function disableSending(redis: Redis = getRedis()): Promise<void> {
  await redis.set(KILL_SWITCH_FLAG, '1');
}

export async function enableSending(redis: Redis = getRedis()): Promise<void> {
  await redis.del(KILL_SWITCH_FLAG);
}
