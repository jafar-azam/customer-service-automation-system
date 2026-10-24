import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import {
  disableSending,
  enableSending,
  hit,
  hitAll,
  isSendingDisabled,
  peek,
  reset,
  OTP_LIMITS,
} from './rate-limit.js';

let redis: Redis;

beforeAll(async () => {
  redis = await startTestRedis();
}, 120_000);

afterEach(async () => {
  await clearTestRedis();
});

afterAll(async () => {
  await stopTestRedis();
});

const rule = { name: 'test', limit: 3, windowSeconds: 60 };

describe('counting hits', () => {
  it('allows up to the limit and refuses after it', async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect((await hit(rule, 'subject')).allowed, `attempt ${String(attempt)}`).toBe(true);
    }
    const refused = await hit(rule, 'subject');
    expect(refused.allowed).toBe(false);
    expect(refused.rule?.name).toBe('test');
  });

  it('counts each subject separately', async () => {
    await hit(rule, 'one');
    await hit(rule, 'one');
    await hit(rule, 'one');
    expect((await hit(rule, 'two')).allowed).toBe(true);
  });

  it('tells the caller how long to wait', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await hit(rule, 'subject');
    const refused = await hit(rule, 'subject');
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  /**
   * The expiry is set on the first hit only. Re-setting it on every hit would
   * slide the window forward with each request, so a caller sending steadily
   * would never see it reset — a limit that quietly becomes permanent.
   */
  it('does not extend the window on later hits', async () => {
    await hit({ ...rule, windowSeconds: 100 }, 'subject');
    const first = await redis.ttl('rl:test:subject');

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await hit({ ...rule, windowSeconds: 100 }, 'subject');
    const second = await redis.ttl('rl:test:subject');

    expect(second).toBeLessThan(first);
  });

  it('starts again once the window passes', async () => {
    const quick = { name: 'quick', limit: 1, windowSeconds: 1 };
    expect((await hit(quick, 'subject')).allowed).toBe(true);
    expect((await hit(quick, 'subject')).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect((await hit(quick, 'subject')).allowed).toBe(true);
  });

  /* The counter is INCR, which is atomic — twenty parallel requests cannot
     each read "0" and all decide they are the first. */
  it('cannot be beaten by parallel requests', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, async () => hit(rule, 'subject')));
    expect(results.filter((result) => result.allowed)).toHaveLength(3);
  });
});

describe('layered rules', () => {
  const perPhone = { name: 'phone', limit: 2, windowSeconds: 60 };
  const perIp = { name: 'ip', limit: 5, windowSeconds: 60 };

  it('allows a request that passes every layer', async () => {
    const result = await hitAll([
      { rule: perPhone, subject: '+96170123456' },
      { rule: perIp, subject: '1.2.3.4' },
    ]);
    expect(result.allowed).toBe(true);
  });

  it('names the layer that refused', async () => {
    const checks = [
      { rule: perPhone, subject: '+96170123456' },
      { rule: perIp, subject: '1.2.3.4' },
    ];
    await hitAll(checks);
    await hitAll(checks);
    const refused = await hitAll(checks);

    expect(refused.allowed).toBe(false);
    expect(refused.rule?.name).toBe('phone');
  });

  /* A refused request still counts against the rule that refused it, so
     hammering pushes the retry further out rather than resetting it. */
  it('keeps counting the refusing layer', async () => {
    const checks = [{ rule: perPhone, subject: '+96170123456' }];
    for (let attempt = 0; attempt < 5; attempt += 1) await hitAll(checks);
    expect(await peek(perPhone, '+96170123456')).toBe(5);
  });

  /* The per-IP layer is the one that catches many numbers from one source —
     the SMS-pumping pattern — and it must not be spent by one number. */
  it('does not charge later layers once an earlier one refuses', async () => {
    const checks = (phone: string) => [
      { rule: perPhone, subject: phone },
      { rule: perIp, subject: '1.2.3.4' },
    ];
    for (let attempt = 0; attempt < 4; attempt += 1) await hitAll(checks('+96170123456'));

    /* Two of those four were refused at the phone layer, so the IP layer saw
       only the two that got through. */
    expect(await peek(perIp, '1.2.3.4')).toBe(2);
  });
});

describe('reading and clearing', () => {
  it('reports zero for a subject that has never been seen', async () => {
    expect(await peek(rule, 'nobody')).toBe(0);
  });

  it('clears a counter', async () => {
    await hit(rule, 'subject');
    await reset(rule, 'subject');
    expect(await peek(rule, 'subject')).toBe(0);
  });
});

describe('the kill switch', () => {
  /* "Alerts alone are not a hard stop" — messaging-lebanon.md. */
  it('is off until it is turned on', async () => {
    expect(await isSendingDisabled()).toBe(false);
  });

  it('stops sending until it is cleared by hand', async () => {
    await disableSending();
    expect(await isSendingDisabled()).toBe(true);

    await enableSending();
    expect(await isSendingDisabled()).toBe(false);
  });

  /* No TTL: a kill switch that expires on its own would turn itself back on
     at 3 a.m. while nobody is watching. */
  it('does not expire on a timer', async () => {
    await disableSending();
    expect(await redis.ttl('otp:kill-switch')).toBe(-1);
  });
});

describe('the OTP limits', () => {
  it('are the values the research recommends as a starting point', () => {
    expect(OTP_LIMITS.perPhone).toEqual({ name: 'otp:phone', limit: 5, windowSeconds: 3_600 });
    /* A 45-second cooldown: a second code sooner than that is a mis-click. */
    expect(OTP_LIMITS.resend.windowSeconds).toBe(45);
    expect(OTP_LIMITS.resend.limit).toBe(1);
  });
});
