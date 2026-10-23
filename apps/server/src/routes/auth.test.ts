import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { SecretCipher } from '../crypto/secret-cipher.js';
import { AuditLog, Session, StaffUser } from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { createMetrics } from '../observability/metrics.js';
import { hashPassword } from '../services/auth/password.js';
import { createEnrolment, currentDemoCode } from '../services/auth/totp.js';
import { MAX_FAILED_ATTEMPTS } from '../services/auth/login.js';
import { capturingLogger, silentLogger, testEnv } from '../test-support.js';
import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../http/cookies.js';

const env = testEnv();

/* Invented passphrases used as test fixtures. They are strong enough to pass
   the policy and belong to nothing; the markers keep the repository's own
   secret scanner from flagging its own tests. */
const PASSWORD = 'fourteen purple lanterns upstairs'; // secret-scan:allow
const WRONG_PASSWORD = 'nine wooden bicycles sideways'; // secret-scan:allow
const OTHER_SECRET = 'a second signing secret entirely'; // secret-scan:allow

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
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

interface StaffOptions {
  readonly role?: 'agent' | 'admin';
  readonly email?: string;
  readonly withTotp?: boolean;
  readonly status?: 'active' | 'disabled';
}

async function createStaff({
  role = 'agent',
  email = `${role}@csas.test`,
  withTotp = false,
  status = 'active',
}: StaffOptions = {}) {
  const enrolment = withTotp ? createEnrolment(email) : undefined;
  const cipher = new SecretCipher(env.PHONE_ENCRYPTION_KEY);

  const staff = await StaffUser.create({
    email,
    name: role === 'admin' ? 'Admin Person' : 'Agent Person',
    role,
    status,
    passwordHash: await hashPassword(PASSWORD),
    ...(enrolment
      ? {
          totpSecretEncrypted: cipher.encrypt(enrolment.secret),
          totpEnrolledAt: new Date(),
        }
      : {}),
  });

  return { staff, secret: enrolment?.secret };
}

/** Supertest types `headers` loosely; one accessor keeps the cast in one place. */
function setCookieHeaders(response: request.Response): string[] {
  const header: unknown = response.headers['set-cookie'];
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
}

/** Extracts one cookie's value from a supertest response. */
function cookie(response: request.Response, name: string): string | undefined {
  const match = setCookieHeaders(response).find((value) => value.startsWith(`${name}=`));
  return match?.split(';')[0]?.split('=')[1];
}

function cookieAttributes(response: request.Response, name: string): string {
  return setCookieHeaders(response).find((value) => value.startsWith(`${name}=`)) ?? '';
}

async function loginAsAgent() {
  await createStaff({ role: 'agent' });
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'agent@csas.test', password: PASSWORD });
  return response;
}

/* ── Login ──────────────────────────────────────────────────────────────── */

describe('POST /api/auth/login', () => {
  it('issues an access token and both cookies', async () => {
    const response = await loginAsAgent();

    expect(response.status).toBe(200);
    const body = response.body as { accessToken: string; staff: { role: string } };
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.staff.role).toBe('agent');
    expect(cookie(response, REFRESH_COOKIE)).toEqual(expect.any(String));
    expect(cookie(response, CSRF_COOKIE)).toEqual(expect.any(String));
  });

  /* The refresh cookie is the long-lived credential, so it must be unreadable
     by script and unsendable cross-site. */
  it('marks the refresh cookie HttpOnly, Secure and SameSite=Strict', async () => {
    const attributes = cookieAttributes(await loginAsAgent(), REFRESH_COOKIE);
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('Secure');
    expect(attributes).toContain('SameSite=Strict');
    /* Scoped, so it is not attached to every API call. */
    expect(attributes).toContain('Path=/api/auth');
  });

  /* The CSRF cookie is the mirror image: the client *must* be able to read it
     in order to echo it back in a header. */
  it('leaves the CSRF cookie readable by script, by design', () => {
    return loginAsAgent().then((response) => {
      expect(cookieAttributes(response, CSRF_COOKIE)).not.toContain('HttpOnly');
    });
  });

  it('never returns the refresh token in the body', async () => {
    const response = await loginAsAgent();
    const refresh = cookie(response, REFRESH_COOKIE);
    expect(JSON.stringify(response.body)).not.toContain(String(refresh));
  });

  it('never returns the password hash', async () => {
    const response = await loginAsAgent();
    expect(JSON.stringify(response.body)).not.toContain('$argon2id$');
  });

  describe('failures are indistinguishable', () => {
    /* ASVS 2.2: an attacker must not learn which staff accounts exist. */
    it('answers identically for an unknown account and a wrong password', async () => {
      await createStaff({ role: 'agent' });

      const unknown = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@csas.test', password: PASSWORD });
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: WRONG_PASSWORD });

      expect(unknown.status).toBe(wrongPassword.status);
      expect(unknown.body).toEqual({
        ...(wrongPassword.body as Record<string, unknown>),
        error: {
          ...(wrongPassword.body as { error: Record<string, unknown> }).error,
          requestId: (unknown.body as { error: { requestId: string } }).error.requestId,
        },
      });
      expect((unknown.body as { error: { code: string } }).error.code).toBe('invalid_credentials');
    });

    it('answers the same for a disabled account', async () => {
      await createStaff({ role: 'agent', status: 'disabled' });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: PASSWORD });

      expect(response.status).toBe(401);
      expect((response.body as { error: { code: string } }).error.code).toBe('invalid_credentials');
    });

    it('answers the same once the account is locked, even with the right password', async () => {
      await createStaff({ role: 'agent' });
      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'agent@csas.test', password: WRONG_PASSWORD });
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: PASSWORD });

      expect(response.status).toBe(401);
      expect((response.body as { error: { code: string } }).error.code).toBe('invalid_credentials');
    });
  });

  describe('lockout', () => {
    it('locks the account after five failures', async () => {
      const { staff } = await createStaff({ role: 'agent' });
      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'agent@csas.test', password: WRONG_PASSWORD });
      }

      const after = await StaffUser.findById(staff._id).lean();
      expect(after?.failedLoginCount).toBe(MAX_FAILED_ATTEMPTS);
      expect(after?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    });

    it('clears the counter and the lock on a successful login', async () => {
      const { staff } = await createStaff({ role: 'agent' });
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: WRONG_PASSWORD });

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: PASSWORD });

      const after = await StaffUser.findById(staff._id).lean();
      expect(after?.failedLoginCount).toBe(0);
      expect(after?.lockedUntil).toBeUndefined();
    });
  });

  describe('two-factor authentication', () => {
    it('is required for an admin who has enrolled', async () => {
      await createStaff({ role: 'admin', email: 'admin@csas.test', withTotp: true });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@csas.test', password: PASSWORD });

      expect(response.status).toBe(401);
      expect((response.body as { error: { code: string } }).error.code).toBe('totp_required');
    });

    it('accepts a correct code', async () => {
      const { secret } = await createStaff({
        role: 'admin',
        email: 'admin@csas.test',
        withTotp: true,
      });
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@csas.test',
          password: PASSWORD,
          totp: currentDemoCode(String(secret), 'admin@csas.test'),
        });

      expect(response.status).toBe(200);
    });

    /* A wrong code must cost an attempt: otherwise the second factor is a free
       six-digit guessing game for anyone holding the password. */
    it('counts a wrong code towards the lockout', async () => {
      const { staff } = await createStaff({
        role: 'admin',
        email: 'admin@csas.test',
        withTotp: true,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@csas.test', password: PASSWORD, totp: '000000' });

      expect(response.status).toBe(401);
      expect((response.body as { error: { code: string } }).error.code).toBe('invalid_credentials');
      expect((await StaffUser.findById(staff._id).lean())?.failedLoginCount).toBe(1);
    });

    it('refuses an admin who has never enrolled', async () => {
      await createStaff({ role: 'admin', email: 'admin@csas.test', withTotp: false });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@csas.test', password: PASSWORD });

      expect(response.status).toBe(403);
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'totp_enrolment_required',
      );
    });

    it('is not required for an agent who has not enrolled', async () => {
      expect((await loginAsAgent()).status).toBe(200);
    });
  });

  describe('input validation', () => {
    /* The classic NoSQL injection: an operator where a string belongs. */
    it('refuses an operator object as a password', async () => {
      await createStaff({ role: 'agent' });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: { $ne: null } });

      expect(response.status).toBe(400);
      expect((response.body as { error: { code: string } }).error.code).toBe('bad_request');
    });

    it('refuses an operator object as an email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: PASSWORD });
      expect(response.status).toBe(400);
    });

    /* Unknown fields are rejected, not stripped: a stripped `role` would look
       to the caller like it had been accepted. */
    it('refuses an unknown field', async () => {
      await createStaff({ role: 'agent' });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: PASSWORD, role: 'admin' });

      expect(response.status).toBe(400);
    });

    it('refuses a malformed one-time code without consulting the secret', async () => {
      await createStaff({ role: 'admin', email: 'admin@csas.test', withTotp: true });
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@csas.test', password: PASSWORD, totp: 'abcdef' });

      expect(response.status).toBe(400);
    });
  });

  describe('the audit log', () => {
    it('records a successful login against the staff member', async () => {
      await loginAsAgent();
      const entry = await AuditLog.findOne({ action: 'staff.login.succeeded' }).lean();
      expect(entry?.actorType).toBe('staff');
      expect(entry?.outcome).toBe('success');
    });

    it('records a failure without naming the account in the clear', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@csas.test', password: PASSWORD });

      const entry = await AuditLog.findOne({ action: 'staff.login.failed' }).lean();
      expect(entry?.outcome).toBe('failure');
      /* The address is masked even here: the audit log outlives the data it
         describes, and `nobody@csas.test` is still personal data. */
      expect(JSON.stringify(entry)).not.toContain('nobody@csas.test');
      expect(JSON.stringify(entry)).toContain('n***y@csas.test');
    });

    it('records the lockout as its own action', async () => {
      await createStaff({ role: 'agent' });
      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'agent@csas.test', password: WRONG_PASSWORD });
      }
      expect(await AuditLog.countDocuments({ action: 'staff.locked' })).toBe(1);
    });

    it('never writes the password to the log', async () => {
      const captured = capturingLogger();
      const loud = build(captured.logger);
      await createStaff({ role: 'agent' });
      await request(loud)
        .post('/api/auth/login')
        .send({ email: 'agent@csas.test', password: PASSWORD });

      expect(JSON.stringify(captured.lines)).not.toContain(PASSWORD);
      expect(JSON.stringify(await AuditLog.find().lean())).not.toContain(PASSWORD);
    });
  });
});

/* ── Session lifecycle ──────────────────────────────────────────────────── */

describe('the authenticated session', () => {
  it('accepts the access token on /me', async () => {
    const login = await loginAsAgent();
    const { accessToken } = login.body as { accessToken: string };

    const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect((me.body as { role: string }).role).toBe('agent');
  });

  it('refuses a request with no token', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect((response.body as { error: { code: string } }).error.code).toBe('unauthenticated');
  });

  it('refuses a token signed with the wrong secret', async () => {
    const { issueAccessToken } = await import('../services/auth/tokens.js');
    const forged = await issueAccessToken({
      staffId: '000000000000000000000000',
      role: 'admin',
      familyId: 'whatever',
      secret: OTHER_SECRET,
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${forged}`);
    expect(response.status).toBe(401);
  });

  /* The reason the family is checked on every request: without it, "log out"
     would mean "log out in up to fifteen minutes". */
  it('stops accepting the access token the moment the session is revoked', async () => {
    const login = await loginAsAgent();
    const { accessToken } = login.body as { accessToken: string };

    expect(
      (await request(app).get('/api/auth/me').set('authorization', `Bearer ${accessToken}`)).status,
    ).toBe(200);

    await Session.updateMany({}, { $set: { revokedAt: new Date(), revokedReason: 'admin' } });

    expect(
      (await request(app).get('/api/auth/me').set('authorization', `Bearer ${accessToken}`)).status,
    ).toBe(401);
  });
});

/* ── Rotation and reuse detection ───────────────────────────────────────── */

describe('POST /api/auth/refresh', () => {
  async function loginAndCapture() {
    const login = await loginAsAgent();
    return {
      refresh: String(cookie(login, REFRESH_COOKIE)),
      csrf: String(cookie(login, CSRF_COOKIE)),
    };
  }

  it('issues a new refresh token and a new access token', async () => {
    const { refresh, csrf } = await loginAndCapture();

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);

    expect(response.status).toBe(200);
    expect((response.body as { accessToken: string }).accessToken).toEqual(expect.any(String));
    expect(cookie(response, REFRESH_COOKIE)).not.toBe(refresh);
  });

  it('refuses the old token once it has been rotated', async () => {
    const { refresh, csrf } = await loginAndCapture();
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);

    expect(replay.status).toBe(401);
    expect((replay.body as { error: { code: string } }).error.code).toBe('session_revoked');
  });

  /**
   * The property that makes rotation worth having: a replayed token proves
   * theft, so the *whole family* is revoked — the thief and the victim are
   * both logged out, rather than taking turns refreshing each other out.
   */
  it('revokes the whole family when a retired token is replayed', async () => {
    const { refresh, csrf } = await loginAndCapture();

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);
    const live = String(cookie(rotated, REFRESH_COOKIE));
    const liveCsrf = String(cookie(rotated, CSRF_COOKIE));

    /* The thief replays the stolen, already-rotated token. */
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);

    /* The victim's current token is now dead too. */
    const victim = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=${live}`, `${CSRF_COOKIE}=${liveCsrf}`])
      .set(CSRF_HEADER, liveCsrf);

    expect(victim.status).toBe(401);
    expect(await Session.countDocuments({ revokedReason: 'reuse_detected' })).toBeGreaterThan(0);
  });

  it('records the reuse in the audit log', async () => {
    const { refresh, csrf } = await loginAndCapture();
    const cookies = [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`];
    const refreshOnce = () =>
      request(app).post('/api/auth/refresh').set('Cookie', cookies).set(CSRF_HEADER, csrf);

    await refreshOnce();
    /* The same token a second time: this is the replay. */
    await refreshOnce();

    const entry = await AuditLog.findOne({
      'metadata.reason': 'refresh_token_reuse_detected',
    }).lean();
    expect(entry).not.toBeNull();
    expect(entry?.outcome).toBe('failure');
  });

  it('refuses an unknown refresh token', async () => {
    const csrf = 'a'.repeat(32);
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`${REFRESH_COOKIE}=not-a-real-token`, `${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);
    expect(response.status).toBe(401);
  });

  describe('CSRF', () => {
    it('refuses a refresh with no CSRF header', async () => {
      const { refresh, csrf } = await loginAndCapture();
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`]);

      expect(response.status).toBe(403);
      expect((response.body as { error: { code: string } }).error.code).toBe('csrf_failed');
    });

    /* The double-submit property: an attacker on another origin can cause the
       cookie to be sent but cannot read it to build a matching header. */
    it('refuses a header that does not match the cookie', async () => {
      const { refresh, csrf } = await loginAndCapture();
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`${REFRESH_COOKIE}=${refresh}`, `${CSRF_COOKIE}=${csrf}`])
        .set(CSRF_HEADER, 'a-value-the-attacker-guessed');

      expect(response.status).toBe(403);
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookies', async () => {
    const login = await loginAsAgent();
    const { accessToken } = login.body as { accessToken: string };
    const csrf = String(cookie(login, CSRF_COOKIE));

    const response = await request(app)
      .post('/api/auth/logout')
      .set('authorization', `Bearer ${accessToken}`)
      .set('Cookie', [`${CSRF_COOKIE}=${csrf}`])
      .set(CSRF_HEADER, csrf);

    expect(response.status).toBe(204);
    expect(await Session.countDocuments({ revokedReason: 'logout' })).toBe(1);

    /* And the access token stops working immediately, not in fifteen minutes. */
    const after = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });
});

/* ── Role-based access ──────────────────────────────────────────────────── */

describe('role guards', () => {
  it('lets an admin call an admin-only route', async () => {
    const { secret } = await createStaff({
      role: 'admin',
      email: 'admin@csas.test',
      withTotp: true,
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@csas.test',
        password: PASSWORD,
        totp: currentDemoCode(String(secret), 'admin@csas.test'),
      });

    const response = await request(app)
      .get('/api/auth/staff-count')
      .set('authorization', `Bearer ${(login.body as { accessToken: string }).accessToken}`);

    expect(response.status).toBe(200);
  });

  /* Function-level authorization (OWASP API Top 10 #5): an authenticated agent
     is not an admin, and the server — not the UI — decides that. */
  it('refuses an agent on the same route', async () => {
    const login = await loginAsAgent();
    const response = await request(app)
      .get('/api/auth/staff-count')
      .set('authorization', `Bearer ${(login.body as { accessToken: string }).accessToken}`);

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('refuses an unauthenticated caller before checking the role', async () => {
    const response = await request(app).get('/api/auth/staff-count');
    expect(response.status).toBe(401);
  });
});
