import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Env, StaffRole } from '@csas/shared';
import { ApiError } from './errors.js';
import {
  isFamilyActive,
  verifyAccessToken,
  verifyCustomerAccessToken,
} from '../services/auth/tokens.js';

/**
 * Who is making this request, and may they?
 *
 * The access token is a signed JWT, so authentication is a signature check
 * rather than a database read — but **the session family is checked too**.
 * Without that, a logout would not actually log anyone out: the access token
 * stays cryptographically valid for its full fifteen minutes, and "revoked"
 * would mean "revoked in a quarter of an hour". The family lookup is one
 * indexed count, and it is what makes revocation immediate.
 *
 * The result is attached to the request *and* to the async request context, so
 * a service three layers down can record who acted without every function in
 * between passing an actor it does not use.
 */

export interface Actor {
  readonly staffId: string;
  readonly role: StaffRole;
  readonly familyId: string;
}

export interface CustomerActor {
  readonly customerId: string;
  readonly familyId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
    customerActor?: CustomerActor;
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined;
  return value;
}

export interface AuthenticateOptions {
  readonly env: Env;
}

/**
 * Rejects anything without a valid, unrevoked staff session.
 *
 * Every failure is the same 401 `unauthenticated`. An expired token, a forged
 * signature and a revoked session are different facts to an operator and the
 * same fact to a caller.
 */
export function requireStaff({ env }: AuthenticateOptions): RequestHandler {
  return function authenticate(req: Request, _res: Response, next: NextFunction): void {
    const token = bearerToken(req);
    if (token === undefined) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    verifyAccessToken(token, env.ACCESS_TOKEN_SECRET)
      .then(async (claims) => {
        if (!claims) throw new ApiError(401, 'unauthenticated', 'Authentication is required');

        if (!(await isFamilyActive(claims.sid))) {
          /* Signed, unexpired — and belonging to a session that has been
             logged out, reset, disabled, or killed by reuse detection. */
          throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        }

        req.actor = { staffId: claims.sub, role: claims.role, familyId: claims.sid };
        next();
      })
      .catch(next);
  };
}

/**
 * The customer equivalent.
 *
 * A separate middleware rather than a flag on the staff one: the two tokens
 * are different shapes, the two subjects live in different collections, and a
 * single function with a branch is how a customer eventually ends up holding
 * something a staff guard accepts.
 */
export function requireCustomer({ env }: AuthenticateOptions): RequestHandler {
  return function authenticateCustomer(req: Request, _res: Response, next: NextFunction): void {
    const token = bearerToken(req);
    if (token === undefined) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }

    verifyCustomerAccessToken(token, env.ACCESS_TOKEN_SECRET)
      .then(async (claims) => {
        if (!claims) throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        if (!(await isFamilyActive(claims.sid))) {
          throw new ApiError(401, 'unauthenticated', 'Authentication is required');
        }
        req.customerActor = { customerId: claims.sub, familyId: claims.sid };
        next();
      })
      .catch(next);
  };
}

/**
 * Role check, applied after `requireStaff`.
 *
 * This is **function-level** authorization: may this role call this endpoint at
 * all? It is not object-level authorization — may this actor touch *this
 * record* — which lives in the repository layer from step 11, because a check
 * that must be remembered in forty handlers will be forgotten in one.
 */
export function requireRole(...roles: readonly StaffRole[]): RequestHandler {
  return function authorize(req: Request, _res: Response, next: NextFunction): void {
    if (!req.actor) {
      next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
      return;
    }
    if (!roles.includes(req.actor.role)) {
      /* 403, not 404: the caller is known, and hiding the existence of an
         admin route from an authenticated agent buys nothing — they can read
         the client bundle. */
      next(new ApiError(403, 'forbidden', 'This action requires a different role'));
      return;
    }
    next();
  };
}
