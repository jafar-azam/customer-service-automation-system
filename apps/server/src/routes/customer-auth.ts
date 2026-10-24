import { Router } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Env } from '@csas/shared';
import { Customer } from '../db/models/index.js';
import { ApiError } from '../http/errors.js';
import { requireCustomer } from '../http/authenticate.js';
import {
  clearSessionCookies,
  readRefreshToken,
  requireCsrfToken,
  setSessionCookies,
} from '../http/cookies.js';
import { validate } from '../http/validate.js';
import { checkEntitlement } from '../services/contracts.js';
import { requestCode, verifyCode } from '../services/auth/otp.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createCustomerSession,
  issueCustomerAccessToken,
  revokeFamily,
  rotateSession,
} from '../services/auth/tokens.js';
import { MockMessagingProvider, type MessagingProvider } from '../services/providers/messaging.js';

/**
 * Customer sign-in: a one-time code, then the contract gate.
 *
 * Kept in its own router, under its own path, deliberately. Staff and
 * customers have different credentials, different risks and different audit
 * events, and a shared code path is how a change meant for one quietly reaches
 * the other.
 *
 * `POST /api/auth/customer/request-code`
 * `POST /api/auth/customer/verify`
 * `POST /api/auth/customer/logout`
 * `GET  /api/auth/customer/me`        — identity **and** entitlement
 */

const requestSchema = z.strictObject({
  phone: z.string().min(6).max(24),
  /* WhatsApp first, SMS as the fallback the research recommends. */
  channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
});

const verifySchema = z.strictObject({
  phone: z.string().min(6).max(24),
  code: z.string().regex(/^\d{6}$/),
});

export interface CustomerAuthRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly messaging?: MessagingProvider;
}

export function customerAuthRouter({
  env,
  logger,
  messaging = new MockMessagingProvider(logger, { revealCodes: env.DEMO_MODE }),
}: CustomerAuthRouterOptions): Router {
  const router = Router();

  /**
   * Asks for a code.
   *
   * Answers `202 accepted` for a number that exists, one that does not, and
   * one that is suppressed by the kill switch — all identical. The only
   * distinguishable answers are a malformed number (400, which says nothing
   * about who is a customer) and a rate limit (429, which must be visible or
   * the client would retry into a wall).
   */
  router.post('/request-code', validate({ body: requestSchema }), (req, res, next) => {
    const body = req.body as z.infer<typeof requestSchema>;

    requestCode({
      phone: body.phone,
      channel: body.channel,
      env,
      logger,
      messaging,
      ip: req.ip ?? 'unknown',
    })
      .then((outcome) => {
        switch (outcome.kind) {
          case 'invalid_number':
            throw new ApiError(400, 'invalid_phone', 'That does not look like a mobile number');
          case 'rate_limited':
            res.setHeader('retry-after', String(outcome.retryAfterSeconds));
            throw new ApiError(429, 'too_many_requests', 'Please wait before asking again');
          case 'sent':
          case 'suppressed':
            /* Identical on purpose. */
            res.status(202).json({ status: 'accepted', expiresInSeconds: 300 });
            return;
        }
      })
      .catch(next);
  });

  /**
   * Verifies a code and opens a session.
   *
   * The entitlement is reported here rather than enforced here: the customer
   * **is** who they say they are, and an expired contract is not an
   * authentication failure. Refusing to log them in would leave them unable to
   * see their own history or read why they were refused.
   */
  router.post('/verify', validate({ body: verifySchema }), (req, res, next) => {
    const body = req.body as z.infer<typeof verifySchema>;

    verifyCode({
      phone: body.phone,
      code: body.code,
      env,
      logger,
      ip: req.ip ?? 'unknown',
    })
      .then(async (outcome) => {
        if (outcome.kind === 'rate_limited') {
          res.setHeader('retry-after', String(outcome.retryAfterSeconds));
          throw new ApiError(429, 'too_many_requests', 'Please wait before trying again');
        }
        if (outcome.kind !== 'verified') {
          /* One answer for wrong, expired, used, unknown and out of attempts. */
          throw new ApiError(401, 'invalid_code', 'That code is not valid');
        }

        const session = await createCustomerSession({
          customerId: outcome.customerId,
          ...(req.headers['user-agent'] === undefined
            ? {}
            : { userAgent: req.headers['user-agent'] }),
          ...(req.ip === undefined ? {} : { ip: req.ip }),
        });

        const accessToken = await issueCustomerAccessToken({
          customerId: outcome.customerId,
          familyId: session.familyId,
          secret: env.ACCESS_TOKEN_SECRET,
        });

        const csrfToken = setSessionCookies(res, session.refreshToken, session.expiresAt);
        const entitlement = await checkEntitlement(outcome.customerId);

        res.json({
          accessToken,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          csrfToken,
          entitlement,
        });
      })
      .catch(next);
  });

  router.get('/me', requireCustomer({ env }), (req, res, next) => {
    const customerId = req.customerActor?.customerId;
    if (customerId === undefined) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    Customer.findById(customerId)
      .select('name companyName preferredLanguage phoneLast3 products')
      .lean()
      .then(async (customer) => {
        if (!customer) throw new ApiError(401, 'unauthenticated', 'Authentication is required');

        const entitlement = await checkEntitlement(customerId);
        res.json({
          id: customerId,
          name: customer.name,
          companyName: customer.companyName,
          preferredLanguage: customer.preferredLanguage,
          /* Enough for the customer to recognise their own number without the
             server decrypting it. */
          phoneLast3: customer.phoneLast3,
          products: customer.products,
          entitlement,
        });
      })
      .catch(next);
  });

  router.post('/logout', requireCsrfToken(), requireCustomer({ env }), (req, res, next) => {
    const familyId = req.customerActor?.familyId;
    if (familyId === undefined) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    revokeFamily(familyId, 'logout')
      .then(() => {
        clearSessionCookies(res);
        res.status(204).end();
      })
      .catch(next);
  });

  /**
   * Rotation, on the same mechanics as staff — including reuse detection
   * revoking the whole family. The only difference is which token is minted
   * at the end, and that a staff session presented here is refused.
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
          clearSessionCookies(res);
          throw new ApiError(401, 'session_revoked', 'This session has been ended');
        }
        if (outcome.kind !== 'rotated' || outcome.subjectType !== 'customer') {
          clearSessionCookies(res);
          throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        }

        const csrfToken = setSessionCookies(
          res,
          outcome.session.refreshToken,
          outcome.session.expiresAt,
        );
        const accessToken = await issueCustomerAccessToken({
          customerId: outcome.subjectId,
          familyId: outcome.session.familyId,
          secret: env.ACCESS_TOKEN_SECRET,
        });

        res.json({ accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, csrfToken });
      })
      .catch(next);
  });

  return router;
}
