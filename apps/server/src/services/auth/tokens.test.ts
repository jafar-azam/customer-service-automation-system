import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Session, StaffUser } from '../../db/models/index.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../../db/test-db.js';
import {
  createSession,
  hashRefreshToken,
  isFamilyActive,
  issueAccessToken,
  revokeAllForStaff,
  revokeFamily,
  rotateSession,
  verifyAccessToken,
} from './tokens.js';

const SECRET = 'a'.repeat(32);

beforeAll(async () => {
  await startTestDatabase();
}, 120_000);

afterEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

async function makeStaff() {
  return StaffUser.create({
    email: `s${String(Math.random())}@csas.test`,
    name: 'S',
    role: 'agent',
    passwordHash: 'x',
  });
}

describe('the access token', () => {
  it('round-trips the claims the application needs', async () => {
    const token = await issueAccessToken({
      staffId: 'abc',
      role: 'admin',
      familyId: 'fam',
      secret: SECRET,
    });
    const claims = await verifyAccessToken(token, SECRET);
    expect(claims).toMatchObject({ sub: 'abc', role: 'admin', sid: 'fam' });
  });

  it('refuses a token signed with another secret', async () => {
    const token = await issueAccessToken({
      staffId: 'abc',
      role: 'agent',
      familyId: 'fam',
      secret: SECRET,
    });
    expect(await verifyAccessToken(token, 'b'.repeat(32))).toBeUndefined();
  });

  it('refuses an expired token', async () => {
    const token = await issueAccessToken({
      staffId: 'abc',
      role: 'agent',
      familyId: 'fam',
      secret: SECRET,
      ttlSeconds: -10,
    });
    expect(await verifyAccessToken(token, SECRET)).toBeUndefined();
  });

  /* `alg: none` is the oldest JWT attack there is: a token with no signature,
     accepted because the verifier trusted the header. */
  it('refuses an unsigned token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'abc',
        role: 'admin',
        sid: 'fam',
        iss: 'csas',
        aud: 'csas-api',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toString('base64url');

    expect(await verifyAccessToken(`${header}.${payload}.`, SECRET)).toBeUndefined();
  });

  it('refuses a token minted for another audience', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ role: 'admin', sid: 'fam' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('abc')
      .setIssuedAt()
      .setExpirationTime('10m')
      .setIssuer('csas')
      .setAudience('some-other-service')
      .sign(new TextEncoder().encode(SECRET));

    expect(await verifyAccessToken(token, SECRET)).toBeUndefined();
  });

  /* The payload is attacker-influenced until it has been looked at: a validly
     signed token carrying `role: "superuser"` must not authorise anything. */
  it('refuses a validly signed token with a role outside the enumeration', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({ role: 'superuser', sid: 'fam' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('abc')
      .setIssuedAt()
      .setExpirationTime('10m')
      .setIssuer('csas')
      .setAudience('csas-api')
      .sign(new TextEncoder().encode(SECRET));

    expect(await verifyAccessToken(token, SECRET)).toBeUndefined();
  });

  it('refuses rubbish', async () => {
    expect(await verifyAccessToken('not.a.token', SECRET)).toBeUndefined();
  });
});

describe('the refresh token', () => {
  it('is never stored in the clear', async () => {
    const staff = await makeStaff();
    const { refreshToken } = await createSession({ staffId: staff._id });

    const stored = await Session.findOne().lean();
    expect(stored?.tokenHash).toBe(hashRefreshToken(refreshToken));
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
  });

  it('rotates to a new token and retires the old one', async () => {
    const staff = await makeStaff();
    const first = await createSession({ staffId: staff._id });

    const outcome = await rotateSession(first.refreshToken);
    expect(outcome.kind).toBe('rotated');
    if (outcome.kind !== 'rotated') return;

    expect(outcome.session.refreshToken).not.toBe(first.refreshToken);
    /* Same family — that is what makes a replay detectable. */
    expect(outcome.session.familyId).toBe(first.familyId);

    const old = await Session.findOne({ tokenHash: hashRefreshToken(first.refreshToken) }).lean();
    expect(old?.revokedReason).toBe('rotation');
  });

  /**
   * Both sign-ins share one `csas_refresh` cookie, so a browser holding a
   * staff session will present it to the customer refresh endpoint if the
   * client tries that one first.
   *
   * Before `expect` existed, that rotated the session: the old token was
   * retired, a new one created, and the route then noticed the mismatch and
   * threw the new token away without ever sending it. The session was
   * destroyed by the act of asking the wrong question about it — and the next
   * legitimate refresh would present a retired token, which reuse detection
   * correctly reads as theft and uses to revoke the entire family.
   *
   * A staff member simply could not stay signed in.
   */
  it('refuses the wrong subject without touching the session', async () => {
    const staff = await makeStaff();
    const first = await createSession({ staffId: staff._id });

    const outcome = await rotateSession(first.refreshToken, { expect: 'customer' });
    expect(outcome.kind).toBe('wrong_subject');

    /* Untouched: not rotated, not revoked, and no second row created. */
    const stored = await Session.findOne({
      tokenHash: hashRefreshToken(first.refreshToken),
    }).lean();
    expect(stored?.rotatedAt).toBeUndefined();
    expect(stored?.revokedAt).toBeUndefined();
    expect(await Session.countDocuments()).toBe(1);

    /* And still usable at the right endpoint afterwards. */
    const second = await rotateSession(first.refreshToken, { expect: 'staff' });
    expect(second.kind).toBe('rotated');
  });

  /* A replayed token is a replayed token whichever endpoint it reaches —
     letting the wrong one ignore it silently would be a way to probe without
     tripping the alarm. */
  it('still detects a replay presented to the wrong endpoint', async () => {
    const staff = await makeStaff();
    const first = await createSession({ staffId: staff._id });
    await rotateSession(first.refreshToken, { expect: 'staff' });

    const replay = await rotateSession(first.refreshToken, { expect: 'customer' });
    expect(replay.kind).toBe('reuse_detected');

    const live = await Session.countDocuments({ revokedAt: { $exists: false } });
    expect(live).toBe(0);
  });

  it('reports an unknown token without creating anything', async () => {
    expect((await rotateSession('never-issued')).kind).toBe('unknown');
    expect(await Session.countDocuments()).toBe(0);
  });

  it('refuses an expired token', async () => {
    const staff = await makeStaff();
    const session = await createSession({ staffId: staff._id, ttlSeconds: -1 });
    expect((await rotateSession(session.refreshToken)).kind).toBe('expired');
  });

  describe('reuse detection', () => {
    it('reports a replay of a retired token', async () => {
      const staff = await makeStaff();
      const first = await createSession({ staffId: staff._id });
      await rotateSession(first.refreshToken);

      const replay = await rotateSession(first.refreshToken);
      expect(replay.kind).toBe('reuse_detected');
    });

    /* The whole point: revoking only the replayed token would leave the thief
       and the victim refreshing each other out indefinitely. */
    it('revokes every live token in the family', async () => {
      const staff = await makeStaff();
      const first = await createSession({ staffId: staff._id });
      const rotated = await rotateSession(first.refreshToken);
      if (rotated.kind !== 'rotated') throw new Error('expected a rotation');

      await rotateSession(first.refreshToken);

      expect(await isFamilyActive(first.familyId)).toBe(false);
      expect((await rotateSession(rotated.session.refreshToken)).kind).toBe('reuse_detected');
    });

    it('leaves another family alone', async () => {
      const staff = await makeStaff();
      const compromised = await createSession({ staffId: staff._id });
      const other = await createSession({ staffId: staff._id });

      await rotateSession(compromised.refreshToken);
      await rotateSession(compromised.refreshToken);

      /* A stolen token from one browser must not log the user out of the
         other one — that would make every theft a full account lockout. */
      expect(await isFamilyActive(other.familyId)).toBe(true);
    });
  });
});

describe('revocation', () => {
  it('ends one family', async () => {
    const staff = await makeStaff();
    const session = await createSession({ staffId: staff._id });

    expect(await revokeFamily(session.familyId, 'logout')).toBe(1);
    expect(await isFamilyActive(session.familyId)).toBe(false);
  });

  it('is idempotent', async () => {
    const staff = await makeStaff();
    const session = await createSession({ staffId: staff._id });
    await revokeFamily(session.familyId, 'logout');
    /* A second logout revokes nothing further rather than failing. */
    expect(await revokeFamily(session.familyId, 'logout')).toBe(0);
  });

  /* Used by a password reset and by deactivation: both mean "whoever was
     logged in may no longer be", everywhere, not just in one browser. */
  it('ends every session a staff member has', async () => {
    const staff = await makeStaff();
    const a = await createSession({ staffId: staff._id });
    const b = await createSession({ staffId: staff._id });

    expect(await revokeAllForStaff(staff._id, 'password_reset')).toBe(2);
    expect(await isFamilyActive(a.familyId)).toBe(false);
    expect(await isFamilyActive(b.familyId)).toBe(false);
  });

  it('does not touch another staff member sessions', async () => {
    const [mine, theirs] = await Promise.all([makeStaff(), makeStaff()]);
    const ours = await createSession({ staffId: mine._id });
    const other = await createSession({ staffId: theirs._id });

    await revokeAllForStaff(mine._id, 'account_disabled');
    expect(await isFamilyActive(ours.familyId)).toBe(false);
    expect(await isFamilyActive(other.familyId)).toBe(true);
  });

  it('treats an expired session as inactive', async () => {
    const staff = await makeStaff();
    const session = await createSession({ staffId: staff._id, ttlSeconds: -1 });
    expect(await isFamilyActive(session.familyId)).toBe(false);
  });
});

describe('concurrency', () => {
  /**
   * Two tabs refreshing at the same moment is ordinary, not an attack. The
   * transaction must make exactly one of them win, and the loser must not be
   * able to leave the family half-revoked.
   */
  it('lets exactly one of two simultaneous refreshes succeed', async () => {
    const staff = await makeStaff();
    const session = await createSession({ staffId: staff._id });

    const outcomes = await Promise.allSettled([
      rotateSession(session.refreshToken),
      rotateSession(session.refreshToken),
    ]);

    const kinds = outcomes.map((result) =>
      result.status === 'fulfilled' ? result.value.kind : 'threw',
    );
    expect(kinds.filter((kind) => kind === 'rotated')).toHaveLength(1);
    /* The other either lost the write conflict or saw the retired token. */
    expect(kinds.filter((kind) => kind === 'rotated' || kind === 'threw').length).toBeLessThan(3);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
