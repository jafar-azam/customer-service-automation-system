import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { SecretCipher } from '../crypto/secret-cipher.js';
import {
  AuditLog,
  Notification,
  PasswordResetToken,
  RecoveryCode,
  Session,
  StaffUser,
} from '../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../db/test-db.js';
import { createMetrics } from '../observability/metrics.js';
import { hashPassword } from '../services/auth/password.js';
import { createEnrolment, currentDemoCode } from '../services/auth/totp.js';
import { RECOVERY_CODE_COUNT } from '../services/auth/recovery.js';
import { silentLogger, testEnv } from '../test-support.js';

const env = testEnv();

/* Invented passphrases; marked so the repository's own scanner ignores them. */
const PASSWORD = 'fourteen purple lanterns upstairs'; // secret-scan:allow
const NEW_PASSWORD = 'seven copper kettles whistling'; // secret-scan:allow
const THIRD_PASSWORD = 'eleven glass marbles rolling'; // secret-scan:allow

const app = createApp({
  env,
  version: '0.1.0',
  logger: silentLogger(),
  metrics: createMetrics({ collectDefaults: false }),
}).express;

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

async function createStaff(role: 'agent' | 'admin' = 'agent', withTotp = false) {
  const email = `${role}@csas.test`;
  const enrolment = withTotp ? createEnrolment(email) : undefined;
  const cipher = new SecretCipher(env.PHONE_ENCRYPTION_KEY);

  const staff = await StaffUser.create({
    email,
    name: role === 'admin' ? 'Admin Person' : 'Agent Person',
    role,
    passwordHash: await hashPassword(PASSWORD),
    ...(enrolment
      ? { totpSecretEncrypted: cipher.encrypt(enrolment.secret), totpEnrolledAt: new Date() }
      : {}),
  });
  return { staff, email, secret: enrolment?.secret };
}

/** The reset link only exists in the dev inbox, exactly as it would in email. */
async function tokenFromDevInbox(): Promise<string> {
  const message = await Notification.findOne({ kind: 'password_reset' }).lean();
  const match = /#token=([A-Za-z0-9_-]+)/.exec(String(message?.preview));
  return String(match?.[1]);
}

/* ── Password reset ─────────────────────────────────────────────────────── */

describe('POST /api/auth/password-reset', () => {
  it('accepts the request and writes the message to the dev inbox', async () => {
    await createStaff();
    const response = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'agent@csas.test' });

    expect(response.status).toBe(202);
    const message = await Notification.findOne({ kind: 'password_reset' }).lean();
    expect(message?.channel).toBe('email');
    expect(message?.preview).toContain('/staff/reset-password#token=');
  });

  /* An unauthenticated endpoint that distinguishes the two turns a leaked
     address list into a verified staff directory. */
  it('answers identically for an address that does not exist', async () => {
    await createStaff();
    const known = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'agent@csas.test' });
    const unknown = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'nobody@csas.test' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('records the attempt for an unknown address, masked', async () => {
    await request(app).post('/api/auth/password-reset').send({ email: 'nobody@csas.test' });
    const entry = await AuditLog.findOne({ action: 'staff.password.reset_requested' }).lean();

    expect(entry?.outcome).toBe('failure');
    expect(JSON.stringify(entry)).toContain('n***y@csas.test');
    expect(JSON.stringify(entry)).not.toContain('nobody@csas.test');
  });

  /* The dev inbox is readable by anyone who can open the dashboard; a token
     stored in it would be a collection of live credentials. */
  it('stores the link but never the token on its own', async () => {
    await createStaff();
    await request(app).post('/api/auth/password-reset').send({ email: 'agent@csas.test' });

    const stored = await PasswordResetToken.findOne().select('+tokenHash').lean<{
      tokenHash: string;
    } | null>();
    const token = await tokenFromDevInbox();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toHaveLength(64);
  });

  it('leaves exactly one live token when asked twice', async () => {
    await createStaff();
    await request(app).post('/api/auth/password-reset').send({ email: 'agent@csas.test' });
    await request(app).post('/api/auth/password-reset').send({ email: 'agent@csas.test' });

    expect(await PasswordResetToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);
  });
});

describe('POST /api/auth/password-reset/complete', () => {
  async function requestReset() {
    await createStaff();
    await request(app).post('/api/auth/password-reset').send({ email: 'agent@csas.test' });
    return tokenFromDevInbox();
  }

  it('sets the new password and lets the staff member log in with it', async () => {
    const token = await requestReset();

    const completed = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: NEW_PASSWORD });
    expect(completed.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@csas.test', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('stops the old password working', async () => {
    const token = await requestReset();
    await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: NEW_PASSWORD });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@csas.test', password: PASSWORD });
    expect(login.status).toBe(401);
  });

  /**
   * A reset usually means "somebody else may have had access". Leaving the
   * existing sessions alive would make the reset theatre.
   */
  it('revokes every session the account had', async () => {
    await createStaff();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@csas.test', password: PASSWORD });
    const accessToken = (login.body as { accessToken: string }).accessToken;

    await request(app).post('/api/auth/password-reset').send({ email: 'agent@csas.test' });
    const token = await tokenFromDevInbox();
    const completed = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: NEW_PASSWORD });

    expect((completed.body as { sessionsRevoked: number }).sessionsRevoked).toBe(1);
    const after = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });

  it('refuses a token that has already been used', async () => {
    const token = await requestReset();
    await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: NEW_PASSWORD });

    const second = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: THIRD_PASSWORD });
    expect(second.status).toBe(400);
    expect((second.body as { error: { code: string } }).error.code).toBe('invalid_token');
  });

  it('refuses a token that was never issued', async () => {
    const response = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token: 'a'.repeat(43), password: NEW_PASSWORD });
    expect(response.status).toBe(400);
  });

  it('refuses an expired token', async () => {
    const token = await requestReset();
    await PasswordResetToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: NEW_PASSWORD });
    expect(response.status).toBe(400);
  });

  it('applies the password policy', async () => {
    const token = await requestReset();
    const response = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: 'Password1!' });

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('weak_password');
  });

  /* A weak choice is a retry, not an attack: burning the token would force a
     whole new email round trip. */
  it('does not consume the token when the password is refused', async () => {
    const token = await requestReset();
    await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: 'Password1!' });

    const second = await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token, password: NEW_PASSWORD });
    expect(second.status).toBe(200);
  });

  it('clears a lockout, so recovery actually recovers', async () => {
    await createStaff();
    await StaffUser.updateOne(
      { email: 'agent@csas.test' },
      { $set: { failedLoginCount: 9, lockedUntil: new Date(Date.now() + 3_600_000) } },
    );

    await request(app).post('/api/auth/password-reset').send({ email: 'agent@csas.test' });
    await request(app)
      .post('/api/auth/password-reset/complete')
      .send({ token: await tokenFromDevInbox(), password: NEW_PASSWORD });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@csas.test', password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });
});

/* ── Two-factor enrolment ───────────────────────────────────────────────── */

describe('two-factor enrolment', () => {
  /** An admin with no second factor: refused, but handed an enrolment ticket. */
  async function ticketForNewAdmin(): Promise<string> {
    await createStaff('admin', false);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD });

    expect(login.status).toBe(403);
    return (login.body as { enrolmentTicket: string }).enrolmentTicket;
  }

  it('hands an enrolment ticket to an admin who cannot otherwise get in', async () => {
    expect(await ticketForNewAdmin()).toEqual(expect.any(String));
  });

  it('issues a secret and a scannable URI', async () => {
    const ticket = await ticketForNewAdmin();
    const started = await request(app)
      .post('/api/auth/totp/start')
      .set('authorization', `Bearer ${ticket}`);

    expect(started.status).toBe(200);
    const body = started.body as { secret: string; uri: string };
    expect(body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(body.uri).toContain('otpauth://totp/');
  });

  /* Storing the secret before the user proves they hold it would leave
     half-enrolled accounts that can neither log in nor recover. */
  it('does not store the secret until a code proves it was scanned', async () => {
    const ticket = await ticketForNewAdmin();
    await request(app).post('/api/auth/totp/start').set('authorization', `Bearer ${ticket}`);

    const staff = await StaffUser.findOne({ email: 'admin@csas.test' })
      .select('+totpSecretEncrypted')
      .lean<{ totpSecretEncrypted?: string } | null>();
    expect(staff?.totpSecretEncrypted).toBeUndefined();
  });

  it('completes enrolment and returns ten recovery codes, once', async () => {
    const ticket = await ticketForNewAdmin();
    const started = await request(app)
      .post('/api/auth/totp/start')
      .set('authorization', `Bearer ${ticket}`);
    const { secret } = started.body as { secret: string };

    const confirmed = await request(app)
      .post('/api/auth/totp/confirm')
      .set('authorization', `Bearer ${ticket}`)
      .send({ secret, code: currentDemoCode(secret, 'admin@csas.test') });

    expect(confirmed.status).toBe(200);
    const codes = (confirmed.body as { recoveryCodes: string[] }).recoveryCodes;
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(codes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);

    /* Only hashes are kept, so they can never be shown again. */
    const stored = await RecoveryCode.find().select('+codeHash').lean<{ codeHash: string }[]>();
    expect(stored).toHaveLength(RECOVERY_CODE_COUNT);
    expect(stored.map((row) => row.codeHash)).not.toContain(codes[0]);
  });

  it('lets the admin log in afterwards with a real code', async () => {
    const ticket = await ticketForNewAdmin();
    const { secret } = (
      await request(app).post('/api/auth/totp/start').set('authorization', `Bearer ${ticket}`)
    ).body as { secret: string };
    await request(app)
      .post('/api/auth/totp/confirm')
      .set('authorization', `Bearer ${ticket}`)
      .send({ secret, code: currentDemoCode(secret, 'admin@csas.test') });

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@csas.test',
        password: PASSWORD,
        totp: currentDemoCode(secret, 'admin@csas.test'),
      });
    expect(login.status).toBe(200);
  });

  it('refuses a wrong code', async () => {
    const ticket = await ticketForNewAdmin();
    const { secret } = (
      await request(app).post('/api/auth/totp/start').set('authorization', `Bearer ${ticket}`)
    ).body as { secret: string };

    const response = await request(app)
      .post('/api/auth/totp/confirm')
      .set('authorization', `Bearer ${ticket}`)
      .send({ secret, code: '000000' });
    expect(response.status).toBe(400);
  });

  it('refuses enrolment with no ticket at all', async () => {
    const response = await request(app).post('/api/auth/totp/start');
    expect(response.status).toBe(401);
  });

  /* The ticket has its own audience, so it cannot be presented as a session. */
  it('refuses an enrolment ticket as an access token', async () => {
    const ticket = await ticketForNewAdmin();
    const response = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${ticket}`);
    expect(response.status).toBe(401);
  });

  it('refuses an access token as an enrolment ticket', async () => {
    await createStaff('agent');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@csas.test', password: PASSWORD });

    const response = await request(app)
      .post('/api/auth/totp/start')
      .set('authorization', `Bearer ${(login.body as { accessToken: string }).accessToken}`);
    expect(response.status).toBe(401);
  });

  it('refuses to re-enrol over a factor that already works', async () => {
    const ticket = await ticketForNewAdmin();
    const { secret } = (
      await request(app).post('/api/auth/totp/start').set('authorization', `Bearer ${ticket}`)
    ).body as { secret: string };
    await request(app)
      .post('/api/auth/totp/confirm')
      .set('authorization', `Bearer ${ticket}`)
      .send({ secret, code: currentDemoCode(secret, 'admin@csas.test') });

    const second = await request(app)
      .post('/api/auth/totp/confirm')
      .set('authorization', `Bearer ${ticket}`)
      .send({ secret, code: currentDemoCode(secret, 'admin@csas.test') });
    expect(second.status).toBe(409);
  });
});

/* ── Recovery codes at login ────────────────────────────────────────────── */

describe('logging in with a recovery code', () => {
  async function enrolledAdmin(): Promise<string[]> {
    await createStaff('admin', false);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD });
    const ticket = (login.body as { enrolmentTicket: string }).enrolmentTicket;

    const { secret } = (
      await request(app).post('/api/auth/totp/start').set('authorization', `Bearer ${ticket}`)
    ).body as { secret: string };
    const confirmed = await request(app)
      .post('/api/auth/totp/confirm')
      .set('authorization', `Bearer ${ticket}`)
      .send({ secret, code: currentDemoCode(secret, 'admin@csas.test') });

    return (confirmed.body as { recoveryCodes: string[] }).recoveryCodes;
  }

  it('works in place of the authenticator', async () => {
    const [code] = await enrolledAdmin();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: code });

    expect(login.status).toBe(200);
  });

  it('spends the code, so it cannot be used twice', async () => {
    const [code] = await enrolledAdmin();
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: code });

    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: code });
    expect(second.status).toBe(401);
  });

  it('leaves the other nine usable', async () => {
    const codes = await enrolledAdmin();
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: codes[0] });

    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: codes[1] });
    expect(second.status).toBe(200);
    expect(await RecoveryCode.countDocuments({ usedAt: { $exists: false } })).toBe(
      RECOVERY_CODE_COUNT - 2,
    );
  });

  it('ignores case and separators, because someone is typing this by hand', async () => {
    const [code] = await enrolledAdmin();
    const login = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@csas.test',
        password: PASSWORD,
        recoveryCode: String(code).toUpperCase().replace(/-/g, ''),
      });
    expect(login.status).toBe(200);
  });

  it('counts a wrong code towards the lockout', async () => {
    await enrolledAdmin();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: 'aaaa-bbbb-cccc' });

    expect(response.status).toBe(401);
    const staff = await StaffUser.findOne({ email: 'admin@csas.test' }).lean();
    expect(staff?.failedLoginCount).toBe(1);
  });

  it('records the use and how many are left', async () => {
    const [code] = await enrolledAdmin();
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@csas.test', password: PASSWORD, recoveryCode: code });

    const entry = await AuditLog.findOne({ action: 'staff.recovery_code.used' }).lean();
    expect(entry?.metadata).toMatchObject({ remaining: RECOVERY_CODE_COUNT - 1 });
  });
});

/* ── Admin-assisted reset ───────────────────────────────────────────────── */

describe('POST /api/auth/totp/admin-reset', () => {
  async function adminSession() {
    const { secret } = await createStaff('admin', true);
    const login = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@csas.test',
        password: PASSWORD,
        totp: currentDemoCode(String(secret), 'admin@csas.test'),
      });
    return (login.body as { accessToken: string }).accessToken;
  }

  it('clears the target second factor and revokes their sessions', async () => {
    const accessToken = await adminSession();
    const { staff, secret } = await createStaff('agent', true);

    const agentLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent@csas.test',
        password: PASSWORD,
        totp: currentDemoCode(String(secret), 'agent@csas.test'),
      });
    expect(agentLogin.status).toBe(200);

    const response = await request(app)
      .post('/api/auth/totp/admin-reset')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ staffId: String(staff._id), confirmation: 'agent@csas.test' });

    expect(response.status).toBe(200);
    expect((response.body as { sessionsRevoked: number }).sessionsRevoked).toBe(1);

    const after = await StaffUser.findById(staff._id)
      .select('+totpSecretEncrypted')
      .lean<{ totpSecretEncrypted?: string } | null>();
    expect(after?.totpSecretEncrypted).toBeUndefined();
    expect(await Session.countDocuments({ revokedReason: 'admin' })).toBe(1);
  });

  /* Typing the address makes a mis-click on the wrong row impossible. */
  it('refuses when the confirmation does not match the target', async () => {
    const accessToken = await adminSession();
    const { staff } = await createStaff('agent', true);

    const response = await request(app)
      .post('/api/auth/totp/admin-reset')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ staffId: String(staff._id), confirmation: 'someone.else@csas.test' });

    expect(response.status).toBe(400);
    const after = await StaffUser.findById(staff._id)
      .select('+totpSecretEncrypted')
      .lean<{ totpSecretEncrypted?: string } | null>();
    expect(after?.totpSecretEncrypted).toBeDefined();
  });

  it('records a failed confirmation, naming both parties', async () => {
    const accessToken = await adminSession();
    const { staff } = await createStaff('agent', true);
    await request(app)
      .post('/api/auth/totp/admin-reset')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ staffId: String(staff._id), confirmation: 'wrong@csas.test' });

    const entry = await AuditLog.findOne({
      action: 'staff.totp.reset_by_admin',
      outcome: 'failure',
    }).lean();
    expect(entry?.targetId).toBe(String(staff._id));
    expect(entry?.actorStaffId).toBeDefined();
  });

  /* Otherwise this is a one-click way for a compromised admin session to shed
     the second factor protecting it. Break-glass exists for that case. */
  it('refuses an admin resetting their own second factor', async () => {
    const accessToken = await adminSession();
    const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${accessToken}`);

    const response = await request(app)
      .post('/api/auth/totp/admin-reset')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ staffId: (me.body as { id: string }).id, confirmation: 'admin@csas.test' });

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('self_reset_refused');
  });

  it('refuses an agent trying to reset anyone', async () => {
    await createStaff('admin', true);
    const { staff } = await createStaff('agent', false);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@csas.test', password: PASSWORD });

    const response = await request(app)
      .post('/api/auth/totp/admin-reset')
      .set('authorization', `Bearer ${(login.body as { accessToken: string }).accessToken}`)
      .send({ staffId: String(staff._id), confirmation: 'agent@csas.test' });

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('forbidden');
  });
});
