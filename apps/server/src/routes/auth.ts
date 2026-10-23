import { Router, type Request } from 'express';
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
  adminResetTotp,
  confirmEnrolment,
  issueEnrolmentTicket,
  startEnrolment,
  verifyEnrolmentTicket,
} from '../services/auth/enrolment.js';
import { completePasswordReset, requestPasswordReset } from '../services/auth/recovery.js';
import { MockEmailProvider, type EmailProvider } from '../services/providers/email.js';
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
  /* `4f3a-9c2e-7b1d`, with the separators optional — someone typing this has
     just lost their phone and should not also lose to punctuation. */
  recoveryCode: z
    .string()
    .regex(/^[a-z0-9-]{12,16}$/i)
    .optional(),
});

const resetRequestSchema = z.strictObject({ email: z.email().max(254) });

const resetCompleteSchema = z.strictObject({
  token: z.string().min(20).max(128),
  password: z.string().min(1).max(128),
});

const enrolConfirmSchema = z.strictObject({
  /* Returned by `/totp/start`; the client holds it only for this exchange. */
  secret: z.string().regex(/^[A-Z2-7]{16,64}$/),
  code: z.string().regex(/^\d{6}$/),
});

const adminResetTotpSchema = z.strictObject({
  staffId: z.string().regex(/^[a-f0-9]{24}$/),
  /* The target's email, typed out. A confirmation that cannot be mis-clicked. */
  confirmation: z.string().min(3).max(254),
});

export interface AuthRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  /** Mock in this release; the interface is what production would swap. */
  readonly email?: EmailProvider;
}

export function authRouter({
  env,
  logger,
  email = new MockEmailProvider(logger),
}: AuthRouterOptions): Router {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), (req, res, next) => {
    const body = req.body as z.infer<typeof loginSchema>;

    login(
      {
        email: body.email,
        password: body.password,
        ...(body.totp === undefined ? {} : { totp: body.totp }),
        ...(body.recoveryCode === undefined ? {} : { recoveryCode: body.recoveryCode }),
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

          case 'totp_enrolment_required': {
            /* The password was correct, so the caller gets a five-minute
               ticket that authorises exactly the two enrolment calls and
               nothing else. Without it an admin with no second factor could
               never obtain one — and an unauthenticated enrolment endpoint
               would let anyone who knows the address attach their own. */
            void issueEnrolmentTicket(result.staffId, env.ACCESS_TOKEN_SECRET).then(
              (enrolmentTicket) => {
                res.status(403).json({
                  error: {
                    code: 'totp_enrolment_required',
                    message: 'Two-factor authentication must be set up before signing in',
                  },
                  enrolmentTicket,
                });
              },
              next,
            );
            return;
          }

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

  /* ── Recovery ────────────────────────────────────────────────────────── */

  /**
   * Always 202, whatever happened. The response, the status and the time are
   * identical for an address that exists and one that does not — this endpoint
   * is unauthenticated, so anything else turns it into a staff directory.
   */
  router.post('/password-reset', validate({ body: resetRequestSchema }), (req, res, next) => {
    const body = req.body as z.infer<typeof resetRequestSchema>;

    requestPasswordReset({
      email: body.email,
      env,
      logger,
      email_: email,
      ...(req.ip === undefined ? {} : { ip: req.ip }),
    })
      .then(() => {
        res.status(202).json({ status: 'accepted' });
      })
      .catch(next);
  });

  router.post(
    '/password-reset/complete',
    validate({ body: resetCompleteSchema }),
    (req, res, next) => {
      const body = req.body as z.infer<typeof resetCompleteSchema>;

      completePasswordReset({
        token: body.token,
        newPassword: body.password,
        logger,
        ...(req.ip === undefined ? {} : { ip: req.ip }),
      })
        .then((outcome) => {
          switch (outcome.kind) {
            case 'invalid_token':
              /* One answer for never-existed, already-used and expired. */
              throw new ApiError(400, 'invalid_token', 'This reset link is no longer valid');
            case 'weak_password':
              throw new ApiError(
                400,
                'weak_password',
                'Choose a stronger password',
                outcome.problems,
              );
            case 'completed':
              res.json({ status: 'completed', sessionsRevoked: outcome.sessionsRevoked });
              return;
          }
        })
        .catch(next);
    },
  );

  /* ── Two-factor enrolment ────────────────────────────────────────────── */

  /** Reads the enrolment ticket login handed out. Nothing else accepts it. */
  function enrolmentSubject(req: Request): Promise<string | undefined> {
    const header = req.headers.authorization;
    const ticket = typeof header === 'string' ? header.replace(/^Bearer /i, '') : '';
    return verifyEnrolmentTicket(ticket, env.ACCESS_TOKEN_SECRET);
  }

  router.post('/totp/start', (req, res, next) => {
    enrolmentSubject(req)
      .then(async (staffId) => {
        if (staffId === undefined) {
          throw new ApiError(401, 'unauthenticated', 'An enrolment ticket is required');
        }
        const started = await startEnrolment(staffId);
        if (!started) throw new ApiError(401, 'unauthenticated', 'An enrolment ticket is required');

        /* The secret is returned and **not stored**: it is written only once a
           working code proves the authenticator really holds it. */
        res.json({ secret: started.secret, uri: started.uri });
      })
      .catch(next);
  });

  router.post('/totp/confirm', validate({ body: enrolConfirmSchema }), (req, res, next) => {
    const body = req.body as z.infer<typeof enrolConfirmSchema>;

    enrolmentSubject(req)
      .then(async (staffId) => {
        if (staffId === undefined) {
          throw new ApiError(401, 'unauthenticated', 'An enrolment ticket is required');
        }

        const outcome = await confirmEnrolment({
          staffId,
          secret: body.secret,
          code: body.code,
          env,
          logger,
          ...(req.ip === undefined ? {} : { ip: req.ip }),
        });

        switch (outcome.kind) {
          case 'wrong_code':
            throw new ApiError(400, 'wrong_code', 'That code did not match');
          case 'already_enrolled':
            throw new ApiError(409, 'already_enrolled', 'A second factor is already set up');
          case 'unknown_staff':
            throw new ApiError(401, 'unauthenticated', 'An enrolment ticket is required');
          case 'enrolled':
            /* The only moment the recovery codes can ever be shown. */
            res.json({ status: 'enrolled', recoveryCodes: outcome.recoveryCodes });
            return;
        }
      })
      .catch(next);
  });

  /** An admin clears someone else's second factor. Never their own. */
  router.post(
    '/totp/admin-reset',
    requireStaff({ env }),
    requireRole('admin'),
    validate({ body: adminResetTotpSchema }),
    (req, res, next) => {
      const body = req.body as z.infer<typeof adminResetTotpSchema>;
      const actor = req.actor;
      if (!actor) {
        next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
        return;
      }

      adminResetTotp({
        adminId: actor.staffId,
        targetStaffId: body.staffId,
        confirmation: body.confirmation,
        logger,
        ...(req.ip === undefined ? {} : { ip: req.ip }),
      })
        .then((outcome) => {
          switch (outcome.kind) {
            case 'unknown_staff':
              throw new ApiError(404, 'not_found', 'No such staff member');
            case 'confirmation_mismatch':
              throw new ApiError(
                400,
                'confirmation_mismatch',
                'Type the staff member email address to confirm',
              );
            case 'self_reset_refused':
              throw new ApiError(
                403,
                'self_reset_refused',
                'Use the break-glass procedure to reset your own second factor',
              );
            case 'reset':
              res.json({ status: 'reset', sessionsRevoked: outcome.sessionsRevoked });
              return;
          }
        })
        .catch(next);
    },
  );

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
