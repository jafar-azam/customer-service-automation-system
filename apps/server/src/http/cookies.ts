import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import type { Env } from '@csas/shared';
import { ApiError } from './errors.js';

/**
 * Cookies, and the CSRF protection that has to come with them.
 *
 * The refresh token is the only thing this application keeps in a cookie, and
 * it is there for one reason: a cookie can be `httpOnly`, so script injected
 * into the page cannot read it. The access token lives in memory on the client
 * for the mirror-image reason — it is sent as a header, so it is immune to
 * CSRF, and its short life bounds the damage if it is ever captured.
 *
 * That split is the whole design: the long-lived credential is unreadable by
 * script, the script-readable credential is short-lived.
 */

export const REFRESH_COOKIE = 'csas_refresh';
export const CSRF_COOKIE = 'csas_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * `SameSite=Strict` is the primary CSRF defence: the browser will not attach
 * this cookie to a request originating from another site at all.
 *
 * `Secure` is set even in development. Browsers treat `http://localhost` as a
 * trustworthy origin and accept Secure cookies there, so this costs nothing
 * locally and removes the "we'll turn it on in production" failure mode.
 *
 * `path` limits the cookie to the three endpoints that consume it, so it is
 * not attached to every API call — a credential that travels less is a
 * credential that leaks less.
 */
export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: maxAgeMs,
  };
}

/**
 * The CSRF cookie is deliberately **not** `httpOnly`: the client must read it
 * to echo it back in a header. That is the "double submit" pattern, and it is
 * safe because an attacker on another origin can cause the cookie to be *sent*
 * but cannot *read* it to construct the matching header.
 *
 * **`path: '/'`, unlike the refresh cookie.** This one was `/api/auth` too,
 * and that made it unreadable by the page that has to read it: `document.cookie`
 * only exposes cookies matching the *current* path, so at `/` the value was
 * invisible, the header could not be built, and `POST /api/auth/refresh`
 * answered 401 to its own client. No session survived a reload — for anybody,
 * since step 08 — and the refresh cookie's whole reason for existing never
 * worked in a browser.
 *
 * Narrowing it bought nothing in the first place. A path restriction stops a
 * cookie being *sent* somewhere; the protection in double-submit comes from an
 * attacker being unable to *read* it cross-origin, which the same-origin
 * policy provides at any path. The restriction that does matter is on
 * `csas_refresh` above, which is `httpOnly` and never read by script at all.
 *
 * It took a browser to find: `supertest` ignores cookie paths entirely, and
 * even a path-aware HTTP client sends this cookie correctly — the rule that
 * breaks is `document.cookie` visibility, which only a real page applies.
 */
export function csrfCookieOptions(maxAgeMs: number): CookieOptions {
  return { httpOnly: false, secure: true, sameSite: 'strict', path: '/', maxAge: maxAgeMs };
}

export function issueCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Requires the CSRF cookie and header to match, for cookie-authenticated
 * state-changing requests.
 *
 * Only `/api/auth/refresh` and `/api/auth/logout` need this, because they are
 * the only endpoints that act on a cookie. Everything else authenticates with
 * a bearer header, which another origin cannot set. Applying it everywhere
 * would be cargo cult — and would make the API harder to use for no gain.
 *
 * `SameSite=Strict` already blocks the attack in every browser that honours
 * it. This is the second line, for the browser that does not, and for the day
 * someone relaxes the cookie to `Lax` for a legitimate reason.
 */
export function requireCsrfToken(): RequestHandler {
  return function csrf(req: Request, _res: Response, next: NextFunction): void {
    const fromCookie = readCookie(req, CSRF_COOKIE);
    const fromHeader = req.headers[CSRF_HEADER];

    if (
      fromCookie === undefined ||
      typeof fromHeader !== 'string' ||
      fromCookie === '' ||
      !sameToken(fromCookie, fromHeader)
    ) {
      next(new ApiError(403, 'csrf_failed', 'A valid CSRF token is required'));
      return;
    }
    next();
  };
}

/** Sets both cookies after a login or a rotation. */
export function setSessionCookies(res: Response, refreshToken: string, expiresAt: Date): string {
  const maxAgeMs = Math.max(0, expiresAt.getTime() - Date.now());
  const csrfToken = issueCsrfToken();
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(maxAgeMs));
  res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(maxAgeMs));
  return csrfToken;
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(0), maxAge: undefined });
  res.clearCookie(CSRF_COOKIE, { ...csrfCookieOptions(0), maxAge: undefined });
}

/**
 * Reads one cookie.
 *
 * `cookie-parser` types `req.cookies` as `any`, so every read of it would
 * otherwise be an unchecked value spreading through the code. One narrow
 * accessor keeps the `any` in a single place and returns a string or nothing.
 */
function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = (req as Request & { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export function readRefreshToken(req: Request): string | undefined {
  return readCookie(req, REFRESH_COOKIE);
}

/** Kept for symmetry with the env-driven options used elsewhere. */
export function cookieSecretFrom(env: Env): string {
  return env.REFRESH_TOKEN_SECRET;
}
