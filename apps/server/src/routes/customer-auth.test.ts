import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '@csas/shared';
import { createApp } from '../app.js';
import { PhoneCipher } from '../crypto/phone.js';
import { AuditLog, Contract, Customer, Notification, OtpChallenge } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { clearTestRedis, startTestRedis, stopTestRedis } from '../db/test-redis.js';
import { createMetrics } from '../observability/metrics.js';
import { OTP_MAX_ATTEMPTS } from '../services/auth/otp.js';
import { capturingLogger, silentLogger, testEnv } from '../test-support.js';

/* DEMO_MODE on: the dev inbox shows the code, which is how a reviewer with no
   phone can try the flow at all. The validator refuses the flag in production. */
const env = testEnv({ DEMO_MODE: 'true', DEMO_ADMIN_TOTP_SECRET: 'A'.repeat(32) });

const PHONE = '+96170100001';
const UNKNOWN_PHONE = '+96170999999';

function build(logger = silentLogger()) {
  return createApp({
    env,
    version: '0.1.0',
    logger,
    metrics: createMetrics({ collectDefaults: false }),
  }).express;
}

const app = build();

beforeAll(async () => {
  await startTestDatabase();
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

interface CustomerOptions {
  readonly phone?: string;
  readonly contract?: 'active' | 'expired' | 'future' | 'none';
  readonly status?: 'active' | 'disabled';
}

async function createCustomer({
  phone = PHONE,
  contract = 'active',
  status = 'active',
}: CustomerOptions = {}) {
  const cipher = new PhoneCipher({
    encryptionKey: env.PHONE_ENCRYPTION_KEY,
    hashPepper: env.PHONE_HASH_PEPPER,
  });
  const e164 = normalizePhone(phone);

  const customer = await Customer.create({
    name: 'Rania Haddad',
    companyName: 'Cedar Pharmaceuticals',
    phoneHash: cipher.hash(e164),
    phoneEncrypted: cipher.encrypt(e164),
    phoneLast3: e164.slice(-3),
    status,
  });

  const day = 86_400_000;
  const ranges = {
    active: [-30 * day, 30 * day],
    expired: [-400 * day, -10 * day],
    future: [10 * day, 400 * day],
  } as const;

  if (contract !== 'none') {
    const [from, to] = ranges[contract];
    await Contract.create({
      customerId: customer._id,
      reference: `CT-${String(Math.random()).slice(2, 10)}`,
      tier: 'standard',
      /* Deliberately stale: the gate must read the dates, not this field. */
      status: 'active',
      startDate: new Date(Date.now() + from),
      endDate: new Date(Date.now() + to),
    });
  }

  return customer;
}

/** Reads the code out of the dev inbox, as a reviewer would. */
async function codeFromDevInbox(): Promise<string> {
  const message = await Notification.findOne({ kind: 'otp' }).sort({ createdAt: -1 }).lean();
  const match = /\b(\d{6})\b/.exec(String(message?.preview));
  return String(match?.[1]);
}

async function signIn(phone = PHONE) {
  await request(app).post('/api/auth/customer/request-code').send({ phone });
  const code = await codeFromDevInbox();
  return request(app).post('/api/auth/customer/verify').send({ phone, code });
}

/* ── Requesting a code ──────────────────────────────────────────────────── */

describe('POST /api/auth/customer/request-code', () => {
  it('accepts the request and puts the message in the dev inbox', async () => {
    await createCustomer();
    const response = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: PHONE });

    expect(response.status).toBe(202);
    const message = await Notification.findOne({ kind: 'otp' }).lean();
    expect(message?.channel).toBe('whatsapp');
    /* Masked: the number lives encrypted on the customer, not twice here. */
    expect(message?.recipientMasked).toBe('+961***001');
  });

  /* The endpoint is unauthenticated, so distinguishing the two would turn it
     into a lookup service for who is a customer. */
  it('answers identically for a number that is not a customer', async () => {
    await createCustomer();
    const known = await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
    const unknown = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: UNKNOWN_PHONE });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    /* …and no message was sent for the unknown one. */
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('sends nothing for a customer who has been deactivated', async () => {
    await createCustomer({ status: 'disabled' });
    const response = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: PHONE });

    expect(response.status).toBe(202);
    expect(await Notification.countDocuments()).toBe(0);
  });

  /* The destination allow-list: a full Lebanese mobile, not "anything that
     starts with +961". Paid sends to arbitrary destinations are the fraud. */
  it('refuses a number outside the allowed country', async () => {
    const response = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: '+447700900123' });
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('invalid_phone');
  });

  it('refuses something that is not a number at all', async () => {
    const response = await request(app)
      .post('/api/auth/customer/request-code')
      .send({ phone: 'not-a-number' });
    expect(response.status).toBe(400);
  });

  it('stores the code only as a hash', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });

    const code = await codeFromDevInbox();
    const challenge = await OtpChallenge.findOne().select('+codeHash').lean<{
      codeHash: string;
    } | null>();
    expect(challenge?.codeHash).not.toContain(code);
    expect(challenge?.codeHash).toHaveLength(64);
  });

  it('never writes the code to the log', async () => {
    const captured = capturingLogger();
    const loud = build(captured.logger);
    await createCustomer();
    await request(loud).post('/api/auth/customer/request-code').send({ phone: PHONE });

    const code = await codeFromDevInbox();
    expect(JSON.stringify(captured.lines)).not.toContain(code);
  });

  it('records the request against the customer, with the number masked', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });

    const entry = await AuditLog.findOne({ action: 'customer.otp.requested' }).lean();
    expect(entry?.actorType).toBe('customer');
    expect(JSON.stringify(entry)).toContain('+961***001');
    expect(JSON.stringify(entry)).not.toContain('70100001');
  });

  describe('anti-pumping controls', () => {
    it('refuses a second code inside the resend cooldown', async () => {
      await createCustomer();
      await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
      const second = await request(app)
        .post('/api/auth/customer/request-code')
        .send({ phone: PHONE });

      expect(second.status).toBe(429);
      expect(second.headers['retry-after']).toBeDefined();
      expect(await Notification.countDocuments()).toBe(1);
    });

    it('counts a rate-limited attempt in the audit log', async () => {
      await createCustomer();
      await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
      await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });

      const refused = await AuditLog.findOne({
        action: 'customer.otp.requested',
        outcome: 'failure',
      }).lean();
      expect(refused?.metadata).toMatchObject({ reason: 'rate_limited' });
    });

    /* An unknown number must not consume the day's budget: otherwise a flood
       of invented numbers stops real customers signing in. */
    it('does not spend the daily budget on a number that is not a customer', async () => {
      await request(app).post('/api/auth/customer/request-code').send({ phone: UNKNOWN_PHONE });
      const { peek } = await import('../services/rate-limit.js');
      const { DAILY_SEND_CAP } = await import('../services/rate-limit.js');
      expect(await peek(DAILY_SEND_CAP, 'global')).toBe(0);
    });

    it('sends nothing at all while the kill switch is on', async () => {
      await createCustomer();
      const { disableSending, enableSending } = await import('../services/rate-limit.js');
      await disableSending();

      const response = await request(app)
        .post('/api/auth/customer/request-code')
        .send({ phone: PHONE });

      /* Still a 202: the caller must not learn that sending is disabled. */
      expect(response.status).toBe(202);
      expect(await Notification.countDocuments()).toBe(0);
      await enableSending();
    });
  });
});

/* ── Verifying a code ───────────────────────────────────────────────────── */

describe('POST /api/auth/customer/verify', () => {
  it('opens a session and reports the entitlement', async () => {
    await createCustomer({ contract: 'active' });
    const response = await signIn();

    expect(response.status).toBe(200);
    const body = response.body as {
      accessToken: string;
      entitlement: { status: string; tier: string };
    };
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.entitlement.status).toBe('active');
    expect(body.entitlement.tier).toBe('standard');
  });

  it('refuses a wrong code', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });

    const response = await request(app)
      .post('/api/auth/customer/verify')
      .send({ phone: PHONE, code: '000000' });
    expect(response.status).toBe(401);
    expect((response.body as { error: { code: string } }).error.code).toBe('invalid_code');
  });

  it('answers the same for a number that never asked for a code', async () => {
    const response = await request(app)
      .post('/api/auth/customer/verify')
      .send({ phone: UNKNOWN_PHONE, code: '123456' });
    expect(response.status).toBe(401);
  });

  it('refuses the same code twice', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
    const code = await codeFromDevInbox();

    expect(
      (await request(app).post('/api/auth/customer/verify').send({ phone: PHONE, code })).status,
    ).toBe(200);
    expect(
      (await request(app).post('/api/auth/customer/verify').send({ phone: PHONE, code })).status,
    ).toBe(401);
  });

  it('refuses an expired code', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
    const code = await codeFromDevInbox();
    await OtpChallenge.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(app)
      .post('/api/auth/customer/verify')
      .send({ phone: PHONE, code });
    expect(response.status).toBe(401);
  });

  /* Five guesses, then the challenge is dead — even for the right code. */
  it('stops accepting after the attempt limit', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
    const code = await codeFromDevInbox();

    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      await request(app).post('/api/auth/customer/verify').send({ phone: PHONE, code: '000000' });
    }

    const response = await request(app)
      .post('/api/auth/customer/verify')
      .send({ phone: PHONE, code });
    expect(response.status).toBe(401);
  });

  it('counts the attempt before comparing, so a crash cannot gift a guess', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
    await request(app).post('/api/auth/customer/verify').send({ phone: PHONE, code: '000000' });

    const challenge = await OtpChallenge.findOne().lean();
    expect(challenge?.attempts).toBe(1);
  });

  it('records a failed verification without the code', async () => {
    await createCustomer();
    await request(app).post('/api/auth/customer/request-code').send({ phone: PHONE });
    await request(app).post('/api/auth/customer/verify').send({ phone: PHONE, code: '000000' });

    const entry = await AuditLog.findOne({ action: 'customer.otp.failed' }).lean();
    expect(entry?.outcome).toBe('failure');
    expect(JSON.stringify(entry)).not.toContain('000000');
  });

  it('refuses a code that is not six digits, before touching the challenge', async () => {
    const response = await request(app)
      .post('/api/auth/customer/verify')
      .send({ phone: PHONE, code: '12345' });
    expect(response.status).toBe(400);
  });
});

/* ── The contract gate ──────────────────────────────────────────────────── */

describe('the contract gate', () => {
  /**
   * The customer is who they say they are; an expired contract is not an
   * authentication failure. Refusing the session would leave them unable to
   * read their own history or even see why they were turned away.
   */
  it('lets an expired customer sign in, and says the contract expired', async () => {
    await createCustomer({ contract: 'expired' });
    const response = await signIn();

    expect(response.status).toBe(200);
    const body = response.body as { entitlement: { status: string; endDate: string } };
    expect(body.entitlement.status).toBe('expired');
    expect(body.entitlement.endDate).toBeDefined();
  });

  /* "Not covered" would send someone whose contract starts on Monday to
     support to argue about something nobody can fix. */
  it('distinguishes a contract that has not started yet', async () => {
    await createCustomer({ contract: 'future' });
    const response = await signIn();

    expect((response.body as { entitlement: { status: string } }).entitlement.status).toBe(
      'not_started',
    );
  });

  it('reports no contract at all separately', async () => {
    await createCustomer({ contract: 'none' });
    const response = await signIn();

    expect((response.body as { entitlement: { status: string } }).entitlement.status).toBe('none');
  });

  /* `status` is a cache maintained by a nightly job; the dates are the truth.
     The fixtures all store `status: 'active'` precisely to prove this. */
  it('reads the dates, not the stored status field', async () => {
    await createCustomer({ contract: 'expired' });
    expect(await Contract.countDocuments({ status: 'active' })).toBe(1);

    const response = await signIn();
    expect((response.body as { entitlement: { status: string } }).entitlement.status).toBe(
      'expired',
    );
  });
});

/* ── The session ────────────────────────────────────────────────────────── */

describe('the customer session', () => {
  it('answers /me with identity and entitlement', async () => {
    await createCustomer();
    const login = await signIn();
    const { accessToken } = login.body as { accessToken: string };

    const me = await request(app)
      .get('/api/auth/customer/me')
      .set('authorization', `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    const body = me.body as { name: string; phoneLast3: string; entitlement: { status: string } };
    expect(body.name).toBe('Rania Haddad');
    /* Enough to recognise the number without decrypting it. */
    expect(body.phoneLast3).toBe('001');
    expect(body.entitlement.status).toBe('active');
  });

  it('never returns the phone number', async () => {
    await createCustomer();
    const login = await signIn();
    const me = await request(app)
      .get('/api/auth/customer/me')
      .set('authorization', `Bearer ${(login.body as { accessToken: string }).accessToken}`);

    expect(JSON.stringify(me.body)).not.toContain('70100001');
  });

  /* Two token shapes, two guards. A customer must never reach a staff route
     and a staff token must never open a customer session. */
  it('refuses a customer token on a staff route', async () => {
    await createCustomer();
    const login = await signIn();

    const response = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${(login.body as { accessToken: string }).accessToken}`);
    expect(response.status).toBe(401);
  });

  it('refuses an unauthenticated call to the customer route', async () => {
    expect((await request(app).get('/api/auth/customer/me')).status).toBe(401);
  });

  it('logs out, and the access token stops working immediately', async () => {
    await createCustomer();
    const login = await signIn();
    const { accessToken, csrfToken } = login.body as { accessToken: string; csrfToken: string };

    const logout = await request(app)
      .post('/api/auth/customer/logout')
      .set('authorization', `Bearer ${accessToken}`)
      .set('Cookie', [`csas_csrf=${csrfToken}`])
      .set('x-csrf-token', csrfToken);
    expect(logout.status).toBe(204);

    const after = await request(app)
      .get('/api/auth/customer/me')
      .set('authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });

  it('rotates the refresh token, and detects a replay', async () => {
    await createCustomer();
    const login = await signIn();
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const refresh = String(
      cookies
        .find((c) => c.startsWith('csas_refresh='))
        ?.split(';')[0]
        ?.split('=')[1],
    );
    const csrf = String(
      cookies
        .find((c) => c.startsWith('csas_csrf='))
        ?.split(';')[0]
        ?.split('=')[1],
    );

    const rotated = await request(app)
      .post('/api/auth/customer/refresh')
      .set('Cookie', [`csas_refresh=${refresh}`, `csas_csrf=${csrf}`])
      .set('x-csrf-token', csrf);
    expect(rotated.status).toBe(200);

    const replay = await request(app)
      .post('/api/auth/customer/refresh')
      .set('Cookie', [`csas_refresh=${refresh}`, `csas_csrf=${csrf}`])
      .set('x-csrf-token', csrf);
    expect(replay.status).toBe(401);
    expect((replay.body as { error: { code: string } }).error.code).toBe('session_revoked');
  });
});
