import { Router } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Env } from '@csas/shared';
import { ApiError } from '../http/errors.js';
import { requireRole, requireStaff } from '../http/authenticate.js';
import {
  clearSessionCookies,
  readRefreshToken,
  requireCsrfToken,
  setSessionCookies,
} from '../http/cookies.js';
import { validate } from '../http/validate.js';
import { StaffUser } from '../db/models/index.js';
import { record } from '../services/audit.js';
import { login } from '../services/auth/login.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueAccessToken,
  revokeFamily,
  rotateSession,
} from '../services/auth/tokens.js';

/**
 * Staff authentication endpoints.
 *
 * `POST /api/auth/login`    — email + password (+ TOTP), issues both tokens
 * `POST /api/auth/refresh`  — rotates the refresh cookie, issues an access token
 * `POST /api/auth/logout`   — revokes the session family
 * `GET  /api/auth/me`       — who am I, according to this access token
 *
 * Customer login is a different flow entirely (one-time code, step 08) and
 * will live under `/api/auth/customer`, so the two can never share a code path
 * by accident — they have different credentials, different risks and different
 * audit events.
 */

const loginSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  /* Optional: an agent without TOTP never sends one. Shape-checked here so a
     malformed value is rejected before it reaches the verifier. */
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export interface AuthRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
}

export function authRouter({ env, logger }: AuthRouterOptions): Router {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), (req, res, next) => {
    const body = req.body as z.infer<typeof loginSchema>;

    login(
      {
        email: body.email,
        password: body.password,
        ...(body.totp === undefined ? {} : { totp: body.totp }),
        ...(req.headers['user-agent'] === undefined
          ? {}
          : { userAgent: req.headers['user-agent'] }),
        ...(req.ip === undefined ? {} : { ip: req.ip }),
      },
      { env, logger },
    )
      .then((result) => {
        switch (result.kind) {
          case 'invalid_credentials':
            /* 401 and one message for every cause: unknown account, wrong
               password, wrong code, locked, disabled. */
            throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect');

          case 'totp_required':
            /* The one deliberate disclosure, to a caller who has just proved
               they know the password. */
            throw new ApiError(401, 'totp_required', 'A one-time code is required');

          case 'totp_enrolment_required':
            throw new ApiError(
              403,
              'totp_enrolment_required',
              'Two-factor authentication must be set up before signing in',
            );

          case 'success': {
            const csrfToken = setSessionCookies(
              res,
              result.session.refreshToken,
              result.session.expiresAt,
            );
            res.json({
              accessToken: result.accessToken,
              expiresIn: ACCESS_TOKEN_TTL_SECONDS,
              csrfToken,
              staff: result.staff,
              mustChangePassword: result.mustChangePassword,
            });
            return;
          }
        }
      })
      .catch(next);
  });

  /**
   * Rotation. Cookie-authenticated, so it needs the CSRF token — and it is one
   * of only two endpoints that do.
   */
  router.post('/refresh', requireCsrfToken(), (req, res, next) => {
    const presented = readRefreshToken(req);
    if (presented === undefined) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    rotateSession(presented)
      .then(async (outcome) => {
        if (outcome.kind === 'reuse_detected') {
          /* The family is already revoked by the time this returns. Both the
             thief and the legitimate user are logged out, and the event is
             recorded — this is the one audit entry that says "a token was
             stolen" rather than "someone failed to log in". */
          await record(logger, {
            action: 'staff.logout',
            actorType: 'staff',
            actorStaffId: outcome.staffId,
            targetType: 'Session',
            targetId: outcome.familyId,
            outcome: 'failure',
            ...(req.ip === undefined ? {} : { ip: req.ip }),
            metadata: { reason: 'refresh_token_reuse_detected' },
          });
          clearSessionCookies(res);
          throw new ApiError(401, 'session_revoked', 'This session has been ended');
        }

        if (outcome.kind !== 'rotated') {
          clearSessionCookies(res);
          throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        }

        const staff = await StaffUser.findById(outcome.staffId).select('role status name').lean<{
          role: 'agent' | 'admin';
          status: string;
          name: string;
        } | null>();

        if (staff?.status !== 'active') {
          /* Deactivated between one refresh and the next. */
          await revokeFamily(outcome.session.familyId, 'account_disabled');
          clearSessionCookies(res);
          throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        }

        const csrfToken = setSessionCookies(
          res,
          outcome.session.refreshToken,
          outcome.session.expiresAt,
        );
        const accessToken = await issueAccessToken({
          staffId: outcome.staffId,
          role: staff.role,
          familyId: outcome.session.familyId,
          secret: env.ACCESS_TOKEN_SECRET,
        });

        res.json({ accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, csrfToken });
      })
      .catch(next);
  });

  router.post('/logout', requireCsrfToken(), requireStaff({ env }), (req, res, next) => {
    const actor = req.actor;
    if (!actor) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    revokeFamily(actor.familyId, 'logout')
      .then(async () => {
        await record(logger, {
          action: 'staff.logout',
          actorType: 'staff',
          actorStaffId: actor.staffId,
          targetType: 'Session',
          targetId: actor.familyId,
          ...(req.ip === undefined ? {} : { ip: req.ip }),
        });
        clearSessionCookies(res);
        res.status(204).end();
      })
      .catch(next);
  });

  router.get('/me', requireStaff({ env }), (req, res, next) => {
    const actor = req.actor;
    if (!actor) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    StaffUser.findById(actor.staffId)
      .select('name email role status mustChangePassword totpEnrolledAt')
      .lean()
      .then((staff) => {
        if (!staff) throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        res.json({
          id: actor.staffId,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          mustChangePassword: staff.mustChangePassword,
          totpEnrolled: staff.totpEnrolledAt !== undefined,
        });
      })
      .catch(next);
  });

  /**
   * An admin-only endpoint with no purpose beyond proving the role guard
   * works end to end — and giving step 34's cross-role probe something to
   * probe before the dashboard exists. It returns counts, nothing sensitive.
   */
  router.get('/staff-count', requireStaff({ env }), requireRole('admin'), (_req, res, next) => {
    StaffUser.countDocuments()
      .then((count) => {
        res.json({ count });
      })
      .catch(next);
  });

  return router;
}
