import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { Notification } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { createMetrics } from '../observability/metrics.js';
import { silentLogger, testEnv } from '../test-support.js';

/**
 * The dev inbox hands out one-time codes, so the guard is the test.
 */

function build(demo: boolean) {
  return createApp({
    env: testEnv(
      demo ? { DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32) } : { DEMO_MODE: 'false' },
    ),
    version: '0.1.0',
    logger: silentLogger(),
    metrics: createMetrics({ collectDefaults: false }),
  }).express;
}

beforeAll(async () => {
  await startTestDatabase();
  /* `request-code` is rate limited, and the limiter needs Redis. Without it
     both calls below fail identically — which made the comparison pass for
     entirely the wrong reason. */
  await startTestRedis();
}, 180_000);

afterEach(async () => {
  await clearTestDatabase();
  await clearTestRedis();
});

afterAll(async () => {
  await stopTestRedis();
  await stopTestDatabase();
});

describe('GET /api/dev/inbox', () => {
  it('shows what would have been sent, in demo mode', async () => {
    await Notification.create({
      channel: 'whatsapp',
      kind: 'otp',
      recipientMasked: '+9617010••••',
      preview: 'رمز الدخول إلى C.S.A.S هو 354814.',
      status: 'sent',
      sentAt: new Date(),
      templateKey: 'otp.code',
      idempotencyKey: `test-${String(Date.now())}`,
    });

    const response = await request(build(true)).get('/api/dev/inbox');

    expect(response.status).toBe(200);
    const body = response.body as { messages: { body: string; to: string }[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.body).toContain('354814');
    /* Masked when it was written: the inbox shows what would have been sent,
       not who it would have reached. */
    expect(body.messages[0]?.to).toBe('+9617010••••');
  });

  /* Not mounted at all when the flag is off, so the path 404s rather than
     403s. An endpoint that answers "forbidden" tells you it exists. */
  it('does not exist when DEMO_MODE is off', async () => {
    const response = await request(build(false)).get('/api/dev/inbox');
    expect(response.status).toBe(404);
    expect((response.body as { error: { code: string } }).error.code).toBe('not_found');
  });

  it('is never cached', async () => {
    const response = await request(build(true)).get('/api/dev/inbox');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  /* The alternative design — returning the code in the request-code response
     under DEMO_MODE — would make a known number's answer differ from an
     unknown one, which is the anti-enumeration property step 08 built. */
  it('does not change what request-code answers', async () => {
    const app = build(true);
    const known = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: '+96170100001' });
    const unknown = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: '+96170999999' });

    expect(known.status).toBe(202);
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toMatch(/\d{6}/);
  });
});
