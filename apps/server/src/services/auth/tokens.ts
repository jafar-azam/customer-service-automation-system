import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import mongoose from 'mongoose';
import type { StaffRole } from '@csas/shared';
import { Session } from '../../db/models/index.js';

/**
 * Sessions: a short-lived access token plus a rotating refresh token.
 *
 * **Why two tokens.** The access token is a signed JWT the server does not
 * look up — fast, and stateless enough to survive a database hiccup — so it
 * must be short-lived, because nothing can revoke it before it expires. The
 * refresh token is the opposite: opaque, stored, revocable, and good for weeks.
 * Fifteen minutes is the window in which a stolen access token still works, and
 * that is the number this design is trading against revocability.
 *
 * **Why rotation with family revocation.** Every refresh issues a new refresh
 * token and retires the old one. If a retired token is ever presented again,
 * exactly one thing has happened: somebody copied it. The legitimate client
 * has already rotated past it, so a replay means the token was stolen — and
 * revoking only that token would leave the thief and the victim taking turns
 * refreshing each other out. So the **whole family** dies, both parties are
 * logged out, and the audit log records it. A forced re-login is a small price
 * for closing a session that is provably compromised.
 *
 * **What is stored.** Only SHA-256 of the refresh token. A database dump
 * therefore yields no usable sessions. SHA-256 rather than Argon2 because the
 * token is 256 bits of randomness, not a human-chosen password: there is
 * nothing to brute-force, and a lookup must stay a single indexed read.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

/** 32 bytes of randomness; base64url so it is cookie- and header-safe. */
const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenClaims extends JWTPayload {
  /** Staff user id. */
  sub: string;
  role: StaffRole;
  /** Session family, so a token can be tied to the session that issued it. */
  sid: string;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssueAccessTokenOptions {
  readonly staffId: string;
  readonly role: StaffRole;
  readonly familyId: string;
  readonly secret: string;
  readonly ttlSeconds?: number;
}

export async function issueAccessToken({
  staffId,
  role,
  familyId,
  secret,
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
}: IssueAccessTokenOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return (
    new SignJWT({ role, sid: familyId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(staffId)
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      /* Issuer and audience are checked on the way back in. They cost nothing
       and they stop a token minted for another service — signed with a reused
       secret — from being accepted here. */
      .setIssuer('csas')
      .setAudience('csas-api')
      .sign(new TextEncoder().encode(secret))
  );
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'csas',
      audience: 'csas-api',
      algorithms: ['HS256'],
    });

    /* `algorithms` above is the important line: without it a token with
       `alg: none`, or one signed with a different family of algorithm, would
       be considered. The claims are then checked for shape because a payload
       is attacker-influenced data until it has been looked at. */
    const { sub, role, sid } = payload;
    if (typeof sub !== 'string' || typeof sid !== 'string') return undefined;
    if (role !== 'agent' && role !== 'admin') return undefined;

    return { ...payload, sub, role, sid };
  } catch {
    /* Expired, wrong signature, malformed — all the same answer to the caller:
       this token is not usable. The reason goes in the log, not the response. */
    return undefined;
  }
}

export interface CreatedSession {
  readonly refreshToken: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

export interface CreateSessionOptions {
  readonly staffId: mongoose.Types.ObjectId;
  readonly userAgent?: string;
  readonly ip?: string;
  readonly ttlSeconds?: number;
}

export async function createSession({
  staffId,
  userAgent,
  ip,
  ttlSeconds = REFRESH_TOKEN_TTL_SECONDS,
}: CreateSessionOptions): Promise<CreatedSession> {
  const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  const familyId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await Session.create({
    subjectType: 'staff',
    staffId,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt,
    ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, 400) }),
    ...(ip === undefined ? {} : { ip }),
  });

  return { refreshToken, familyId, expiresAt };
}

export type RotationOutcome =
  | { readonly kind: 'rotated'; readonly session: CreatedSession; readonly staffId: string }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'reuse_detected'; readonly familyId: string; readonly staffId: string };

/**
 * Exchanges a refresh token for a new one.
 *
 * The whole operation runs in a transaction: retiring the old token, writing
 * the new one and — in the reuse case — revoking the family must either all
 * happen or none of them. Two concurrent refreshes with the same token would
 * otherwise race, and the losing one could leave a family half-revoked, which
 * is the worst of both outcomes.
 */
export async function rotateSession(
  presentedToken: string,
  { ttlSeconds = REFRESH_TOKEN_TTL_SECONDS }: { ttlSeconds?: number } = {},
): Promise<RotationOutcome> {
  const tokenHash = hashRefreshToken(presentedToken);
  const dbSession = await mongoose.startSession();

  try {
    let outcome: RotationOutcome = { kind: 'unknown' };

    await dbSession.withTransaction(async () => {
      const existing = await Session.findOne({ tokenHash }).session(dbSession);

      if (!existing) {
        outcome = { kind: 'unknown' };
        return;
      }

      const staffId = String(existing.staffId);

      /* Already rotated or already revoked — and presented anyway. The real
         client moved on; this is a copy. */
      if (existing.rotatedAt ?? existing.revokedAt) {
        await Session.updateMany(
          { familyId: existing.familyId, revokedAt: { $exists: false } },
          { $set: { revokedAt: new Date(), revokedReason: 'reuse_detected' } },
          { session: dbSession },
        );
        outcome = { kind: 'reuse_detected', familyId: existing.familyId, staffId };
        return;
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        outcome = { kind: 'expired' };
        return;
      }

      const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      /* A staff session always has a staffId — the schema allows it to be
         absent because the same collection carries customer sessions from
         step 08. Checked rather than asserted: a row without one is corrupt,
         and continuing would create an unattributable session. */
      if (!existing.staffId) {
        outcome = { kind: 'unknown' };
        return;
      }

      await Session.updateOne(
        { _id: existing._id },
        { $set: { rotatedAt: new Date(), revokedAt: new Date(), revokedReason: 'rotation' } },
        { session: dbSession },
      );

      await Session.create(
        [
          {
            subjectType: 'staff' as const,
            staffId: existing.staffId,
            /* Same family: that is what makes reuse detectable later. */
            familyId: existing.familyId,
            tokenHash: hashRefreshToken(refreshToken),
            expiresAt,
            ...(existing.userAgent === undefined ? {} : { userAgent: existing.userAgent }),
            ...(existing.ip === undefined ? {} : { ip: existing.ip }),
          },
        ],
        { session: dbSession },
      );

      outcome = {
        kind: 'rotated',
        staffId,
        session: { refreshToken, familyId: existing.familyId, expiresAt },
      };
    });

    return outcome;
  } finally {
    await dbSession.endSession();
  }
}

export type RevokeReason = 'logout' | 'password_reset' | 'account_disabled' | 'admin';

/** Ends one session family — a logout from one browser. */
export async function revokeFamily(familyId: string, reason: RevokeReason): Promise<number> {
  const result = await Session.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  return result.modifiedCount;
}

/**
 * Ends every session a staff member has, everywhere.
 *
 * Used by a password reset and by deactivation: both mean "whoever was logged
 * in may no longer be". Access tokens already issued still work until they
 * expire — the fifteen-minute window this design accepts in exchange for not
 * looking up the database on every request.
 */
export async function revokeAllForStaff(
  staffId: mongoose.Types.ObjectId | string,
  reason: RevokeReason,
): Promise<number> {
  const result = await Session.updateMany(
    { staffId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  return result.modifiedCount;
}

/** True when the family is still live — checked on every authenticated request. */
export async function isFamilyActive(familyId: string): Promise<boolean> {
  const live = await Session.countDocuments({
    familyId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  return live > 0;
}
