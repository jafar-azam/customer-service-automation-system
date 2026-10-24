import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from './errors.js';
import { hit, type LimitRule } from '../services/rate-limit.js';

/**
 * A rate limit on an ordinary route.
 *
 * Checklist 13.1 asks for limits on all routes and strict ones on sensitive
 * endpoints. Step 08 built the strict layer for OTP, where each request costs
 * money; this is the ordinary layer, which exists for a different reason: a
 * runaway client, a stuck retry loop, or an authenticated account being used
 * to flood the database.
 *
 * **Keyed on the authenticated actor, not the IP.** These routes require a
 * session, so the account is the meaningful subject — several colleagues
 * behind one office NAT must not share a budget, and one compromised account
 * must not get a fresh one by changing address. Unauthenticated requests never
 * reach here; the guard runs first.
 */
export function rateLimit(rule: LimitRule): RequestHandler {
  return function limit(req: Request, res: Response, next: NextFunction): void {
    const subject =
      req.actor?.staffId ?? req.customerActor?.customerId ?? `ip:${req.ip ?? 'unknown'}`;

    hit(rule, subject)
      .then((result) => {
        if (result.allowed) {
          next();
          return;
        }
        /* Visible, not silent: a client that cannot see the limit retries into
           a wall, which is worse for the server than telling it to wait. */
        res.setHeader('retry-after', String(result.retryAfterSeconds ?? rule.windowSeconds));
        next(new ApiError(429, 'too_many_requests', 'Too many requests — please slow down'));
      })
      .catch(next);
  };
}

/**
 * Limits for the ticket routes.
 *
 * Generous enough that no real person meets them — a customer opening six
 * tickets an hour is already unusual, and an agent typing sixty messages in a
 * minute is not typing. They are a ceiling on automation, not a quota.
 */
export const TICKET_LIMITS = {
  create: { name: 'ticket:create', limit: 20, windowSeconds: 3_600 },
  message: { name: 'ticket:message', limit: 60, windowSeconds: 60 },
  transition: { name: 'ticket:transition', limit: 120, windowSeconds: 60 },
  read: { name: 'ticket:read', limit: 600, windowSeconds: 60 },
} as const satisfies Record<string, LimitRule>;
